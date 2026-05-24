/**
 * POST /api/social/veille/scrape
 * Lance le scrape LinkedIn + Twitter via Serper (Google Search).
 * Résultats disponibles en ~10s — after() les stocke en background.
 */
import { NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scrapeViralPosts } from "@/lib/services/social/viral-monitor";

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

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  if (!process.env.SERPER_API_KEY) {
    return NextResponse.json(
      { error: "SERPER_API_KEY manquant." },
      { status: 503 }
    );
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { brandVoice: true },
  });

  const bv = workspace?.brandVoice as Record<string, unknown> | null;
  const queries: string[] = [...DEFAULT_QUERIES];
  if (bv?.niche && typeof bv.niche === "string") queries.unshift(bv.niche);
  if (Array.isArray(bv?.contentPillars)) queries.unshift(...(bv.contentPillars as string[]).slice(0, 3));
  const uniqueQueries = [...new Set(queries)].slice(0, 10);

  after(async () => {
    try {
      await scrapeViralPosts({ queries: uniqueQueries, maxPostsPerPlatform: 30 });
    } catch (e) {
      console.error("[veille/scrape]", e);
    }
  });

  return NextResponse.json({
    ok: true,
    message: "Scrape lancé — actualise dans ~15s pour voir les posts",
  });
}
