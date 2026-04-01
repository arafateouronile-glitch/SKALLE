/**
 * GET /api/superscale-ads/[campaignId]
 *
 * Retourne le statut et les variantes d'une AdCampaign.
 * Polled par le client toutes les 3s pendant GENERATING.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { campaignId } = await params;

  const campaign = await prisma.adCampaign.findFirst({
    where: {
      id: campaignId,
      workspace: { userId: session.user.id },
    },
    include: {
      variants: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
  }

  return NextResponse.json({
    id: campaign.id,
    niche: campaign.niche,
    status: campaign.status,
    errorMessage: campaign.errorMessage,
    competitorInsights: campaign.competitorInsights,
    variants: campaign.variants.map((v) => ({
      id: v.id,
      angle: v.angle,
      framework: v.framework,
      primaryText: v.primaryText,
      headline: v.headline,
      subheadline: v.subheadline,
      imagePrompt: v.imagePrompt,
      backgroundUrl: v.backgroundUrl,
      squareUrl: v.squareUrl,
      storyUrl: v.storyUrl,
      landscapeUrl: v.landscapeUrl,
      metaAdId: v.metaAdId,
      exportedAt: v.exportedAt,
    })),
    createdAt: campaign.createdAt,
  });
}
