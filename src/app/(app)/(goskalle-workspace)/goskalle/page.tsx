import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CsoAgentQueue } from "@/components/modules/cso/cso-agent-queue";
import { FunnelDonut, GOSKALLE_STAGE_COLORS, GOSKALLE_TEMPERATURE_COLORS } from "@/components/modules/cso/funnel-donut";
import { QuickActions } from "@/components/modules/goskalle/quick-actions";
import { QuotaGauge } from "@/components/modules/goskalle/quota-gauge";
import { ActivityHeatmap } from "@/components/modules/goskalle/activity-heatmap";
import { PipelineTrendChart } from "@/components/modules/goskalle/pipeline-trend-chart";
import { getCreditStats, PLAN_LIMITS } from "@/lib/credits";
import { getMonthlyPipelineTrend, getDailyActivityHeatmap } from "@/lib/services/analytics/cso-roi-tracking";
import type { CsoPerformanceInsights } from "@/lib/services/sales/cso-learning";
import { Radar, Briefcase, MapPin, Building2, Linkedin, UserSearch, Brain, Mail, MessageCircle, Target, Zap, Gauge, Activity, TrendingUp, Flame } from "lucide-react";

const TEMPERATURE_LABEL: Record<string, string> = { HOT: "Chauds", WARM: "Tièdes", COLD: "Froids" };

const CSO_ACTION_TYPES = [
  "CSO_LAUNCH_LINKEDIN",
  "CSO_LAUNCH_EMAIL",
  "CSO_FOLLOWUP",
  "CSO_STALE_REJECT",
];

const SOURCE_LABEL: Record<string, { label: string; icon: typeof Radar }> = {
  JOB_BOARD_SIGNAL: { label: "Signals", icon: Briefcase },
  LOCAL_MAPS: { label: "Local", icon: MapPin },
  NEW_COMPANY_REGISTRY: { label: "Newborn", icon: Building2 },
  LINKEDIN: { label: "LinkedIn", icon: Linkedin },
  APOLLO_ICP_MATCH: { label: "Apollo", icon: UserSearch },
};

const HOW_IT_WORKS = [
  { icon: Target, label: "Détecte", desc: "les prospects high-score non contactés + les stagnants" },
  { icon: Brain, label: "Génère", desc: "des messages personnalisés pour chaque cas (LinkedIn, email, relance)" },
  { icon: Zap, label: "Propose", desc: "une file d'approbation — vous validez ou rejetez chaque action" },
  { icon: Mail, label: "Exécute", desc: "les décisions approuvées : séquences créées, prospects mis à jour" },
];

async function getHomeData(userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { userId },
    select: { id: true, brandVoice: true },
  });
  if (!workspace) return null;

  const bv = (workspace.brandVoice as Record<string, unknown>) ?? {};
  const csoPerformanceInsights = bv.csoPerformanceInsights as CsoPerformanceInsights | undefined;

  const [decisions, prospectsInPipeline, topFused, creditStats, activeProspectsTotal, temperatureBreakdown, monthlyTrend, dailyActivity] = await Promise.all([
    prisma.agentDecision.findMany({
      where: { workspaceId: workspace.id, actionType: { in: CSO_ACTION_TYPES } },
      orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "desc" }],
      take: 50,
    }),
    prisma.prospect.count({
      where: {
        workspaceId: workspace.id,
        status: { in: ["NEW", "RESEARCHED", "MESSAGES_GENERATED", "CONTACTED"] },
      },
    }),
    prisma.prospect.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ compositeScore: "desc" }, { score: "desc" }],
      take: 8,
      select: {
        id: true,
        company: true,
        compositeScore: true,
        score: true,
        fusionSources: true,
        source: true,
        suggestedHook: true,
      },
    }),
    getCreditStats(userId),
    prisma.prospect.count({ where: { workspaceId: workspace.id } }),
    prisma.prospect.groupBy({ by: ["temperature"], where: { workspaceId: workspace.id }, _count: true }),
    getMonthlyPipelineTrend(workspace.id),
    getDailyActivityHeatmap(workspace.id),
  ]);

  const maxProspects = creditStats ? PLAN_LIMITS[creditStats.plan].maxProspects : 0;

  return {
    workspaceId: workspace.id,
    decisions,
    prospectsInPipeline,
    topFused,
    csoPerformanceInsights,
    creditStats,
    maxProspects,
    activeProspectsTotal,
    temperatureBreakdown,
    monthlyTrend,
    dailyActivity,
  };
}

export default async function GoskalleHomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const data = await getHomeData(session.user.id);
  if (!data) redirect("/login");

  const {
    workspaceId,
    decisions,
    prospectsInPipeline,
    topFused,
    csoPerformanceInsights,
    creditStats,
    maxProspects,
    activeProspectsTotal,
    temperatureBreakdown,
    monthlyTrend,
    dailyActivity,
  } = data;

  const serializedDecisions = decisions.map((d) => ({
    ...d,
    actionData: d.actionData as Record<string, unknown> | null,
    result: d.result as Record<string, unknown> | null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    executedAt: d.executedAt?.toISOString() ?? null,
  }));

  const pendingCount = decisions.filter((d) => d.status === "PENDING").length;
  const executedCount = decisions.filter((d) => d.status === "EXECUTED").length;
  const fusedCount = topFused.filter((p) => p.fusionSources.length > 1).length;

  const statusStages = [
    { label: "En attente", key: "PENDING", count: pendingCount, rate: 0 },
    { label: "Approuvées", key: "APPROVED", count: decisions.filter((d) => d.status === "APPROVED").length, rate: 0 },
    { label: "Exécutées", key: "EXECUTED", count: executedCount, rate: 0 },
    { label: "Rejetées", key: "REJECTED", count: decisions.filter((d) => d.status === "REJECTED").length, rate: 0 },
    { label: "Échouées", key: "FAILED", count: decisions.filter((d) => d.status === "FAILED").length, rate: 0 },
  ];

  const temperatureStages = ["HOT", "WARM", "COLD"].map((t) => ({
    label: TEMPERATURE_LABEL[t],
    key: t,
    count: temperatureBreakdown.find((x) => x.temperature === t)?._count ?? 0,
    rate: 0,
  }));

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-8 animate-stagger">
      {/* ── HEADER ── */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div
              className="h-8 w-8 rounded-xl flex items-center justify-center"
              style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-line)" }}
            >
              <Brain className="h-4 w-4" style={{ color: "var(--amber-fg)" }} />
            </div>
            <h1 className="text-[22px] font-display font-bold" style={{ color: "var(--fg)" }}>
              Aujourd&apos;hui
            </h1>
            {pendingCount > 0 && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
                style={{ background: "var(--amber-soft)", color: "var(--amber-fg)", border: "1px solid var(--amber-line)" }}
              >
                {pendingCount} en attente
              </span>
            )}
          </div>
          <p className="text-[13px]" style={{ color: "var(--fg-mute)" }}>
            Ce que l&apos;agent propose, et vos signaux les plus chauds — tout au même endroit
          </p>
        </div>

        {decisions.length > 0 && (
          <div
            className="flex items-center gap-4 rounded-2xl p-4"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}
          >
            <FunnelDonut stages={statusStages} total={decisions.length} variant="goskalle" size={92} />
            <div className="space-y-1">
              {statusStages.filter((s) => s.count > 0).map((s) => (
                <div key={s.key} className="flex items-center gap-2 text-[11px]">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: GOSKALLE_STAGE_COLORS[s.key] ?? "var(--fg-mute)" }} />
                  <span style={{ color: "var(--fg-mute)" }}>{s.label}</span>
                  <span className="font-display font-semibold tabular-nums ml-auto" style={{ color: "var(--fg)" }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── ACTIONS RAPIDES ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-line)" }}
          >
            <Zap className="h-4 w-4" style={{ color: "var(--amber-fg)" }} />
          </div>
          <div>
            <h2 className="text-[14px] font-display font-semibold" style={{ color: "var(--fg)" }}>
              Actions rapides
            </h2>
            <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
              Accédez directement à vos tâches courantes
            </p>
          </div>
        </div>
        <QuickActions />
      </div>

      {/* ── VUE D'ENSEMBLE (objectifs, activité, pipeline, répartition) ── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-line)" }}
          >
            <Activity className="h-4 w-4" style={{ color: "var(--amber-fg)" }} />
          </div>
          <div>
            <h2 className="text-[14px] font-display font-semibold" style={{ color: "var(--fg)" }}>
              Vue d&apos;ensemble
            </h2>
            <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
              Objectifs, activité et pipeline
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-stagger">
          <div className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}>
            <div className="flex items-center gap-2 mb-5">
              <Gauge className="h-4 w-4" style={{ color: "var(--amber-fg)" }} />
              <div>
                <h3 className="text-[13px] font-display font-semibold" style={{ color: "var(--fg)" }}>Objectifs</h3>
                <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>Progression du mois</p>
              </div>
            </div>
            <div className="flex items-center justify-around">
              <QuotaGauge used={creditStats?.usedThisMonth ?? 0} limit={creditStats?.monthlyLimit ?? 1} label="Crédits ce mois" />
              <QuotaGauge used={activeProspectsTotal} limit={maxProspects || 1} label="Prospects actifs" />
            </div>
          </div>

          <div className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}>
            <div className="flex items-center gap-2 mb-5">
              <Activity className="h-4 w-4" style={{ color: "var(--amber-fg)" }} />
              <div>
                <h3 className="text-[13px] font-display font-semibold" style={{ color: "var(--fg)" }}>Activité</h3>
                <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>12 dernières semaines</p>
              </div>
            </div>
            <ActivityHeatmap data={dailyActivity} />
          </div>

          <div className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}>
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="h-4 w-4" style={{ color: "var(--amber-fg)" }} />
              <div>
                <h3 className="text-[13px] font-display font-semibold" style={{ color: "var(--fg)" }}>Pipeline converti</h3>
                <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>6 derniers mois</p>
              </div>
            </div>
            <PipelineTrendChart data={monthlyTrend} />
          </div>

          <div className="rounded-2xl p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}>
            <div className="flex items-center gap-2 mb-5">
              <Flame className="h-4 w-4" style={{ color: "var(--amber-fg)" }} />
              <div>
                <h3 className="text-[13px] font-display font-semibold" style={{ color: "var(--fg)" }}>Répartition</h3>
                <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>Température des prospects</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <FunnelDonut
                stages={temperatureStages}
                total={activeProspectsTotal}
                variant="goskalle"
                size={92}
                colorMap={GOSKALLE_TEMPERATURE_COLORS}
              />
              <div className="space-y-1">
                {temperatureStages.filter((s) => s.count > 0).map((s) => (
                  <div key={s.key} className="flex items-center gap-2 text-[11px]">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: GOSKALLE_TEMPERATURE_COLORS[s.key] }} />
                    <span style={{ color: "var(--fg-mute)" }}>{s.label}</span>
                    <span className="font-display font-semibold tabular-nums ml-auto" style={{ color: "var(--fg)" }}>{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── HOW IT WORKS (if empty) ── */}
      {decisions.length === 0 && (
        <div className="rounded-2xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}>
          <h3 className="text-[13px] font-display font-semibold mb-4" style={{ color: "var(--fg)" }}>
            Comment ça marche
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.label} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="h-5 w-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0"
                    style={{ background: "var(--amber-soft)", color: "var(--amber-fg)" }}
                  >
                    {i + 1}
                  </span>
                  <div className="h-5 w-5 rounded-md flex items-center justify-center" style={{ background: "var(--bg-sidebar)" }}>
                    <step.icon className="h-3 w-3" style={{ color: "var(--amber-fg)" }} />
                  </div>
                  <span className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>{step.label}</span>
                </div>
                <p className="text-[11px] pl-10" style={{ color: "var(--fg-mute)" }}>{step.desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 p-4 rounded-xl" style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-line)" }}>
            <div className="flex items-center gap-2 mb-2">
              <Linkedin className="h-4 w-4" style={{ color: "#2563eb" }} />
              <Mail className="h-4 w-4" style={{ color: "var(--amber-fg)" }} />
              <MessageCircle className="h-4 w-4" style={{ color: "var(--amber-fg)" }} />
              <span className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>Canaux supportés</span>
            </div>
            <p className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
              LinkedIn (notes de connexion), Email (séquences personnalisées), Relances multi-canal
            </p>
          </div>
        </div>
      )}

      {/* ── FILE DE DÉCISIONS (contenu principal) ── */}
      <CsoAgentQueue
        workspaceId={workspaceId}
        initialDecisions={serializedDecisions}
        initialExecutedCount={executedCount}
        initialProspectsInPipeline={prospectsInPipeline}
        csoPerformanceInsights={csoPerformanceInsights}
        variant="goskalle"
      />

      {/* ── SIGNAUX FORTS (score composite, panneau secondaire) ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-line)" }}
          >
            <Radar className="h-4 w-4" style={{ color: "var(--amber-fg)" }} />
          </div>
          <div>
            <h2 className="text-[14px] font-display font-semibold" style={{ color: "var(--fg)" }}>
              Signaux forts
            </h2>
            <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
              {fusedCount > 0
                ? `${fusedCount} entreprise${fusedCount > 1 ? "s" : ""} détectée${fusedCount > 1 ? "s" : ""} par plusieurs radars`
                : "score fusionné Signals · Local · Newborn · LinkedIn · Apollo"}
            </p>
          </div>
        </div>
        {topFused.length === 0 ? (
          <div className="rounded-xl p-8 text-center text-[13px]" style={{ border: "1px solid var(--line)", color: "var(--fg-mute)" }}>
            Aucun prospect pour l&apos;instant — lancez un scan depuis Prospects → Sourcer.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {topFused.map((p) => {
              const displayScore = p.compositeScore ?? p.score;
              const scorePct = Math.max(0, Math.min(100, displayScore));
              const sources = p.fusionSources.length > 0 ? p.fusionSources : p.source ? [p.source] : [];
              return (
                <div key={p.id} className="gk-signal-card rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="font-display font-semibold text-[13px] truncate" style={{ color: p.company ? "var(--fg)" : "var(--fg-mute)" }}>
                      {p.company || "Profil sans entreprise identifiée"}
                    </p>
                    <span className="font-display font-bold text-[15px] tabular-nums shrink-0" style={{ color: "var(--fg)" }}>{displayScore}</span>
                  </div>
                  {p.suggestedHook && (
                    <p className="text-[11px] line-clamp-2 mb-3" style={{ color: "var(--fg-mute)" }}>{p.suggestedHook}</p>
                  )}
                  <div className="h-1 rounded-full mb-3 overflow-hidden" style={{ background: "var(--line-strong)" }}>
                    <div className="h-full rounded-full" style={{ width: `${scorePct}%`, background: "var(--amber-fg)" }} />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {sources.map((s) => {
                      const meta = SOURCE_LABEL[s];
                      if (!meta) return null;
                      const Icon = meta.icon;
                      return (
                        <span
                          key={s}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium"
                          style={{ background: "var(--amber-soft)", color: "var(--amber-fg)", border: "1px solid var(--amber-line)" }}
                        >
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
