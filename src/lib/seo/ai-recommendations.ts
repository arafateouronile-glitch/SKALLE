/**
 * 🤖 Recommandations IA pour l'audit SEO
 *
 * Utilise Claude pour générer des recommandations
 * actionnables basées sur les données d'audit.
 */

import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import type { EnhancedSEOAuditReport, AIRecommendation } from "@/types/seo";

const seoRecommendationsPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un consultant SEO expert. À partir d'un rapport d'audit SEO détaillé, génère des recommandations actionnables et priorisées.

Règles:
- Chaque recommandation doit être concrète et applicable immédiatement
- Priorise par impact SEO réel (high = résultat rapide, medium = important, low = nice-to-have)
- Maximum 10 recommandations, minimum 3
- Explique le POURQUOI et le COMMENT
- Sois spécifique : "Ajoutez un H1 contenant le mot-clé principal" plutôt que "Améliorez les titres"

Format de sortie: JSON array UNIQUEMENT (pas de markdown, pas d'explication).
Chaque objet: {{ "priority": "high"|"medium"|"low", "category": "technical"|"content"|"onPage"|"structure", "title": "...", "description": "...", "estimatedImpact": 1-5 }}`,
  ],
  [
    "human",
    `Voici le rapport d'audit SEO pour l'URL: {url}
{targetKeywordSection}

Score global: {score}/100

TITRE:
- Valeur: {titleValue}
- Longueur: {titleLength} caractères
- Score: {titleScore}/100
- Problèmes: {titleIssues}

META DESCRIPTION:
- Valeur: {metaDescValue}
- Longueur: {metaDescLength} caractères
- Score: {metaDescScore}/100
- Problèmes: {metaDescIssues}

STRUCTURE (HEADINGS):
- H1: {h1Count}, H2: {h2Count}, H3: {h3Count}
- Score: {headingsScore}/100
- Problèmes: {headingsIssues}

IMAGES:
- Total: {imagesTotal}, Avec alt: {imagesWithAlt}
- Score: {imagesScore}/100

LIENS:
- Internes: {linksInternal}, Externes: {linksExternal}
- Score: {linksScore}/100

CONTENU:
- Nombre de mots: {wordCount}
- Score: {contentScore}/100

TECHNIQUE:
- SSL: {ssl}
- Mobile viewport: {mobileViewport}
- Canonical: {canonical}
- Robots: {robots}
- Schema.org: {structuredData}
- Open Graph: {openGraph}
- Score technique: {technicalScore}/100
- Problèmes techniques: {technicalIssues}

ON-PAGE:
- Lisibilité: {readabilityScore}/100 ({readabilityLevel})
- Score on-page: {onPageScore}/100
- Problèmes on-page: {onPageIssues}
{keywordDensitySection}

Génère les recommandations en JSON.`,
  ],
]);

export async function generateAIRecommendations(
  auditReport: EnhancedSEOAuditReport,
  url: string,
  targetKeyword?: string
): Promise<AIRecommendation[]> {
  try {
    const chain = seoRecommendationsPrompt
      .pipe(getClaude())
      .pipe(getStringParser());

    const response = await chain.invoke({
      url,
      targetKeywordSection: targetKeyword
        ? `Mot-clé cible: "${targetKeyword}"`
        : "Pas de mot-clé cible spécifié",
      score: auditReport.score,
      titleValue: auditReport.title.value || "MANQUANT",
      titleLength: auditReport.title.length,
      titleScore: auditReport.title.score,
      titleIssues: auditReport.title.issues.join(", ") || "Aucun",
      metaDescValue: auditReport.metaDescription.value?.slice(0, 100) || "MANQUANTE",
      metaDescLength: auditReport.metaDescription.length,
      metaDescScore: auditReport.metaDescription.score,
      metaDescIssues: auditReport.metaDescription.issues.join(", ") || "Aucun",
      h1Count: auditReport.headings.h1Count,
      h2Count: auditReport.headings.h2Count,
      h3Count: auditReport.headings.h3Count,
      headingsScore: auditReport.headings.score,
      headingsIssues: auditReport.headings.issues.join(", ") || "Aucun",
      imagesTotal: auditReport.images.total,
      imagesWithAlt: auditReport.images.withAlt,
      imagesScore: auditReport.images.score,
      linksInternal: auditReport.links.internal,
      linksExternal: auditReport.links.external,
      linksScore: auditReport.links.score,
      wordCount: auditReport.content.wordCount,
      contentScore: auditReport.content.score,
      ssl: auditReport.technical.ssl ? "Oui" : "Non",
      mobileViewport: auditReport.technical.mobileViewport ? "Oui" : "Non",
      canonical: auditReport.technical.canonical.url || "Absente",
      robots: auditReport.technical.robotsMeta.raw || "Pas de directive",
      structuredData: auditReport.technical.structuredData.hasJsonLd
        ? `Oui (${auditReport.technical.structuredData.types.join(", ")})`
        : "Non",
      openGraph: auditReport.technical.openGraph.title ? "Configuré" : "Manquant",
      technicalScore: auditReport.technical.score,
      technicalIssues: auditReport.technical.issues.join(", ") || "Aucun",
      readabilityScore: auditReport.onPage.readability.score,
      readabilityLevel: auditReport.onPage.readability.level,
      onPageScore: auditReport.onPage.score,
      onPageIssues: auditReport.onPage.issues.join(", ") || "Aucun",
      keywordDensitySection: auditReport.onPage.keywordDensity
        ? `Densité mot-clé "${auditReport.onPage.keywordDensity.keyword}": ${auditReport.onPage.keywordDensity.density}% (${auditReport.onPage.keywordDensity.status})`
        : "",
    });

    // Parser le JSON de la réponse
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("AI response is not valid JSON array:", response.slice(0, 200));
      return getDefaultRecommendations(auditReport);
    }

    const parsed = JSON.parse(jsonMatch[0]) as AIRecommendation[];

    // Valider la structure
    return parsed
      .filter(
        (r) =>
          r.priority &&
          r.category &&
          r.title &&
          r.description &&
          typeof r.estimatedImpact === "number"
      )
      .slice(0, 10);
  } catch (error) {
    console.error("AI Recommendations error:", error);
    return getDefaultRecommendations(auditReport);
  }
}

/**
 * Recommandations par défaut basées sur les scores (fallback si l'IA échoue).
 */
function getDefaultRecommendations(
  report: EnhancedSEOAuditReport
): AIRecommendation[] {
  const recs: AIRecommendation[] = [];

  if (report.title.score < 80) {
    recs.push({
      priority: "high",
      category: "onPage",
      title: "Optimisez le titre de la page",
      description:
        "Le titre doit faire entre 30-60 caractères et contenir le mot-clé principal en début de phrase.",
      estimatedImpact: 5,
    });
  }

  if (report.metaDescription.score < 80) {
    recs.push({
      priority: "high",
      category: "onPage",
      title: "Améliorez la meta description",
      description:
        "La meta description doit faire 120-160 caractères, être engageante et contenir le mot-clé cible.",
      estimatedImpact: 4,
    });
  }

  if (report.content.wordCount < 1000) {
    recs.push({
      priority: "high",
      category: "content",
      title: "Enrichissez le contenu de la page",
      description: `Avec seulement ${report.content.wordCount} mots, votre page manque de profondeur. Visez au moins 1500 mots pour les sujets compétitifs.`,
      estimatedImpact: 5,
    });
  }

  if (!report.technical.structuredData.hasJsonLd) {
    recs.push({
      priority: "medium",
      category: "technical",
      title: "Ajoutez des données structurées (Schema.org)",
      description:
        "Implémentez du JSON-LD pour aider Google à comprendre votre contenu et obtenir des rich snippets.",
      estimatedImpact: 3,
    });
  }

  if (!report.technical.ssl) {
    recs.push({
      priority: "high",
      category: "technical",
      title: "Passez en HTTPS",
      description:
        "HTTPS est un facteur de classement Google. Installez un certificat SSL sur votre serveur.",
      estimatedImpact: 4,
    });
  }

  if (report.links.internal < 3) {
    recs.push({
      priority: "medium",
      category: "structure",
      title: "Renforcez le maillage interne",
      description:
        "Ajoutez des liens vers vos autres pages pertinentes pour distribuer l'autorité et faciliter la navigation.",
      estimatedImpact: 3,
    });
  }

  return recs;
}
