/**
 * Email Outreach Daily Cron — traite la queue PENDING EMAIL.
 *
 * Pour chaque workspace avec un SmtpConfig vérifié + steps EMAIL en attente :
 *   1. Charge le SmtpConfig par défaut du workspace
 *   2. Compte les envois déjà effectués aujourd'hui (respect dailyLimit)
 *   3. Envoie les steps PENDING dans la limite disponible
 *   4. Injecte pixel de tracking + lien de désabonnement
 *   5. Met à jour le statut prospect → CONTACTED après le premier envoi
 *   6. Persiste sent/failed dans lastEmailRunStats sur le workspace
 */

import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { createSmtpTransporter, sendEmailViaSMTP } from "@/lib/email/smtp-transport";
import { decryptIfNeeded } from "@/lib/encryption";
import { generateUnsubscribeToken } from "@/lib/unsubscribe-token";
import { trackEmailMetrics } from "@/lib/prospection/deliverability";

// ─── Template interpolation ───────────────────────────────────────────────────

function interpolate(template: string, vars: Record<string, string>): string {
  return template
    .replace(/\{\{prénom\}\}/gi, vars.firstName ?? "")
    .replace(/\{\{prenom\}\}/gi, vars.firstName ?? "")
    .replace(/\{\{nom\}\}/gi, vars.lastName ?? "")
    .replace(/\{\{entreprise\}\}/gi, vars.company ?? "")
    .replace(/\{\{poste\}\}/gi, vars.jobTitle ?? "")
    .replace(/\{\{name\}\}/gi, vars.name ?? "")
    .trim();
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return { firstName: parts[0] ?? fullName, lastName: parts.slice(1).join(" ") };
}

// ─── Tracking injection ───────────────────────────────────────────────────────

function injectTracking(html: string, stepId: string, prospectId: string): string {
  const base = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const pixel = `<img src="${base}/api/track/open/${stepId}" width="1" height="1" alt="" style="display:none" />`;
  const unsubToken = generateUnsubscribeToken(prospectId);
  const unsubUrl = `${base}/api/unsubscribe/${unsubToken}`;
  const unsubFooter = `<div style="text-align:center;margin-top:24px;font-size:11px;color:#9ca3af;"><a href="${unsubUrl}" style="color:#9ca3af;text-decoration:underline;">Se désinscrire</a></div>`;
  const extras = pixel + unsubFooter;
  return html.includes("</body>") ? html.replace("</body>", `${extras}</body>`) : html + extras;
}

// ─── Content → HTML ──────────────────────────────────────────────────────────

function toHtml(text: string): string {
  if (text.trimStart().startsWith("<")) return text;
  return `<div style="font-family:sans-serif;line-height:1.6;color:#1f2937;">${text
    .split(/\n\n+/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
}

// ─── Cron quotidien ───────────────────────────────────────────────────────────

export const emailOutreachDaily = inngest.createFunction(
  {
    id: "email-outreach-daily",
    name: "Email Outreach — Envoi quotidien autonome",
    concurrency: { limit: 3 },
    retries: 0,
  },
  { cron: "0 8 * * 1-5" }, // 8h du matin, lun-ven
  async ({ step, logger }) => {
    // Charge tous les workspaces ayant des steps EMAIL PENDING et un SMTP vérifié
    const workspaces = await step.run("load-workspaces", async () => {
      const smtpConfigs = await prisma.smtpConfig.findMany({
        where: { isVerified: true, isDefault: true },
        select: {
          id: true,
          workspaceId: true,
          host: true,
          port: true,
          secure: true,
          username: true,
          password: true,
          fromEmail: true,
          fromName: true,
          dailyLimit: true,
          perMinuteLimit: true,
        },
      });
      return smtpConfigs;
    });

    logger.info(`Email outreach — ${workspaces.length} workspaces avec SMTP actif`);

    const summary: Array<{ workspaceId: string; sent: number; failed: number; skipped: number }> = [];

    for (const smtp of workspaces) {
      const stats = await step.run(`process-${smtp.workspaceId}`, async () => {
        const now = new Date();
        const startOfDay = new Date(now);
        startOfDay.setHours(0, 0, 0, 0);

        // Compte les envois déjà effectués aujourd'hui
        const sentToday = await prisma.sequenceStep.count({
          where: {
            channel: "EMAIL",
            status: { in: ["SENT", "DELIVERED", "OPENED"] },
            sentAt: { gte: startOfDay },
            sequence: { workspaceId: smtp.workspaceId },
          },
        });

        const remaining = Math.max(0, smtp.dailyLimit - sentToday);
        if (remaining === 0) {
          logger.info(`Workspace ${smtp.workspaceId} — limite journalière atteinte (${smtp.dailyLimit})`);
          return { sent: 0, failed: 0, skipped: 0 };
        }

        // Charge les steps PENDING EMAIL dus
        const pendingSteps = await prisma.sequenceStep.findMany({
          where: {
            channel: "EMAIL",
            status: "PENDING",
            sequence: { workspaceId: smtp.workspaceId },
            OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
          },
          include: {
            sequence: {
              include: {
                prospect: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    company: true,
                    jobTitle: true,
                    status: true,
                    emailStatus: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: "asc" },
          take: remaining,
        });

        if (!pendingSteps.length) return { sent: 0, failed: 0, skipped: 0 };

        logger.info(`Workspace ${smtp.workspaceId} — ${pendingSteps.length} steps à envoyer (${remaining} disponibles)`);

        const transporter = createSmtpTransporter({
          host: smtp.host,
          port: smtp.port,
          secure: smtp.secure,
          username: smtp.username,
          password: decryptIfNeeded(smtp.password),
        });

        const delayMs = smtp.perMinuteLimit > 0 ? Math.ceil(60_000 / smtp.perMinuteLimit) : 4_000;
        let sent = 0;
        let failed = 0;
        let skipped = 0;

        for (const s of pendingSteps) {
          const prospect = s.sequence.prospect;

          // Skip si pas d'email ou désinscrit / bounced
          if (!prospect.email || prospect.emailStatus === "unsubscribed" || prospect.emailStatus === "bounced" || prospect.emailStatus === "spam_complaint") {
            skipped++;
            await prisma.sequenceStep.update({
              where: { id: s.id },
              data: { status: "SKIPPED" },
            });
            continue;
          }

          // Interpolation des variables
          const { firstName, lastName } = splitName(prospect.name);
          const vars = {
            name: prospect.name,
            firstName,
            lastName,
            company: prospect.company ?? "",
            jobTitle: prospect.jobTitle ?? "",
          };

          const subject = interpolate(s.subject ?? "(sans objet)", vars);
          const bodyText = interpolate(s.content, vars);
          const html = injectTracking(toHtml(bodyText), s.id, prospect.id);

          // Marquer comme SENT avant l'envoi (optimistic) pour éviter les doublons en cas de retry
          await prisma.sequenceStep.update({
            where: { id: s.id },
            data: { status: "SENT", sentAt: now },
          });

          const result = await sendEmailViaSMTP(transporter, {
            from: smtp.fromEmail,
            fromName: smtp.fromName,
            to: prospect.email,
            subject,
            html,
          });

          if (result.success) {
            await prisma.sequenceStep.update({
              where: { id: s.id },
              data: {
                status: "DELIVERED",
                deliveredAt: now,
                messageId: result.messageId ?? null,
              },
            });

            // Prospect → CONTACTED si était NEW/RESEARCHED/MESSAGES_GENERATED
            const promotableStatuses = new Set(["NEW", "RESEARCHED", "MESSAGES_GENERATED"]);
            if (promotableStatuses.has(prospect.status)) {
              await prisma.prospect.update({
                where: { id: prospect.id },
                data: { status: "CONTACTED", lastInteractionAt: now },
              });
            }
            sent++;
          } else {
            await prisma.sequenceStep.update({
              where: { id: s.id },
              data: { status: "FAILED", error: result.error?.slice(0, 255) },
            });
            failed++;
          }

          // Délai entre envois pour respecter perMinuteLimit
          if (sent + failed < pendingSteps.length) {
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }

        transporter.close();
        logger.info(`Workspace ${smtp.workspaceId} — sent=${sent} failed=${failed} skipped=${skipped}`);

        // Mise à jour des métriques de délivrabilité
        if (sent > 0) await trackEmailMetrics(smtp.workspaceId, "sent").catch(() => undefined);
        if (failed > 0) await trackEmailMetrics(smtp.workspaceId, "bounced").catch(() => undefined);

        return { sent, failed, skipped };
      });

      summary.push({ workspaceId: smtp.workspaceId, ...stats });
    }

    const totalSent = summary.reduce((a, s) => a + s.sent, 0);
    logger.info(`Email outreach terminé — ${totalSent} emails envoyés`);
    return { workspacesProcessed: workspaces.length, summary };
  }
);

// ─── Déclenchement manuel ─────────────────────────────────────────────────────

export const emailOutreachManual = inngest.createFunction(
  { id: "email-outreach-manual", name: "Email Outreach — Envoi manuel", retries: 0 },
  { event: "email/outreach.trigger" },
  async ({ event, step }) => {
    const { workspaceId } = event.data as { workspaceId: string };

    return step.run("process", async () => {
      const smtp = await prisma.smtpConfig.findFirst({
        where: { workspaceId, isVerified: true, isDefault: true },
        select: {
          host: true, port: true, secure: true,
          username: true, password: true,
          fromEmail: true, fromName: true,
          dailyLimit: true, perMinuteLimit: true,
        },
      });

      if (!smtp) return { error: "Aucun SMTP vérifié configuré" };

      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      const sentToday = await prisma.sequenceStep.count({
        where: {
          channel: "EMAIL",
          status: { in: ["SENT", "DELIVERED", "OPENED"] },
          sentAt: { gte: startOfDay },
          sequence: { workspaceId },
        },
      });

      const remaining = Math.max(0, smtp.dailyLimit - sentToday);
      if (remaining === 0) return { sent: 0, failed: 0, message: "Limite journalière atteinte" };

      const pendingSteps = await prisma.sequenceStep.findMany({
        where: {
          channel: "EMAIL",
          status: "PENDING",
          sequence: { workspaceId },
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: now } }],
        },
        include: {
          sequence: {
            include: {
              prospect: {
                select: {
                  id: true, name: true, email: true,
                  company: true, jobTitle: true,
                  status: true, emailStatus: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: remaining,
      });

      if (!pendingSteps.length) return { sent: 0, failed: 0, message: "Queue vide" };

      const transporter = createSmtpTransporter({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        username: smtp.username,
        password: decryptIfNeeded(smtp.password),
      });

      const delayMs = smtp.perMinuteLimit > 0 ? Math.ceil(60_000 / smtp.perMinuteLimit) : 4_000;
      let sent = 0;
      let failed = 0;
      let skipped = 0;

      for (const s of pendingSteps) {
        const prospect = s.sequence.prospect;
        if (!prospect.email || prospect.emailStatus === "unsubscribed" || prospect.emailStatus === "bounced") {
          skipped++;
          await prisma.sequenceStep.update({ where: { id: s.id }, data: { status: "SKIPPED" } });
          continue;
        }

        const { firstName, lastName } = splitName(prospect.name);
        const vars = { name: prospect.name, firstName, lastName, company: prospect.company ?? "", jobTitle: prospect.jobTitle ?? "" };
        const subject = interpolate(s.subject ?? "(sans objet)", vars);
        const html = injectTracking(toHtml(interpolate(s.content, vars)), s.id, prospect.id);

        await prisma.sequenceStep.update({ where: { id: s.id }, data: { status: "SENT", sentAt: now } });

        const result = await sendEmailViaSMTP(transporter, {
          from: smtp.fromEmail,
          fromName: smtp.fromName,
          to: prospect.email,
          subject,
          html,
        });

        if (result.success) {
          await prisma.sequenceStep.update({
            where: { id: s.id },
            data: { status: "DELIVERED", deliveredAt: now, messageId: result.messageId ?? null },
          });
          const promotable = new Set(["NEW", "RESEARCHED", "MESSAGES_GENERATED"]);
          if (promotable.has(prospect.status)) {
            await prisma.prospect.update({
              where: { id: prospect.id },
              data: { status: "CONTACTED", lastInteractionAt: now },
            });
          }
          sent++;
        } else {
          await prisma.sequenceStep.update({ where: { id: s.id }, data: { status: "FAILED", error: result.error?.slice(0, 255) } });
          failed++;
        }

        if (sent + failed < pendingSteps.length) await new Promise((r) => setTimeout(r, delayMs));
      }

      transporter.close();
      if (sent > 0) await trackEmailMetrics(workspaceId, "sent").catch(() => undefined);
      if (failed > 0) await trackEmailMetrics(workspaceId, "bounced").catch(() => undefined);
      return { sent, failed, skipped };
    });
  }
);
