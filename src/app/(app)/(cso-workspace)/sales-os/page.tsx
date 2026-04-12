import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import {
  Users,
  Zap,
  ArrowRight,
  Brain,
  Target,
  MessageCircle,
  UserPlus,
  Mail,
  CheckCircle2,
  Clock,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

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

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todaySalesDecisions = await prisma.agentDecision.findMany({
    where: {
      workspaceId: workspace.id,
      createdAt: { gte: todayStart },
      actionType: { in: ["PROSPECT_DM", "DISCOVERY_SCAN"] },
    },
    orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    take: 5,
  });

  const totalProspects = prospectsByStatus.reduce((s, p) => s + p._count, 0);

  return {
    workspace,
    user,
    kpis: {
      total: totalProspects,
      newThisWeek,
      contacted: statusCount("CONTACTED"),
      replied: statusCount("REPLIED"),
      converted: statusCount("CONVERTED"),
      activeSequences,
    },
    todaySalesDecisions,
    isAutopilotActive: workspace.autopilotConfig?.isActive ?? false,
  };
}

const actionTypeConfig: Record<string, { label: string; icon: React.ElementType }> = {
  PROSPECT_DM: { label: "Message prospect", icon: MessageCircle },
  DISCOVERY_SCAN: { label: "Scan concurrent", icon: Target },
};

const decisionStatusConfig: Record<string, { label: string; dot: string }> = {
  PENDING: { label: "En attente", dot: "bg-slate-400" },
  APPROVED: { label: "Approuvé", dot: "bg-emerald-500" },
  EXECUTED: { label: "Exécuté", dot: "bg-violet-500" },
  REJECTED: { label: "Rejeté", dot: "bg-slate-500" },
  FAILED: { label: "Échoué", dot: "bg-slate-500" },
};

export default async function SalesDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const data = await getSalesDashboardData(session.user.id);
  if (!data) redirect("/login");

  const { user, kpis, todaySalesDecisions, isAutopilotActive } = data;
  const firstName = user?.name?.split(" ")[0] ?? session.user.name?.split(" ")[0] ?? "là";

  const conversionRate = kpis.total > 0 ? Math.round((kpis.converted / kpis.total) * 100) : 0;
  const replyRate = kpis.contacted > 0 ? Math.round((kpis.replied / kpis.contacted) * 100) : 0;

  const pipelineStages = [
    { label: "Nouveaux leads", value: Math.max(0, kpis.total - kpis.contacted - kpis.replied - kpis.converted), pct: 0 },
    { label: "Contactés", value: kpis.contacted, pct: 0 },
    { label: "En discussion", value: kpis.replied, pct: 0 },
    { label: "Convertis", value: kpis.converted, pct: 0 },
  ].map((s) => ({ ...s, pct: kpis.total > 0 ? Math.round((s.value / kpis.total) * 100) : 0 }));

  const quickActions = [
    { title: "Trouver des leads", description: "LinkedIn & Google Business", icon: UserPlus, href: "/sales-os/prospection" },
    { title: "Social Prospector", description: "Instagram & Facebook", icon: MessageCircle, href: "/sales-os/social-prospector" },
    { title: "Séquences", description: `${kpis.activeSequences} active${kpis.activeSequences !== 1 ? "s" : ""}`, icon: Zap, href: "/sales-os/prospection?tab=sequences" },
    { title: "Analyser prospect", description: "Enrichissement & découverte", icon: Target, href: "/sales-os/prospection?tab=leads" },
  ];

  return (
    <div className="space-y-6 pb-8">

      {/* ── HEADER ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bonjour, {firstName}</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">
            {isAutopilotActive ? "Votre agent Sales est actif" : "Tableau de bord commercial"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center rounded-lg bg-violet-50 border border-violet-200 px-3 py-1.5 text-[12px] font-medium text-violet-700">
            Plan {user?.plan ?? "FREE"}
          </span>
          {isAutopilotActive && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 border border-violet-200 px-3 py-1.5 text-[12px] font-medium text-violet-700">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
              Sales Autopilot ON
            </span>
          )}
        </div>
      </div>

      {/* ── PIPELINE HERO ── */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">Pipeline commercial</h2>
            <p className="text-[12px] text-gray-500 mt-0.5">{kpis.total} prospects au total</p>
          </div>
          <Link href="/sales-os/prospection" className="text-[12px] text-violet-600 hover:text-violet-700 flex items-center gap-1 font-medium">
            Gérer <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="p-6 space-y-3">
          {pipelineStages.map((stage, i) => {
            const isLast = i === pipelineStages.length - 1;
            return (
              <div key={stage.label} className="flex items-center gap-4">
                <div className="w-28 shrink-0">
                  <p className="text-[12px] text-gray-600 font-medium truncate">{stage.label}</p>
                </div>
                <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-700 ${isLast ? "bg-emerald-500" : "bg-violet-500"}`}
                    style={{ width: `${stage.pct || (stage.value > 0 ? 2 : 0)}%` }}
                  />
                </div>
                <span className={`text-[13px] font-bold w-10 text-right tabular-nums ${isLast ? "text-emerald-600" : "text-gray-700"}`}>
                  {stage.value}
                </span>
                <span className="text-[11px] text-gray-400 w-8 text-right">{stage.pct}%</span>
              </div>
            );
          })}
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-gray-100">
          {[
            { label: "Total prospects", value: kpis.total, icon: Users, sub: `+${kpis.newThisWeek} cette semaine` },
            { label: "Contactés", value: kpis.contacted, icon: Mail, sub: "En outreach" },
            { label: "Taux de réponse", value: `${replyRate}%`, icon: MessageCircle, sub: `${kpis.replied} réponse(s)` },
            { label: "Convertis", value: kpis.converted, icon: CheckCircle2, sub: `${conversionRate}% taux` },
          ].map((kpi, i) => (
            <div key={kpi.label} className={`px-5 py-4 ${i < 3 ? "border-r border-gray-100" : ""}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <kpi.icon className="h-3.5 w-3.5 text-violet-400" />
                <span className="text-[11px] text-gray-500 font-medium">{kpi.label}</span>
              </div>
              <p className="text-xl font-bold text-gray-900 tabular-nums">{kpi.value}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{kpi.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── BRIEF SALES + STATS ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">

        {/* Brief Sales */}
        <div className="xl:col-span-3 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <Brain className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-gray-900">Brief Sales du jour</h2>
              <p className="text-[11px] text-gray-500">Recommandations de l&apos;agent outreach</p>
            </div>
          </div>
          <div className="p-4 space-y-2">
            {todaySalesDecisions.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Zap className="h-8 w-8 mx-auto mb-3 opacity-20" />
                <p className="text-[13px] font-medium text-gray-500">Aucune recommandation aujourd&apos;hui</p>
                <p className="text-[12px] mt-1 text-gray-400">
                  {isAutopilotActive ? "L'agent analysera vos données ce soir" : "Activez l'Autopilot pour des recommandations"}
                </p>
              </div>
            ) : (
              todaySalesDecisions.map((decision) => {
                const cfg = actionTypeConfig[decision.actionType] ?? { label: decision.actionType, icon: Zap };
                const statusCfg = decisionStatusConfig[decision.status] ?? { label: decision.status, dot: "bg-slate-400" };
                return (
                  <div key={decision.id} className="flex items-start gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50/60 hover:bg-gray-50 transition-colors">
                    <div className="h-7 w-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <cfg.icon className="h-3.5 w-3.5 text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-[11px] font-semibold text-gray-700">{cfg.label}</span>
                        <span className="flex items-center gap-1 text-[11px] text-gray-400">
                          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                        <span className="ml-auto text-[11px] text-gray-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" />P{decision.priority}
                        </span>
                      </div>
                      <p className="text-[12px] text-gray-600 line-clamp-2">{decision.reasoning}</p>
                      {decision.impact && (
                        <p className="text-[11px] text-violet-600 mt-1 font-medium">→ {decision.impact}</p>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Stats sidebar */}
        <div className="xl:col-span-2 space-y-4">
          {/* Performance */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="h-4 w-4 text-violet-500" />
              <h3 className="text-[13px] font-semibold text-gray-900">Performance</h3>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-gray-50">
                <span className="text-[12px] text-gray-500">Nouveaux (semaine)</span>
                <span className="text-[13px] font-bold text-gray-900 tabular-nums">+{kpis.newThisWeek}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-50">
                <span className="text-[12px] text-gray-500">Taux de réponse</span>
                <span className="text-[13px] font-bold text-gray-900 tabular-nums">{replyRate}%</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-50">
                <span className="text-[12px] text-gray-500">Conversion</span>
                <span className="text-[13px] font-bold text-emerald-600 tabular-nums">{conversionRate}%</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-[12px] text-gray-500">Séquences actives</span>
                <span className="text-[13px] font-bold text-violet-600 tabular-nums">{kpis.activeSequences}</span>
              </div>
            </div>
          </div>

          {/* Crédits */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-semibold text-gray-900">Crédits disponibles</span>
              <span className="text-[13px] font-bold text-violet-600">{user?.credits ?? 0}</span>
            </div>
            <p className="text-[11px] text-gray-400">Plan {user?.plan ?? "FREE"}</p>
            <Link href="/sales-os/settings" className="mt-3 flex items-center gap-1 text-[12px] text-violet-600 hover:text-violet-700 font-medium">
              Gérer le plan <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* ── QUICK ACTIONS ── */}
      <div>
        <div className="mb-3 flex items-center gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Actions rapides</span>
          <div className="h-px flex-1 bg-gray-100" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Link key={action.title} href={action.href}>
              <div className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-200 hover:border-violet-300 hover:shadow-md hover:-translate-y-0.5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 border border-violet-100">
                  <action.icon className="h-4 w-4 text-violet-600" />
                </div>
                <h3 className="text-[13px] font-semibold text-gray-900">{action.title}</h3>
                <p className="mt-0.5 text-[12px] text-gray-500">{action.description}</p>
                <ArrowRight className="mt-3 h-3.5 w-3.5 text-gray-300 transition-all duration-200 group-hover:translate-x-1 group-hover:text-violet-500" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* ── AUTOPILOT CTA ── */}
      {!isAutopilotActive && (
        <div className="relative overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 p-6">
          <div className="absolute inset-0 bg-gradient-to-r from-violet-600/10 to-transparent pointer-events-none" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/20 border border-violet-500/30">
                <Brain className="h-5 w-5 text-violet-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Activez le Sales Autopilot</h3>
                <p className="mt-0.5 max-w-md text-[13px] text-slate-400">
                  Votre agent IA identifiera chaque matin les prospects à contacter et les séquences à lancer.
                </p>
              </div>
            </div>
            <Button asChild className="shrink-0 rounded-xl bg-violet-600 px-5 font-medium text-white shadow-sm hover:bg-violet-700 border-0">
              <Link href="/sales-os/settings">
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
