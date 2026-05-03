import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/credits";
import { CMODashboardClient } from "@/components/modules/cmo-dashboard/dashboard-client";

async function getCommandCenterData(userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { userId },
    select: {
      id: true,
      autopilotConfig: { select: { isActive: true } },
      _count: {
        select: {
          posts: { where: { deletedAt: null } },
          audits: true,
          agentDecisions: true,
        },
      },
    },
  });

  if (!workspace) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true, plan: true, name: true },
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayDecisions = await prisma.agentDecision.findMany({
    where: { workspaceId: workspace.id, createdAt: { gte: todayStart } },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    include: {
      linkedPost: { select: { id: true, type: true, title: true, status: true } },
    },
  });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [decisionStats, agentPosts, posts] = await Promise.all([
    prisma.agentDecision.groupBy({
      by: ["status"],
      where: { workspaceId: workspace.id, createdAt: { gte: thirtyDaysAgo } },
      _count: true,
    }),
    prisma.agentDecision.count({
      where: {
        workspaceId: workspace.id,
        linkedPostId: { not: null },
        status: "EXECUTED",
        createdAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.post.findMany({
      where: { workspaceId: workspace.id, createdAt: { gte: thirtyDaysAgo }, deletedAt: null },
      select: { createdAt: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const postsByDay: Record<string, { total: number; published: number }> = {};
  for (const post of posts) {
    const day = post.createdAt.toISOString().split("T")[0];
    if (!postsByDay[day]) postsByDay[day] = { total: 0, published: 0 };
    postsByDay[day].total++;
    if (post.status === "PUBLISHED") postsByDay[day].published++;
  }

  const failedDecisions = decisionStats.find((d) => d.status === "FAILED")?._count ?? 0;
  const totalDecisions30 = decisionStats.reduce((s, d) => s + d._count, 0);
  const hasAlerts = totalDecisions30 > 0 && failedDecisions / totalDecisions30 > 0.5;

  const kpiPerf = {
    totalDecisions: totalDecisions30,
    executedDecisions: decisionStats.find((d) => d.status === "EXECUTED")?._count ?? 0,
    approvedDecisions: decisionStats.find((d) => d.status === "APPROVED")?._count ?? 0,
    rejectedDecisions: decisionStats.find((d) => d.status === "REJECTED")?._count ?? 0,
    agentCreatedPosts: agentPosts,
    postsByDay,
  };

  return { workspace, user, todayDecisions, kpiPerf, hasAlerts };
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const data = await getCommandCenterData(session.user.id);
  if (!data) redirect("/login");

  const { workspace, user, todayDecisions, kpiPerf, hasAlerts } = data;
  const isAutopilotActive = workspace.autopilotConfig?.isActive ?? false;
  const firstName = user?.name?.split(" ")[0] ?? session.user.name?.split(" ")[0] ?? "là";
  const plan = user?.plan ?? "FREE";
  const credits = user?.credits ?? 0;
  const planKey = plan in PLAN_LIMITS ? (plan as keyof typeof PLAN_LIMITS) : "FREE";
  const creditsMax = PLAN_LIMITS[planKey].monthlyCredits;

  return (
    <CMODashboardClient
      firstName={firstName}
      plan={plan}
      credits={credits}
      creditsMax={creditsMax}
      todayDecisions={todayDecisions.map((d) => ({
        id: d.id,
        actionType: d.actionType,
        reasoning: d.reasoning,
        priority: d.priority,
        impact: d.impact,
        status: d.status,
        linkedPost: d.linkedPost
          ? { id: d.linkedPost.id, type: d.linkedPost.type, title: d.linkedPost.title ?? "" }
          : null,
      }))}
      kpiPerf={kpiPerf}
      isAutopilotActive={isAutopilotActive}
      hasAlerts={hasAlerts}
      workspaceId={workspace.id}
    />
  );
}
