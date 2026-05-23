import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getViralPosts, getViralPostFacets } from "@/lib/services/social/viral-monitor";
import type { HookType, ViralPlatform } from "@prisma/client";
import type { SortBy } from "@/lib/services/social/viral-monitor";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true },
  });

  const sp = req.nextUrl.searchParams;

  // Facets-only mode
  if (sp.get("facets") === "true") {
    const facets = await getViralPostFacets();
    return NextResponse.json(facets);
  }

  const platform = sp.get("platform") as ViralPlatform | null;
  const hookType = sp.get("hookType") as HookType | null;
  const niche = sp.get("niche") ?? undefined;
  const country = sp.get("country") ?? undefined;
  const minScore = Number(sp.get("minScore") ?? 0);
  const minLikes = Number(sp.get("minLikes") ?? 0);
  const minComments = Number(sp.get("minComments") ?? 0);
  const minViews = sp.get("minViews") ? Number(sp.get("minViews")) : undefined;
  const sortBy = (sp.get("sortBy") as SortBy | null) ?? "viralScore";
  const bookmarkedOnly = sp.get("bookmarkedOnly") === "true";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const limit = Math.min(50, Math.max(1, Number(sp.get("limit") ?? 20)));

  const result = await getViralPosts({
    platform: platform ?? undefined,
    hookType: hookType ?? undefined,
    niche,
    country,
    minScore,
    minLikes,
    minComments,
    minViews,
    sortBy,
    workspaceId: workspace?.id,
    bookmarkedOnly,
    page,
    limit,
  });

  return NextResponse.json(result);
}
