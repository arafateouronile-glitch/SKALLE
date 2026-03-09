/**
 * ✍️ Enhanced Article Generator
 *
 * Pipeline complet de génération d'article SEO:
 * 1. Outline (si non fourni)
 * 2. Recherche de sources
 * 3. Génération avec LLM
 * 4. Post-processing (meta, TOC, FAQ, scoring)
 */

import { getOpenAI, getStringParser } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { searchCompetitorContent, getRelatedKeywords } from "@/lib/ai/serper";
import { generateArticleOutline } from "./outline-generator";
import { scoreArticleContent } from "./content-optimizer";
import type { ArticleOutline, GeneratedArticle } from "@/types/seo";

const enhancedSeoArticlePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un rédacteur SEO expert de classe mondiale. Génère un article complet, optimisé et engageant.

INSTRUCTIONS STRICTES:
- Suis exactement le plan fourni (sections, sous-sections)
- Écris en Markdown avec la hiérarchie correcte (# H1, ## H2, ### H3)
- Intègre le mot-clé principal naturellement (densité 1-2%)
- Paragraphes courts (3-4 phrases max)
- Utilise des listes à puces quand pertinent
- Inclus des données, statistiques ou exemples concrets
- Termine par une section FAQ avec les questions fournies
- Ajoute un CTA final engageant
- Longueur cible : {targetWords} mots

MÉTA (à inclure en commentaire HTML au tout début):
<!--META_TITLE: [meta title ici]-->
<!--META_DESCRIPTION: [meta description ici]-->

FORMAT: Article complet en Markdown`,
  ],
  [
    "human",
    `Mot-clé principal: {keyword}

PLAN DE L'ARTICLE:
{outlineText}

SOURCES DE RÉFÉRENCE:
{sourcesText}

MOTS-CLÉS SECONDAIRES à intégrer: {relatedKeywords}

QUESTIONS FAQ à traiter:
{faqQuestions}

{brandVoiceSection}
{internalLinksSection}

Rédige l'article complet maintenant.`,
  ],
]);

interface GenerateArticleParams {
  keyword: string;
  outline?: ArticleOutline;
  brandVoice?: Record<string, unknown>;
  workspaceId: string;
  existingArticleTitles?: string[];
}

export async function generateEnhancedArticle(
  params: GenerateArticleParams
): Promise<GeneratedArticle> {
  const { keyword, brandVoice, existingArticleTitles = [] } = params;

  // 1. Générer l'outline si non fourni
  const outline = params.outline || await generateArticleOutline(keyword, brandVoice);

  // 2. Rechercher des sources
  let sourcesText = "Pas de sources disponibles.";
  try {
    const sources = await searchCompetitorContent(keyword);
    sourcesText = sources
      .slice(0, 5)
      .map((s) => `- ${s.title}: ${s.snippet}`)
      .join("\n");
  } catch {
    // Continuer sans sources
  }

  // 3. Mots-clés liés
  let relatedKws: string[] = [];
  try {
    relatedKws = await getRelatedKeywords(keyword);
  } catch {
    // Continuer sans mots-clés liés
  }

  // 4. Construire le texte du plan
  const outlineText = outline.sections
    .map((s) => {
      const prefix = s.level === 2 ? "##" : "###";
      const points = s.keyPoints.map((p) => `  - ${p}`).join("\n");
      return `${prefix} ${s.heading} (~${s.suggestedWordCount} mots)\n${points}`;
    })
    .join("\n\n");

  // 5. FAQ
  const faqQuestions =
    outline.faqQuestions.length > 0
      ? outline.faqQuestions.map((q) => `- ${q}`).join("\n")
      : "- Pas de questions FAQ spécifiques";

  // 6. Liens internes
  const internalLinksSection =
    existingArticleTitles.length > 0
      ? `ARTICLES EXISTANTS (propose des liens internes vers ceux-ci si pertinent):\n${existingArticleTitles.slice(0, 10).map((t) => `- ${t}`).join("\n")}`
      : "";

  // 7. Générer l'article
  const chain = enhancedSeoArticlePrompt.pipe(getOpenAI()).pipe(getStringParser());
  const article = await chain.invoke({
    keyword,
    outlineText,
    sourcesText,
    relatedKeywords: relatedKws.slice(0, 8).join(", ") || keyword,
    faqQuestions,
    targetWords: outline.estimatedWordCount || 2000,
    brandVoiceSection: brandVoice
      ? `TON DE VOIX: ${JSON.stringify(brandVoice)}`
      : "TON: Professionnel et accessible",
    internalLinksSection,
  });

  // 8. Post-processing
  // Extraire meta title et description des commentaires HTML
  let metaTitle = outline.metaTitle;
  let metaDescription = outline.metaDescription;

  const metaTitleMatch = article.match(/<!--META_TITLE:\s*(.+?)-->/);
  if (metaTitleMatch) metaTitle = metaTitleMatch[1].trim();

  const metaDescMatch = article.match(/<!--META_DESCRIPTION:\s*(.+?)-->/);
  if (metaDescMatch) metaDescription = metaDescMatch[1].trim();

  // Nettoyer les commentaires META du contenu
  const cleanContent = article
    .replace(/<!--META_TITLE:.+?-->\n?/g, "")
    .replace(/<!--META_DESCRIPTION:.+?-->\n?/g, "")
    .trim();

  // Extraire le titre H1
  const h1Match = cleanContent.match(/^#\s+(.+)$/m);
  const title = h1Match ? h1Match[1] : outline.title;

  // Générer le sommaire
  const tocRegex = /^(#{1,3})\s+(.+)$/gm;
  const tableOfContents: Array<{ text: string; level: number; id: string }> = [];
  let tocMatch;
  while ((tocMatch = tocRegex.exec(cleanContent)) !== null) {
    const level = tocMatch[1].length;
    const text = tocMatch[2];
    const id = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "");
    tableOfContents.push({ text, level, id });
  }

  // Extraire les FAQ
  const faqContent: Array<{ question: string; answer: string }> = [];
  const faqSectionMatch = cleanContent.match(
    /(?:##\s*(?:FAQ|Questions?\s+[Ff]réquentes)[\s\S]*?)(?=\n##\s|$)/
  );
  if (faqSectionMatch) {
    const faqSection = faqSectionMatch[0];
    const questionRegex = new RegExp("(?:###?\\s*(?:\\d+[.)]\\s*)?)(.+\\?)\\s*\\n([\\s\\S]*?)(?=\\n###?\\s|\\n##\\s|$)", "g");
    let qMatch;
    while ((qMatch = questionRegex.exec(faqSection)) !== null) {
      faqContent.push({
        question: qMatch[1].trim(),
        answer: qMatch[2].trim(),
      });
    }
  }

  // Compter les mots
  const wordCount = cleanContent
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  // Excerpt
  const contentWithoutTitle = cleanContent.replace(/^#\s+.+$/m, "").trim();
  const excerpt = contentWithoutTitle
    .replace(/[#*\[\]()]/g, "")
    .slice(0, 200)
    .trim() + "...";

  // 9. Scoring SEO
  const seoFeedback = scoreArticleContent(
    cleanContent,
    keyword,
    metaTitle,
    metaDescription
  );

  return {
    title,
    content: cleanContent,
    excerpt,
    metaTitle,
    metaDescription,
    outline,
    faqContent,
    tableOfContents,
    wordCount,
    readabilityScore: seoFeedback.readability.fleschKincaid,
    seoScore: seoFeedback.overallScore,
    seoFeedback,
    relatedKeywords: relatedKws,
  };
}
