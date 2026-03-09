/**
 * 📄 Analyseur On-Page SEO
 *
 * Fonctions pures pour l'analyse du contenu on-page :
 * - Densité de mots-clés
 * - Score de lisibilité (Flesch-Kincaid adapté français)
 * - Hiérarchie des titres
 * - Profondeur de maillage interne
 */

import * as cheerio from "cheerio";
import type { OnPageSEOReport } from "@/types/seo";

type CheerioAPI = ReturnType<typeof cheerio.load>;

// ═══════════════════════════════════════════════════════════════════════════
// 🔑 DENSITÉ DE MOTS-CLÉS
// ═══════════════════════════════════════════════════════════════════════════

export function analyzeKeywordDensity(
  text: string,
  keyword: string
): OnPageSEOReport["keywordDensity"] {
  if (!keyword || !text) return null;

  const cleanText = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ");
  const words = cleanText.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  if (wordCount === 0) return null;

  // Compter les occurrences du mot-clé (peut être multi-mots)
  const keywordLower = keyword.toLowerCase();
  const keywordWords = keywordLower.split(/\s+/);
  let count = 0;

  if (keywordWords.length === 1) {
    // Mot-clé simple
    count = words.filter((w) => w === keywordLower).length;
  } else {
    // Expression multi-mots : recherche par fenêtre glissante
    const textLower = cleanText;
    let searchFrom = 0;
    while (true) {
      const idx = textLower.indexOf(keywordLower, searchFrom);
      if (idx === -1) break;
      count++;
      searchFrom = idx + 1;
    }
  }

  const density = (count / wordCount) * 100;

  let status: "optimal" | "faible" | "suroptimise" = "optimal";
  if (density < 0.5) status = "faible";
  else if (density > 3) status = "suroptimise";

  return {
    keyword,
    count,
    density: Math.round(density * 100) / 100,
    status,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 📖 LISIBILITÉ (Flesch-Kincaid adapté français)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compte les syllabes d'un mot français (heuristique).
 * Approche basée sur les voyelles avec gestion des diphtongues françaises.
 */
function countFrenchSyllables(word: string): number {
  if (!word || word.length === 0) return 0;

  const lower = word
    .toLowerCase()
    .replace(/[^\p{L}]/gu, "");

  if (lower.length <= 2) return 1;

  // Voyelles françaises (incluant accentuées)
  const vowels = /[aeiouyàâäéèêëïîôùûüÿœæ]/i;
  // Diphtongues et combinaisons courantes comptant pour une syllabe
  const diphthongs = /(?:eau|eaux|oui|oue|aie|ieu|ieu|oi|ou|ai|ei|au|eu|ae|oe)/gi;

  // Remplacer les diphtongues par un marqueur (une seule syllabe)
  let processed = lower.replace(diphthongs, "V");

  // E muet en fin de mot (ne compte pas comme syllabe en français courant)
  if (processed.endsWith("e") && processed.length > 2) {
    processed = processed.slice(0, -1);
  }
  // "es" et "ent" muets en fin de mot
  if (processed.endsWith("es") && processed.length > 3) {
    processed = processed.slice(0, -2);
  }
  if (processed.endsWith("ent") && processed.length > 4) {
    processed = processed.slice(0, -3);
  }

  // Compter les groupes de voyelles
  let syllables = 0;
  let prevVowel = false;
  for (const char of processed) {
    const isVowel = vowels.test(char) || char === "V";
    if (isVowel && !prevVowel) {
      syllables++;
    }
    prevVowel = isVowel;
  }

  return Math.max(1, syllables);
}

/**
 * Calcule le score de lisibilité Flesch-Kincaid adapté pour le français.
 *
 * Formule adaptée:
 * Score = 207 - 1.015 * (mots/phrases) - 73.6 * (syllabes/mots)
 *
 * Score > 70 : facile
 * Score 40-70 : moyen
 * Score < 40 : difficile
 */
export function computeReadabilityScore(text: string): OnPageSEOReport["readability"] {
  if (!text || text.trim().length === 0) {
    return { score: 0, level: "difficile", avgSentenceLength: 0, avgWordLength: 0 };
  }

  // Découper en phrases (ponctuation française)
  const sentences = text
    .split(/[.!?…]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  const sentenceCount = Math.max(1, sentences.length);

  // Découper en mots
  const words = text
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);

  const wordCount = Math.max(1, words.length);

  // Compter les syllabes totales
  let totalSyllables = 0;
  let totalWordLength = 0;
  for (const word of words) {
    totalSyllables += countFrenchSyllables(word);
    totalWordLength += word.length;
  }

  const avgSentenceLength = wordCount / sentenceCount;
  const avgSyllablesPerWord = totalSyllables / wordCount;
  const avgWordLength = totalWordLength / wordCount;

  // Formule Flesch-Kincaid adaptée français
  const score = Math.round(
    207 - 1.015 * avgSentenceLength - 73.6 * avgSyllablesPerWord
  );

  const clampedScore = Math.max(0, Math.min(100, score));

  let level: "facile" | "moyen" | "difficile" = "moyen";
  if (clampedScore >= 70) level = "facile";
  else if (clampedScore < 40) level = "difficile";

  return {
    score: clampedScore,
    level,
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    avgWordLength: Math.round(avgWordLength * 10) / 10,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔤 HIÉRARCHIE DES TITRES
// ═══════════════════════════════════════════════════════════════════════════

export function analyzeHeadingHierarchy(
  $: CheerioAPI
): OnPageSEOReport["headingHierarchy"] {
  const issues: string[] = [];
  const structure: string[] = [];
  let isValid = true;

  const h1Elements = $("h1");
  const h1Text = h1Elements.length > 0 ? h1Elements.first().text().trim() : null;

  // Collecter tous les headings dans l'ordre
  const headings: Array<{ level: number; text: string }> = [];
  $("h1, h2, h3, h4, h5, h6").each((_: number, el: any) => {
    const tag = $(el).prop("tagName")?.toLowerCase() || "";
    const level = parseInt(tag.replace("h", ""), 10);
    const text = $(el).text().trim();
    if (text) {
      headings.push({ level, text });
      structure.push(`${"  ".repeat(level - 1)}H${level}: ${text.slice(0, 60)}`);
    }
  });

  // Vérifications
  if (h1Elements.length === 0) {
    issues.push("Aucun H1 trouvé");
    isValid = false;
  } else if (h1Elements.length > 1) {
    issues.push(`${h1Elements.length} balises H1 trouvées (recommandé : 1)`);
    isValid = false;
  }

  // Vérifier les sauts de niveaux (ex: H1 → H3 sans H2)
  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1].level;
    const curr = headings[i].level;
    if (curr > prev + 1) {
      issues.push(
        `Saut de niveau : H${prev} → H${curr} (H${prev + 1} manquant)`
      );
      isValid = false;
    }
  }

  const h2Count = $("h2").length;
  if (h2Count === 0) {
    issues.push("Aucun H2 trouvé - structurez votre contenu avec des sous-titres");
  }

  return { isValid, h1Text, structure, issues };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔗 MAILLAGE INTERNE
// ═══════════════════════════════════════════════════════════════════════════

export function analyzeInternalLinkingDepth(
  $: CheerioAPI,
  baseDomain: string
): number {
  let internalLinks = 0;

  $("a[href]").each((_: number, el: any) => {
    const href = $(el).attr("href") || "";
    if (
      href.startsWith("/") ||
      href.includes(baseDomain)
    ) {
      internalLinks++;
    }
  });

  return internalLinks;
}

// ═══════════════════════════════════════════════════════════════════════════
// 🎯 ANALYSE ON-PAGE COMPLÈTE
// ═══════════════════════════════════════════════════════════════════════════

export function runOnPageAnalysis(
  $: CheerioAPI,
  bodyText: string,
  baseDomain: string,
  targetKeyword?: string
): OnPageSEOReport {
  const keywordDensity = targetKeyword
    ? analyzeKeywordDensity(bodyText, targetKeyword)
    : null;

  const readability = computeReadabilityScore(bodyText);
  const headingHierarchy = analyzeHeadingHierarchy($);
  const internalLinkingDepth = analyzeInternalLinkingDepth($, baseDomain);

  // Scoring on-page
  const issues: string[] = [];
  let score = 100;

  // Densité de mots-clés
  if (keywordDensity) {
    if (keywordDensity.status === "faible") {
      issues.push(
        `Densité du mot-clé "${targetKeyword}" faible (${keywordDensity.density}%) - visez 1-2%`
      );
      score -= 15;
    } else if (keywordDensity.status === "suroptimise") {
      issues.push(
        `Suroptimisation du mot-clé "${targetKeyword}" (${keywordDensity.density}%) - réduisez à 1-2%`
      );
      score -= 20;
    }
  }

  // Lisibilité
  if (readability.level === "difficile") {
    issues.push(
      `Contenu difficile à lire (score: ${readability.score}/100) - simplifiez vos phrases`
    );
    score -= 15;
  } else if (readability.score < 50) {
    issues.push(
      `Lisibilité moyenne (score: ${readability.score}/100) - phrases plus courtes recommandées`
    );
    score -= 8;
  }

  // Hiérarchie des titres
  if (!headingHierarchy.isValid) {
    score -= 10;
    issues.push(...headingHierarchy.issues);
  }

  // Maillage interne
  if (internalLinkingDepth < 3) {
    issues.push(
      `Peu de liens internes (${internalLinkingDepth}) - ajoutez des liens vers vos autres pages`
    );
    score -= 10;
  }

  return {
    keywordDensity,
    readability,
    headingHierarchy,
    internalLinkingDepth,
    score: Math.max(0, score),
    issues,
  };
}
