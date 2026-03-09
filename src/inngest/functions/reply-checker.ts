import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { checkImapForReplies } from "@/lib/email/imap-checker";
import { decryptIfNeeded } from "@/lib/encryption";

/**
 * Reply Checker - Detection automatique des reponses via IMAP
 *
 * Cron toutes les 5 minutes :
 * - Pour chaque SmtpConfig avec IMAP configure
 * - Verifie les emails recus
 * - Matche les reponses aux SequenceSteps existants
 * - Emet des events email/event "replied"
 */

export const checkRepliesForAllWorkspaces = inngest.createFunction(
  {
    id: "reply-checker",
    name: "Check IMAP Replies",
    concurrency: { limit: 1 },
  },
  { cron: "*/5 * * * *" }, // Toutes les 5 minutes
  async ({ step }) => {
    // Trouver toutes les configs SMTP avec IMAP configure
    const imapConfigs = await step.run("load-imap-configs", async () => {
      return prisma.smtpConfig.findMany({
        where: {
          imapHost: { not: null },
          isVerified: true,
        },
        select: {
          id: true,
          workspaceId: true,
          username: true,
          password: true,
          imapHost: true,
          imapPort: true,
          imapSecure: true,
          fromEmail: true,
        },
      });
    });

    if (imapConfigs.length === 0) {
      return { checked: 0, replies: 0 };
    }

    let totalReplies = 0;

    for (const config of imapConfigs) {
      if (!config.imapHost) continue;

      const replies = await step.run(`check-imap-${config.id}`, async () => {
        // Verifier les 10 dernieres minutes
        const since = new Date(Date.now() - 10 * 60 * 1000);

        return checkImapForReplies(
          {
            host: config.imapHost!,
            port: config.imapPort || 993,
            secure: config.imapSecure,
            username: config.username,
            password: decryptIfNeeded(config.password),
          },
          since
        );
      });

      for (const reply of replies) {
        // Verifier si cette reply a deja ete enregistree
        const existing = await step.run(`check-existing-${reply.messageId.substring(0, 20)}`, async () => {
          return prisma.replyDetection.findUnique({
            where: { messageId: reply.messageId },
          });
        });

        if (existing) continue;

        // Matcher la reply a un SequenceStep envoye
        const matchedStep = await step.run(`match-reply-${reply.messageId.substring(0, 20)}`, async () => {
          // Matcher par In-Reply-To (Message-ID du step envoye)
          if (reply.inReplyTo) {
            const step = await prisma.sequenceStep.findFirst({
              where: {
                messageId: reply.inReplyTo,
                status: { in: ["SENT", "DELIVERED", "OPENED"] },
              },
            });
            if (step) return step;
          }

          // Matcher par email du prospect
          const prospect = await prisma.prospect.findFirst({
            where: {
              email: reply.fromEmail,
              workspaceId: config.workspaceId,
            },
          });

          if (prospect) {
            // Trouver le dernier step envoye pour ce prospect
            return prisma.sequenceStep.findFirst({
              where: {
                sequence: { prospectId: prospect.id },
                status: { in: ["SENT", "DELIVERED", "OPENED"] },
              },
              orderBy: { sentAt: "desc" },
            });
          }

          return null;
        });

        if (!matchedStep) continue;

        // Enregistrer la detection de reply
        await step.run(`save-reply-${reply.messageId.substring(0, 20)}`, async () => {
          await prisma.replyDetection.create({
            data: {
              sequenceStepId: matchedStep.id,
              fromEmail: reply.fromEmail,
              subject: reply.subject,
              snippet: reply.snippet,
              messageId: reply.messageId,
              receivedAt: reply.receivedAt,
            },
          });
        });

        // Emettre l'event email/event pour declencher trackEmailEvent
        await step.run(`emit-replied-${reply.messageId.substring(0, 20)}`, async () => {
          await inngest.send({
            name: "email/event",
            data: {
              stepId: matchedStep.id,
              eventType: "replied" as const,
              metadata: {
                fromEmail: reply.fromEmail,
                subject: reply.subject,
                detectedVia: "imap",
              },
            },
          });
        });

        // Re-scorer le prospect immédiatement (reply = signal fort)
        await step.run(`rescore-on-reply-${reply.messageId.substring(0, 20)}`, async () => {
          const sequence = await prisma.sequenceStep.findUnique({
            where: { id: matchedStep.id },
            include: { sequence: { select: { prospectId: true } } },
          });
          if (sequence?.sequence?.prospectId) {
            await inngest.send({
              name: "prospect/rescore",
              data: { prospectId: sequence.sequence.prospectId },
            });
          }
        });

        totalReplies++;
      }
    }

    return { checked: imapConfigs.length, replies: totalReplies };
  }
);
