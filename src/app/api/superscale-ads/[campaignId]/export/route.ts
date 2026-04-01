/**
 * POST /api/superscale-ads/[campaignId]/export
 *
 * Envoie toutes les variantes vers Facebook Ads en mode brouillon (PAUSED).
 * Body : { adAccountId: string, pageId: string, variantIds?: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { exportVariantToMeta } from "@/lib/services/marketing/superscale-agent";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { campaignId } = await params;
  const body = (await req.json()) as {
    adAccountId?: string;
    pageId?: string;
    variantIds?: string[];
  };

  if (!body.adAccountId || !body.pageId) {
    return NextResponse.json({ error: "adAccountId et pageId sont requis" }, { status: 400 });
  }

  const campaign = await prisma.adCampaign.findFirst({
    where: {
      id: campaignId,
      workspace: { userId: session.user.id },
      status: "READY",
    },
    include: { variants: true },
  });

  if (!campaign) {
    return NextResponse.json(
      { error: "Campagne introuvable ou pas encore prête (status doit être READY)" },
      { status: 404 }
    );
  }

  const variantsToExport = body.variantIds
    ? campaign.variants.filter((v) => body.variantIds!.includes(v.id))
    : campaign.variants;

  const results = await Promise.all(
    variantsToExport.map((v) =>
      exportVariantToMeta(v.id, body.adAccountId!, body.pageId!)
    )
  );

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  if (succeeded > 0) {
    await prisma.adCampaign.update({
      where: { id: campaignId },
      data: { status: "EXPORTED" },
    });
  }

  return NextResponse.json({ succeeded, failed, results });
}
