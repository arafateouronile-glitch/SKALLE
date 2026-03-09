/**
 * 🎯 Lead Scoring CSO — Formule pondérée pour le Dashboard
 *
 * Score_Total = (I × W_int) + (S × W_sent) + (A × W_auth)
 *
 * I (Interaction) : fréquence et type (commentaire > like)
 * S (Sentiment) : Positif +50, Neutre +10, Négatif -100
 * A (Autorité) : qualité du profil (connexions, bio pro, lien site)
 */

import { prisma } from "@/lib/prisma";

// ═══════════════════════════════════════════════════════════════════════════
// 📐 POIDS PAR DÉFAUT (ajustables)
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_WEIGHTS = {
  interaction: 0.35,  // W_int (réduit légèrement pour laisser place au trigger)
  sentiment: 0.30,    // W_sent
  authority: 0.20,    // W_auth
  trigger: 0.15,      // W_trigger (nouveau : signaux d'achat, levées, technographie)
} as const;

/** Poids sans composante trigger (rétrocompatibilité) */
export const WEIGHTS_WITHOUT_TRIGGER = {
  interaction: 0.40,
  sentiment: 0.35,
  authority: 0.25,
  trigger: 0,
} as const;

/** Sentiment → valeur S (normalisée 0–100 pour la formule) */
export const SENTIMENT_VALUES: Record<string, number> = {
  POSITIVE: 85,
  NEUTRAL: 40,
  NEGATIVE: 0,
};

/** Température dérivée du score total */
export function scoreToTemperature(score: number): "HOT" | "WARM" | "COLD" {
  if (score > 80) return "HOT";
  if (score >= 40) return "WARM";
  return "COLD";
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 CALCUL DES COMPOSANTES (0–100 chacune)
// ═══════════════════════════════════════════════════════════════════════════

export interface ScoringInput {
  /** Type d'interaction : "comment" | "like" | "follow" | "none" */
  interactionType?: string;
  /** Nombre d'interactions récentes (ex: 5) */
  interactionCount?: number;
  /** Sentiment connu : POSITIVE | NEUTRAL | NEGATIVE */
  sentiment?: string;
  /** Connexions LinkedIn (ex: 500+) */
  linkedInConnections?: number | null;
  /** A un lien site / bio pro dans enrichmentData */
  hasProfileUrl?: boolean;
  /** Données enrichies (bio, etc.) */
  enrichmentData?: unknown;
  /**
   * Score d'intention d'achat (0-100) — composante T (Trigger).
   * 0 = aucun signal, 50 = offre d'emploi, 75 = croissance, 100 = levée de fonds récente.
   * Si null/undefined, la composante T est ignorée (poids répartis sur I, S, A).
   */
  intentScore?: number | null;
}

/**
 * Calcule I (Interaction) 0–100 : commentaire = plus qu'un like.
 */
function computeInteractionScore(input: ScoringInput): number {
  const type = (input.interactionType || "none").toLowerCase();
  const count = Math.min(input.interactionCount ?? 0, 10);
  const typeMultiplier =
    type === "comment" ? 1.0 : type === "follow" ? 0.6 : type === "like" ? 0.4 : 0;
  return Math.min(100, Math.round(typeMultiplier * (30 + count * 7)));
}

/**
 * Calcule S (Sentiment) 0–100 à partir du sentiment connu.
 */
function computeSentimentScore(input: ScoringInput): number {
  const s = (input.sentiment || "NEUTRAL").toUpperCase();
  return SENTIMENT_VALUES[s] ?? SENTIMENT_VALUES.NEUTRAL;
}

/**
 * Calcule A (Autorité) 0–100 : profil pro, connexions, lien site.
 */
function computeAuthorityScore(input: ScoringInput): number {
  let score = 0;
  const connections = input.linkedInConnections ?? 0;
  if (connections >= 500) score += 40;
  else if (connections >= 200) score += 25;
  else if (connections >= 50) score += 10;
  if (input.hasProfileUrl) score += 25;
  const hasEnrichment = input.enrichmentData && typeof input.enrichmentData === "object" && Object.keys(input.enrichmentData as object).length > 0;
  if (hasEnrichment) score += 20;
  return Math.min(100, score + 15); // base 15 pour tout profil
}

// ═══════════════════════════════════════════════════════════════════════════
// 🧮 SCORE TOTAL ET MISE À JOUR
// ═══════════════════════════════════════════════════════════════════════════

export interface LeadScoringResult {
  score: number;
  temperature: "HOT" | "WARM" | "COLD";
  sentiment: string;
  interactionScore: number;
  sentimentScore: number;
  authorityScore: number;
  triggerScore: number; // Composante T : signaux d'achat (intentScore)
}

/**
 * Calcule le score pondéré pour un prospect.
 *
 * Si intentScore est fourni :
 *   Score_Total = (I × 0.35) + (S × 0.30) + (A × 0.20) + (T × 0.15)
 * Sinon (rétrocompatibilité) :
 *   Score_Total = (I × 0.40) + (S × 0.35) + (A × 0.25)
 */
export function computeLeadScore(
  input: ScoringInput,
  weights = DEFAULT_WEIGHTS
): LeadScoringResult {
  const I = computeInteractionScore(input);
  const S = computeSentimentScore(input);
  const A = computeAuthorityScore(input);
  const T = input.intentScore ?? null;

  let raw: number;
  let triggerScore = 0;

  if (T !== null) {
    // Nouvelle formule avec composante Trigger
    triggerScore = Math.min(100, Math.max(0, T));
    raw = I * weights.interaction + S * weights.sentiment + A * weights.authority + triggerScore * weights.trigger;
  } else {
    // Rétrocompatibilité : pas de composante trigger, poids redistribués
    raw = I * WEIGHTS_WITHOUT_TRIGGER.interaction + S * WEIGHTS_WITHOUT_TRIGGER.sentiment + A * WEIGHTS_WITHOUT_TRIGGER.authority;
  }

  const score = Math.round(Math.min(100, Math.max(0, raw)));
  const sentiment = (input.sentiment || "NEUTRAL").toUpperCase();
  return {
    score,
    temperature: scoreToTemperature(score),
    sentiment: sentiment === "POSITIVE" ? "POSITIVE" : sentiment === "NEGATIVE" ? "NEGATIVE" : "NEUTRAL",
    interactionScore: I,
    sentimentScore: S,
    authorityScore: A,
    triggerScore,
  };
}

/**
 * Met à jour le prospect en DB avec le score, temperature, sentiment.
 * Optionnel : aiSummary et suggestedHook (générés par IA ailleurs).
 */
export async function updateProspectScoring(
  prospectId: string,
  result: LeadScoringResult,
  options?: { aiSummary?: string; suggestedHook?: string }
): Promise<void> {
  await prisma.prospect.update({
    where: { id: prospectId },
    data: {
      score: result.score,
      temperature: result.temperature,
      sentiment: result.sentiment,
      lastInteractionAt: new Date(),
      lastScoredAt: new Date(), // Tracking pour le scoring dynamique
      ...(options?.aiSummary != null && { aiSummary: options.aiSummary }),
      ...(options?.suggestedHook != null && { suggestedHook: options.suggestedHook }),
    },
  });
}

/**
 * Construit les ScoringInput à partir d'un prospect Prisma (et optionnellement d'une SocialInteraction).
 */
export function prospectToScoringInput(prospect: {
  sentiment?: string | null;
  notes?: string | null;
  linkedInConnections?: number | null;
  enrichmentData?: unknown;
  platform?: string | null;
  intentScore?: number | null;
}): ScoringInput {
  const enrichmentData = prospect.enrichmentData as Record<string, unknown> | null;
  const hasProfileUrl = !!(
    enrichmentData?.profileUrl ||
    enrichmentData?.website ||
    enrichmentData?.companyWebsite
  );
  const interactionType = prospect.notes?.includes("commentaire") ? "comment" : prospect.notes ? "like" : "none";
  return {
    interactionType,
    interactionCount: prospect.notes ? 1 : 0,
    sentiment: prospect.sentiment || "NEUTRAL",
    linkedInConnections: prospect.linkedInConnections,
    hasProfileUrl,
    enrichmentData: prospect.enrichmentData,
    intentScore: prospect.intentScore,
  };
}
