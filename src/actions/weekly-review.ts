"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getClaude, getStringParser } from "@/lib/ai/langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface WeeklyReview {
  score: number; // 0-100
  headline: string;
  highlights: string[];
  what_worked: string;
  what_failed: string;
  insights: string[];
  next_week_strategy: string;
  recommended_actions: string[];
  agent_adjustments: string;
  generatedAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT
// ═══════════════════════════════════════════════════════════════════════════

const weeklyReviewPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Tu es l'agent CMO de Skalle. Tu analyses les décisions marketing de la semaine passée pour identifier ce qui a fonctionné, ce qui a échoué, et comment optimiser la stratégie de la semaine suivante.

Réponds UNIQUEMENT en JSON valide avec cette structure exacte:
{
  "score": 85,
  "headline": "Bonne semaine : 8/10 décisions exécutées, SEO en tête",
  "highlights": ["3 articles SEO publiés", "Taux d'approbation 80%"],
  "what_worked": "Les décisions SEO_ARTICLE ont été approuvées et exécutées rapidement. Le CMO valide ce type de contenu.",
  "what_failed": "Les actions PROSPECT_DM ont été systématiquement rejetées (0/3). La prospection automatique génère de la résistance.",
  "insights": ["Le CMO préfère les contenus SEO aux actions commerciales", "Les décisions de priorité 1-2 sont approuvées plus vite"],
  "next_week_strategy": "Prioriser les contenus SEO (3 articles TOFU) et réduire la prospection automatique. Tester les posts LinkedIn pour la visibilité.",
  "recommended_actions": ["Créer 3 articles TOFU sur les keywords prioritaires", "Planifier 2 posts LinkedIn MOFU", "Suspendre PROSPECT_DM cette semaine"],
  "agent_adjustments": "Réduire la fréquence des décisions PROSPECT_DM. Augmenter la priorité des décisions SEO_ARTICLE (1→2). Proposer plus de SOCIAL_POST."
}`,
  ],
  [
    "human",
    `Voici les décisions de l'agent marketing des 7 derniers jours:

Statistiques globales:
- Total décisions: {totalDecisions}
- Approuvées/Exécutées: {approvedCount}
- Rejetées: {rejectedCount}
- Exécutées: {executedCount}
- En attente: {pendingCount}

Détail par type d'action:
{actionBreakdown}

Feedback utilisateur enregistré (résultats):
{outcomeSummary}

Décisions rejetées (échantillon):
{rejectedSummary}

Génère la revue hebdomadaire de l'agent.`,
  ],
]);

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function getAuthWorkspace(workspaceId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Non autorisé" as const };

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
  });
  if (!workspace) return { error: "Workspace non trouvé" as const };

  return { error: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. GENERATE WEEKLY REVIEW
// ═══════════════════════════════════════════════════════════════════════════

export async function generateWeeklyReview(workspaceId: string): Promise<{
  success: boolean;
  data?: WeeklyReview;
  error?: string;
}> {
  const { error } = await getAuthWorkspace(workspaceId);
  if (error) return { success: false, error };

  const since = new Date();
  since.setDate(since.getDate() - 7);

  const decisions = await prisma.agentDecision.findMany({
    where: { workspaceId, createdAt: { gte: since } },
    select: {
      actionType: true,
      status: true,
      reasoning: true,
      result: true,
      impact: true,
      priority: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  if (decisions.length === 0) {
    return {
      success: false,
      error:
        "Aucune décision cette semaine. Activez l'autopilot pour générer des décisions.",
    };
  }

  // Compute stats
  const totalDecisions = decisions.length;
  const approvedCount = decisions.filter(
    (d) => d.status === "APPROVED" || d.status === "EXECUTED"
  ).length;
  const rejectedCount = decisions.filter((d) => d.status === "REJECTED").length;
  const executedCount = decisions.filter((d) => d.status === "EXECUTED").length;
  const pendingCount = decisions.filter((d) => d.status === "PENDING").length;

  // Group by action type
  const byType: Record<
    string,
    { total: number; approved: number; rejected: number; executed: number }
  > = {};
  for (const d of decisions) {
    if (!byType[d.actionType])
      byType[d.actionType] = { total: 0, approved: 0, rejected: 0, executed: 0 };
    byType[d.actionType].total++;
    if (d.status === "APPROVED" || d.status === "EXECUTED")
      byType[d.actionType].approved++;
    if (d.status === "REJECTED") byType[d.actionType].rejected++;
    if (d.status === "EXECUTED") byType[d.actionType].executed++;
  }

  const actionBreakdown = Object.entries(byType)
    .map(
      ([type, stats]) =>
        `- ${type}: ${stats.total} total, ${stats.approved} approuvées, ${stats.rejected} rejetées, ${stats.executed} exécutées`
    )
    .join("\n");

  // Outcomes with user feedback
  const decisionsWithOutcome = decisions.filter((d) => d.result !== null);
  const outcomeSummary =
    decisionsWithOutcome.length > 0
      ? decisionsWithOutcome
          .map((d) => `- ${d.actionType}: ${JSON.stringify(d.result)}`)
          .join("\n")
      : "Aucun feedback utilisateur enregistré cette semaine.";

  // Rejected decisions (sample)
  const rejectedDecisions = decisions
    .filter((d) => d.status === "REJECTED")
    .slice(0, 5);
  const rejectedSummary =
    rejectedDecisions.length > 0
      ? rejectedDecisions
          .map(
            (d) =>
              `- ${d.actionType} (priorité ${d.priority}): "${d.reasoning.slice(0, 120)}..."`
          )
          .join("\n")
      : "Aucune décision rejetée cette semaine.";

  try {
    const raw = await weeklyReviewPrompt
      .pipe(getClaude())
      .pipe(getStringParser())
      .invoke({
        totalDecisions,
        approvedCount,
        rejectedCount,
        executedCount,
        pendingCount,
        actionBreakdown,
        outcomeSummary,
        rejectedSummary,
      });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { success: false, error: "Format de réponse invalide" };

    const parsed = JSON.parse(jsonMatch[0]) as Omit<WeeklyReview, "generatedAt">;

    const reviewData: WeeklyReview = {
      ...parsed,
      generatedAt: new Date().toISOString(),
    };

    // Persist in AutopilotLog for later retrieval
    await prisma.autopilotLog.create({
      data: {
        workspaceId,
        agentType: "weekly_review",
        action: `Weekly Review — Score: ${parsed.score}/100`,
        status: "success",
        details: JSON.parse(JSON.stringify(reviewData)),
        creditsUsed: 5,
      },
    });

    return { success: true, data: reviewData };
  } catch (err) {
    console.error("generateWeeklyReview error:", err);
    return { success: false, error: "Erreur lors de la génération de la review" };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. GET LAST WEEKLY REVIEW
// ═══════════════════════════════════════════════════════════════════════════

export async function getLastWeeklyReview(workspaceId: string): Promise<{
  success: boolean;
  data?: WeeklyReview;
  error?: string;
}> {
  const { error } = await getAuthWorkspace(workspaceId);
  if (error) return { success: false, error };

  const log = await prisma.autopilotLog.findFirst({
    where: { workspaceId, agentType: "weekly_review" },
    orderBy: { createdAt: "desc" },
  });

  if (!log?.details) return { success: false, error: "Aucune review disponible" };

  return { success: true, data: log.details as unknown as WeeklyReview };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. GET AGENT SCORE (quick stats — no Claude call)
// ═══════════════════════════════════════════════════════════════════════════

export async function getAgentScore(workspaceId: string): Promise<{
  success: boolean;
  data?: {
    executionRate: number; // % decisions executed vs total
    approvalRate: number;  // % decisions approved vs non-pending
    totalThisWeek: number;
    executedThisWeek: number;
    positiveOutcomes: number; // decisions with rating: "good"
  };
  error?: string;
}> {
  const { error } = await getAuthWorkspace(workspaceId);
  if (error) return { success: false, error };

  const since = new Date();
  since.setDate(since.getDate() - 7);

  const decisions = await prisma.agentDecision.findMany({
    where: { workspaceId, createdAt: { gte: since } },
    select: { status: true, result: true },
  });

  const total = decisions.length;
  const executed = decisions.filter((d) => d.status === "EXECUTED").length;
  const approved = decisions.filter(
    (d) => d.status === "APPROVED" || d.status === "EXECUTED"
  ).length;
  const nonPending = decisions.filter((d) => d.status !== "PENDING").length;
  const positiveOutcomes = decisions.filter(
    (d) => d.result && (d.result as { rating?: string }).rating === "good"
  ).length;

  return {
    success: true,
    data: {
      executionRate: total > 0 ? Math.round((executed / total) * 100) : 0,
      approvalRate: nonPending > 0 ? Math.round((approved / nonPending) * 100) : 0,
      totalThisWeek: total,
      executedThisWeek: executed,
      positiveOutcomes,
    },
  };
}
