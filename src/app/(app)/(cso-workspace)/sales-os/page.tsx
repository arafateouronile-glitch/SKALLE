import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CSODashboardClientV2 } from "@/components/modules/cso/dashboard-client-v2";

async function getSalesDashboardData(userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { userId },
    select: {
      id: true,
      autopilotConfig: { select: { isActive: true } },
    },
  });

  if (!workspace) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true, plan: true, name: true },
  });

  const prospectsByStatus = await prisma.prospect.groupBy({
    by: ["status"],
    where: { workspaceId: workspace.id },
    _count: true,
  });

  const statusCount = (status: string) =>
    prospectsByStatus.find((p) => p.status === status)?._count ?? 0;

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const newThisWeek = await prisma.prospect.count({
    where: { workspaceId: workspace.id, createdAt: { gte: weekAgo } },
  });

  const activeSequences = await prisma.outreachSequence.count({
    where: { workspaceId: workspace.id, isActive: true },
  });

  const csoPendingCount = await prisma.agentDecision.count({
    where: {
      workspaceId: workspace.id,
      status: "PENDING",
      actionType: { in: ["CSO_LAUNCH_LINKEDIN", "CSO_LAUNCH_EMAIL", "CSO_FOLLOWUP", "CSO_STALE_REJECT"] },
    },
  });

  const totalProspects = prospectsByStatus.reduce((s, p) => s + p._count, 0);

  return {
    workspace,
    user,
    csoPendingCount,
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

  const { user, kpis, isAutopilotActive, csoPendingCount } = data;
  const firstName = user?.name?.split(" ")[0] ?? session.user.name?.split(" ")[0] ?? "là";
  const plan = user?.plan ?? "FREE";

  return (
    <CSODashboardClientV2
      firstName={firstName}
      plan={plan}
      kpis={kpis}
      isAutopilotActive={isAutopilotActive}
      csoPendingCount={csoPendingCount}
    />
  );
}
