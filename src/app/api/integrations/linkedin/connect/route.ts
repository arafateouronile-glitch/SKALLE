/**
 * GET /api/integrations/linkedin/connect?workspaceId=xxx
 *
 * Redirige vers l'écran de consentement OAuth LinkedIn.
 *
 * Variables d'env requises :
 *   LINKEDIN_CLIENT_ID=...
 *   LINKEDIN_CLIENT_SECRET=...
 *   NEXTAUTH_URL=https://ton-domaine.com
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Scopes standard — r_organization_social permet de lire les likes/comments
// sur les posts des pages company (nécessite approbation LinkedIn si pas déjà accordé).
const LINKEDIN_SCOPES = [
  "openid",
  "profile",
  "w_member_social",
  "r_member_social",
  "r_liteprofile",
  "r_organization_social",
].join(" ");

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId manquant" }, { status: 400 });
  }

  // redirectTo : page vers laquelle revenir après auth (défaut : marketing-os/settings)
  const redirectTo = req.nextUrl.searchParams.get("redirectTo") ?? "/marketing-os/settings?tab=integrations&linkedin=connected";

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true },
  });
  if (!workspace) {
    return NextResponse.json({ error: "Workspace non trouvé" }, { status: 404 });
  }

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "LINKEDIN_CLIENT_ID non configuré" }, { status: 500 });
  }

  const redirectUri = `${process.env.NEXTAUTH_URL}/api/integrations/linkedin/callback`;
  // state = "workspaceId|redirectTo" — séparateur | suffisamment rare dans les paths
  const state = `${workspaceId}|${redirectTo}`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: LINKEDIN_SCOPES,
  });

  return NextResponse.redirect(
    `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
  );
}
