/**
 * GET  /api/partners
 *   → Retourne les partenaires sauvegardés (Prospects source PARTNER_SOCIAL / PARTNER_SEO)
 *
 * POST /api/partners
 *   Body: { type: "social" | "seo", ...params }
 *   Social : { niche, minFollowers, maxFollowers, platform }
 *   SEO    : { keyword }
 *
 * PATCH /api/partners  { prospectId, status }
 *   → Met à jour le statut pipeline d'un partenaire (ex: CONTACTED)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withCredits } from "@/lib/credits";
import { getOrCreateWorkspace } from "@/lib/workspace";
import {
  runSocialPartnerSearch,
  runBlogPartnerSearch,
  type SocialPlatform,
} from "@/lib/services/sales/partnership-engine";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspace = await getOrCreateWorkspace(session);

  const partners = await prisma.prospect.findMany({
    where: {
      workspaceId: workspace.id,
      source: { in: ["PARTNER_SOCIAL", "PARTNER_SEO"] },
    },
    select: {
      id: true,
      name: true,
      company: true,
      jobTitle: true,
      linkedInUrl: true,
      email: true,
      status: true,
      source: true,
      score: true,
      createdAt: true,
      enrichmentData: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ partners });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { prospectId, status } = (await req.json()) as { prospectId: string; status: string };
  if (!prospectId || !status) return NextResponse.json({ error: "prospectId et status requis" }, { status: 400 });

  const workspace = await getOrCreateWorkspace(session);

  const prospect = await prisma.prospect.findFirst({
    where: { id: prospectId, workspaceId: workspace.id, source: { in: ["PARTNER_SOCIAL", "PARTNER_SEO"] } },
    select: { id: true },
  });
  if (!prospect) return NextResponse.json({ error: "Partenaire introuvable" }, { status: 404 });

  await prisma.prospect.update({
    where: { id: prospectId },
    data: { status: status as never },
  });

  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const workspace = await getOrCreateWorkspace(session);
  const workspaceId = workspace.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 });
  }

  const { type, saveToCRM = false } = body as {
    type: "social" | "seo";
    saveToCRM?: boolean;
  };

  if (!type) {
    return NextResponse.json({ error: "Paramètre manquant : type" }, { status: 400 });
  }

  if (type === "social") {
    const {
      niche,
      minFollowers = 10_000,
      maxFollowers = 500_000,
      platform = "INSTAGRAM",
    } = body as {
      niche: string;
      minFollowers?: number;
      maxFollowers?: number;
      platform?: SocialPlatform;
    };

    if (!niche) {
      return NextResponse.json({ error: "Paramètre manquant : niche" }, { status: 400 });
    }

    const result = await withCredits("partner_social_search", workspaceId, () =>
      runSocialPartnerSearch(niche, minFollowers, maxFollowers, platform as SocialPlatform, workspaceId, saveToCRM)
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 402 });
    }

    return NextResponse.json({ partners: result.data, creditsUsed: result.creditsUsed });
  }

  if (type === "seo") {
    const { keyword } = body as { keyword: string };

    if (!keyword) {
      return NextResponse.json({ error: "Paramètre manquant : keyword" }, { status: 400 });
    }

    const result = await withCredits("partner_seo_search", workspaceId, () =>
      runBlogPartnerSearch(keyword, workspaceId, saveToCRM)
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 402 });
    }

    return NextResponse.json({ partners: result.data, creditsUsed: result.creditsUsed });
  }

  return NextResponse.json({ error: `Type inconnu : ${type}` }, { status: 400 });
}
