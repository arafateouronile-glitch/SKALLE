import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Zap,
  ArrowRight,
  Sparkles,
  Target,
  BarChart3,
  Brain,
  Factory,
  Bot,
  TrendingUp,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { MorningBrief } from "@/components/modules/agent-brain/morning-brief";
import { PerformanceChart } from "@/components/modules/agent-brain/performance-chart";

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

  const kpis = [
    { label: "Contenus", value: workspace._count.posts, icon: FileText, href: "/marketing-os/seo-factory" },
    { label: "Audits SEO", value: workspace._count.audits, icon: BarChart3, href: "/marketing-os/seo-factory" },
    { label: "Décisions IA", value: workspace._count.agentDecisions, icon: Brain, href: "#brief" },
    { label: "Crédits", value: user?.credits ?? 0, icon: Zap, href: "/marketing-os/settings" },
  ];

  const quickActions = [
    { title: "Content Factory", description: "30 posts sociaux en un clic", icon: Factory, href: "/marketing-os/social/factory" },
    { title: "Audit SEO", description: "Analysez vos lacunes", icon: BarChart3, href: "/marketing-os/seo-factory" },
    { title: "Concurrents", description: "Spy pubs & stratégies", icon: Target, href: "/marketing-os/discovery" },
    { title: "Agents IA", description: "Automatisez le marketing", icon: Bot, href: "/marketing-os/autopilot" },
  ];

  return (
    <div className="space-y-6 pb-8">

      {/* ── HERO BANNER ── */}
      <div className="rounded-2xl bg-slate-900 overflow-hidden">
        <div className="px-6 py-5 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          {/* Greeting */}
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <Activity className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Bonjour, {firstName}</h1>
              <p className="text-[13px] text-slate-400 mt-0.5">
                {isAutopilotActive
                  ? "Votre agent IA est actif — Morning Brief ci-dessous"
                  : "Tableau de bord Marketing OS"}
              </p>
            </div>
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.07] border border-white/10 px-3 py-1.5 text-[12px] font-medium text-slate-300">
              Plan {user?.plan ?? "FREE"}
            </span>
            {isAutopilotActive ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 text-[12px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Autopilot actif
              </span>
            ) : (
              <Link href="/marketing-os/settings">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] border border-white/10 px-3 py-1.5 text-[12px] font-medium text-slate-400 hover:bg-white/10 transition-colors">
                  <Sparkles className="h-3 w-3" />
                  Activer l&apos;Autopilot
                </span>
              </Link>
            )}
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-white/[0.07]">
          {kpis.map((kpi, i) => (
            <Link key={kpi.label} href={kpi.href}>
              <div className={`px-6 py-4 hover:bg-white/[0.04] transition-colors cursor-pointer ${i < kpis.length - 1 ? "border-r border-white/[0.07]" : ""}`}>
                <div className="flex items-center gap-2 mb-1">
                  <kpi.icon className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-[11px] text-slate-500 font-medium">{kpi.label}</span>
                </div>
                <p className="text-2xl font-bold text-white tabular-nums">{kpi.value.toLocaleString("fr-FR")}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── MAIN GRID: BRIEF + CHART ── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5" id="brief">
        <div className="xl:col-span-3">
          <MorningBrief
            workspaceId={workspace.id}
            decisions={(Array.isArray(todayDecisions) ? todayDecisions : []).map((d) => ({
              id: d.id,
              reasoning: d.reasoning,
              actionType: d.actionType,
              priority: d.priority,
              impact: d.impact,
              status: d.status,
              linkedPost: d.linkedPost
                ? { id: d.linkedPost.id, type: d.linkedPost.type, title: d.linkedPost.title }
                : null,
            }))}
            isAutopilotActive={isAutopilotActive}
            hasAlerts={hasAlerts}
          />
        </div>
        <div className="xl:col-span-2">
          <PerformanceChart
            postsByDay={kpiPerf.postsByDay}
            agentCreatedPosts={kpiPerf.agentCreatedPosts}
            totalDecisions={kpiPerf.totalDecisions}
            executedDecisions={kpiPerf.executedDecisions}
            approvedDecisions={kpiPerf.approvedDecisions}
            rejectedDecisions={kpiPerf.rejectedDecisions}
          />
        </div>
      </div>

      {/* ── QUICK ACTIONS ── */}
      <div>
        <div className="mb-3 flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            Actions rapides
          </span>
          <div className="h-px flex-1 bg-gray-100" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Link key={action.title} href={action.href}>
              <div className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-200 hover:border-emerald-300 hover:shadow-md hover:-translate-y-0.5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 border border-emerald-100">
                  <action.icon className="h-4 w-4 text-emerald-600" />
                </div>
                <h3 className="text-[13px] font-semibold text-gray-900">{action.title}</h3>
                <p className="mt-0.5 text-[12px] text-gray-500">{action.description}</p>
                <ArrowRight className="mt-3 h-3.5 w-3.5 text-gray-300 transition-all duration-200 group-hover:translate-x-1 group-hover:text-emerald-500" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── AUTOPILOT CTA ── */}
      {!isAutopilotActive && (
        <div className="relative overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-6">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/10 to-transparent pointer-events-none" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/30">
                <Brain className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Activez le Cerveau Central</h3>
                <p className="mt-0.5 max-w-md text-[13px] text-slate-400">
                  Votre agent IA analysera vos données chaque matin et proposera des décisions prêtes à valider.
                </p>
              </div>
            </div>
            <Button
              asChild
              className="shrink-0 rounded-xl bg-emerald-600 px-5 font-medium text-white shadow-sm hover:bg-emerald-700 border-0"
            >
              <Link href="/marketing-os/settings">
                <Sparkles className="mr-2 h-4 w-4" />
                Activer l&apos;Autopilot
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
