/**
 * POST /api/social/veille/scrape
 * 1. Trouve des profils LinkedIn via Serper
 * 2. Lance harvestapi~linkedin-profile-posts (async)
 * 3. Lance apidojo~tweet-scraper (async)
 * → Retourne { runIds } immédiatement
 *
 * POST /api/social/veille/scrape?collect=1  { runIds, queries }
 * Vérifie le statut des runs et collecte si SUCCEEDED.
 */
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  findLinkedInProfiles,
  startLinkedInProfileScrape,
  startApifyRun,
  getApifyRunStatus,
  collectHarvestLinkedInRun,
  collectTwitterRun,
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

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  if (!process.env.APIFY_API_TOKEN) {
    return NextResponse.json({ error: "APIFY_API_TOKEN manquant dans les variables d'environnement Vercel." }, { status: 503 });
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

  // Trouver les profils LinkedIn via Serper
  const profileUrls = await findLinkedInProfiles(uniqueQueries, 15).catch(() => [] as string[]);

  const errors: string[] = [];
  let linkedinRunId: string | null = null;
  let twitterRunId: string | null = null;

  await Promise.allSettled([
    (profileUrls.length > 0
      ? startLinkedInProfileScrape(profileUrls, 6)
      : Promise.reject(new Error("Aucun profil LinkedIn trouvé via Serper"))
    ).then((id) => { linkedinRunId = id; })
     .catch((e: Error) => errors.push(`LinkedIn: ${e.message}`)),

    startApifyRun("apidojo~tweet-scraper", {
      searchTerms: uniqueQueries.slice(0, 6),
      maxTweets: 30,
      queryType: "Top",
    }).then((id) => { twitterRunId = id; })
     .catch((e: Error) => errors.push(`Twitter: ${e.message}`)),
  ]);

  if (!linkedinRunId && !twitterRunId) {
    return NextResponse.json({ error: `Échec Apify : ${errors.join(" | ")}` }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    runIds: { linkedin: linkedinRunId, twitter: twitterRunId },
    queries: uniqueQueries,
    profilesFound: profileUrls.length,
    errors,
    message: `Scrape lancé (${profileUrls.length} profils LinkedIn) — résultats dans ~2 min`,
  });
}

async function handleCollect(req: NextRequest) {
  const body = await req.json() as {
    runIds: { linkedin: string | null; twitter: string | null };
    queries: string[];
  };
  const { runIds, queries } = body;

  const [liStatus, twStatus] = await Promise.all([
    runIds.linkedin ? getApifyRunStatus(runIds.linkedin).catch(() => "FAILED" as const) : Promise.resolve("FAILED" as const),
    runIds.twitter  ? getApifyRunStatus(runIds.twitter).catch(() => "FAILED" as const)  : Promise.resolve("FAILED" as const),
  ]);

  const liDone = liStatus !== "RUNNING" && liStatus !== "READY";
  const twDone = twStatus !== "RUNNING" && twStatus !== "READY";

  if (!liDone || !twDone) {
    return NextResponse.json({ status: "running", liStatus, twStatus });
  }

  let saved = 0;
  const errors: string[] = [];

  if (liStatus === "SUCCEEDED" && runIds.linkedin) {
    saved += await collectHarvestLinkedInRun(runIds.linkedin, queries).catch((e: Error) => { errors.push(`LinkedIn: ${e.message}`); return 0; });
  } else if (runIds.linkedin) {
    errors.push(`LinkedIn run ${liStatus}`);
  }

  if (twStatus === "SUCCEEDED" && runIds.twitter) {
    saved += await collectTwitterRun(runIds.twitter, queries).catch((e: Error) => { errors.push(`Twitter: ${e.message}`); return 0; });
  } else if (runIds.twitter) {
    errors.push(`Twitter run ${twStatus}`);
  }

  return NextResponse.json({ status: "done", saved, errors });
}
