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
} from "lucide-react";
import Link from "next/link";
import { MorningBrief } from "@/components/modules/agent-brain/morning-brief";
import { PerformanceChart } from "@/components/modules/agent-brain/performance-chart";

// ═══════════════════════════════════════════════════════════════════════════
// DATA FETCHING
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const data = await getCommandCenterData(session.user.id);
  if (!data) redirect("/login");

  const { workspace, user, todayDecisions, kpiPerf, hasAlerts } = data;
  const isAutopilotActive = workspace.autopilotConfig?.isActive ?? false;
  const firstName = user?.name?.split(" ")[0] ?? session.user.name?.split(" ")[0] ?? "là";

  const kpiCards = [
    {
      title: "Contenus",
      subtitle: "articles créés",
      value: workspace._count.posts,
      icon: FileText,
      iconGradient: "from-sky-500 to-blue-600",
      iconBg: "bg-sky-50",
      accent: "text-sky-600",
      trend: "text-sky-500",
      href: "/marketing-os/seo-factory",
    },
    {
      title: "Audits SEO",
      subtitle: "sites analysés",
      value: workspace._count.audits,
      icon: BarChart3,
      iconGradient: "from-emerald-500 to-teal-600",
      iconBg: "bg-emerald-50",
      accent: "text-emerald-600",
      trend: "text-emerald-500",
      href: "/marketing-os/seo-factory",
    },
    {
      title: "Décisions IA",
      subtitle: "actions autonomes",
      value: workspace._count.agentDecisions,
      icon: Brain,
      iconGradient: "from-violet-500 to-purple-600",
      iconBg: "bg-violet-50",
      accent: "text-violet-600",
      trend: "text-violet-500",
      href: "#brief",
    },
    {
      title: "Crédits",
      subtitle: "disponibles",
      value: user?.credits ?? 0,
      icon: Zap,
      iconGradient: "from-amber-400 to-orange-500",
      iconBg: "bg-amber-50",
      accent: "text-amber-600",
      trend: "text-amber-500",
      href: "/marketing-os/settings",
    },
  ];

  const quickActions = [
    {
      title: "Content Factory",
      description: "30 posts sociaux en un clic",
      icon: Factory,
      href: "/marketing-os/social/factory",
      iconGradient: "from-purple-500 to-violet-600",
      hoverBorder: "hover:border-purple-200",
      hoverBg: "hover:bg-purple-50/50",
    },
    {
      title: "Audit SEO",
      description: "Analysez et corrigez vos lacunes",
      icon: BarChart3,
      href: "/marketing-os/seo-factory",
      iconGradient: "from-blue-500 to-cyan-500",
      hoverBorder: "hover:border-blue-200",
      hoverBg: "hover:bg-blue-50/50",
    },
    {
      title: "Analyser concurrents",
      description: "Spy pubs & stratégies",
      icon: Target,
      href: "/marketing-os/discovery",
      iconGradient: "from-orange-500 to-red-500",
      hoverBorder: "hover:border-orange-200",
      hoverBg: "hover:bg-orange-50/50",
    },
    {
      title: "Agents IA",
      description: "Automatisez vos tâches marketing",
      icon: Bot,
      href: "/marketing-os/autopilot",
      iconGradient: "from-emerald-500 to-teal-500",
      hoverBorder: "hover:border-emerald-200",
      hoverBg: "hover:bg-emerald-50/50",
    },
  ];

  return (
    <div className="space-y-8 pb-8">

      {/* ── HEADER compact ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Bonjour, {firstName} 👋
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {isAutopilotActive
              ? "Votre agent IA est actif — vérifiez son Morning Brief ci-dessous"
              : "Voici votre tableau de bord marketing"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-sm">
            Plan {user?.plan ?? "FREE"}
          </span>
          {isAutopilotActive && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-600">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
              Autopilot ON
            </span>
          )}
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 animate-stagger">
        {kpiCards.map((card) => (
          <Link key={card.title} href={card.href}>
            <div className="group relative cursor-pointer overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:border-gray-200 hover:-translate-y-0.5">
              <div className="flex items-start justify-between mb-4">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${card.iconGradient} shadow-sm`}
                >
                  <card.icon className="h-5 w-5 text-white" />
                </div>
                <TrendingUp className={`h-4 w-4 ${card.trend} opacity-0 group-hover:opacity-100 transition-opacity`} />
              </div>
              <p className="text-2xl font-bold tabular-nums text-gray-900">{card.value}</p>
              <p className="mt-0.5 text-xs font-semibold text-gray-500">{card.title}</p>
              <p className="mt-0.5 text-xs text-gray-400">{card.subtitle}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* ── MAIN GRID: BRIEF + CHART ── */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3" id="brief">
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
                ? {
                    id: d.linkedPost.id,
                    type: d.linkedPost.type,
                    title: d.linkedPost.title,
                  }
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
          <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            Actions rapides
          </span>
          <div className="h-px flex-1 bg-gray-100" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Link key={action.title} href={action.href}>
              <div
                className={`group cursor-pointer rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${action.hoverBorder} ${action.hoverBg}`}
              >
                <div
                  className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${action.iconGradient} shadow-sm`}
                >
                  <action.icon className="h-4 w-4 text-white" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">{action.title}</h3>
                <p className="mt-0.5 text-xs text-gray-500">{action.description}</p>
                <ArrowRight className="mt-3 h-4 w-4 text-gray-300 transition-all duration-200 group-hover:translate-x-1 group-hover:text-gray-500" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── AUTOPILOT CTA ── */}
      {!isAutopilotActive && (
        <div className="relative overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50 via-indigo-50 to-white p-6 shadow-sm">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-md shadow-violet-500/20">
                <Brain className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Activez le Cerveau Central</h3>
                <p className="mt-0.5 max-w-md text-sm text-gray-500">
                  Votre agent IA analysera vos données chaque matin et proposera des décisions
                  marketing prêtes à valider.
                </p>
              </div>
            </div>
            <Button
              asChild
              className="shrink-0 rounded-xl bg-violet-600 px-5 font-medium text-white shadow-sm hover:bg-violet-700"
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
