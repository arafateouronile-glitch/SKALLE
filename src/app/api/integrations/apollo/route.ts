/**
 * POST /api/integrations/apollo  → sauvegarder + tester la clé Apollo
 * GET  /api/integrations/apollo  → récupérer le statut (clé configurée ? quotas ?)
 * DELETE /api/integrations/apollo → supprimer la clé
 */

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { apolloCheckAccount, getApolloApiKey } from "@/lib/services/apollo-client";

export const dynamic = "force-dynamic";

async function requireWorkspace(userId: string) {
  return prisma.workspace.findFirst({
    where: { userId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const ws = await requireWorkspace(session.user.id);
  if (!ws) return NextResponse.json({ connected: false });

  const integration = await prisma.externalIntegration.findFirst({
    where: { workspaceId: ws.id, provider: "apollo" },
    select: { id: true, updatedAt: true },
  });

  return NextResponse.json({ connected: !!integration, updatedAt: integration?.updatedAt ?? null });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { apiKey } = (await req.json()) as { apiKey: string };
  if (!apiKey?.trim()) return NextResponse.json({ error: "Clé API requise" }, { status: 400 });

  // Tester la clé avant de la sauvegarder
  const check = await apolloCheckAccount(apiKey.trim());
  if (!check.ok) {
    return NextResponse.json(
      { error: `Clé Apollo invalide : ${check.error ?? "vérifiez votre clé dans Apollo → Settings → Integrations"}` },
      { status: 422 }
    );
  }

  const ws = await requireWorkspace(session.user.id);
  if (!ws) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  // Stocker le format complet "iv:authTag:ciphertext" dans encryptedApiKey
  const encrypted = encrypt(apiKey.trim());

  await prisma.externalIntegration.upsert({
    where: { workspaceId_provider: { workspaceId: ws.id, provider: "apollo" } },
    create: { workspaceId: ws.id, provider: "apollo", encryptedApiKey: encrypted, iv: "gcm" },
    update: { encryptedApiKey: encrypted, iv: "gcm" },
  });

  return NextResponse.json({
    ok: true,
    planTier: check.planTier,
    emailCreditsUsed: check.emailCreditsUsed,
    emailCreditsLimit: check.emailCreditsLimit,
  });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const ws = await requireWorkspace(session.user.id);
  if (!ws) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  await prisma.externalIntegration.deleteMany({
    where: { workspaceId: ws.id, provider: "apollo" },
  });

  return NextResponse.json({ ok: true });
}

// getApolloApiKey est maintenant dans src/lib/services/apollo-client.ts
export { getApolloApiKey } from "@/lib/services/apollo-client";
