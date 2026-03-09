"use server";

/**
 * God Mode — Actions réservées aux admins (ADMIN_EMAIL / SKALLE_ADMIN_EMAILS).
 * À appeler uniquement depuis des pages protégées par le layout (admin).
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addCredits } from "@/lib/credits";

const PLAN_MRR: Record<string, number> = {
  FREE: 0,
  BUSINESS: 99,
  AGENCY: 299,
  SCALE: 999,
};

function isAdmin(email: string): boolean {
  const single = process.env.ADMIN_EMAIL;
  if (single && single.trim().toLowerCase() === email.toLowerCase()) return true;
  const list = process.env.SKALLE_ADMIN_EMAILS;
  if (!list) return false;
  return list.split(",").map((e) => e.trim().toLowerCase()).includes(email.toLowerCase());
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function getGodModeStats(): Promise<{
  mrr: number;
  workspacesTotal: number;
  workspacesActive: number;
  creditsBurned30d: number;
  leadsTotal: number;
  articlesTotal: number;
  creditsByDay: Array<{ date: string; credits: number }>;
}> {
  await requireAdmin();

  const since30d = new Date();
  since30d.setDate(since30d.getDate() - 30);
  const since14d = new Date();
  since14d.setDate(since14d.getDate() - 14);

  const [userPlans, workspacesTotal, creditsAgg, prospectsCount, postsCount, usageRows] =
    await Promise.all([
      prisma.user.groupBy({
        by: ["plan"],
        _count: true,
      }),
      prisma.workspace.count(),
      prisma.aPIUsage.aggregate({
        where: { createdAt: { gte: since30d } },
        _sum: { credits: true },
      }),
      prisma.prospect.count(),
      prisma.post.count({ where: { type: "SEO_ARTICLE", deletedAt: null } }),
      prisma.aPIUsage.findMany({
        where: { createdAt: { gte: since14d } },
        select: { createdAt: true, credits: true },
      }),
    ]);

  const mrr = userPlans.reduce(
    (sum, g) => sum + (PLAN_MRR[g.plan] ?? 0) * (g._count ?? 0),
    0
  );
  const workspacesWithRecentActivity = await prisma.workspace.count({
    where: { updatedAt: { gte: since30d } },
  });

  const creditsBurned30d = creditsAgg._sum.credits ?? 0;

  const creditsByDayMap: Record<string, number> = {};
  for (let d = 0; d < 14; d++) {
    const date = new Date(since14d);
    date.setDate(date.getDate() + d);
    const key = date.toISOString().slice(0, 10);
    creditsByDayMap[key] = 0;
  }
  for (const row of usageRows) {
    const key = new Date(row.createdAt).toISOString().slice(0, 10);
    if (key in creditsByDayMap) {
      creditsByDayMap[key] += row.credits;
    }
  }
  const creditsByDay = Object.entries(creditsByDayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, credits]) => ({ date, credits }));

  return {
    mrr,
    workspacesTotal,
    workspacesActive: workspacesWithRecentActivity,
    creditsBurned30d,
    leadsTotal: prospectsCount,
    articlesTotal: postsCount,
    creditsByDay,
  };
}

export async function getGodModeWorkspaces(): Promise<
  Array<{
    id: string;
    name: string;
    ownerId: string;
    ownerEmail: string;
    plan: string;
    credits: number;
    suspendedAt: Date | null;
    updatedAt: Date;
  }>
> {
  await requireAdmin();

  const list = await prisma.workspace.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      user: {
        select: { id: true, email: true, plan: true, credits: true, suspendedAt: true },
      },
    },
  });

  type Row = (typeof list)[number] & {
    user: { id: string; email: string | null; plan: string; credits: number; suspendedAt: Date | null };
  };
  return list.map((w: Row) => ({
    id: w.id,
    name: w.name,
    ownerId: w.user.id,
    ownerEmail: w.user.email ?? "",
    plan: w.user.plan,
    credits: w.user.credits,
    suspendedAt: w.user.suspendedAt,
    updatedAt: w.updatedAt,
  }));
}

export async function getGodModeErrorLogs(): Promise<
  Array<{
    id: string;
    workspaceId: string;
    type: string;
    status: string;
    error: string | null;
    createdAt: Date;
  }>
> {
  await requireAdmin();

  const failed = await prisma.generationHistory.findMany({
    where: { status: "failed" },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, workspaceId: true, type: true, status: true, error: true, createdAt: true },
  });

  const autopilotFailed = await prisma.autopilotLog.findMany({
    where: { status: "failed" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, workspaceId: true, agentType: true, action: true, createdAt: true },
  });

  const logs = [
    ...failed.map((f) => ({
      id: f.id,
      workspaceId: f.workspaceId,
      type: f.type,
      status: f.status,
      error: f.error,
      createdAt: f.createdAt,
    })),
    ...autopilotFailed.map((a) => ({
      id: a.id,
      workspaceId: a.workspaceId,
      type: `autopilot.${a.agentType}`,
      status: "failed",
      error: a.action,
      createdAt: a.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 50);

  return logs;
}

export async function adminAddCredits(
  userId: string,
  amount: number
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  if (amount < 1 || amount > 10000) {
    return { success: false, error: "Montant entre 1 et 10000" };
  }
  const result = await addCredits(userId, amount, "bonus");
  return result.success ? { success: true } : { success: false, error: "Échec" };
}

export async function adminSuspendUser(
  userId: string,
  suspend: boolean
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: { suspendedAt: suspend ? new Date() : null },
  });
  return { success: true };
}
