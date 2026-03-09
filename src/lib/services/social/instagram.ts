/**
 * 📸 Instagram Prospector Engine
 *
 * - Analyse du contexte par hashtag (besoins type de l'audience)
 * - Génération de DM "low-friction" personnalisés (followers concurrents vs hashtag)
 * - Système de warm-up : limite 20 suggestions DM/jour pour protéger le compte
 * - URL DM : instagram.com/direct/t/{prospect_id} (nécessite metaUserId)
 */

import { prisma } from "@/lib/prisma";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const IG_DAILY_DM_LIMIT = 20;
const API_OP_IG_DM = "instagram_dm_suggestion";

// ═══════════════════════════════════════════════════════════════════════════
// 1️⃣ ANALYSE DE NICHE PAR HASHTAG
// ═══════════════════════════════════════════════════════════════════════════

const hashtagAnalysisPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en marketing et en analyse d'audience Instagram.
Analyse un hashtag Instagram et définis quel est le "problème type" ou le besoin principal des gens qui utilisent ce hashtag.

Exemples :
- #SaaSMarketing → besoin : acquisition de clients B2B, scaling des ventes
- #FitnessMotivation → besoin : perdre du poids, se remettre en forme, motivation
- #VieDeFrelance → besoin : trouver des clients, gérer son activité en solo

Réponds en JSON :
{
  "hashtag": "string",
  "primaryNeed": "string",
  "audienceType": "string",
  "painPoints": ["string"],
  "suggestedApproach": "string"
}

Réponds UNIQUEMENT en JSON valide.`,
  ],
  ["human", "Analyse le hashtag : {hashtag}"],
]);

/**
 * Analyse le contexte d'un hashtag pour identifier le besoin type de l'audience.
 */
export async function analyzeHashtagContext(hashtag: string): Promise<{
  hashtag: string;
  primaryNeed: string;
  audienceType: string;
  painPoints: string[];
  suggestedApproach: string;
}> {
  const cleanHashtag = hashtag.replace(/^#/, "").trim();
  const chain = hashtagAnalysisPrompt.pipe(getClaude()).pipe(getStringParser());

  const result = await chain.invoke({ hashtag: cleanHashtag });
  const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2️⃣ GÉNÉRATEUR DE DM "LOW-FRICTION"
// ═══════════════════════════════════════════════════════════════════════════

export type IGContextType = "FOLLOWER" | "HASHTAG";

const igOpeningPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es un expert en prospection Instagram et en messages d'approche authentiques.

RÈGLES CRUCIALES (Méthode des 3 étapes - JAMAIS de lien au 1er message) :
1. Message 1 : Question ouverte OU compliment + curiosité. Aucun lien.
2. Message 2 (si réponse) : Apport de valeur.
3. Message 3 (si engagement) : Lien vers le SaaS ou calendrier.

Pour ce message d'ouverture :
- Ton : Curiosité pour FOLLOWERS, rebond sur thématique pour HASHTAG
- Longueur : 150-250 caractères max (limite DM Instagram)
- Tutoiement naturel
- Pas de mots spam : "opportunité", "gratuit", "incroyable", "cliquez ici"
- Une seule idée, fluide

FOLLOWERS (concurrent) : "Salut [Handle], j'ai vu que tu t'intéressais à [domaine], je développe un outil qui simplifie [X], j'aimerais avoir ton avis d'expert."
HASHTAG : "Top ta photo sur le #[hashtag], je travaille justement sur [sujet lié]..."

Réponds UNIQUEMENT avec le message brut, sans guillemets ni préambule.`,
  ],
  [
    "human",
    `Handle du prospect : {prospectHandle}
Contexte : {contextType}
Hashtag (si HASHTAG) : {hashtag}
Domaine / offre du workspace : {domainContext}
Brand voice : {brandVoice}

Génère le message d'ouverture DM.`,
  ],
]);

export interface IGOpeningInput {
  prospectHandle: string;
  contextType: IGContextType;
  hashtag?: string;
  domainContext?: string;
  brandVoice?: string;
}

/**
 * Génère une accroche d'ouverture DM personnalisée pour Instagram.
 */
export async function generateIGOpening(input: IGOpeningInput): Promise<string> {
  const chain = igOpeningPrompt.pipe(getClaude()).pipe(getStringParser());

  const result = await chain.invoke({
    prospectHandle: input.prospectHandle,
    contextType: input.contextType,
    hashtag: input.hashtag || "",
    domainContext: input.domainContext || "solution marketing / productivité",
    brandVoice: input.brandVoice || "Professionnel et amical, conversationnel.",
  });

  return result.trim().replace(/^["']|["']$/g, "");
}

// ═══════════════════════════════════════════════════════════════════════════
// 3️⃣ SYSTÈME DE WARM-UP & QUOTAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Nombre de suggestions DM Instagram déjà consommées aujourd'hui pour ce workspace.
 */
export async function getRemainingDailyDmQuota(workspaceId: string): Promise<{
  remaining: number;
  used: number;
  limit: number;
}> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const used = await prisma.aPIUsage.count({
    where: {
      workspaceId,
      operation: API_OP_IG_DM,
      createdAt: { gte: startOfDay },
    },
  });

  return {
    remaining: Math.max(0, IG_DAILY_DM_LIMIT - used),
    used,
    limit: IG_DAILY_DM_LIMIT,
  };
}

/**
 * Vérifie le quota et enregistre une consommation si OK.
 */
export async function checkAndConsumeDmQuota(workspaceId: string): Promise<{
  allowed: boolean;
  remaining: number;
}> {
  const { remaining } = await getRemainingDailyDmQuota(workspaceId);

  if (remaining <= 0) {
    return { allowed: false, remaining: 0 };
  }

  await prisma.aPIUsage.create({
    data: {
      service: "instagram",
      operation: API_OP_IG_DM,
      credits: 1,
      workspaceId,
    },
  });

  return { allowed: true, remaining: remaining - 1 };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4️⃣ URL DM INSTAGRAM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Construit l'URL pour ouvrir une conversation DM Instagram.
 * Nécessite le metaUserId (Instagram-scoped user ID) pour le format /direct/t/{id}.
 * Sans ID Meta, retourne l'URL du profil (l'utilisateur devra cliquer "Message").
 */
export function buildIGDirectUrl(metaUserId: string | null, profileUrl?: string): string {
  if (metaUserId) {
    return `https://www.instagram.com/direct/t/${metaUserId}/`;
  }
  return profileUrl || "https://www.instagram.com/";
}
