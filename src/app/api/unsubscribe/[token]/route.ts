/**
 * GET /api/unsubscribe/[token]
 *
 * Désinscription email RGPD.
 * Vérifie le token HMAC, marque le prospect UNSUBSCRIBED,
 * met à jour les métriques de délivrabilité, puis affiche une page de confirmation.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";
import { trackEmailMetrics } from "@/lib/prospection/deliverability";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const prospectId = verifyUnsubscribeToken(token);

  if (!prospectId) {
    return new NextResponse(renderPage("Lien invalide", "Ce lien de désinscription est invalide ou a expiré.", false), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  try {
    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      select: { id: true, status: true, workspaceId: true, name: true },
    });

    if (!prospect) {
      return new NextResponse(renderPage("Déjà traité", "Votre désinscription a déjà été enregistrée.", true), {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((prospect.status as any) !== "UNSUBSCRIBED") {
      await prisma.prospect.update({
        where: { id: prospectId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { status: "UNSUBSCRIBED" as any },
      });

      // Mettre à jour le taux de spam/unsubscribe dans la config délivrabilité
      await trackEmailMetrics(prospect.workspaceId, "bounced").catch(() => {});
    }

    return new NextResponse(renderPage("Désinscription confirmée", "Vous avez bien été désinscrit de nos communications. Vous ne recevrez plus d'emails de notre part.", true), {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("[Unsubscribe]", err);
    return new NextResponse(renderPage("Erreur", "Une erreur est survenue. Veuillez réessayer.", false), {
      status: 500,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

function renderPage(title: string, message: string, success: boolean): string {
  const color = success ? "#10b981" : "#ef4444";
  const icon = success ? "✓" : "✗";
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #f9fafb; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: white; border-radius: 12px; padding: 48px 40px; max-width: 420px; width: 90%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
    .icon { font-size: 48px; color: ${color}; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 12px; }
    p { color: #6b7280; font-size: 15px; line-height: 1.6; margin: 0; }
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
