"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasEnoughCredits, useCredits } from "@/lib/credits";
import type { OperationType } from "@/lib/credits";
import { inngest } from "@/inngest/client";
import { executeDecision } from "@/lib/services/agent/brain";

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

async function getAuthWorkspace(workspaceId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Non autorisé" as const, userId: null };

  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, userId: session.user.id },
  });
  if (!workspace) return { error: "Workspace non trouvé" as const, userId: null };

  return { error: null, userId: session.user.id };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. GET TODAY'S BRIEF
// ═══════════════════════════════════════════════════════════════════════════

export async function getTodayBrief(workspaceId: string) {
  const { error } = await getAuthWorkspace(workspaceId);
  if (error) return { success: false as const, error, data: null };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const decisions = await prisma.agentDecision.findMany({
    where: {
      workspaceId,
      createdAt: { gte: todayStart },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    include: {
      linkedPost: {
        select: { id: true, type: true, title: true, status: true },
      },
    },
  });

  return { success: true as const, data: decisions, error: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. APPROVE / REJECT DECISIONS
// ═══════════════════════════════════════════════════════════════════════════

export async function approveDecision(decisionId: string) {
  const session = await auth();
  if (!session?.user?.id) return { success: false as const, error: "Non autorisé" };

  const decision = await prisma.agentDecision.findUnique({
    where: { id: decisionId },
    include: { workspace: { select: { userId: true } } },
  });

  if (!decision || decision.workspace.userId !== session.user.id) {
    return { success: false as const, error: "Non autorisé" };
  }

  await prisma.agentDecision.update({
    where: { id: decisionId },
    data: { status: "APPROVED" },
  });

  return { success: true as const, error: null };
}

export async function rejectDecision(decisionId: string) {
  const session = await auth();
  if (!session?.user?.id) return { success: false as const, error: "Non autorisé" };

  const decision = await prisma.agentDecision.findUnique({
    where: { id: decisionId },
    include: { workspace: { select: { userId: true } } },
  });

  if (!decision || decision.workspace.userId !== session.user.id) {
    return { success: false as const, error: "Non autorisé" };
  }

  await prisma.agentDecision.update({
    where: { id: decisionId },
    data: { status: "REJECTED" },
  });

  return { success: true as const, error: null };
}

export async function approveAllDecisions(workspaceId: string) {
  const { error } = await getAuthWorkspace(workspaceId);
  if (error) return { success: false as const, error };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  await prisma.agentDecision.updateMany({
    where: {
      workspaceId,
      status: "PENDING",
      createdAt: { gte: todayStart },
    },
    data: { status: "APPROVED" },
  });

  return { success: true as const, error: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. EXECUTE APPROVED DECISIONS (via Inngest)
// ═══════════════════════════════════════════════════════════════════════════

export async function executeApprovedDecisions(workspaceId: string) {
  const { error, userId } = await getAuthWorkspace(workspaceId);
  if (error) return { success: false as const, error };

  const approved = await prisma.agentDecision.findMany({
    where: { workspaceId, status: "APPROVED" },
    select: { id: true },
  });

  if (approved.length === 0) {
    return { success: false as const, error: "Aucune décision approuvée à exécuter" };
  }

  // Vérifier les crédits
  const op: OperationType = "agent_brain_execute";
  const check = await hasEnoughCredits(userId!, op);
  if (check.currentCredits < check.cost * approved.length) {
    return {
      success: false as const,
      error: `Crédits insuffisants. Requis: ${check.cost * approved.length}, Disponibles: ${check.currentCredits}`,
    };
  }

  // Déclencher via Inngest
  await inngest.send({
    name: "agent-brain/execute-decisions",
    data: {
      workspaceId,
      userId: userId!,
      decisionIds: approved.map((d) => d.id),
    },
  });

  return { success: true as const, error: null, count: approved.length };
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. TRIGGER MANUAL CYCLE
// ═══════════════════════════════════════════════════════════════════════════

export async function triggerManualCycle(workspaceId: string) {
  const { error, userId } = await getAuthWorkspace(workspaceId);
  if (error) return { success: false as const, error };

  const op: OperationType = "agent_brain_cycle";
  const check = await hasEnoughCredits(userId!, op);
  if (!check.hasCredits) {
    return {
      success: false as const,
      error: `Crédits insuffisants. Requis: ${check.cost}, Disponibles: ${check.currentCredits}`,
    };
  }

  await inngest.send({
    name: "agent-brain/run-cycle",
    data: { workspaceId, userId: userId! },
  });

  return { success: true as const, error: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. AGENT HISTORY
// ═══════════════════════════════════════════════════════════════════════════

export async function getAgentHistory(workspaceId: string, days: number = 7) {
  const { error } = await getAuthWorkspace(workspaceId);
  if (error) return { success: false as const, error, data: null };

  const since = new Date();
  since.setDate(since.getDate() - days);

  const decisions = await prisma.agentDecision.findMany({
    where: { workspaceId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      linkedPost: {
        select: { id: true, type: true, title: true, status: true },
      },
    },
  });

  return { success: true as const, data: decisions, error: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. RECORD DECISION OUTCOME (feedback loop)
// ═══════════════════════════════════════════════════════════════════════════

export async function recordDecisionOutcome(
  decisionId: string,
  outcome: {
    rating: "good" | "bad";
    impressions?: number;
    clicks?: number;
    published?: boolean;
    note?: string;
  }
) {
  const session = await auth();
  if (!session?.user?.id) return { success: false as const, error: "Non autorisé" };

  const decision = await prisma.agentDecision.findUnique({
    where: { id: decisionId },
    include: { workspace: { select: { userId: true } } },
  });

  if (!decision || decision.workspace.userId !== session.user.id) {
    return { success: false as const, error: "Non autorisé" };
  }

  await prisma.agentDecision.update({
    where: { id: decisionId },
    data: { result: outcome },
  });

  return { success: true as const, error: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. PERFORMANCE KPIs
// ═══════════════════════════════════════════════════════════════════════════

export async function getPerformanceKPIs(workspaceId: string) {
  const { error } = await getAuthWorkspace(workspaceId);
  if (error) return { success: false as const, error, data: null };

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Décisions stats
  const decisionStats = await prisma.agentDecision.groupBy({
    by: ["status"],
    where: { workspaceId, createdAt: { gte: thirtyDaysAgo } },
    _count: true,
  });

  // Posts créés par l'agent (avec linkedPostId)
  const agentPosts = await prisma.agentDecision.count({
    where: {
      workspaceId,
      linkedPostId: { not: null },
      status: "EXECUTED",
      createdAt: { gte: thirtyDaysAgo },
    },
  });

  // Posts par jour (pour le graphique)
  const posts = await prisma.post.findMany({
    where: { workspaceId, createdAt: { gte: thirtyDaysAgo }, deletedAt: null },
    select: { createdAt: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  // Grouper par jour
  const postsByDay: Record<string, { total: number; published: number }> = {};
  for (const post of posts) {
    const day = post.createdAt.toISOString().split("T")[0];
    if (!postsByDay[day]) postsByDay[day] = { total: 0, published: 0 };
    postsByDay[day].total++;
    if (post.status === "PUBLISHED") postsByDay[day].published++;
  }

  return {
    success: true as const,
    data: {
      totalDecisions: decisionStats.reduce((s, d) => s + d._count, 0),
      executedDecisions: decisionStats.find((d) => d.status === "EXECUTED")?._count ?? 0,
      approvedDecisions: decisionStats.find((d) => d.status === "APPROVED")?._count ?? 0,
      rejectedDecisions: decisionStats.find((d) => d.status === "REJECTED")?._count ?? 0,
      agentCreatedPosts: agentPosts,
      postsByDay,
    },
    error: null,
  };
}
