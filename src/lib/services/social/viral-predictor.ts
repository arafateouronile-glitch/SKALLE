/**
 * Viral Predictor — Score un post 0-100 avant publication
 * Compare avec les posts viraux en DB + analyse structurelle via Claude
 */

import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { prisma } from "@/lib/prisma";

export interface PredictionBreakdown {
  hook: { score: number; label: string; tip: string };
  structure: { score: number; label: string; tip: string };
  length: { score: number; label: string; tip: string };
  cta: { score: number; label: string; tip: string };
  engagement_triggers: { score: number; label: string; tip: string };
}

export interface ViralPrediction {
  score: number;           // 0-100
  grade: "A" | "B" | "C" | "D";
  summary: string;         // 1-2 phrases
  breakdown: PredictionBreakdown;
  topSuggestion: string;   // action concrète n°1
  similarViralPosts: Array<{ content: string; score: number; platform: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT — top posts viraux similaires en DB
// ─────────────────────────────────────────────────────────────────────────────

async function getSimilarViralContext(platform: string, content: string) {
  const platformFilter = platform.toUpperCase() === "LINKEDIN" ? "LINKEDIN" : "TWITTER";

  // Trouver les 5 mots-clés les plus longs du contenu pour une similarité approx.
  const words = content
    .split(/\s+/)
    .filter((w) => w.length > 5)
    .slice(0, 5);

  const posts = await prisma.viralPost.findMany({
    where: {
      platform: platformFilter,
      viralScore: { gte: 200 },
      ...(words.length > 0 && {
        OR: words.map((w) => ({ content: { contains: w, mode: "insensitive" as const } })),
      }),
    },
    orderBy: { viralScore: "desc" },
    take: 3,
    select: { content: true, viralScore: true, platform: true },
  });

  // Fallback : juste les top posts si pas de match
  if (posts.length < 2) {
    const top = await prisma.viralPost.findMany({
      where: { platform: platformFilter, viralScore: { gte: 200 } },
      orderBy: { viralScore: "desc" },
      take: 3,
      select: { content: true, viralScore: true, platform: true },
    });
    return top;
  }
  return posts;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE SCORING
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un expert en contenu viral pour LinkedIn et Twitter/X.
Tu analyses un post et retournes UNIQUEMENT un JSON valide (sans markdown) avec cette structure exacte :

{
  "score": <number 0-100>,
  "grade": <"A"|"B"|"C"|"D">,
  "summary": "<1-2 phrases bilan>",
  "breakdown": {
    "hook": { "score": <0-25>, "label": "<force du hook>", "tip": "<conseil actionnable>" },
    "structure": { "score": <0-25>, "label": "<lisibilité/structure>", "tip": "<conseil>" },
    "length": { "score": <0-20>, "label": "<longueur>", "tip": "<conseil>" },
    "cta": { "score": <0-15>, "label": "<appel à l action>", "tip": "<conseil>" },
    "engagement_triggers": { "score": <0-15>, "label": "<déclencheurs>", "tip": "<conseil>" }
  },
  "topSuggestion": "<action n°1 à faire pour améliorer>"
}

Critères de notation :
- hook (0-25) : première phrase — question, stat choc, contraire, histoire, confession ?
- structure (0-25) : paragraphes courts ? espaces ? listes ? facile à scanner ?
- length (0-20) : LinkedIn optimal 900-1500 chars, X optimal 180-240 chars
- cta (0-15) : y a-t-il un appel à action clair ? (commentaire, partage, lien, question finale)
- engagement_triggers (0-15) : émotions ? stats ? preuve sociale ? tension ? curiosité ?

Grade : A (80-100), B (60-79), C (40-59), D (0-39).`;

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export async function predictViralScore(
  content: string,
  platform: "LINKEDIN" | "TWITTER" | "X" | "INSTAGRAM" | "TIKTOK"
): Promise<ViralPrediction> {
  const normalizedPlatform = platform === "X" ? "TWITTER" : platform;
  const similarViralPosts = await getSimilarViralContext(normalizedPlatform, content);

  const viralContext =
    similarViralPosts.length > 0
      ? `\n\nPosts viraux similaires en référence (score réel) :\n${similarViralPosts
          .map((p) => `[Score ${Math.round(p.viralScore)}] "${p.content.slice(0, 200)}"`)
          .join("\n")}`
      : "";

  const model = getClaude();
  const parser = getStringParser();

  const raw = await model.pipe(parser).invoke([
    new SystemMessage({ content: SYSTEM_PROMPT }),
    new HumanMessage(
      `Plateforme : ${platform}\n\nContenu à analyser :\n"${content}"${viralContext}`
    ),
  ]);

  const cleaned = raw.replace(/^```json?\s*|\s*```$/g, "").trim();

  let parsed: Omit<ViralPrediction, "similarViralPosts">;
  try {
    parsed = JSON.parse(cleaned) as typeof parsed;
  } catch {
    // Fallback structurel si Claude sort du JSON malformé
    parsed = {
      score: 50,
      grade: "C",
      summary: "Analyse partielle disponible.",
      breakdown: {
        hook: { score: 12, label: "Hook moyen", tip: "Commence par une question ou une stat." },
        structure: { score: 12, label: "Structure correcte", tip: "Ajoute des sauts de ligne." },
        length: { score: 10, label: "Longueur correcte", tip: "" },
        cta: { score: 8, label: "CTA présent", tip: "Rends-le plus direct." },
        engagement_triggers: { score: 8, label: "Quelques déclencheurs", tip: "Ajoute une tension." },
      },
      topSuggestion: "Renforce le hook en première phrase.",
    };
  }

  return {
    ...parsed,
    similarViralPosts: similarViralPosts.map((p) => ({
      content: p.content.slice(0, 150),
      score: Math.round(p.viralScore),
      platform: p.platform,
    })),
  };
}
