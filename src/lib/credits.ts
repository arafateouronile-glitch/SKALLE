/**
 * 💰 Système de Crédits Skalle
 * 
 * Gestion des crédits utilisateur:
 * - Décompte automatique par opération
 * - Vérification avant action
 * - Historique d'utilisation
 */

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// ═══════════════════════════════════════════════════════════════════════════
// 📊 COÛT PAR OPÉRATION (en crédits)
// ═══════════════════════════════════════════════════════════════════════════

export const CREDIT_COSTS = {
  // SEO
  seo_article_short: 5,
  seo_article_medium: 8,
  seo_article_long: 12,
  seo_article_single: 8,       // Génération article unique via server action
  seo_audit: 2,
  seo_audit_enhanced: 4,       // Audit avancé avec technique + on-page + IA
  seo_audit_competitor: 6,     // Audit avec comparaison concurrentielle
  seo_intelligence: 10,        // Analyse SEO Intelligence complète (scraping + concurrents + stratégie)
  keyword_analysis: 1,
  keyword_research: 3,         // Recherche complète avec PAA + mots-clés liés
  competitor_analysis: 4,       // Analyse d'un domaine concurrent
  article_outline: 2,          // Génération de plan d'article
  content_optimization: 1,     // Scoring SEO post-génération

  // Social
  repurpose_single: 2,
  repurpose_multi: 5,
  social_post: 1,

  // Prospection
  prospect_sequence: 3,
  prospect_bulk: 2, // par prospect

  // Intelligence SEO (DataForSEO)
  seo_keyword_intelligence: 5,
  seo_competitor_analysis: 8,
  seo_content_gap: 12,
  seo_domain_authority: 4,
  seo_content_brief: 15,

  // Ad-Intelligence (Vision + analyse créative)
  ad_analysis: 20,       // Analyse complète IA (GPT-4o Vision + texte)
  ad_remix: 15,           // Génération brief créatif / remix pour ma marque

  // Social Prospector
  social_prospector_track: 2,   // Tracking d'engagement (import interactions)
  social_prospector_dm: 3,      // Génération DM personnalisé par l'IA
  social_dm_send: 1,            // Envoi d'un DM approuvé via API Meta

  // CSO Sales OS (Elite Sales Closer)
  cso_prospect_analysis: 10,    // Analyse prospect + stratégie de contact (hooks, follow-ups, objections)
  cso_closing_response: 5,       // Réponse de closing (analyse intention + 2 options A/B)
  job_board_signals: 15,        // Radar à Signaux — 10 offres + analyse IA + hooks (Job Boards)
  local_maps_scan: 10,          // Local Radar — scan + qualification IA (jusqu'à 100 leads, Filtre à Douleur)
  newborn_radar_scan: 5,        // Newborn Radar — scan registre INSEE (jusqu'à 25 nouvelles entreprises + hooks IA)
  newborn_enrichment: 2,        // Enrichissement Dropcontact par lead qualifié (email professionnel + statut)

  // Images
  image_generation: 3,
  image_generation_seo: 5,        // Image Nano Banana pour article SEO (HD 16:9, text_fidelity max)

  // Brand
  brand_voice: 2,              // Analyse ton de marque (site → IA)

  // Voice-to-Content (Whisper)
  voice_transcribe: 1,         // Transcription audio → texte (mot-clé / brief)

  // Social Content Factory
  social_factory_strategy: 5,   // Initialisation stratégie de marque (scrape + persona)
  social_factory_concepts: 15,  // Génération de 30 concepts de posts (LLM-heavy)
  social_factory_post: 2,       // Génération multi-format par concept
  social_factory_image: 3,      // Génération image Instagram (Nano Banana)

  // Agent Brain (Cerveau Central)
  agent_brain_cycle: 20,    // Cycle quotidien complet (observation + analyse + décisions)
  agent_brain_execute: 5,   // Exécution d'une décision approuvée

  // Agents (coût moyen estimé)
  agent_seo: 15,
  agent_discovery: 10,
  agent_social: 8,
  agent_prospection: 5,

  // Agent Intelligence (nouvelles fonctionnalités différenciatrices)
  auto_enrichment: 3,       // Enrichissement automatique d'un prospect (Apollo/Hunter)
  ab_test_variant: 2,       // Génération d'une variante B pour A/B test social
  competitor_alert_scan: 0, // Scan concurrent pour alertes (interne, gratuit)
  gsc_sync: 0,              // Synchronisation Google Search Console (interne, gratuit)
  score_prospect_bulk: 0,   // Re-scoring batch de prospects (interne, gratuit)

  // API publique Inbound (création lead depuis Typeform/Zapier/Make)
  api_lead: 1,
  // API publique Inbound — génération article SEO (async, headless)
  api_seo_generate: 20,
} as const;

export type OperationType = keyof typeof CREDIT_COSTS;

// ═══════════════════════════════════════════════════════════════════════════
// 💳 LIMITES PAR PLAN
// ═══════════════════════════════════════════════════════════════════════════

export const PLAN_LIMITS = {
  FREE: {
    monthlyCredits: 100,
    maxWorkspaces: 1,
    maxProspects: 50,
    autopilotEnabled: false,
    apiAccess: false,
  },
  BUSINESS: {
    monthlyCredits: 600,
    maxWorkspaces: 1,
    maxProspects: 200,
    autopilotEnabled: false,
    apiAccess: false,
  },
  AGENCY: {
    monthlyCredits: 2000,
    maxWorkspaces: 3,
    maxProspects: 1000,
    autopilotEnabled: true,
    apiAccess: false,
  },
  SCALE: {
    monthlyCredits: 6000,
    maxWorkspaces: 10,
    maxProspects: 5000,
    autopilotEnabled: true,
    apiAccess: true,
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// 🔍 FONCTIONS DE VÉRIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Vérifie si l'utilisateur a assez de crédits
 */
export async function hasEnoughCredits(
  userId: string,
  operation: OperationType
): Promise<{ hasCredits: boolean; currentCredits: number; cost: number }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true },
  });

  if (!user) {
    return { hasCredits: false, currentCredits: 0, cost: CREDIT_COSTS[operation] };
  }

  const cost = CREDIT_COSTS[operation];
  return {
    hasCredits: user.credits >= cost,
    currentCredits: user.credits,
    cost,
  };
}

/**
 * Vérifie et déduit les crédits en une seule opération
 */
export async function useCredits(
  userId: string,
  operation: OperationType,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; remainingCredits: number; error?: string }> {
  const cost = CREDIT_COSTS[operation];

  try {
    // Transaction atomique: vérifier et déduire
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { credits: true },
      });

      if (!user) {
        throw new Error("Utilisateur non trouvé");
      }

      if (user.credits < cost) {
        throw new Error(`Crédits insuffisants. Requis: ${cost}, Disponibles: ${user.credits}`);
      }

      // Déduire les crédits
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { credits: { decrement: cost } },
        select: { credits: true },
      });

      return updatedUser;
    });

    return {
      success: true,
      remainingCredits: result.credits,
    };
  } catch (error) {
    return {
      success: false,
      remainingCredits: -1,
      error: error instanceof Error ? error.message : "Erreur inconnue",
    };
  }
}

/**
 * Ajoute des crédits (achat, bonus, reset mensuel, remboursement)
 */
export async function addCredits(
  userId: string,
  amount: number,
  reason: "purchase" | "bonus" | "monthly_reset" | "referral" | "refund"
): Promise<{ success: boolean; newBalance: number }> {
  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: amount } },
      select: { credits: true },
    });

    return { success: true, newBalance: user.credits };
  } catch {
    return { success: false, newBalance: -1 };
  }
}

/**
 * Reset mensuel des crédits
 */
export async function resetMonthlyCredits(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });

  if (!user) return;

  const monthlyCredits = PLAN_LIMITS[user.plan].monthlyCredits;
  
  await prisma.user.update({
    where: { id: userId },
    data: { credits: monthlyCredits },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 📊 STATISTIQUES D'UTILISATION
// ═══════════════════════════════════════════════════════════════════════════

export interface CreditStats {
  currentCredits: number;
  monthlyLimit: number;
  usedThisMonth: number;
  percentageUsed: number;
  topOperations: { operation: string; count: number; credits: number }[];
}

export async function getCreditStats(userId: string): Promise<CreditStats | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true, plan: true, workspaces: { select: { id: true } } },
  });

  if (!user) return null;

  const workspaceIds = user.workspaces.map(w => w.id);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  // Get usage this month
  const usage = await prisma.aPIUsage.groupBy({
    by: ["operation"],
    where: {
      workspaceId: { in: workspaceIds },
      createdAt: { gte: startOfMonth },
    },
    _sum: { credits: true },
    _count: true,
  });

  const usedThisMonth = usage.reduce((sum, u) => sum + (u._sum.credits || 0), 0);
  const monthlyLimit = PLAN_LIMITS[user.plan].monthlyCredits;

  return {
    currentCredits: user.credits,
    monthlyLimit,
    usedThisMonth,
    percentageUsed: Math.round((usedThisMonth / monthlyLimit) * 100),
    topOperations: usage
      .map(u => ({
        operation: u.operation,
        count: u._count,
        credits: u._sum.credits || 0,
      }))
      .sort((a, b) => b.credits - a.credits)
      .slice(0, 5),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🛡️ MIDDLEWARE DE CRÉDITS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wrapper pour les actions qui nécessitent des crédits.
 * Déduit les crédits AVANT l'action (évite double-spend sous concurrence).
 * En cas d'échec de l'action, rembourse automatiquement les crédits.
 */
export async function withCredits<T>(
  operation: OperationType,
  workspaceId: string,
  action: () => Promise<T>
): Promise<{ success: boolean; data?: T; error?: string; creditsUsed?: number }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { success: false, error: "Non autorisé" };
  }

  const userId = session.user.id;
  const cost = CREDIT_COSTS[operation];

  // 1. Déduire les crédits en premier (transaction atomique — évite race condition)
  const creditResult = await useCredits(userId, operation);
  if (!creditResult.success) {
    return {
      success: false,
      error: creditResult.error ?? `Crédits insuffisants. Requis: ${cost}. Passez à un plan supérieur pour continuer.`,
    };
  }

  // 2. Exécuter l'action ; en cas d'échec, rembourser
  try {
    const result = await action();

    // 3. Logger l'utilisation (succès)
    await prisma.aPIUsage.create({
      data: {
        service: operation.split("_")[0],
        operation,
        credits: cost,
        workspaceId,
      },
    });

    return {
      success: true,
      data: result,
      creditsUsed: cost,
    };
  } catch (error) {
    // Rembourser les crédits en cas d'échec de l'action
    await addCredits(userId, cost, "refund");
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur lors de l'exécution",
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔔 ALERTES DE CRÉDITS
// ═══════════════════════════════════════════════════════════════════════════

export function getCreditAlert(credits: number, monthlyLimit: number): {
  level: "none" | "warning" | "critical" | "depleted";
  message: string;
} {
  const percentage = (credits / monthlyLimit) * 100;

  if (credits === 0) {
    return {
      level: "depleted",
      message: "Vous n'avez plus de crédits. Passez à un plan supérieur pour continuer.",
    };
  }
  if (percentage <= 10) {
    return {
      level: "critical",
      message: `Il ne vous reste que ${credits} crédits. Pensez à upgrader votre plan.`,
    };
  }
  if (percentage <= 25) {
    return {
      level: "warning",
      message: `${credits} crédits restants ce mois-ci.`,
    };
  }
  return { level: "none", message: "" };
}
