import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CSODashboardClientV2 } from "@/components/modules/cso/dashboard-client-v2";
import { CsoMetricsDashboard } from "@/components/modules/cso/cso-metrics-dashboard";
import { FunnelDonut } from "@/components/modules/cso/funnel-donut";

async function getSalesDashboardData(userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { userId },
    select: {
      id: true,
      calendarLink: true,
      autopilotConfig: { select: { isActive: true } },
    },
  });

  if (!workspace) return null;

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const now = new Date();

  const [
    user,
    prospectsByStatus,
    newThisWeek,
    activeSequences,
    csoPendingCount,
    hotLeads,
    recentReplies,
    recentDecisions,
    dueSteps,
    contactedThisWeek,
    respondedThisWeek,
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
      take: 6,
      select: {
        id: true,
        name: true,
        jobTitle: true,
        company: true,
        linkedInUrl: true,
        status: true,
        updatedAt: true,
        enrichmentData: true,
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
    // Steps due today (PENDING + scheduledAt <= now, or null scheduledAt on active sequences)
    prisma.sequenceStep.findMany({
      where: {
        status: "PENDING",
        channel: "EMAIL",
        sequence: { workspaceId: workspace.id, isActive: true },
        OR: [
          { scheduledAt: { lte: now } },
          { scheduledAt: null },
        ],
      },
      select: {
        id: true,
        stepNumber: true,
        subject: true,
        delayDays: true,
        sequence: {
          select: {
            id: true,
            prospect: { select: { id: true, name: true, company: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    // Contacted this week
    prisma.prospect.count({
      where: { workspaceId: workspace.id, status: "CONTACTED", lastInteractionAt: { gte: weekAgo } },
    }),
    // Responded this week
    prisma.prospect.count({
      where: { workspaceId: workspace.id, status: { in: ["RESPONDED", "REPLIED"] }, lastInteractionAt: { gte: weekAgo } },
    }),
  ]);

  const statusCount = (status: string) =>
    prospectsByStatus.find((p) => p.status === status)?._count ?? 0;

  const totalProspects = prospectsByStatus.reduce((s, p) => s + p._count, 0);

  // Funnel stages
  const funnelStages = [
    { label: "Nouveaux",  key: "NEW",           count: statusCount("NEW") },
    { label: "Enrichis",  key: "RESEARCHED",     count: statusCount("RESEARCHED") },
    { label: "Contactés", key: "CONTACTED",      count: statusCount("CONTACTED") },
    { label: "Répondu",   key: "RESPONDED",      count: statusCount("RESPONDED") + statusCount("REPLIED") },
    { label: "Meeting",   key: "MEETING_BOOKED", count: statusCount("MEETING_BOOKED") },
    { label: "Convertis", key: "CONVERTED",      count: statusCount("CONVERTED") },
  ].map((stage, i, arr) => ({
    ...stage,
    rate: i === 0 ? 100 : arr[i - 1].count > 0
      ? Math.round((stage.count / arr[i - 1].count) * 100)
      : 0,
  }));

  return {
    workspace,
    user,
    csoPendingCount,
    funnelStages,
    dueSteps: dueSteps.map((s) => ({
      id: s.id,
      stepNumber: s.stepNumber,
      subject: s.subject,
      delayDays: s.delayDays,
      sequenceId: s.sequence.id,
      prospect: s.sequence.prospect,
    })),
    weekActivity: { contactedThisWeek, respondedThisWeek },
    hotLeads: hotLeads.map((l) => ({ ...l, source: l.source as string | null })),
    recentReplies: recentReplies.map((r) => {
      const ed = (r.enrichmentData ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        name: r.name,
        jobTitle: r.jobTitle ?? null,
        company: r.company,
        linkedInUrl: r.linkedInUrl ?? null,
        status: r.status as string,
        updatedAt: r.updatedAt.toISOString(),
        replyPreview: (ed.replyPreview as string) ?? null,
        respondedAt: (ed.respondedAt as string) ?? null,
      };
    }),
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
    calendarLink: workspace.calendarLink ?? null,
  };
}

export default async function SalesDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const data = await getSalesDashboardData(session.user.id);
  if (!data) redirect("/login");

  const { user, kpis, isAutopilotActive, csoPendingCount, hotLeads, recentReplies, recentDecisions, calendarLink, funnelStages, dueSteps, weekActivity } = data;
  const firstName = user?.name?.split(" ")[0] ?? session.user.name?.split(" ")[0] ?? "là";
  const plan = user?.plan ?? "FREE";

  const maxFunnelCount = Math.max(...funnelStages.map((s) => s.count), 1);

  return (
    <div className="space-y-5">

      {/* ── Funnel de conversion ───────────────────────────────────────────── */}
      <section
        className="mx-6 mt-6 rounded-2xl p-6"
        style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
              Funnel de conversion
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--fg-mute)" }}>
              Taux de transformation étape par étape
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs" style={{ color: "var(--fg-mute)" }}>
            <span>
              Cette semaine :{" "}
              <strong style={{ color: "var(--violet-fg)" }}>{weekActivity.contactedThisWeek}</strong> contactés
            </span>
            <span>
              <strong style={{ color: "var(--emerald-fg)" }}>{weekActivity.respondedThisWeek}</strong> réponses
            </span>
          </div>
        </div>

        <div className="flex items-center gap-8">
          {/* Barres horizontales */}
          <div className="flex-1 space-y-3">
            {funnelStages.map((stage, i) => {
              const barPct = maxFunnelCount > 0 ? (stage.count / maxFunnelCount) * 100 : 0;
              const colors = [
                "#94A3B8",
                "#8B5CF6",
                "#F59E0B",
                "#10B981",
                "#7C3AED",
                "#059669",
              ];
              return (
                <div key={stage.key} className="flex items-center gap-3">
                  <span
                    className="w-20 text-xs text-right shrink-0"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    {stage.label}
                  </span>
                  <div
                    className="flex-1 h-2 rounded-full overflow-hidden"
                    style={{ background: "var(--line-strong)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${barPct}%`, background: colors[i] }}
                    />
                  </div>
                  <span
                    className="w-8 text-xs font-semibold tabular-nums shrink-0"
                    style={{ color: colors[i] }}
                  >
                    {stage.count}
                  </span>
                  {i > 0 ? (
                    <span
                      className="w-10 text-[11px] font-medium shrink-0"
                      style={{
                        color:
                          stage.rate >= 30
                            ? "var(--emerald-fg)"
                            : stage.rate >= 15
                              ? "var(--amber-fg)"
                              : "var(--danger-fg)",
                      }}
                    >
                      {stage.rate}%
                    </span>
                  ) : (
                    <span className="w-10 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Donut */}
          <div
            className="hidden md:flex flex-col items-center gap-3 shrink-0 pl-6"
            style={{ borderLeft: "1px solid var(--line)" }}
          >
            <FunnelDonut
              stages={funnelStages}
              total={funnelStages.reduce((s, f) => s + f.count, 0)}
            />
            <div className="flex flex-col items-center gap-1">
              {funnelStages.slice(0, 4).map((stage, i) => {
                const dotColors = ["#94A3B8", "#8B5CF6", "#F59E0B", "#10B981"];
                return (
                  <div key={stage.key} className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: dotColors[i] }}
                    />
                    <span className="text-[10px]" style={{ color: "var(--fg-mute)" }}>
                      {stage.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── Étapes dues ───────────────────────────────────────────────────── */}
      {dueSteps.length > 0 && (
        <section
          className="mx-6 rounded-2xl p-5"
          style={{ background: "var(--bg-card)", border: "1px solid var(--amber-line)", boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-lg"
              style={{ background: "var(--amber-soft)", color: "var(--amber-fg)" }}
            >
              {dueSteps.length} étape{dueSteps.length > 1 ? "s" : ""}
            </span>
            <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
              Séquences en attente
            </h2>
          </div>
          <div className="space-y-2">
            {dueSteps.slice(0, 6).map((step) => (
              <div
                key={step.id}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-xl"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0"
                    style={{ background: "var(--amber-soft)", color: "var(--amber-fg)" }}
                  >
                    Étape {step.stepNumber}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--fg)" }}>
                      {step.prospect.name}
                    </p>
                    <p className="text-xs truncate" style={{ color: "var(--fg-mute)" }}>
                      {step.prospect.company}
                      {step.subject ? ` · "${step.subject}"` : ""}
                    </p>
                  </div>
                </div>
                <a
                  href="/sales-os/sequences"
                  className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all hover:brightness-105"
                  style={{ background: "var(--amber-soft)", color: "var(--amber-fg)", border: "1px solid var(--amber-line)" }}
                >
                  Voir →
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      <CSODashboardClientV2
        firstName={firstName}
        plan={plan}
        kpis={kpis}
        isAutopilotActive={isAutopilotActive}
        csoPendingCount={csoPendingCount}
        hotLeads={hotLeads}
        recentReplies={recentReplies}
        recentDecisions={recentDecisions}
        calendarLink={calendarLink}
      />
      <div className="px-6 pb-6">
        <CsoMetricsDashboard workspaceId={data.workspace.id} />
      </div>
    </div>
  );
}
