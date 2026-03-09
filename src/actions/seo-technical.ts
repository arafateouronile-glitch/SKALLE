"use server";

import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";

export interface CoreWebVital {
  value: string;
  score: number; // 0-1 from Lighthouse
  status: "good" | "needs-improvement" | "poor";
}

export interface TechnicalReport {
  url: string;
  performanceScore: number; // 0-100
  overallCategory: "FAST" | "AVERAGE" | "SLOW" | "unknown";
  vitals: {
    lcp: CoreWebVital;
    tbt: CoreWebVital;
    cls: CoreWebVital;
    fcp: CoreWebVital;
    speedIndex: CoreWebVital;
    ttfb: CoreWebVital;
  };
  opportunities: Array<{
    title: string;
    description: string;
    savings?: string;
  }>;
  aiRecommendations: string;
  analyzedAt: string;
}

function scoreToStatus(score: number): "good" | "needs-improvement" | "poor" {
  if (score >= 0.9) return "good";
  if (score >= 0.5) return "needs-improvement";
  return "poor";
}

function getVital(
  audits: Record<string, { displayValue?: string; score?: number | null }>
): (key: string) => CoreWebVital {
  return (key: string) => {
    const audit = audits[key] ?? {};
    const score = audit.score ?? 0;
    return {
      value: audit.displayValue ?? "N/A",
      score,
      status: scoreToStatus(score),
    };
  };
}

const seoTechnicalPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en performance web et Core Web Vitals.

Analyse les métriques PageSpeed fournies et génère des recommandations concrètes en français.
Structure ta réponse en 3 sections courtes:

**🔴 Problèmes critiques** (si score < 50)
**🟡 Points à améliorer** (si score 50-89)
**✅ Points forts** (si score ≥ 90)

Puis une section **Priorité d'action** avec 3 actions concrètes numérotées.
Sois concis et technique. Max 300 mots.`,
  ],
  [
    "human",
    `URL: {url}
Score Performance: {performance}/100
Catégorie globale: {category}

Core Web Vitals:
- LCP (Largest Contentful Paint): {lcp} [score: {lcpScore}]
- TBT (Total Blocking Time): {tbt} [score: {tbtScore}]
- CLS (Cumulative Layout Shift): {cls} [score: {clsScore}]
- FCP (First Contentful Paint): {fcp} [score: {fcpScore}]
- Speed Index: {speedIndex}
- TTFB (Time to First Byte): {ttfb}

Opportunités détectées: {opportunities}`,
  ],
]);

export async function analyzeTechnicalSEO(
  url: string
): Promise<{ success: boolean; data?: TechnicalReport; error?: string }> {
  try {
    // Normalize URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http")) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    const apiKey = process.env.PAGESPEED_API_KEY ?? "";
    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
      normalizedUrl
    )}&strategy=mobile${apiKey ? `&key=${apiKey}` : ""}`;

    const response = await fetch(apiUrl, {
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error:
          (err as { error?: { message?: string } })?.error?.message ??
          `PageSpeed API error: ${response.status}`,
      };
    }

    const json = await response.json();

    const lhr = json.lighthouseResult ?? {};
    const audits = lhr.audits ?? {};
    const categories = lhr.categories ?? {};
    const loadingExp = json.loadingExperience ?? {};

    const perfScore = Math.round((categories.performance?.score ?? 0) * 100);

    const overallCat: TechnicalReport["overallCategory"] =
      loadingExp.overall_category === "FAST"
        ? "FAST"
        : loadingExp.overall_category === "AVERAGE"
        ? "AVERAGE"
        : loadingExp.overall_category === "SLOW"
        ? "SLOW"
        : "unknown";

    const vital = getVital(audits);

    const vitals: TechnicalReport["vitals"] = {
      lcp: vital("largest-contentful-paint"),
      tbt: vital("total-blocking-time"),
      cls: vital("cumulative-layout-shift"),
      fcp: vital("first-contentful-paint"),
      speedIndex: vital("speed-index"),
      ttfb: vital("server-response-time"),
    };

    // Top opportunities
    const opportunityKeys = [
      "render-blocking-resources",
      "unused-css-rules",
      "unused-javascript",
      "uses-optimized-images",
      "uses-webp-images",
      "efficient-animated-content",
      "uses-text-compression",
      "uses-long-cache-ttl",
    ];

    const opportunities: TechnicalReport["opportunities"] = opportunityKeys
      .map((key) => {
        const a = audits[key];
        if (!a || a.score === 1 || a.score === null) return null;
        return {
          title: a.title ?? key,
          description: a.description ?? "",
          savings: (a as { displayValue?: string }).displayValue,
        };
      })
      .filter(Boolean) as TechnicalReport["opportunities"];

    // AI analysis
    const oppsText =
      opportunities.length > 0
        ? opportunities.map((o) => `- ${o.title}: ${o.savings ?? ""}`).join("\n")
        : "Aucune opportunité majeure détectée";

    const aiRecommendations = await seoTechnicalPrompt
      .pipe(getClaude())
      .pipe(getStringParser())
      .invoke({
        url: normalizedUrl,
        performance: perfScore.toString(),
        category: overallCat,
        lcp: vitals.lcp.value,
        lcpScore: (vitals.lcp.score * 100).toFixed(0),
        tbt: vitals.tbt.value,
        tbtScore: (vitals.tbt.score * 100).toFixed(0),
        cls: vitals.cls.value,
        clsScore: (vitals.cls.score * 100).toFixed(0),
        fcp: vitals.fcp.value,
        fcpScore: (vitals.fcp.score * 100).toFixed(0),
        speedIndex: vitals.speedIndex.value,
        ttfb: vitals.ttfb.value,
        opportunities: oppsText,
      });

    return {
      success: true,
      data: {
        url: normalizedUrl,
        performanceScore: perfScore,
        overallCategory: overallCat,
        vitals,
        opportunities,
        aiRecommendations,
        analyzedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("SEO Technical analysis error:", error);
    return {
      success: false,
      error: "Impossible d'analyser cette URL. Vérifiez qu'elle est accessible.",
    };
  }
}
