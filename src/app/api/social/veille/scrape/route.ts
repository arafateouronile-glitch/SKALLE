/**
 * POST /api/social/veille/scrape
 * Lance harvestapi~linkedin-profile-posts + apidojo~tweet-scraper + apify~facebook-posts-scraper en async.
 * Retourne { runIds } immédiatement, le frontend poll jusqu'à SUCCEEDED.
 *
 * POST /api/social/veille/scrape?collect=1  { runIds, queries }
 * Vérifie le statut et collecte le dataset quand terminé.
 */
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  startApifyRun,
  getApifyRunStatus,
  collectHarvestLinkedInRun,
  collectTwitterRun,
  collectFacebookRun,
} from "@/lib/services/social/viral-monitor";

const DEFAULT_QUERIES = [
  "entrepreneuriat",
  "marketing digital",
  "startup",
  "personal branding",
  "SaaS",
  "leadership",
  "productivité",
  "growth hacking",
];

// Curated French business/entrepreneurship Facebook pages
const FACEBOOK_PAGES = [
  "https://www.facebook.com/BFMBusiness/",
  "https://www.facebook.com/FrenchWeb/",
  "https://www.facebook.com/maddyness/",
  "https://www.facebook.com/HBRFrance/",
  "https://www.facebook.com/LesEchos/",
  "https://www.facebook.com/lentreprise.latribune/",
  "https://www.facebook.com/LaTribune/",
  "https://www.facebook.com/webmarketing.fr/",
];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  if (!process.env.APIFY_API_TOKEN) {
    return NextResponse.json(
      { error: "APIFY_API_TOKEN manquant dans les variables Vercel." },
      { status: 503 }
    );
  }

  if (req.nextUrl.searchParams.get("collect") === "1") {
    return handleCollect(req);
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { brandVoice: true },
  });

  const bv = workspace?.brandVoice as Record<string, unknown> | null;
  const queries = [...DEFAULT_QUERIES];
  if (bv?.niche && typeof bv.niche === "string") queries.unshift(bv.niche);
  if (Array.isArray(bv?.contentPillars)) queries.unshift(...(bv.contentPillars as string[]).slice(0, 3));
  const uniqueQueries = [...new Set(queries)].slice(0, 10);

  // Extra Facebook pages from brand voice
  const fbPages = [...FACEBOOK_PAGES];
  if (Array.isArray(bv?.facebookPages)) {
    fbPages.push(...(bv.facebookPages as string[]).slice(0, 4));
  }

  const errors: string[] = [];
  let linkedinRunId: string | null = null;
  let twitterRunId: string | null = null;
  let facebookRunId: string | null = null;

  await Promise.allSettled([
    startApifyRun("harvestapi~linkedin-profile-posts", {
      queries: uniqueQueries,
      sortBy: "TOP_POSTS",
      maxResults: 30,
    }).then((id) => { linkedinRunId = id; })
      .catch((e: Error) => errors.push(`LinkedIn: ${e.message}`)),

    startApifyRun("apidojo~tweet-scraper", {
      searchTerms: uniqueQueries.slice(0, 6),
      maxTweets: 30,
      queryType: "Top",
    }).then((id) => { twitterRunId = id; })
      .catch((e: Error) => errors.push(`Twitter: ${e.message}`)),

    startApifyRun("apify~facebook-posts-scraper", {
      startUrls: fbPages.slice(0, 8).map((url) => ({ url })),
      resultsLimit: 10,
      scrapeAbout: false,
      scrapeReviews: false,
    }).then((id) => { facebookRunId = id; })
      .catch((e: Error) => errors.push(`Facebook: ${e.message}`)),
  ]);

  if (!linkedinRunId && !twitterRunId && !facebookRunId) {
    return NextResponse.json({ error: `Échec Apify : ${errors.join(" | ")}` }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    runIds: { linkedin: linkedinRunId, twitter: twitterRunId, facebook: facebookRunId },
    queries: uniqueQueries,
    errors,
    message: "Scrape lancé — résultats dans ~2 min",
  });
}

async function handleCollect(req: NextRequest) {
  const body = await req.json() as {
    runIds: { linkedin: string | null; twitter: string | null; facebook?: string | null };
    queries: string[];
  };
  const { runIds, queries } = body;

  const [liStatus, twStatus, fbStatus] = await Promise.all([
    runIds.linkedin  ? getApifyRunStatus(runIds.linkedin).catch(() => "FAILED" as const)  : Promise.resolve("FAILED" as const),
    runIds.twitter   ? getApifyRunStatus(runIds.twitter).catch(() => "FAILED" as const)   : Promise.resolve("FAILED" as const),
    runIds.facebook  ? getApifyRunStatus(runIds.facebook).catch(() => "FAILED" as const)  : Promise.resolve("FAILED" as const),
  ]);

  const liDone = liStatus !== "RUNNING" && liStatus !== "READY";
  const twDone = twStatus !== "RUNNING" && twStatus !== "READY";
  const fbDone = fbStatus !== "RUNNING" && fbStatus !== "READY";

  if (!liDone || !twDone || !fbDone) {
    return NextResponse.json({ status: "running", liStatus, twStatus, fbStatus });
  }

  let saved = 0;
  const errors: string[] = [];

  if (liStatus === "SUCCEEDED" && runIds.linkedin) {
    saved += await collectHarvestLinkedInRun(runIds.linkedin, queries)
      .catch((e: Error) => { errors.push(`LinkedIn: ${e.message}`); return 0; });
  } else if (runIds.linkedin) {
    errors.push(`LinkedIn run ${liStatus}`);
  }

  if (twStatus === "SUCCEEDED" && runIds.twitter) {
    saved += await collectTwitterRun(runIds.twitter, queries)
      .catch((e: Error) => { errors.push(`Twitter: ${e.message}`); return 0; });
  } else if (runIds.twitter) {
    errors.push(`Twitter run ${twStatus}`);
  }

  if (fbStatus === "SUCCEEDED" && runIds.facebook) {
    saved += await collectFacebookRun(runIds.facebook, queries)
      .catch((e: Error) => { errors.push(`Facebook: ${e.message}`); return 0; });
  } else if (runIds.facebook) {
    errors.push(`Facebook run ${fbStatus}`);
  }

  return NextResponse.json({ status: "done", saved, errors });
}
