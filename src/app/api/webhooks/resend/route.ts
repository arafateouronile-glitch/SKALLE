/**
 * POST /api/webhooks/resend
 *
 * Adapter Resend → format normalisé email webhook.
 *
 * Événements Resend gérés:
 *   email.bounced      → bounced
 *   email.complained   → spam_complaint
 *   email.unsubscribed → unsubscribed
 *
 * Vérification de signature: RESEND_WEBHOOK_SECRET (svix)
 * Doc: https://resend.com/docs/dashboard/webhooks/introduction
 *
 * Env requis: RESEND_WEBHOOK_SECRET
 */

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { trackEmailMetrics } from "@/lib/prospection/deliverability";

// Resend event types → normalized type
const RESEND_EVENT_MAP: Record<string, "bounced" | "spam_complaint" | "unsubscribed"> = {
  "email.bounced": "bounced",
  "email.complained": "spam_complaint",
  "email.unsubscribed": "unsubscribed",
};

interface ResendEvent {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    to?: string[];
    from?: string;
    subject?: string;
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  // ── Signature verification ────────────────────────────────────────────────
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret) {
    const svixId        = request.headers.get("svix-id") ?? "";
    const svixTimestamp = request.headers.get("svix-timestamp") ?? "";
    const svixSignature = request.headers.get("svix-signature") ?? "";

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
    }

    // Reject messages older than 5 minutes
    const ts = Number(svixTimestamp);
    if (Math.abs(Date.now() / 1000 - ts) > 300) {
      return NextResponse.json({ error: "Timestamp too old" }, { status: 400 });
    }

    const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const expected = createHmac("sha256", secretBytes).update(toSign).digest("base64");

    const signatures = svixSignature.split(" ").map((s) => s.replace(/^v1,/, ""));
    const valid = signatures.some((sig) => {
      try {
        const sigBuf = Buffer.from(sig, "base64");
        const expBuf = Buffer.from(expected, "base64");
        return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
      } catch {
        return false;
      }
    });

    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  // ── Parse ─────────────────────────────────────────────────────────────────
  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const normalizedType = RESEND_EVENT_MAP[event.type];
  if (!normalizedType) {
    // Ignorer silencieusement les événements non gérés (email.sent, email.opened…)
    return NextResponse.json({ ok: true, skipped: event.type });
  }

  const emails = event.data.to ?? [];
  const emailId = event.data.email_id;

  try {
    // 1. Mettre à jour emailStatus de chaque destinataire
    for (const raw of emails) {
      const email = raw.toLowerCase().trim();
      if (!email) continue;

      await prisma.prospect.updateMany({
        where: { email },
        data: { emailStatus: normalizedType },
      });

      // Stopper séquences PENDING si unsubscribe ou spam
      if (normalizedType === "unsubscribed" || normalizedType === "spam_complaint") {
        await prisma.sequenceStep.updateMany({
          where: {
            sequence: { prospect: { email } },
            channel: "EMAIL",
            status: "PENDING",
          },
          data: { status: "SKIPPED" },
        });
      }
    }

    // 2. Envoyer événement Inngest si on peut relier à un step (email_id = stepId convention)
    if (emailId) {
      await inngest.send({
        name: "email/event",
        data: { stepId: emailId, eventType: normalizedType },
      }).catch(() => undefined); // best-effort
    }

    // 3. Mettre à jour les métriques de délivrabilité pour chaque workspace concerné
    if (emails.length > 0) {
      const workspaces = await prisma.prospect.findMany({
        where: { email: { in: emails.map((e) => e.toLowerCase()) } },
        select: { workspaceId: true },
        distinct: ["workspaceId"],
      });
      const metricEvent = normalizedType === "bounced" ? "bounced"
        : normalizedType === "spam_complaint" ? "spam"
        : "unsubscribed";

      await Promise.all(
        workspaces.map((ws) => trackEmailMetrics(ws.workspaceId, metricEvent).catch(() => undefined))
      );
    }

    return NextResponse.json({ ok: true, type: normalizedType, affected: emails.length });
  } catch (error) {
    console.error("[Resend webhook]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
