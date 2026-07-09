import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { HubSpotClient } from "@/lib/crm/hubspot-client";
import { runFullSync } from "@/lib/crm/hubspot-sync";
import { inngest } from "@/inngest/client";

async function getWorkspaceId(userId: string): Promise<string | null> {
  const ws = await prisma.workspace.findFirst({
    where: { userId },
    select: { id: true },
  });
  return ws?.id ?? null;
}

// POST /api/crm/hubspot — connect (save token)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const { token } = await req.json();
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Token requis" }, { status: 400 });
  }

  // Validate token against HubSpot API
  const client = new HubSpotClient(token.trim());
  const validation = await client.validateToken();
  if (!validation.valid) {
    return NextResponse.json({ error: "Token HubSpot invalide" }, { status: 400 });
  }

  // Save encrypted
  const encryptedApiKey = encrypt(token.trim());
  await prisma.externalIntegration.upsert({
    where: { workspaceId_provider: { workspaceId, provider: "hubspot" } },
    create: { workspaceId, provider: "hubspot", encryptedApiKey, iv: "" },
    update: { encryptedApiKey },
  });

  return NextResponse.json({ success: true, portalId: validation.portalId });
}

// GET /api/crm/hubspot — status
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const integration = await prisma.externalIntegration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: "hubspot" } },
    select: { updatedAt: true },
  });

  if (!integration) return NextResponse.json({ connected: false });

  // Count synced prospects
  const syncedCount = await prisma.prospect.count({
    where: { workspaceId, hubspotContactId: { not: null } },
  });

  return NextResponse.json({
    connected: true,
    connectedAt: integration.updatedAt,
    syncedProspects: syncedCount,
  });
}

// PATCH /api/crm/hubspot — manual sync trigger
export async function PATCH() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  const integration = await prisma.externalIntegration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider: "hubspot" } },
  });
  if (!integration) return NextResponse.json({ error: "HubSpot non connecté" }, { status: 400 });

  try {
    // Trigger Inngest sync event for this workspace
    await inngest.send({ name: "crm/hubspot.sync", data: { workspaceId } });
    // Also run inline for immediate feedback
    const result = await runFullSync(workspaceId);
    return NextResponse.json({ success: true, result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/crm/hubspot — disconnect
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = await getWorkspaceId(session.user.id);
  if (!workspaceId) return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });

  await prisma.externalIntegration.deleteMany({
    where: { workspaceId, provider: "hubspot" },
  });

  return NextResponse.json({ success: true });
}
