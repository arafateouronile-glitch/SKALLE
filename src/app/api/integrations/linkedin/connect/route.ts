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

const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"].join(" ");

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const workspaceId = req.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId manquant" }, { status: 400 });
  }

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
  const state = workspaceId; // on passe le workspaceId comme state

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
