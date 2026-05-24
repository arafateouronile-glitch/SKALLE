/**
 * POST /api/social/veille/scrape
 * Lance les runs Apify en mode asynchrone (retourne < 1s).
 * Renvoie { runIds: { linkedin, twitter } } que le frontend poll.
 *
 * POST /api/social/veille/scrape?collect=1
 * Reçoit { runIds, queries } — vérifie le statut et collecte si SUCCEEDED.
 */
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  startApifyRun,
  getApifyRunStatus,
  collectLinkedInRun,
  collectTwitterRun,
} from "@/lib/services/social/viral-monitor";

const DEFAULT_QUERIES = [
  "growth hacking",
  "entrepreneuriat",
  "marketing digital",
  "startup",
  "personal branding",
  "productivité",
  "SaaS",
  "leadership",
];

// ── Lancer les runs ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  if (!process.env.APIFY_API_TOKEN) {
    return NextResponse.json(
      { error: "APIFY_API_TOKEN manquant — configure-le dans les variables d'environnement Vercel." },
      { status: 503 }
    );
  }

  const isCollect = req.nextUrl.searchParams.get("collect") === "1";

  if (isCollect) {
    return handleCollect(req);
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { brandVoice: true },
  });

  const bv = workspace?.brandVoice as Record<string, unknown> | null;
  const queries: string[] = [...DEFAULT_QUERIES];
  if (bv?.niche && typeof bv.niche === "string") queries.unshift(bv.niche);
  if (Array.isArray(bv?.contentPillars)) queries.unshift(...(bv.contentPillars as string[]).slice(0, 3));
  const uniqueQueries = [...new Set(queries)].slice(0, 12);

  let linkedinRunId: string | null = null;
  let twitterRunId: string | null = null;
  const startErrors: string[] = [];

  await Promise.allSettled([
    startApifyRun("curious_coder~linkedin-post-search", {
      keywords: uniqueQueries,
      maxResults: 25,
      sortBy: "relevance",
    }).then((id) => { linkedinRunId = id; }).catch((e: Error) => startErrors.push(`LinkedIn: ${e.message}`)),

    startApifyRun("apidojo~tweet-scraper", {
      searchTerms: uniqueQueries.slice(0, 8),
      maxTweets: 25,
      queryType: "Latest",
    }).then((id) => { twitterRunId = id; }).catch((e: Error) => startErrors.push(`Twitter: ${e.message}`)),
  ]);

  if (!linkedinRunId && !twitterRunId) {
    return NextResponse.json(
      { error: `Échec lancement Apify : ${startErrors.join(" | ")}` },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    runIds: { linkedin: linkedinRunId, twitter: twitterRunId },
    queries: uniqueQueries,
    errors: startErrors,
    message: "Scrape lancé — collecte automatique dans ~90s",
  });
}

// ── Collecter les résultats ──────────────────────────────────────────────────

async function handleCollect(req: NextRequest) {
  const body = await req.json() as {
    runIds: { linkedin: string | null; twitter: string | null };
    queries: string[];
  };
  const { runIds, queries } = body;

  const [liStatus, twStatus] = await Promise.all([
    runIds.linkedin
      ? getApifyRunStatus(runIds.linkedin).catch(() => "FAILED" as const)
      : Promise.resolve("FAILED" as const),
    runIds.twitter
      ? getApifyRunStatus(runIds.twitter).catch(() => "FAILED" as const)
      : Promise.resolve("FAILED" as const),
  ]);

  const allDone = liStatus !== "RUNNING" && twStatus !== "RUNNING";
  if (!allDone) {
    return NextResponse.json({ status: "running", liStatus, twStatus });
  }

  let saved = 0;
  const errors: string[] = [];

  if (liStatus === "SUCCEEDED" && runIds.linkedin) {
    const n = await collectLinkedInRun(runIds.linkedin, queries).catch((e: Error) => {
      errors.push(`LinkedIn: ${e.message}`);
      return 0;
    });
    saved += n;
  } else {
    errors.push("LinkedIn run failed");
  }

  if (twStatus === "SUCCEEDED" && runIds.twitter) {
    const n = await collectTwitterRun(runIds.twitter, queries).catch((e: Error) => {
      errors.push(`Twitter: ${e.message}`);
      return 0;
    });
    saved += n;
  } else {
    errors.push("Twitter run failed");
  }

  return NextResponse.json({ status: "done", saved, errors });
}
