"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const IN_PROGRESS_STATUSES = ["NEW", "CONTACTED", "REPLIED"] as const;
const FUNNEL_STAGES = ["NEW", "CONTACTED", "REPLIED", "CONVERTED"] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export interface PipelineAnalyticsResult {
  /** Somme brute des deals en cours (NEW, CONTACTED, REPLIED) */
  totalPipelineValue: number;
  /** Valeur pondérée : Σ (value × score/100) */
  weightedForecast: number;
  /** Moyenne des montants saisis (deals en cours) */
  averageDealSize: number;
  /** Win rate : % de deals clôturés qui sont Gagnés (CONVERTED / (CONVERTED + REJECTED)) */
  winRate: number | null;
  /** Tunnel : count + value par étape */
  funnel: { stage: FunnelStage; label: string; count: number; value: number }[];
  /** Répartition par source (valeur totale par canal) */
  bySource: { source: string; label: string; value: number; count: number }[];
  /** Argent "bloqué" en Discussion depuis 7+ jours (pour Conseil CSO) */
  stagnantDiscussion: { amount: number; count: number };
}

async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Non autorisé");
  return session;
}

async function requireWorkspace(workspaceId: string, userId: string) {
  const ws = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId },
  });
  if (!ws) throw new Error("Workspace non trouvé");
  return ws;
}

/** Dérive la source d'affichage (pour donut) à partir de source + platform */
function normalizeSource(source: string | null, platform: string | null): string {
  const s = source?.toUpperCase() ?? platform?.toUpperCase() ?? "LINKEDIN";
  if (s.includes("INSTAGRAM")) return "INSTAGRAM_HASHTAG";
  if (s.includes("FACEBOOK")) return "FACEBOOK_GROUP";
  if (s === "SEO_INBOUND") return "SEO_INBOUND";
  return "LINKEDIN";
}

const STAGE_LABELS: Record<FunnelStage, string> = {
  NEW: "Nouveau",
  CONTACTED: "Contacté",
  REPLIED: "En Discussion",
  CONVERTED: "Gagné",
};

const SOURCE_LABELS: Record<string, string> = {
  LINKEDIN: "LinkedIn",
  FACEBOOK_GROUP: "Facebook",
  INSTAGRAM_HASHTAG: "Instagram",
  SEO_INBOUND: "SEO",
};

/**
 * Récupère toutes les métriques Pipeline Analytics pour le dashboard.
 */
export async function getPipelineAnalytics(
  workspaceId: string
): Promise<{ success: boolean; data?: PipelineAnalyticsResult; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const prospects = await prisma.prospect.findMany({
      where: { workspaceId },
      select: {
        status: true,
        value: true,
        score: true,
        source: true,
        platform: true,
        lastInteractionAt: true,
        updatedAt: true,
      },
    });

    const withValue = (v: number | null): number => (v != null && v > 0 ? Number(v) : 0);
    const inProgress = prospects.filter((p) => IN_PROGRESS_STATUSES.includes(p.status as typeof IN_PROGRESS_STATUSES[number]));

    const totalPipelineValue = inProgress.reduce((acc, p) => acc + withValue(p.value), 0);
    const weightedForecast = inProgress.reduce(
      (acc, p) => acc + (withValue(p.value) * Math.min(100, Math.max(0, p.score ?? 0))) / 100,
      0
    );
    const withValueCount = inProgress.filter((p) => p.value != null && p.value > 0).length;
    const averageDealSize = withValueCount > 0 ? totalPipelineValue / withValueCount : 0;

    const converted = prospects.filter((p) => p.status === "CONVERTED").length;
    const rejected = prospects.filter((p) => p.status === "REJECTED").length;
    const closed = converted + rejected;
    const winRate = closed > 0 ? (converted / closed) * 100 : null;

    const funnel = FUNNEL_STAGES.map((stage) => {
      const subset = prospects.filter((p) => p.status === stage);
      return {
        stage,
        label: STAGE_LABELS[stage],
        count: subset.length,
        value: subset.reduce((acc, p) => acc + withValue(p.value), 0),
      };
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const stagnant = prospects.filter(
      (p) =>
        p.status === "REPLIED" &&
        (p.lastInteractionAt ? p.lastInteractionAt < sevenDaysAgo : p.updatedAt < sevenDaysAgo)
    );
    const stagnantDiscussion = {
      amount: stagnant.reduce((acc, p) => acc + withValue(p.value), 0),
      count: stagnant.length,
    };

    const sourceMap = new Map<string, { value: number; count: number }>();
    for (const p of prospects) {
      const src = normalizeSource(p.source, p.platform);
      const prev = sourceMap.get(src) ?? { value: 0, count: 0 };
      sourceMap.set(src, {
        value: prev.value + withValue(p.value),
        count: prev.count + 1,
      });
    }
    const bySource = Array.from(sourceMap.entries()).map(([source, { value, count }]) => ({
      source,
      label: SOURCE_LABELS[source] ?? source,
      value,
      count,
    })).filter((s) => s.value > 0 || s.count > 0).sort((a, b) => b.value - a.value);

    return {
      success: true,
      data: {
        totalPipelineValue,
        weightedForecast,
        averageDealSize,
        winRate,
        funnel,
        bySource,
        stagnantDiscussion,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}

/**
 * Génère un court "Conseil du CSO" à partir des métriques (template + optionnel LLM).
 */
export async function getPipelineAnalyticsInsight(
  workspaceId: string,
  analytics: PipelineAnalyticsResult
): Promise<{ success: boolean; insight?: string; error?: string }> {
  try {
    const session = await requireAuth();
    await requireWorkspace(workspaceId, session.user!.id!);

    const { stagnantDiscussion, bySource, weightedForecast } = analytics;
    const topSource = bySource[0];
    const secondSource = bySource[1];

    if (stagnantDiscussion.amount > 0 && stagnantDiscussion.count > 0) {
      const pct = Math.min(30, Math.round(weightedForecast > 0 ? (stagnantDiscussion.amount / weightedForecast) * 100 : 20));
      return {
        success: true,
        insight: `Vous avez ${stagnantDiscussion.amount.toLocaleString("fr-FR")} € stagnants dans la colonne "En Discussion" depuis plus de 7 jours (${stagnantDiscussion.count} lead${stagnantDiscussion.count > 1 ? "s" : ""}). Une relance ciblée pourrait débloquer environ ${pct}% de ce montant.`,
      };
    }

    if (topSource && secondSource && topSource.value > 0 && secondSource.value > 0) {
      const ratio = (topSource.value / (secondSource.value || 1)).toFixed(1);
      return {
        success: true,
        insight: `Vos meilleurs contrats viennent de ${topSource.label} (${topSource.value.toLocaleString("fr-FR")} €). En réallouant plus de temps de prospection sur cette source, vous pouvez augmenter la valeur moyenne de votre pipeline.`,
      };
    }

    if (weightedForecast > 0) {
      return {
        success: true,
        insight: `Prévisionnel pondéré actuel : ${weightedForecast.toLocaleString("fr-FR")} €. Saisissez les montants estimés sur vos deals pour affiner le tableau de bord.`,
      };
    }

    return {
      success: true,
      insight: "Saisissez la valeur estimée de vos deals dans le CRM pour activer les prévisionnels et les conseils personnalisés.",
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erreur",
    };
  }
}
