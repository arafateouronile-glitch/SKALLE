/**
 * GET /api/integrations/linkedin/callback
 *
 * Callback OAuth LinkedIn. Reçoit ?code=&state=workspaceId,
 * échange le code contre un access_token, récupère le profil (personUrn + nom),
 * sauvegarde le tout chiffré dans ExternalIntegration (provider: LINKEDIN_OAUTH),
 * puis redirige vers /marketing-os/settings?linkedin=connected.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/security/crypto";

const SETTINGS_URL = "/marketing-os/settings?tab=integrations&linkedin=connected";
const ERROR_URL = "/marketing-os/settings?tab=integrations&linkedin=error";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const workspaceId = searchParams.get("state");
  const error = searchParams.get("error");

  if (error || !code || !workspaceId) {
    console.error("[LinkedIn callback] OAuth error:", error ?? "code ou state manquant");
    return NextResponse.redirect(new URL(ERROR_URL, req.url));
  }

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) {
    return NextResponse.redirect(new URL(ERROR_URL, req.url));
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL(ERROR_URL, req.url));
  }

  try {
    const redirectUri = `${process.env.NEXTAUTH_URL}/api/integrations/linkedin/callback`;

    // 1. Échanger le code contre un access_token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!tokenRes.ok) {
      console.error("[LinkedIn callback] Token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(new URL(ERROR_URL, req.url));
    }

    const tokenData = await tokenRes.json() as {
      access_token: string;
      expires_in: number;
    };

    const accessToken = tokenData.access_token;
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // 2. Récupérer le profil via OpenID Connect (userinfo endpoint)
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let personUrn = "";
    let name = "";

    if (profileRes.ok) {
      const profile = await profileRes.json() as {
        sub: string;  // LinkedIn person ID
        name?: string;
        given_name?: string;
        family_name?: string;
      };
      personUrn = `urn:li:person:${profile.sub}`;
      name = profile.name ?? `${profile.given_name ?? ""} ${profile.family_name ?? ""}`.trim();
    }

    // 3. Chiffrer et sauvegarder le token
    const tokenPayload = JSON.stringify({ accessToken, expiresAt, personUrn, name });
    const { encrypted, iv } = encryptSecret(tokenPayload);

    await prisma.externalIntegration.upsert({
      where: { workspaceId_provider: { workspaceId, provider: "LINKEDIN_OAUTH" } },
      create: { workspaceId, provider: "LINKEDIN_OAUTH", encryptedApiKey: encrypted, iv },
      update: { encryptedApiKey: encrypted, iv },
    });

    console.log(`[LinkedIn] Connexion réussie pour workspace ${workspaceId} — ${name}`);
    return NextResponse.redirect(new URL(SETTINGS_URL, req.url));
  } catch (err) {
    console.error("[LinkedIn callback] Erreur:", err);
    return NextResponse.redirect(new URL(ERROR_URL, req.url));
  }
}
