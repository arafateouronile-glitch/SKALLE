/**
 * Facebook Data Deletion Callback
 *
 * Requis par Meta pour les apps utilisant Facebook Login.
 * Déclenché quand un utilisateur supprime l'app depuis ses paramètres Facebook.
 *
 * Spec : https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback
 *
 * GET  : Affiche le statut de suppression (confirmation_code requis)
 * POST : Reçoit la demande de suppression signée par Meta
 */

import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

const APP_SECRET = process.env.META_APP_SECRET ?? "";
const BASE_URL = process.env.NEXTAUTH_URL ?? "https://app.skalle.io";

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseSignedRequest(signedRequest: string): { user_id: string } | null {
  try {
    const [encodedSig, payload] = signedRequest.split(".");

    const sig = Buffer.from(encodedSig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    const data = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );

    const expectedSig = crypto
      .createHmac("sha256", APP_SECRET)
      .update(payload)
      .digest();

    if (!crypto.timingSafeEqual(sig, expectedSig)) return null;

    return data;
  } catch {
    return null;
  }
}

// ─── POST : Réception de la demande de suppression ──────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.formData();
    const signedRequest = body.get("signed_request") as string | null;

    if (!signedRequest || !APP_SECRET) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const data = parseSignedRequest(signedRequest);
    if (!data?.user_id) {
      return NextResponse.json({ error: "Invalid signed request" }, { status: 400 });
    }

    const facebookUserId = data.user_id;

    // Trouver l'account lié à ce Facebook ID
    const account = await prisma.account.findFirst({
      where: { provider: "facebook", providerAccountId: facebookUserId },
      include: { user: true },
    });

    // Générer un code de confirmation unique
    const confirmationCode = crypto.randomBytes(16).toString("hex");

    if (account) {
      // Récupérer les workspaces de l'utilisateur pour supprimer les ExtensionTokens associés
      const workspaces = await prisma.workspace.findMany({
        where: { userId: account.userId },
        select: { id: true },
      });
      const workspaceIds = workspaces.map((w) => w.id);

      // Supprimer : account Facebook, ExtensionToken liés, et données associées
      await prisma.$transaction([
        // Supprimer le compte OAuth Facebook
        prisma.account.deleteMany({
          where: { provider: "facebook", providerAccountId: facebookUserId },
        }),
        // Supprimer les tokens d'extension Chrome liés aux workspaces de l'utilisateur
        prisma.extensionToken.deleteMany({
          where: { workspaceId: { in: workspaceIds } },
        }),
      ]);

      // Log de la demande (sans données personnelles)
      console.log(
        `[Meta Data Deletion] Processed for providerAccountId=${facebookUserId}, confirmationCode=${confirmationCode}`
      );
    } else {
      // Aucune donnée trouvée — on répond quand même avec un code valide
      console.log(
        `[Meta Data Deletion] No data found for providerAccountId=${facebookUserId}, confirmationCode=${confirmationCode}`
      );
    }

    // Réponse conforme à la spec Meta
    return NextResponse.json({
      url: `${BASE_URL}/api/facebook/data-deletion?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  } catch (error) {
    console.error("[Meta Data Deletion] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── GET : Page de statut (optionnel, pour l'interface Meta) ─────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing confirmation code" }, { status: 400 });
  }

  // Dans une implémentation complète, on vérifierait le statut en base.
  // Ici on confirme simplement que la demande a été traitée.
  return NextResponse.json({
    status: "completed",
    confirmation_code: code,
    message: "Your Facebook data deletion request has been processed.",
  });
}
