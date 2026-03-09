/**
 * GET /api/integrations/gsc/callback
 *
 * Callback OAuth2 Google Search Console.
 * Reçoit ?code=&state=workspaceId depuis Google,
 * échange le code contre des tokens, sauvegarde en DB,
 * puis redirige vers /marketing-os/settings?gsc=connected.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { exchangeGSCCode } from "@/lib/services/integrations/google-search-console";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const workspaceId = searchParams.get("state");
  const error = searchParams.get("error");

  // Erreur OAuth de la part de Google
  if (error || !code || !workspaceId) {
    console.error("[GSC Callback] Erreur OAuth:", error || "code ou state manquant");
    return NextResponse.redirect(
      new URL("/marketing-os/settings?gsc=error", req.url)
    );
  }

  try {
    // Vérifier que le workspace appartient bien à l'utilisateur connecté
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, userId: session.user.id },
      select: { id: true, domainUrl: true, onboardingStep: true },
    });

    if (!workspace) {
      return NextResponse.redirect(
        new URL("/marketing-os/settings?gsc=unauthorized", req.url)
      );
    }

    // Échanger le code contre des tokens
    const { accessToken, refreshToken, expiresAt } = await exchangeGSCCode(code);

    // Déterminer l'URL du site (format GSC: "https://example.com/")
    const siteUrl = workspace.domainUrl.startsWith("http")
      ? workspace.domainUrl.replace(/\/?$/, "/")
      : `https://${workspace.domainUrl.replace(/\/?$/, "/")}`;

    // Sauvegarder la configuration GSC
    await prisma.googleSearchConsoleConfig.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        siteUrl,
        accessToken,
        refreshToken,
        tokenExpiry: expiresAt,
        isConnected: true,
      },
      update: {
        siteUrl,
        accessToken,
        refreshToken,
        tokenExpiry: expiresAt,
        isConnected: true,
      },
    });

    console.log(`[GSC] Connexion réussie pour workspace ${workspaceId}`);

    // Si l'onboarding n'est pas terminé, retourner à /onboarding
    const redirectBase =
      workspace.onboardingStep !== 0
        ? "/onboarding?gsc=connected"
        : "/marketing-os/settings?gsc=connected";

    return NextResponse.redirect(new URL(redirectBase, req.url));
  } catch (err) {
    console.error("[GSC Callback] Erreur:", err);
    return NextResponse.redirect(
      new URL("/marketing-os/settings?gsc=error", req.url)
    );
  }
}
