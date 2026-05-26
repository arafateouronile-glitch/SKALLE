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

  // Only scrape the network the user actually selected — never launch all 3 at once
  const body = await req.json().catch(() => ({})) as { networks?: string[] };
  const requestedNetworks: string[] = body.networks ?? ["LINKEDIN"];

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { brandVoice: true },
  });

  const bv = workspace?.brandVoice as Record<string, unknown> | null;
  const queries = [...DEFAULT_QUERIES];
  if (bv?.niche && typeof bv.niche === "string") queries.unshift(bv.niche);
  if (Array.isArray(bv?.contentPillars)) queries.unshift(...(bv.contentPillars as string[]).slice(0, 2));
  const uniqueQueries = [...new Set(queries)].slice(0, 3); // max 3 queries

  const errors: string[] = [];
  let linkedinRunId: string | null = null;
  let twitterRunId: string | null = null;
  let facebookRunId: string | null = null;

  const tasks: Promise<unknown>[] = [];

  if (requestedNetworks.includes("LINKEDIN")) {
    tasks.push(
      startApifyRun("harvestapi~linkedin-profile-posts", {
        queries: uniqueQueries,
        sortBy: "TOP_POSTS",
        maxResults: 10,
      }).then((id) => { linkedinRunId = id; })
        .catch((e: Error) => errors.push(`LinkedIn: ${e.message}`))
    );
  }

  if (requestedNetworks.includes("TWITTER")) {
    tasks.push(
      startApifyRun("apidojo~tweet-scraper", {
        searchTerms: uniqueQueries.slice(0, 2),
        maxItems: 10,
        maxTweetsPerQuery: 5,
        queryType: "Top",
      }).then((id) => { twitterRunId = id; })
        .catch((e: Error) => errors.push(`Twitter: ${e.message}`))
    );
  }

  if (requestedNetworks.includes("FACEBOOK") || requestedNetworks.includes("INSTAGRAM")) {
    const fbPages = FACEBOOK_PAGES.slice(0, 3);
    tasks.push(
      startApifyRun("apify~facebook-posts-scraper", {
        startUrls: fbPages.map((url) => ({ url })),
        resultsLimit: 3,
        scrapeAbout: false,
        scrapeReviews: false,
      }).then((id) => { facebookRunId = id; })
        .catch((e: Error) => errors.push(`Facebook: ${e.message}`))
    );
  }

  await Promise.allSettled(tasks);

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
    collectedRunIds?: string[];
  };
  const { runIds, queries, collectedRunIds = [] } = body;

  // Hard cap: entire collect must finish in 28 s — avoids multi-minute server holds
  const hardTimeout = new Promise<NextResponse>((resolve) =>
    setTimeout(
      () => resolve(NextResponse.json({ status: "running", saved: 0, errors: ["collect timeout — réessai dans 10s"], newlyCollected: [] })),
      28_000
    )
  );

  return Promise.race([doCollect(runIds, queries, collectedRunIds), hardTimeout]);
}

async function doCollect(
  runIds: { linkedin: string | null; twitter: string | null; facebook?: string | null },
  queries: string[],
  collectedRunIds: string[]
): Promise<NextResponse> {
  const [liStatus, twStatus, fbStatus] = await Promise.all([
    runIds.linkedin  ? getApifyRunStatus(runIds.linkedin).catch(() => "FAILED" as const)  : Promise.resolve(null as null),
    runIds.twitter   ? getApifyRunStatus(runIds.twitter).catch(() => "FAILED" as const)   : Promise.resolve(null as null),
    runIds.facebook  ? getApifyRunStatus(runIds.facebook).catch(() => "FAILED" as const)  : Promise.resolve(null as null),
  ]);

  const isStillRunning = (s: string | null) => s === "RUNNING" || s === "READY";
  const liDone = !isStillRunning(liStatus);
  const twDone = !isStillRunning(twStatus);
  const fbDone = !isStillRunning(fbStatus);

  let saved = 0;
  const errors: string[] = [];
  const newlyCollected: string[] = [];

  // Eagerly collect any finished run — skip runs already collected this session
  if (liDone && liStatus === "SUCCEEDED" && runIds.linkedin && !collectedRunIds.includes(runIds.linkedin)) {
    saved += await collectHarvestLinkedInRun(runIds.linkedin, queries)
      .catch((e: Error) => { errors.push(`LinkedIn: ${e.message}`); return 0; });
    newlyCollected.push(runIds.linkedin);
  } else if (liDone && runIds.linkedin && liStatus !== "SUCCEEDED" && liStatus !== null) {
    errors.push(`LinkedIn run ${liStatus}`);
  }

  if (twDone && twStatus === "SUCCEEDED" && runIds.twitter && !collectedRunIds.includes(runIds.twitter)) {
    saved += await collectTwitterRun(runIds.twitter, queries)
      .catch((e: Error) => { errors.push(`Twitter: ${e.message}`); return 0; });
    newlyCollected.push(runIds.twitter);
  } else if (twDone && runIds.twitter && twStatus !== "SUCCEEDED" && twStatus !== null) {
    errors.push(`Twitter run ${twStatus}`);
  }

  if (fbDone && fbStatus === "SUCCEEDED" && runIds.facebook && !collectedRunIds.includes(runIds.facebook)) {
    saved += await collectFacebookRun(runIds.facebook, queries)
      .catch((e: Error) => { errors.push(`Facebook: ${e.message}`); return 0; });
    newlyCollected.push(runIds.facebook);
  } else if (fbDone && runIds.facebook && fbStatus !== "SUCCEEDED" && fbStatus !== null) {
    errors.push(`Facebook run ${fbStatus}`);
  }

  // All non-null runs must be done before reporting "done"
  const allDone = (runIds.linkedin ? liDone : true) &&
                  (runIds.twitter  ? twDone : true) &&
                  (runIds.facebook ? fbDone : true);

  return NextResponse.json({ status: allDone ? "done" : "running", saved, errors, newlyCollected });
}
