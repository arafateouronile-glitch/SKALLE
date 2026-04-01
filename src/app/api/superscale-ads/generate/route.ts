/**
 * POST /api/superscale-ads/generate
 *
 * Crée une AdCampaign en DB, déclenche le job Inngest, retourne le campaignId
 * pour que le client puisse poller GET /api/superscale-ads/[campaignId].
 *
 * Body : { niche: string, workspaceId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { useCredits } from "@/lib/credits";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = (await req.json()) as { niche?: string; workspaceId?: string };
  const { niche, workspaceId } = body;

  if (!niche?.trim() || !workspaceId?.trim()) {
    return NextResponse.json({ error: "niche et workspaceId sont requis" }, { status: 400 });
  }

  // Vérifier que le workspace appartient à l'utilisateur
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
    select: { id: true, name: true, brandVoice: true },
  });

  if (!workspace) {
    return NextResponse.json({ error: "Workspace introuvable" }, { status: 404 });
  }

  // Déduire les crédits
  const creditResult = await useCredits(session.user.id, "superscale_campaign");
  if (!creditResult.success) {
    return NextResponse.json(
      { error: "Crédits insuffisants. La campagne Superscale coûte 50 crédits." },
      { status: 402 }
    );
  }

  // Extraire le contexte de marque si disponible
  const brandVoice = workspace.brandVoice as Record<string, unknown> | null;
  const brandContext = brandVoice
    ? `Marque: ${workspace.name}. Ton: ${brandVoice.tone ?? "professionnel"}. Style: ${brandVoice.style ?? "moderne"}. ${brandVoice.description ?? ""}`
    : `Marque: ${workspace.name}`;

  // Créer la campagne en DB (statut GENERATING)
  const campaign = await prisma.adCampaign.create({
    data: {
      workspaceId,
      niche: niche.trim(),
      status: "GENERATING",
    },
  });

  // Déclencher le job Inngest en arrière-plan
  await inngest.send({
    name: "marketing/superscale.run",
    data: {
      workspaceId,
      userId: session.user.id,
      niche: niche.trim(),
      campaignId: campaign.id,
      brandContext,
    },
  });

  return NextResponse.json({ campaignId: campaign.id, status: "GENERATING" }, { status: 202 });
}
