"use server";

import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";

export interface CampaignDay {
  day: number;
  channel: "Blog" | "LinkedIn" | "X" | "Instagram" | "Newsletter" | "TikTok";
  contentType: string;
  topic: string;
  cta: string;
  funnel: "TOFU" | "MOFU" | "BOFU";
}

export interface CampaignPlan {
  objective: string;
  audience: string;
  duration: number;
  days: CampaignDay[];
  summary: string;
  generatedAt: string;
}


const campaignPlanPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert CMO qui crée des plans de campagne marketing 30 jours.

Génère un plan de contenu 30 jours au format JSON.
Chaque jour doit avoir: day (1-30), channel (Blog|LinkedIn|X|Instagram|Newsletter|TikTok), contentType (Article SEO|Post|Thread|Carrousel|Email|Vidéo|Story|etc.), topic (sujet précis), cta (appel à l'action clair), funnel (TOFU|MOFU|BOFU).

Distribution recommandée par objectif:
- TOFU (notoriété): 40% des posts → Blog/X/TikTok/Instagram
- MOFU (considération): 35% → LinkedIn/Newsletter/Blog
- BOFU (conversion): 25% → Newsletter/LinkedIn/Blog avec CTA fort

Réponds UNIQUEMENT avec un JSON valide avec cette structure:
{{
  "summary": "Résumé stratégique en 2-3 phrases",
  "days": [
    {{"day": 1, "channel": "Blog", "contentType": "Article SEO", "topic": "...", "cta": "...", "funnel": "TOFU"}},
    ...
  ]
}}
Génère exactement 30 jours. Ne pas réduire à moins de 30 entrées.`,
  ],
  [
    "human",
    `Objectif business: {objective}
Audience cible: {audience}
Mots-clés / thèmes: {keywords}
Ton de marque: {brandTone}

Génère le plan de campagne 30 jours complet.`,
  ],
]);

export async function generateCampaignPlan(params: {
  objective: string;
  audience: string;
  keywords: string;
  brandTone?: string;
}): Promise<{ success: boolean; data?: CampaignPlan; error?: string }> {
  try {
    const { objective, audience, keywords, brandTone = "professionnel et accessible" } = params;

    if (!objective.trim() || !audience.trim()) {
      return { success: false, error: "Objectif et audience requis" };
    }

    const raw = await campaignPlanPrompt
      .pipe(getClaude())
      .pipe(getStringParser())
      .invoke({ objective, audience, keywords, brandTone });

    // Extract JSON
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { success: false, error: "Format de réponse invalide" };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary: string;
      days: CampaignDay[];
    };

    if (!parsed.days || !Array.isArray(parsed.days)) {
      return { success: false, error: "Plan vide généré" };
    }

    return {
      success: true,
      data: {
        objective,
        audience,
        duration: parsed.days.length,
        days: parsed.days,
        summary: parsed.summary ?? "",
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("generateCampaignPlan error:", error);
    return {
      success: false,
      error: "Erreur lors de la génération du plan",
    };
  }
}
