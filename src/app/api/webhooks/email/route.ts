/**
 * 📧 Email Bounce/Spam Webhook
 *
 * Reçoit les notifications de rebond et plaintes spam des fournisseurs email.
 * Compatible avec Resend, Postmark, Mailgun, SendGrid (format normalisé).
 *
 * POST /api/webhooks/email
 * Header: Authorization: Bearer EMAIL_WEBHOOK_SECRET
 *
 * Corps attendu :
 * {
 *   type: "bounced" | "spam_complaint" | "unsubscribed",
 *   email: string,
 *   stepId?: string,   // si connu, pour mise à jour précise du SequenceStep
 * }
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";

export async function POST(request: Request) {
  // Vérification du secret
  const authHeader = request.headers.get("authorization");
  const secret = process.env.EMAIL_WEBHOOK_SECRET;

  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { type: string; email?: string; stepId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, email, stepId } = body;

  if (!type || !["bounced", "spam_complaint", "unsubscribed"].includes(type)) {
    return NextResponse.json({ error: "type must be bounced | spam_complaint | unsubscribed" }, { status: 400 });
  }

  const emailStatusMap: Record<string, string> = {
    bounced: "bounced",
    spam_complaint: "spam_complaint",
    unsubscribed: "unsubscribed",
  };

  try {
    // 1. Si stepId fourni : émettre l'événement Inngest pour mise à jour précise
    if (stepId) {
      await inngest.send({
        name: "email/event",
        data: {
          stepId,
          eventType: type as "bounced" | "unsubscribed" | "spam_complaint",
        },
      });
    }

    // 2. Si email fourni : mettre à jour l'emailStatus du prospect directement
    if (email) {
      await prisma.prospect.updateMany({
        where: { email: email.toLowerCase() },
        data: { emailStatus: emailStatusMap[type] },
      });

      // Stopper les séquences PENDING pour cet email
      if (type === "unsubscribed" || type === "spam_complaint") {
        await prisma.sequenceStep.updateMany({
          where: {
            sequence: { prospect: { email: email.toLowerCase() } },
            channel: "EMAIL",
            status: "PENDING",
          },
          data: { status: "SKIPPED" },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Email webhook error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
