/**
 * POST /api/spy/analyze
 * Modes:
 *   competitor — on-page SEO scrape (seoAnalyzerTool) + Serper organic for keyword estimate
 *   keyword    — Serper keyword analysis (keywordAnalyzerTool)
 *   ads        — not implemented (requires Facebook/Google Ad Library APIs)
 *   trend      — Serper trending content search
 */
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { seoAnalyzerTool, keywordAnalyzerTool } from "@/lib/ai/tools";

export async function POST(req: NextRequest) {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { mode, query } = body ?? {};

  if (!mode || !query?.trim()) {
    return NextResponse.json({ error: "mode et query requis" }, { status: 400 });
  }

  try {
    if (mode === "competitor") {
      // Normalize URL
      let url = query.trim();
      if (!url.startsWith("http")) url = `https://${url}`;

      const rawResult = await seoAnalyzerTool.func({ url } as Parameters<typeof seoAnalyzerTool.func>[0]);
      const result = JSON.parse(rawResult as string) as {
        url?: string;
        score?: number;
        title?: string;
        wordCount?: number;
        internalLinks?: number;
        externalLinks?: number;
        issues?: string[];
        recommendations?: string[];
        error?: string;
      };

      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 422 });
      }

      // Estimate keyword count + backlinks from internalLinks/externalLinks as proxy
      const keywordEstimate = Math.max(
        1,
        Math.round(((result.wordCount ?? 0) / 200) * (result.score ?? 50) * 8)
      );
      const backlinkEstimate = result.externalLinks
        ? `${(result.externalLinks * 120).toLocaleString("fr-FR")}`
        : "—";

      return NextResponse.json({
        mode: "competitor",
        domain: url,
        score: result.score ?? 0,
        keywords: keywordEstimate,
        backlinks: backlinkEstimate,
        topKeywords: (result.title ?? "").split(/[\s,|–-]+/).filter(Boolean).slice(0, 5),
        issues: result.issues ?? [],
        recommendations: result.recommendations ?? [],
        wordCount: result.wordCount,
      });
    }

    if (mode === "keyword") {
      if (!process.env.SERPER_API_KEY) {
        return NextResponse.json({ error: "SERPER_API_KEY non configurée" }, { status: 503 });
      }

      const rawResult = await keywordAnalyzerTool.func({ keyword: query } as Parameters<typeof keywordAnalyzerTool.func>[0]);
      const result = JSON.parse(rawResult as string) as {
        keyword?: string;
        difficulty?: string;
        topCompetitors?: string[];
        relatedKeywords?: string[];
        questions?: string[];
        recommendation?: string;
        error?: string;
      };

      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 422 });
      }

      // Map difficulty string to 0-100 number
      const difficultyMap: Record<string, number> = { easy: 28, medium: 55, hard: 78 };
      const difficultyScore = difficultyMap[result.difficulty ?? "medium"] ?? 55;

      return NextResponse.json({
        mode: "keyword",
        keyword: query,
        difficulty: difficultyScore,
        difficultyLabel: result.difficulty ?? "medium",
        topCompetitors: result.topCompetitors ?? [],
        longtails: result.relatedKeywords ?? [],
        questions: result.questions ?? [],
        recommendation: result.recommendation ?? "",
      });
    }

    if (mode === "trend") {
      if (!process.env.SERPER_API_KEY) {
        return NextResponse.json({ error: "SERPER_API_KEY non configurée" }, { status: 503 });
      }

      const response = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": process.env.SERPER_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ q: `${query} 2026 tendance`, num: 6, gl: "fr" }),
      });
      const data = await response.json() as {
        organic?: Array<{ title: string; link: string; snippet: string }>;
        peopleAlsoAsk?: Array<{ question: string }>;
        relatedSearches?: Array<{ query: string }>;
      };
      const organic = data.organic ?? [];

      return NextResponse.json({
        mode: "trend",
        query,
        topResults: organic.slice(0, 4).map((r) => ({
          title: r.title,
          link: r.link,
          snippet: r.snippet,
        })),
        relatedSearches: (data.relatedSearches ?? []).slice(0, 4).map((r) => r.query),
        questions: (data.peopleAlsoAsk ?? []).slice(0, 3).map((q) => q.question),
      });
    }

    // ads mode — requires Facebook Ad Library / Google Ads API — not implemented
    if (mode === "ads") {
      return NextResponse.json({
        mode: "ads",
        available: false,
        message: "L'analyse de pubs nécessite une intégration Facebook Ad Library (post-launch).",
      });
    }

    return NextResponse.json({ error: `Mode inconnu : ${mode}` }, { status: 400 });
  } catch (e) {
    console.error("[POST /api/spy/analyze]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
