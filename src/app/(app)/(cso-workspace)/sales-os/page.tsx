import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CSODashboardClientV2 } from "@/components/modules/cso/dashboard-client-v2";
import { CsoMetricsDashboard } from "@/components/modules/cso/cso-metrics-dashboard";

async function getSalesDashboardData(userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { userId },
    select: {
      id: true,
      autopilotConfig: { select: { isActive: true } },
    },
  });

  if (!workspace) return null;

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [
    user,
    prospectsByStatus,
    newThisWeek,
    activeSequences,
    csoPendingCount,
    hotLeads,
    recentReplies,
    recentDecisions,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true, plan: true, name: true },
    }),
    prisma.prospect.groupBy({
      by: ["status"],
      where: { workspaceId: workspace.id },
      _count: true,
    }),
    prisma.prospect.count({
      where: { workspaceId: workspace.id, createdAt: { gte: weekAgo } },
    }),
    prisma.outreachSequence.count({
      where: { workspaceId: workspace.id, isActive: true },
    }),
    prisma.agentDecision.count({
      where: {
        workspaceId: workspace.id,
        status: "PENDING",
        actionType: { in: ["CSO_LAUNCH_LINKEDIN", "CSO_LAUNCH_EMAIL", "CSO_FOLLOWUP", "CSO_STALE_REJECT"] },
      },
    }),
    prisma.prospect.findMany({
      where: {
        workspaceId: workspace.id,
        OR: [{ temperature: "HOT" }, { score: { gte: 75 } }],
      },
      orderBy: { score: "desc" },
      take: 6,
      select: {
        id: true,
        name: true,
        jobTitle: true,
        company: true,
        score: true,
        source: true,
        aiSummary: true,
        suggestedHook: true,
        temperature: true,
      },
    }),
    prisma.prospect.findMany({
      where: {
        workspaceId: workspace.id,
        status: { in: ["RESPONDED", "REPLIED", "MEETING_BOOKED"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: {
        id: true,
        name: true,
        company: true,
        status: true,
        updatedAt: true,
        notes: true,
      },
    }),
    prisma.agentDecision.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        actionType: true,
        reasoning: true,
        status: true,
        priority: true,
        createdAt: true,
      },
    }),
  ]);

  const statusCount = (status: string) =>
    prospectsByStatus.find((p) => p.status === status)?._count ?? 0;

  const totalProspects = prospectsByStatus.reduce((s, p) => s + p._count, 0);

  return {
    workspace,
    user,
    csoPendingCount,
    hotLeads: hotLeads.map((l) => ({ ...l, source: l.source as string | null })),
    recentReplies: recentReplies.map((r) => ({
      ...r,
      updatedAt: r.updatedAt.toISOString(),
      status: r.status as string,
    })),
    recentDecisions: recentDecisions.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
    })),
    kpis: {
      total: totalProspects,
      newThisWeek,
      contacted: statusCount("CONTACTED"),
      replied: statusCount("REPLIED"),
      converted: statusCount("CONVERTED"),
      activeSequences,
    },
    isAutopilotActive: workspace.autopilotConfig?.isActive ?? false,
  };
}

export default async function SalesDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const data = await getSalesDashboardData(session.user.id);
  if (!data) redirect("/login");

  const { user, kpis, isAutopilotActive, csoPendingCount, hotLeads, recentReplies, recentDecisions } = data;
  const firstName = user?.name?.split(" ")[0] ?? session.user.name?.split(" ")[0] ?? "là";
  const plan = user?.plan ?? "FREE";

  return (
    <div className="space-y-6">
      <CSODashboardClientV2
        firstName={firstName}
        plan={plan}
        kpis={kpis}
        isAutopilotActive={isAutopilotActive}
        csoPendingCount={csoPendingCount}
        hotLeads={hotLeads}
        recentReplies={recentReplies}
        recentDecisions={recentDecisions}
      />
      <div className="max-w-2xl">
        <CsoMetricsDashboard workspaceId={data.workspace.id} />
      </div>
    </div>
  );
}
