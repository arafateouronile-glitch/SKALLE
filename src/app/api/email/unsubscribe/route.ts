/**
 * 🚫 Email Unsubscribe Endpoint
 *
 * GET /api/email/unsubscribe?email=xxx&token=yyy
 *
 * Inclure dans chaque email : <a href="/api/email/unsubscribe?email={{email}}&token={{hmac}}">Se désabonner</a>
 * Générer le token : crypto.createHmac('sha256', UNSUBSCRIBE_SECRET).update(email).digest('hex')
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { inngest } from "@/inngest/client";

const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET || process.env.NEXTAUTH_SECRET || "fallback-secret";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");
  const token = url.searchParams.get("token");

  if (!email || !token) {
    return new Response(renderPage("Lien invalide", "Ce lien de désabonnement est incomplet.", false), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
      status: 400,
    });
  }

  // Vérifier la signature HMAC
  const expected = crypto.createHmac("sha256", UNSUBSCRIBE_SECRET).update(email).digest("hex");
  const isValid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token.padEnd(expected.length, "0").slice(0, expected.length)));

  if (!isValid) {
    return new Response(renderPage("Lien expiré", "Ce lien de désabonnement est invalide ou expiré.", false), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
      status: 403,
    });
  }

  try {
    // Marquer tous les prospects avec cet email comme désabonnés
    const updated = await prisma.prospect.updateMany({
      where: { email: email.toLowerCase() },
      data: { emailStatus: "unsubscribed" },
    });

    // Envoyer l'événement Inngest pour stopper les séquences actives
    const activeSteps = await prisma.sequenceStep.findMany({
      where: {
        sequence: { prospect: { email: email.toLowerCase() } },
        channel: "EMAIL",
        status: "PENDING",
      },
      select: { id: true },
    });

    for (const step of activeSteps) {
      await inngest.send({
        name: "email/event",
        data: { stepId: step.id, eventType: "unsubscribed" },
      });
    }

    return new Response(
      renderPage(
        "Désabonnement confirmé",
        `L'adresse <strong>${email}</strong> a bien été retirée de notre liste. Vous ne recevrez plus de messages de notre part.`,
        true
      ),
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (error) {
    console.error("Unsubscribe error:", error);
    return new Response(renderPage("Erreur", "Une erreur s'est produite. Veuillez réessayer ou nous contacter directement.", false), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
      status: 500,
    });
  }
}

function renderPage(title: string, message: string, success: boolean): string {
  const color = success ? "#10b981" : "#ef4444";
  const icon = success ? "✓" : "✕";
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — SKALLE</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; }
    .card { background: white; border-radius: 12px; padding: 48px 40px; max-width: 440px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .icon { font-size: 48px; background: ${color}20; border-radius: 50%; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: ${color}; }
    h1 { font-size: 22px; color: #111; margin: 0 0 12px; }
    p { color: #6b7280; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
