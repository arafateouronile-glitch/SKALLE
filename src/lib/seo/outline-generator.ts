/**
 * 📋 Outline Generator - Génération de plans d'articles
 *
 * Utilise GPT-4o-mini pour créer un plan structuré
 * avant la rédaction complète de l'article.
 */

import { getOpenAI, getStringParser } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import type { ArticleOutline } from "@/types/seo";

const articleOutlinePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en stratégie de contenu SEO. Génère un plan d'article détaillé et optimisé pour le référencement.

Le plan doit être au format JSON strict avec cette structure:
{{
  "title": "Titre H1 de l'article (avec mot-clé, < 70 caractères)",
  "metaTitle": "Meta title SEO (30-60 caractères, mot-clé en début)",
  "metaDescription": "Meta description engageante (120-155 caractères, avec CTA)",
  "sections": [
    {{
      "heading": "Titre de la section",
      "level": 2,
      "keyPoints": ["Point 1", "Point 2", "Point 3"],
      "suggestedWordCount": 300
    }},
    {{
      "heading": "Sous-section",
      "level": 3,
      "keyPoints": ["Détail 1"],
      "suggestedWordCount": 150
    }}
  ],
  "faqQuestions": ["Question 1 ?", "Question 2 ?"],
  "estimatedWordCount": 2000,
  "internalLinkSuggestions": ["sujet lié 1", "sujet lié 2"]
}}

Règles:
- Minimum 5 sections H2 pour un article complet
- Inclure des H3 sous les sections importantes
- Les FAQ doivent être des questions que les gens posent réellement
- Intégrer naturellement le mot-clé dans les titres de section
- Viser 1500-2500 mots au total
- Réponds UNIQUEMENT avec le JSON valide`,
  ],
  [
    "human",
    `Crée un plan d'article SEO pour le mot-clé: "{keyword}"
{brandVoiceSection}

Génère le plan en JSON.`,
  ],
]);

export async function generateArticleOutline(
  keyword: string,
  brandVoice?: Record<string, unknown>
): Promise<ArticleOutline> {
  const chain = articleOutlinePrompt.pipe(getOpenAI()).pipe(getStringParser());

  const response = await chain.invoke({
    keyword,
    brandVoiceSection: brandVoice
      ? `Ton de voix de la marque: ${JSON.stringify(brandVoice)}`
      : "",
  });

  // Extraire le JSON de la réponse
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Impossible de parser le plan d'article");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Valider et normaliser
  return {
    title: parsed.title || keyword,
    metaTitle: parsed.metaTitle || parsed.title || keyword,
    metaDescription: parsed.metaDescription || "",
    sections: (parsed.sections || []).map((s: Record<string, unknown>) => ({
      heading: s.heading || "",
      level: s.level === 3 ? 3 : 2,
      keyPoints: Array.isArray(s.keyPoints) ? s.keyPoints : [],
      suggestedWordCount: typeof s.suggestedWordCount === "number" ? s.suggestedWordCount : 200,
    })),
    faqQuestions: Array.isArray(parsed.faqQuestions) ? parsed.faqQuestions : [],
    estimatedWordCount: parsed.estimatedWordCount || 2000,
    internalLinkSuggestions: Array.isArray(parsed.internalLinkSuggestions)
      ? parsed.internalLinkSuggestions
      : [],
  };
}
