import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enrichBrandVoiceFromWebsite } from "@/lib/services/brand-voice-enricher";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = (await req.json()) as { workspaceId: string; websiteUrl?: string };
  const { workspaceId, websiteUrl } = body;

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId requis" }, { status: 400 });
  }

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true, brandVoice: true },
  });
  if (!workspace) {
    return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });
  }

  // Si une URL est fournie dans le body, la sauvegarder d'abord
  if (websiteUrl?.trim()) {
    const bv = (workspace.brandVoice ?? {}) as Record<string, unknown>;
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { brandVoice: { ...bv, websiteUrl: websiteUrl.trim() } },
    });
  }

  try {
    const result = await enrichBrandVoiceFromWebsite(workspaceId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
