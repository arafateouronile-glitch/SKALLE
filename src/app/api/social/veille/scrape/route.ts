import { NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scrapeViralPosts } from "@/lib/services/social/viral-monitor";

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

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  if (!process.env.APIFY_API_TOKEN) {
    return NextResponse.json(
      { error: "APIFY_API_TOKEN manquant — configure-le dans les variables d'environnement." },
      { status: 503 }
    );
  }

  const workspace = await prisma.workspace.findFirst({
    where: { userId: session.user.id },
    select: { id: true, brandVoice: true },
  });

  const bv = workspace?.brandVoice as Record<string, unknown> | null;
  const queries: string[] = [...DEFAULT_QUERIES];
  if (bv?.niche && typeof bv.niche === "string") queries.unshift(bv.niche);
  if (Array.isArray(bv?.contentPillars)) {
    queries.unshift(...(bv.contentPillars as string[]).slice(0, 3));
  }

  after(async () => {
    try {
      await scrapeViralPosts({
        queries: [...new Set(queries)].slice(0, 12),
        maxPostsPerPlatform: 20,
        workspaceId: workspace?.id,
      });
    } catch (e) {
      console.error("[veille/scrape] Erreur scrape:", e);
    }
  });

  return NextResponse.json({ ok: true, message: "Scrape lancé — les posts arriveront dans 1-2 min" });
}
