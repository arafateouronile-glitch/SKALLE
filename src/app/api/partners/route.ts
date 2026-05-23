/**
 * POST /api/partners
 *
 * Le workspaceId est résolu depuis la session (jamais fait confiance au client).
 *
 * Body: { type: "social" | "seo", saveToCRM?: boolean, ...params }
 *   Social : { niche, minFollowers, maxFollowers, platform }
 *   SEO    : { keyword }
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
