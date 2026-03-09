/**
 * 📈 Content Optimizer - Scoring SEO du contenu
 *
 * Fonction pure qui analyse un article et retourne
 * un score SEO détaillé par catégorie.
 */

import { computeReadabilityScore } from "./onpage-analyzer";
import type { ContentOptimizationScore } from "@/types/seo";

export function scoreArticleContent(
  content: string,
  keyword: string,
  metaTitle?: string,
  metaDescription?: string
): ContentOptimizationScore {
  // ---- Word count ----
  const words = content
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const wordCount = words.length;

  let contentLengthScore = 100;
  let contentLengthRec = "Bonne longueur de contenu.";
  if (wordCount < 500) {
    contentLengthScore = 20;
    contentLengthRec = `Contenu très court (${wordCount} mots). Visez au moins 1500 mots pour un article SEO.`;
  } else if (wordCount < 1000) {
    contentLengthScore = 50;
    contentLengthRec = `Contenu court (${wordCount} mots). Enrichissez pour atteindre 1500-2000 mots.`;
  } else if (wordCount < 1500) {
    contentLengthScore = 75;
    contentLengthRec = `Longueur correcte (${wordCount} mots). L'idéal est 1500-2500 mots.`;
  }

  // ---- Keyword density ----
  let keywordDensityScore = 100;
  let keywordDensityValue = 0;
  let keywordDensityRec = "Densité de mot-clé optimale.";

  if (keyword) {
    const keywordLower = keyword.toLowerCase();
    const contentLower = content.toLowerCase();
    let count = 0;
    let searchFrom = 0;
    while (true) {
      const idx = contentLower.indexOf(keywordLower, searchFrom);
      if (idx === -1) break;
      count++;
      searchFrom = idx + 1;
    }
    keywordDensityValue = wordCount > 0 ? (count / wordCount) * 100 : 0;

    if (keywordDensityValue < 0.3) {
      keywordDensityScore = 30;
      keywordDensityRec = `Mot-clé "${keyword}" quasi absent (${keywordDensityValue.toFixed(1)}%). Intégrez-le naturellement (cible: 1-2%).`;
    } else if (keywordDensityValue < 0.8) {
      keywordDensityScore = 60;
      keywordDensityRec = `Densité faible (${keywordDensityValue.toFixed(1)}%). Ajoutez quelques occurrences supplémentaires.`;
    } else if (keywordDensityValue > 3) {
      keywordDensityScore = 40;
      keywordDensityRec = `Suroptimisation (${keywordDensityValue.toFixed(1)}%). Réduisez pour éviter une pénalité.`;
    } else if (keywordDensityValue > 2.5) {
      keywordDensityScore = 70;
      keywordDensityRec = `Densité un peu élevée (${keywordDensityValue.toFixed(1)}%). Restez sous 2%.`;
    }
  }

  // ---- Readability ----
  const readabilityResult = computeReadabilityScore(content);
  let readabilityScore = 100;
  let readabilityRec = "Bonne lisibilité.";
  if (readabilityResult.level === "difficile") {
    readabilityScore = 40;
    readabilityRec = "Contenu difficile à lire. Raccourcissez vos phrases et simplifiez le vocabulaire.";
  } else if (readabilityResult.score < 50) {
    readabilityScore = 60;
    readabilityRec = "Lisibilité moyenne. Essayez des phrases plus courtes (15-20 mots max).";
  } else if (readabilityResult.score < 60) {
    readabilityScore = 80;
    readabilityRec = "Lisibilité correcte. Quelques phrases pourraient être simplifiées.";
  }

  // ---- Heading structure ----
  const h1Matches = content.match(/^# .+$/gm) || [];
  const h2Matches = content.match(/^## .+$/gm) || [];
  const h3Matches = content.match(/^### .+$/gm) || [];
  const headingIssues: string[] = [];
  let headingScore = 100;

  if (h1Matches.length === 0) {
    headingIssues.push("Pas de titre H1");
    headingScore -= 20;
  } else if (h1Matches.length > 1) {
    headingIssues.push("Plusieurs H1 - gardez un seul H1");
    headingScore -= 10;
  }
  if (h2Matches.length < 2) {
    headingIssues.push("Trop peu de H2 - ajoutez des sous-sections");
    headingScore -= 15;
  }
  if (h3Matches.length < 1 && wordCount > 1000) {
    headingIssues.push("Ajoutez des H3 pour les articles longs");
    headingScore -= 10;
  }

  // Vérifier si le mot-clé est dans un H2
  if (keyword && h2Matches.length > 0) {
    const keywordInH2 = h2Matches.some((h) =>
      h.toLowerCase().includes(keyword.toLowerCase())
    );
    if (!keywordInH2) {
      headingIssues.push(`Le mot-clé "${keyword}" n'apparaît dans aucun H2`);
      headingScore -= 10;
    }
  }

  // ---- Meta quality ----
  let titleScore = 100;
  let descriptionScore = 100;
  const metaIssues: string[] = [];

  if (metaTitle) {
    if (metaTitle.length < 30) { titleScore = 50; metaIssues.push("Meta title trop court (< 30 car.)"); }
    else if (metaTitle.length > 60) { titleScore = 70; metaIssues.push("Meta title trop long (> 60 car.)"); }
    if (keyword && !metaTitle.toLowerCase().includes(keyword.toLowerCase())) {
      titleScore -= 20;
      metaIssues.push("Le mot-clé n'apparaît pas dans le meta title");
    }
  } else {
    titleScore = 0;
    metaIssues.push("Meta title manquant");
  }

  if (metaDescription) {
    if (metaDescription.length < 120) { descriptionScore = 50; metaIssues.push("Meta description trop courte"); }
    else if (metaDescription.length > 160) { descriptionScore = 70; metaIssues.push("Meta description trop longue"); }
    if (keyword && !metaDescription.toLowerCase().includes(keyword.toLowerCase())) {
      descriptionScore -= 15;
      metaIssues.push("Le mot-clé n'apparaît pas dans la meta description");
    }
  } else {
    descriptionScore = 0;
    metaIssues.push("Meta description manquante");
  }

  // ---- Internal links ----
  const linkRegex = /\[.+?\]\(.+?\)/g;
  const links = content.match(linkRegex) || [];
  const internalLinkCount = links.length;
  let internalLinksScore = 100;
  let internalLinksSuggestion = "Bon maillage interne.";
  if (internalLinkCount === 0) {
    internalLinksScore = 30;
    internalLinksSuggestion = "Aucun lien interne. Ajoutez des liens vers vos autres articles.";
  } else if (internalLinkCount < 3) {
    internalLinksScore = 60;
    internalLinksSuggestion = `Seulement ${internalLinkCount} lien(s). Visez 3-5 liens internes.`;
  }

  // ---- FAQ ----
  const hasFaq = /(?:faq|questions?\s+fréquentes|questions?\s+et\s+réponses)/i.test(content);
  const faqQuestionCount = (content.match(/^(?:#{1,3}\s*)?(?:\*\*)?Q[\s.:]/gm) || []).length
    + (content.match(/^(?:#{1,3}\s*)?(?:\*\*)?(?:Comment|Pourquoi|Qu|Quel|Est-ce)/gm) || []).length;

  // ---- Overall score ----
  const overallScore = Math.round(
    contentLengthScore * 0.20 +
    keywordDensityScore * 0.20 +
    readabilityScore * 0.15 +
    headingScore * 0.15 +
    ((titleScore + descriptionScore) / 2) * 0.15 +
    internalLinksScore * 0.10 +
    (hasFaq ? 100 : 0) * 0.05
  );

  return {
    overallScore: Math.max(0, Math.min(100, overallScore)),
    keywordDensity: {
      score: Math.max(0, keywordDensityScore),
      value: Math.round(keywordDensityValue * 100) / 100,
      recommendation: keywordDensityRec,
    },
    readability: {
      score: Math.max(0, readabilityScore),
      fleschKincaid: readabilityResult.score,
      level: readabilityResult.level,
      recommendation: readabilityRec,
    },
    headingStructure: {
      score: Math.max(0, headingScore),
      issues: headingIssues,
    },
    contentLength: {
      score: Math.max(0, contentLengthScore),
      wordCount,
      recommendation: contentLengthRec,
    },
    metaQuality: {
      titleScore: Math.max(0, titleScore),
      descriptionScore: Math.max(0, descriptionScore),
      issues: metaIssues,
    },
    internalLinks: {
      score: Math.max(0, internalLinksScore),
      count: internalLinkCount,
      suggestion: internalLinksSuggestion,
    },
    faq: {
      present: hasFaq,
      questionCount: faqQuestionCount,
    },
  };
}
