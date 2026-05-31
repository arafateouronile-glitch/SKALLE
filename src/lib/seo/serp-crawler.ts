/**
 * 🔍 SERP Crawler — Intelligence compétitive avant génération
 *
 * Pipeline :
 * 1. Serper → top-10 résultats organiques + PAA + related searches
 * 2. Fetch HTML des top-5 pages (timeout 6s, fallback silencieux)
 * 3. Extraction H2/H3 + estimation word count
 * 4. Claude → analyse structurelle → serpContext injecté dans le prompt
 *
 * Résultat : l'outline généré colle à ce qui ranke réellement,
 * pas à ce que le LLM imagine.
 */

import { searchGoogleFull } from "@/lib/ai/serper";
import { getClaude } from "@/lib/ai/langchain";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SerpPageData {
  position: number;
  url: string;
  title: string;
  /** H2/H3 headings extraits de la page (vide si fetch échoue) */
  headings: string[];
  /** Estimation du nombre de mots */
  wordEstimate: number;
  /** Snippet Serper (toujours disponible) */
  snippet: string;
}

export interface SerpIntelligence {
  /** Pages crawlées (position 1-5) */
  pages: SerpPageData[];
  /** Questions People Also Ask */
  paaQuestions: string[];
  /** Moyenne mots des top-3 articles × 1.15 (longueur cible recommandée) */
  targetWordCount: number;
  /**
   * Bloc texte pré-analysé par Claude, prêt à être injecté dans le prompt
   * de génération. Contient : thèmes communs, angles manquants, structure recommandée.
   */
  serpContext: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 6_000;
const MAX_HTML_BYTES = 120_000;
const MAX_PAGES_TO_CRAWL = 5;

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}

function extractHeadings(html: string): string[] {
  const headings: string[] = [];
  const regex = /<(h[23])[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const level = m[1].toLowerCase() === "h2" ? "##" : "###";
    const text = stripTags(m[2]).slice(0, 120).trim();
    if (text.length > 3) headings.push(`${level} ${text}`);
  }
  return headings;
}

function estimateWordCount(html: string): number {
  // Remove scripts/styles first
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ");
  return clean.split(/\s+/).filter((w) => w.length > 2).length;
}

// ─── Page fetcher ─────────────────────────────────────────────────────────────

async function fetchPageData(
  url: string,
  position: number,
  title: string,
  snippet: string
): Promise<SerpPageData> {
  const base: SerpPageData = {
    position,
    url,
    title,
    headings: [],
    wordEstimate: 800,
    snippet,
  };

  // Skip non-crawlable URLs
  if (!url.startsWith("http") || url.includes("youtube.com") || url.includes("amazon.")) {
    return base;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
      },
    });
    clearTimeout(timer);

    if (!res.ok) return base;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) return base;

    // Lire en streaming, limité à MAX_HTML_BYTES
    const reader = res.body?.getReader();
    if (!reader) return base;

    let html = "";
    let bytesRead = 0;
    const decoder = new TextDecoder();

    while (bytesRead < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      bytesRead += value.byteLength;
    }
    reader.cancel().catch(() => {});

    return {
      ...base,
      headings: extractHeadings(html),
      wordEstimate: estimateWordCount(html),
    };
  } catch {
    return base;
  }
}

// ─── Claude SERP analyser ─────────────────────────────────────────────────────

const SERP_ANALYSIS_SYSTEM = `Tu es un stratège SEO expert. On te donne les données SERP (titres, snippets, headings) des pages en top-5 Google pour un mot-clé.

Ta mission : produire une analyse structurée en Markdown qui sera injectée dans le prompt de génération d'article pour guider le rédacteur IA.

Réponds UNIQUEMENT avec ce format Markdown (pas de JSON, pas de balises, pas de commentaires hors structure) :

## Thèmes communs (couverts par 3+ concurrents)
- [thème 1]
- [thème 2]
...

## Angles manquants (faiblement couverts — opportunité)
- [angle 1]
- [angle 2]
...

## Structure recommandée (H2 dans l'ordre logique)
1. [H2 recommandé]
2. [H2 recommandé]
...

## Signaux d'intention
[1-2 phrases sur l'intention de recherche principale : informationnelle / transactionnelle / comparative / locale]

## Erreurs ou lacunes des concurrents
- [lacune 1 à exploiter]
...`;

async function analyzeSerpWithClaude(
  keyword: string,
  pages: SerpPageData[],
  paaQuestions: string[]
): Promise<string> {
  const model = getClaude();

  const pagesBlock = pages
    .map((p) => {
      const headingList =
        p.headings.length > 0
          ? p.headings.slice(0, 12).join("\n")
          : "(headings non disponibles)";
      return `### Position ${p.position} — ${p.title}
URL : ${p.url}
Snippet : ${p.snippet}
Headings extraits :
${headingList}
Word count estimé : ~${p.wordEstimate} mots`;
    })
    .join("\n\n---\n\n");

  const paaBlock =
    paaQuestions.length > 0
      ? `## People Also Ask\n${paaQuestions.map((q) => `- ${q}`).join("\n")}`
      : "";

  const response = await model.invoke([
    new SystemMessage({ content: SERP_ANALYSIS_SYSTEM }),
    new HumanMessage(`Mot-clé cible : "${keyword}"

${paaBlock}

## Top-${pages.length} résultats SERP

${pagesBlock}

Produis l'analyse SERP maintenant.`),
  ]);

  const raw =
    typeof response.content === "string"
      ? response.content
      : Array.isArray(response.content)
        ? response.content
            .map((b: { type: string; text?: string } | string) =>
              typeof b === "string" ? b : (b.text ?? "")
            )
            .join("")
        : "";

  return raw.trim();
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function crawlSerpIntelligence(
  keyword: string
): Promise<SerpIntelligence> {
  // 1. Serper : top-10 + PAA + related
  const serperFull = await searchGoogleFull(keyword, 10);
  const organic = (serperFull.organic ?? []).slice(0, 10);
  const paaQuestions = (serperFull.peopleAlsoAsk ?? [])
    .map((p: { question: string }) => p.question)
    .filter(Boolean)
    .slice(0, 8);

  // 2. Crawl HTML des top-5 (parallèle, fallback silencieux)
  const toCrawl = organic.slice(0, MAX_PAGES_TO_CRAWL);
  const pages = await Promise.all(
    toCrawl.map((r) =>
      fetchPageData(r.link, r.position, r.title, r.snippet)
    )
  );

  // 3. Target word count : moyenne top-3 × 1.15, clampé à [1500, 4000]
  const top3WordCounts = pages.slice(0, 3).map((p) => p.wordEstimate);
  const avgWordCount =
    top3WordCounts.length > 0
      ? top3WordCounts.reduce((a, b) => a + b, 0) / top3WordCounts.length
      : 2000;
  const targetWordCount = Math.min(
    4000,
    Math.max(1500, Math.round(avgWordCount * 1.15))
  );

  // 4. Analyse Claude
  let serpContext = "";
  try {
    serpContext = await analyzeSerpWithClaude(keyword, pages, paaQuestions);
  } catch {
    // Fallback : résumé basique à partir des snippets
    serpContext = `## Thèmes communs (top SERP)\n${organic
      .slice(0, 5)
      .map((r) => `- ${r.title}`)
      .join("\n")}`;
  }

  return { pages, paaQuestions, targetWordCount, serpContext };
}
