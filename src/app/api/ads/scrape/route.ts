/**
 * POST /api/ads/scrape
 * Lance apify~facebook-ads-scraper en async.
 * Retourne { runId } immédiatement — le frontend poll jusqu'à SUCCEEDED.
 *
 * POST /api/ads/scrape?collect=1  { runId, workspaceId }
 * Vérifie le statut, collecte et persiste les ads quand terminé.
 */
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  startApifyRun,
  getApifyRunStatus,
  fetchApifyRunItems,
} from "@/lib/services/social/viral-monitor";
import { buildFbAdLibraryUrl, mapFbAdToRaw } from "@/lib/services/ads/apify-scrapers";

interface ApifyFbSnapshot {
  body?: { text?: string };
  title?: string;
  caption?: string;
  displayFormat?: string;
  linkUrl?: string | null;
  images?: Array<{ originalImageUrl?: string; resizedImageUrl?: string }>;
  videos?: Array<{ videoPreviewImageUrl?: string }>;
  pageCategories?: string[];
  pageLikeCount?: number;
  pageName?: string;
}

interface ApifyFbAd {
  adArchiveID?: string;
  adArchiveId?: string;
  pageName?: string;
  startDateFormatted?: string;
  endDateFormatted?: string | null;
  isActive?: boolean;
  snapshot?: ApifyFbSnapshot;
  impressionsWithIndex?: { impressionsText?: string | null };
  error?: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  if (!process.env.APIFY_API_TOKEN) {
    return NextResponse.json({ error: "APIFY_API_TOKEN manquant" }, { status: 503 });
  }

  if (req.nextUrl.searchParams.get("collect") === "1") {
    return handleCollect(req, session.user.id);
  }

  const { keyword, country = "FR", limit = 20 } = (await req.json()) as {
    keyword: string;
    country?: string;
    limit?: number;
  };

  if (!keyword?.trim()) return NextResponse.json({ error: "keyword requis" }, { status: 400 });

  const searchUrl = buildFbAdLibraryUrl(keyword.trim(), country);

  try {
    const runId = await startApifyRun("apify~facebook-ads-scraper", {
      startUrls: [{ url: searchUrl }],
      maxAds: Math.min(limit, 50),
    });
    return NextResponse.json({ ok: true, runId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Apify start failed: ${msg}` }, { status: 502 });
  }
}

async function handleCollect(req: NextRequest, userId: string) {
  const { runId, workspaceId } = (await req.json()) as {
    runId: string;
    workspaceId: string;
  };

  // Verify workspace ownership
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
    select: { id: true },
  });
  if (!workspace) return NextResponse.json({ error: "Workspace non trouvé" }, { status: 403 });

  const status = await getApifyRunStatus(runId).catch(() => "FAILED" as const);
  const done = status !== "RUNNING" && status !== "READY";

  if (!done) return NextResponse.json({ status: "running", runStatus: status });

  if (status !== "SUCCEEDED") {
    return NextResponse.json({ status: "done", ads: [], error: `Run ${status}` });
  }

  const items = await fetchApifyRunItems<ApifyFbAd>(runId);
  const rawAds = items.map(mapFbAdToRaw).filter((a) => a !== null);

  const persisted = [];
  for (const ad of rawAds) {
    try {
      const record = await prisma.scrapedAd.upsert({
        where: { adLibraryId: ad.adLibraryId },
        create: {
          platform: ad.platform,
          adLibraryId: ad.adLibraryId,
          advertiserName: ad.advertiserName,
          adContent: ad.adContent,
          mediaUrl: ad.mediaUrl,
          isActive: ad.isActive,
          daysActive: ad.daysActive,
          workspaceId,
        },
        update: {
          isActive: ad.isActive,
          daysActive: ad.daysActive,
          adContent: ad.adContent,
        },
      });
      // Enrich with runtime fields not in schema
      persisted.push({
        ...record,
        advertiserDomain: ad.advertiserDomain ?? null,
        industry: ad.industry ?? null,
        viewCount: ad.viewCount ?? null,
        likeCount: null,
        commentCount: null,
      });
    } catch { /* duplicate */ }
  }

  return NextResponse.json({ status: "done", ads: persisted });
}
