import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Zap,
  ArrowRight,
  Brain,
  Target,
  MessageCircle,
  TrendingUp,
  UserPlus,
  Mail,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

// ═══════════════════════════════════════════════════════════════════════════
// DATA FETCHING
// ═══════════════════════════════════════════════════════════════════════════

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

  // Prospect counts by status
  const prospectsByStatus = await prisma.prospect.groupBy({
    by: ["status"],
    where: { workspaceId: workspace.id },
    _count: true,
  });

  const statusCount = (status: string) =>
    prospectsByStatus.find((p) => p.status === status)?._count ?? 0;

  // New this week
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const newThisWeek = await prisma.prospect.count({
    where: { workspaceId: workspace.id, createdAt: { gte: weekAgo } },
  });

  // Active sequences count
  const activeSequences = await prisma.outreachSequence.count({
    where: { workspaceId: workspace.id, isActive: true },
  });

  // Today's Agent Decisions — filtrés sur les types Sales
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

// ═══════════════════════════════════════════════════════════════════════════
// ACTION TYPE CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const actionTypeConfig: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  PROSPECT_DM: {
    label: "Message prospect",
    color: "bg-violet-100 text-violet-700",
    icon: MessageCircle,
  },
  DISCOVERY_SCAN: {
    label: "Scan concurrent",
    color: "bg-orange-100 text-orange-700",
    icon: Target,
  },
};

const decisionStatusConfig: Record<string, { label: string; color: string }> =
  {
    PENDING: { label: "En attente", color: "bg-amber-100 text-amber-700" },
    APPROVED: { label: "Approuvé", color: "bg-emerald-100 text-emerald-700" },
    EXECUTED: { label: "Exécuté", color: "bg-blue-100 text-blue-700" },
    REJECTED: { label: "Rejeté", color: "bg-red-100 text-red-700" },
    FAILED: { label: "Échoué", color: "bg-red-100 text-red-700" },
  };

// ═══════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default async function SalesDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const data = await getSalesDashboardData(session.user.id);
  if (!data) redirect("/login");

  const { user, kpis, todaySalesDecisions, isAutopilotActive } = data;
  const firstName =
    user?.name?.split(" ")[0] ??
    session.user.name?.split(" ")[0] ??
    "là";

  const conversionRate =
    kpis.total > 0 ? Math.round((kpis.converted / kpis.total) * 100) : 0;

  const replyRate =
    kpis.contacted > 0
      ? Math.round((kpis.replied / kpis.contacted) * 100)
      : 0;

  const kpiCards = [
    {
      title: "Prospects total",
      value: kpis.total,
      sub: `+${kpis.newThisWeek} cette semaine`,
      icon: Users,
      gradient: "from-violet-500 to-purple-600",
      href: "/sales-os/prospection",
    },
    {
      title: "Contactés",
      value: kpis.contacted,
      sub: "En cours d'outreach",
      icon: Mail,
      gradient: "from-blue-500 to-cyan-500",
      href: "/sales-os/prospection",
    },
    {
      title: "Taux de réponse",
      value: `${replyRate}%`,
      sub: `${kpis.replied} réponse(s)`,
      icon: MessageCircle,
      gradient: "from-emerald-500 to-teal-500",
      href: "/sales-os/prospection",
    },
    {
      title: "Convertis",
      value: kpis.converted,
      sub: `${conversionRate}% taux de conversion`,
      icon: CheckCircle2,
      gradient: "from-amber-400 to-orange-500",
      href: "/sales-os/prospection",
    },
  ];

  const quickActions = [
    {
      title: "Trouver des leads",
      description: "LinkedIn & Google Business",
      icon: UserPlus,
      href: "/sales-os/prospection",
      color: "border-violet-200/60 text-violet-700 hover:bg-violet-50/60",
      iconBg: "bg-violet-100 text-violet-600",
    },
    {
      title: "Social Prospector",
      description: "Instagram & Facebook",
      icon: MessageCircle,
      href: "/sales-os/social-prospector",
      color: "border-blue-200/60 text-blue-700 hover:bg-blue-50/60",
      iconBg: "bg-blue-100 text-blue-600",
    },
    {
      title: "Séquences actives",
      description: `${kpis.activeSequences} séquence(s) en cours`,
      icon: Zap,
      href: "/sales-os/prospection?tab=sequences",
      color: "border-emerald-200/60 text-emerald-700 hover:bg-emerald-50/60",
      iconBg: "bg-emerald-100 text-emerald-600",
    },
    {
      title: "Analyser un prospect",
      description: "Enrichissement & découverte",
      icon: Target,
      href: "/sales-os/prospection?tab=leads",
      color: "border-orange-200/60 text-orange-700 hover:bg-orange-50/60",
      iconBg: "bg-orange-100 text-orange-600",
    },
  ];

  const pipelineStages = [
    {
      label: "Nouveaux leads",
      value: Math.max(
        0,
        kpis.total - kpis.contacted - kpis.replied - kpis.converted
      ),
      color: "bg-gray-300",
      textColor: "text-gray-700",
    },
    {
      label: "Contactés",
      value: kpis.contacted,
      color: "bg-blue-400",
      textColor: "text-blue-700",
    },
    {
      label: "En discussion",
      value: kpis.replied,
      color: "bg-violet-400",
      textColor: "text-violet-700",
    },
    {
      label: "Convertis",
      value: kpis.converted,
      color: "bg-emerald-400",
      textColor: "text-emerald-700",
    },
  ];

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Bonjour, {firstName} 👋
          </h1>
          <p className="text-gray-500 mt-1">
            {isAutopilotActive
              ? "Votre agent Sales est actif — vérifiez ses recommandations"
              : "Voici votre tableau de bord commercial"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 text-xs font-medium rounded-full bg-violet-50 text-violet-600 border border-violet-200/60">
            Plan {user?.plan ?? "FREE"}
          </span>
          {isAutopilotActive && (
            <span className="px-3 py-1 text-xs font-medium rounded-full bg-violet-50 text-violet-600 border border-violet-200/60 flex items-center gap-1">
              <Brain className="h-3 w-3" />
              Sales Autopilot ON
            </span>
          )}
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <Link key={card.title} href={card.href}>
            <Card className="bg-white/60 backdrop-blur-sm shadow-sm border border-gray-200/60 hover:shadow-md hover:border-gray-300/60 transition-all cursor-pointer group">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={`p-2.5 rounded-xl bg-gradient-to-br ${card.gradient}`}
                  >
                    <card.icon className="h-5 w-5 text-white" />
                  </div>
                  <TrendingUp className="h-4 w-4 text-gray-300 group-hover:text-violet-500 transition-colors" />
                </div>
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{card.title}</p>
                <p className="text-xs text-gray-400 mt-1">{card.sub}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── Main grid: Brief Sales + Pipeline ── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Brief Sales — 3/5 */}
        <div className="xl:col-span-3">
          <Card className="border border-gray-200/60 bg-white/60 backdrop-blur-sm shadow-sm">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600">
                  <Brain className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    Brief Sales du jour
                  </h2>
                  <p className="text-xs text-gray-500">
                    Recommandations de l&apos;agent pour les actions outreach
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {todaySalesDecisions.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Zap className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">
                    Aucune recommandation Sales aujourd&apos;hui
                  </p>
                  <p className="text-xs mt-1">
                    {isAutopilotActive
                      ? "L'agent analysera vos données ce soir"
                      : "Activez l'Autopilot pour des recommandations quotidiennes"}
                  </p>
                </div>
              ) : (
                todaySalesDecisions.map((decision) => {
                  const cfg = actionTypeConfig[decision.actionType] ?? {
                    label: decision.actionType,
                    color: "bg-gray-100 text-gray-700",
                    icon: Zap,
                  };
                  const statusCfg = decisionStatusConfig[decision.status] ?? {
                    label: decision.status,
                    color: "bg-gray-100 text-gray-600",
                  };
                  return (
                    <div
                      key={decision.id}
                      className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/80 border border-gray-100"
                    >
                      <div className={`p-1.5 rounded-lg mt-0.5 ${cfg.color}`}>
                        <cfg.icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}
                          >
                            {cfg.label}
                          </span>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${statusCfg.color}`}
                          >
                            {statusCfg.label}
                          </span>
                          <span className="text-xs text-gray-400 ml-auto flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            P{decision.priority}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 line-clamp-2">
                          {decision.reasoning}
                        </p>
                        {decision.impact && (
                          <p className="text-xs text-violet-600 mt-1 font-medium">
                            → {decision.impact}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* Pipeline — 2/5 */}
        <div className="xl:col-span-2">
          <Card className="border border-gray-200/60 bg-white/60 backdrop-blur-sm shadow-sm h-full">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">
                  Pipeline
                </h2>
                <Link
                  href="/sales-os/prospection"
                  className="text-xs text-violet-600 hover:text-violet-700 flex items-center gap-1"
                >
                  Voir tout <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {pipelineStages.map((stage) => (
                <div key={stage.label} className="flex items-center gap-3">
                  <div className="w-28 shrink-0">
                    <p className="text-xs text-gray-500 truncate">
                      {stage.label}
                    </p>
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full ${stage.color} transition-all`}
                      style={{
                        width:
                          kpis.total > 0
                            ? `${Math.round(
                                (stage.value / kpis.total) * 100
                              )}%`
                            : "0%",
                      }}
                    />
                  </div>
                  <span
                    className={`text-sm font-semibold w-8 text-right ${stage.textColor}`}
                  >
                    {stage.value}
                  </span>
                </div>
              ))}

              {/* Footer stats */}
              <div className="pt-3 border-t border-gray-100 space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Crédits disponibles</span>
                  <span className="font-semibold text-gray-700">
                    {user?.credits ?? 0}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="text-xs bg-violet-50 text-violet-700 border-violet-200">
                    {kpis.activeSequences} séquence
                    {kpis.activeSequences !== 1 ? "s" : ""} active
                    {kpis.activeSequences !== 1 ? "s" : ""}
                  </Badge>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 mb-3">
          Actions rapides
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link key={action.title} href={action.href}>
              <Card
                className={`bg-white/60 backdrop-blur-sm shadow-sm border transition-all cursor-pointer group ${action.color}`}
              >
                <CardContent className="p-4 flex flex-col gap-3">
                  <div className={`p-2.5 rounded-lg w-fit ${action.iconBg}`}>
                    <action.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {action.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {action.description}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-300 group-hover:translate-x-1 group-hover:text-gray-600 transition-all mt-auto self-end" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Autopilot CTA ── */}
      {!isAutopilotActive && (
        <Card className="border border-violet-200/60 bg-gradient-to-r from-violet-50 to-purple-50 shadow-sm">
          <CardContent className="p-6 flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600">
                <Brain className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">
                  Activez le Sales Autopilot
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Votre agent IA identifiera chaque matin les prospects à
                  contacter et les séquences à lancer.
                </p>
              </div>
            </div>
            <Button
              asChild
              className="bg-violet-600 hover:bg-violet-700 shrink-0"
            >
              <Link href="/sales-os/settings">
                <Sparkles className="h-4 w-4 mr-2" />
                Activer l&apos;Autopilot
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
