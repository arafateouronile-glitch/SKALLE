/**
 * 💰 Budget Guard — Protection contre les dépenses API runaway
 *
 * Utilise Upstash Redis pour tracker les dépenses estimées par workspace/jour.
 * Si un workspace dépasse son plafond journalier, les appels LLM sont bloqués.
 *
 * Les coûts sont des estimations basées sur le nombre de tokens moyen par opération.
 * Objectif : éviter qu'un bug ou une boucle infinie génère des factures catastrophiques.
 */

import { Redis } from "@upstash/redis";

// ─── Coûts estimés par 1000 tokens (USD) ────────────────────────────────────
const COST_PER_1K_TOKENS_USD: Record<string, number> = {
  "claude-sonnet-4-6": 0.003,         // $3/Mtok input + $15/Mtok output → avg ~$3/Mtok
  "claude-haiku-4-5-20251001": 0.00025, // $0.25/Mtok input (très bon marché)
  "gpt-4o-mini": 0.00015,             // $0.15/Mtok input
  "gpt-4o": 0.005,                    // $5/Mtok input
};

// ─── Budget journalier par plan (en centimes USD) ───────────────────────────
const DAILY_BUDGET_CENTS: Record<string, number> = {
  FREE:     50,    // $0.50/jour
  BUSINESS: 200,   // $2.00/jour
  AGENCY:   500,   // $5.00/jour
  SCALE:    2000,  // $20.00/jour
};

// ─── Tokens estimés par opération agent ─────────────────────────────────────
export const ESTIMATED_TOKENS_PER_OP: Record<string, number> = {
  agent_brain_cycle:    8000,  // ~8k tokens pour observation + analyse + planification
  agent_brain_execute:  2000,  // ~2k tokens pour l'exécution d'une décision
  agent_seo:           12000,  // ~12k tokens (recherche + rédaction longue)
  agent_discovery:      8000,  // ~8k tokens (analyse concurrent)
  agent_social:         4000,  // ~4k tokens (adaptation contenu)
  agent_prospection:    3000,  // ~3k tokens (séquence messages)
  learn_from_performance: 6000, // ~6k tokens (apprentissage hebdomadaire)
};

// ─── Lazy Redis client ───────────────────────────────────────────────────────
let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null; // Pas de Redis configuré → pas de budget guard
  }
  _redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return _redis;
}

// ─── Clé Redis : "budget:{workspaceId}:{YYYY-MM-DD}" ────────────────────────
function budgetKey(workspaceId: string): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `budget:${workspaceId}:${today}`;
}

/**
 * Vérifie si le workspace peut encore effectuer une opération LLM.
 * @returns { allowed: true } ou { allowed: false, reason, spentCents, limitCents }
 */
export async function checkBudget(
  workspaceId: string,
  operation: keyof typeof ESTIMATED_TOKENS_PER_OP,
  model: string = "claude-sonnet-4-6",
  plan: string = "AGENCY"
): Promise<{ allowed: boolean; spentCents: number; limitCents: number; reason?: string }> {
  const redis = getRedis();
  const limitCents = DAILY_BUDGET_CENTS[plan] ?? DAILY_BUDGET_CENTS.AGENCY;

  // Sans Redis → pas de guard (fail open)
  if (!redis) {
    return { allowed: true, spentCents: 0, limitCents };
  }

  const estimatedTokens = ESTIMATED_TOKENS_PER_OP[operation] ?? 4000;
  const costPer1k = COST_PER_1K_TOKENS_USD[model] ?? 0.003;
  const estimatedCents = Math.ceil((estimatedTokens / 1000) * costPer1k * 100);

  const key = budgetKey(workspaceId);
  const current = await redis.get<number>(key) ?? 0;
  const spentCents = Number(current);

  if (spentCents + estimatedCents > limitCents) {
    return {
      allowed: false,
      spentCents,
      limitCents,
      reason: `Budget journalier dépassé: ${(spentCents / 100).toFixed(2)}$ dépensés / ${(limitCents / 100).toFixed(2)}$ max. Réessayez demain.`,
    };
  }

  return { allowed: true, spentCents, limitCents };
}

/**
 * Enregistre une dépense LLM estimée pour le workspace.
 * Appeler APRÈS un appel LLM réussi.
 * La clé expire automatiquement à minuit + 1h pour les fuseaux horaires.
 */
export async function trackSpend(
  workspaceId: string,
  operation: keyof typeof ESTIMATED_TOKENS_PER_OP,
  model: string = "claude-sonnet-4-6"
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const estimatedTokens = ESTIMATED_TOKENS_PER_OP[operation] ?? 4000;
  const costPer1k = COST_PER_1K_TOKENS_USD[model] ?? 0.003;
  const estimatedCents = Math.ceil((estimatedTokens / 1000) * costPer1k * 100);

  const key = budgetKey(workspaceId);

  // Incrémenter et définir un TTL de 25h (reset le lendemain)
  await redis.incrby(key, estimatedCents);
  await redis.expire(key, 90000); // 25h en secondes
}

/**
 * Retourne le résumé des dépenses du jour pour un workspace.
 */
export async function getBudgetStatus(
  workspaceId: string,
  plan: string = "AGENCY"
): Promise<{ spentCents: number; limitCents: number; remainingCents: number; spentUsd: string; limitUsd: string }> {
  const redis = getRedis();
  const limitCents = DAILY_BUDGET_CENTS[plan] ?? DAILY_BUDGET_CENTS.AGENCY;

  const current = redis ? (await redis.get<number>(budgetKey(workspaceId)) ?? 0) : 0;
  const spentCents = Number(current);

  return {
    spentCents,
    limitCents,
    remainingCents: Math.max(0, limitCents - spentCents),
    spentUsd: (spentCents / 100).toFixed(2),
    limitUsd: (limitCents / 100).toFixed(2),
  };
}
