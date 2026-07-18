/**
 * POST /api/social/linkedin/session-sync
 *
 * Reçoit le cookie de session LinkedIn (li_at + JSESSIONID) synchronisé par
 * l'extension Chrome et le stocke dans LinkedInAutomationConfig. C'est ce qui
 * permet au cron serveur (scrapeWarmLeadsServerSide, linkedin-reply-checker)
 * de tourner sans que l'extension/l'onglet LinkedIn reste ouvert.
 *
 * Authentification : Bearer token (ExtensionToken table), même pattern que
 * /api/social/linkedin/warm-import.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface SessionSyncBody {
  liAt: string;
  jsessionId?: string;
}

async function resolveWorkspaceFromToken(token: string): Promise<string | null> {
  const record = await prisma.extensionToken.findUnique({
    where: { token },
    select: { workspaceId: true },
  });
  return record?.workspaceId ?? null;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return NextResponse.json({ error: "Token manquant" }, { status: 401 });
  }

  const workspaceId = await resolveWorkspaceFromToken(token);
  if (!workspaceId) {
    return NextResponse.json({ error: "Token invalide" }, { status: 401 });
  }

  let body: SessionSyncBody;
  try {
    body = (await req.json()) as SessionSyncBody;
  } catch {
    return NextResponse.json({ error: "Body invalide" }, { status: 400 });
  }

  const liAt = body.liAt?.trim();
  if (!liAt) {
    return NextResponse.json({ error: "liAt manquant" }, { status: 400 });
  }
  const jsessionId = body.jsessionId?.trim() || null;

  await prisma.linkedInAutomationConfig.upsert({
    where: { workspaceId },
    update: { liAt, jsessionId, isActive: true },
    create: { workspaceId, liAt, jsessionId, isActive: true },
  });

  return NextResponse.json({ synced: true });
}
