import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/credits";
import { CMODashboardClientV2 } from "@/components/modules/cmo-dashboard/dashboard-client-v2";

// ─── Agent squad config ───────────────────────────────────────────────────────

const AGENT_DEFS = [
  { name: "SEO Sentinel",   types: ["SEO_ARTICLE", "SEO_REGENERATE"],          color: "emerald" },
  { name: "Social Factory", types: ["SOCIAL_POST", "AD_REMIX"],                 color: "violet"  },
  { name: "Discovery",      types: ["DISCOVERY_SCAN", "COMPETITOR_REACT"],      color: "amber"   },
  { name: "Prospection",    types: ["PROSPECT_DM"],                              color: "cold"    },
] as const;

// ─── Data fetcher ─────────────────────────────────────────────────────────────

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

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Fetch in parallel — today's decisions (for pending queue) + 30-day window (for squad + signals)
  const [todayDecisions, last30Decisions, decisionStats, agentPosts, posts] = await Promise.all([
    prisma.agentDecision.findMany({
      where: { workspaceId: workspace.id, createdAt: { gte: todayStart } },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      include: {
        linkedPost: { select: { id: true, type: true, title: true, status: true } },
      },
    }),
    prisma.agentDecision.findMany({
      where: { workspaceId: workspace.id, createdAt: { gte: thirtyDaysAgo } },
      select: { actionType: true, status: true, reasoning: true, priority: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
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

  // ── postsByDay ────────────────────────────────────────────────────────────
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

  // ── Agent Squad (real) ────────────────────────────────────────────────────
  const agentSquad = AGENT_DEFS.map(({ name, types, color }) => {
    const relevant = last30Decisions.filter((d) =>
      (types as readonly string[]).includes(d.actionType)
    );
    const latest = relevant[0]; // already desc
    let status: "active" | "thinking" | "idle" = "idle";
    let task = "Aucune activité ce mois";
    if (latest) {
      if (latest.status === "EXECUTED") status = "active";
      else if (latest.status === "PENDING" || latest.status === "APPROVED") status = "thinking";
      const r = latest.reasoning;
      task = r.length > 58 ? r.slice(0, 55) + "…" : r;
    }
    const executed = relevant.filter((d) => d.status === "EXECUTED").length;
    return { name, status, task, executed, total: relevant.length, color };
  });

  // ── Signal Feed (real — last 48h decisions) ───────────────────────────────
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 3600 * 1000);
  const signalFeed = last30Decisions
    .filter((d) => d.createdAt >= fortyEightHoursAgo)
    .slice(0, 6)
    .map((d) => {
      let sev: "high" | "good" | "warn" | "info" = "info";
      if (d.status === "FAILED") sev = "high";
      else if (d.status === "EXECUTED") sev = "good";
      else if (d.priority === 1 && d.status === "PENDING") sev = "warn";
      const r = d.reasoning;
      return {
        text: r.length > 90 ? r.slice(0, 87) + "…" : r,
        createdAt: d.createdAt.toISOString(),
        sev,
      };
    });

  // ── Channel Activity (executed decisions grouped by agent category, 30j) ──
  const channelDefs = [
    { name: "SEO / Articles",   types: ["SEO_ARTICLE", "SEO_REGENERATE"],     color: "emerald" },
    { name: "Social & Ads",     types: ["SOCIAL_POST", "AD_REMIX"],            color: "violet"  },
    { name: "Prospection DMs",  types: ["PROSPECT_DM"],                         color: "cold"    },
    { name: "Discovery",        types: ["DISCOVERY_SCAN", "COMPETITOR_REACT"], color: "amber"   },
  ] as const;

  const channelActivity = (() => {
    const executedOnly = last30Decisions.filter((d) => d.status === "EXECUTED");
    const raw = channelDefs.map(({ name, types, color }) => ({
      name,
      color,
      count: executedOnly.filter((d) => (types as readonly string[]).includes(d.actionType)).length,
    }));
    const maxCount = Math.max(1, ...raw.map((c) => c.count));
    return raw.map((c) => ({ ...c, pct: Math.round((c.count / maxCount) * 100) }));
  })();

  return {
    workspace, user, todayDecisions, kpiPerf, hasAlerts,
    agentSquad, signalFeed, channelActivity,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const data = await getCommandCenterData(session.user.id);
  if (!data) redirect("/login");

  const { workspace, user, todayDecisions, kpiPerf, hasAlerts, agentSquad, signalFeed, channelActivity } = data;
  const isAutopilotActive = workspace.autopilotConfig?.isActive ?? false;
  const firstName = user?.name?.split(" ")[0] ?? session.user.name?.split(" ")[0] ?? "là";
  const plan = user?.plan ?? "FREE";
  const credits = user?.credits ?? 0;
  const planKey = plan in PLAN_LIMITS ? (plan as keyof typeof PLAN_LIMITS) : "FREE";
  const creditsMax = PLAN_LIMITS[planKey].monthlyCredits;

  return (
    <CMODashboardClientV2
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
      agentSquad={agentSquad}
      signalFeed={signalFeed}
      channelActivity={channelActivity}
    />
  );
}
