"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import { Zap, Bot, Loader2, Users, Sparkles, ChevronRight } from "lucide-react";
import { getUserWorkspace } from "@/actions/leads";
import {
  getScoredProspectsForDashboard,
  updateProspectStatusAction,
  type ScoredProspectForDashboard,
} from "@/actions/cso-sales";

// ─── Types ────────────────────────────────────────────────────────────────────

type KanbanColId = "nouveau" | "etudie" | "contacte" | "repondu" | "rdv" | "gagne";
type TempFilter = "hot" | "warm" | "cold" | "all";
type Tab = "pipeline" | "liste" | "agent";

interface AgentDecision {
  id: string;
  actionType: string;
  reasoning: string;
  priority: number;
  status: string;
  actionData: Record<string, unknown> | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_TO_COL: Record<string, KanbanColId> = {
  NEW: "nouveau",
  RESEARCHED: "etudie",
  MESSAGES_GENERATED: "etudie",
  CONTACTED: "contacte",
  RESPONDED: "repondu",
  REPLIED: "repondu",
  MEETING_BOOKED: "rdv",
  CONVERTED: "gagne",
};

const NEXT_STATUS: Record<string, string> = {
  NEW: "CONTACTED",
  RESEARCHED: "CONTACTED",
  MESSAGES_GENERATED: "CONTACTED",
  CONTACTED: "RESPONDED",
  RESPONDED: "MEETING_BOOKED",
  REPLIED: "MEETING_BOOKED",
  MEETING_BOOKED: "CONVERTED",
};

const KANBAN_COLS: { id: KanbanColId; label: string }[] = [
  { id: "nouveau", label: "Nouveau" },
  { id: "etudie", label: "Étudié" },
  { id: "contacte", label: "Contacté" },
  { id: "repondu", label: "A répondu" },
  { id: "rdv", label: "Rendez-vous" },
  { id: "gagne", label: "Gagné" },
];

const ACTION_LABEL: Record<string, string> = {
  CSO_LAUNCH_LINKEDIN: "Lancer séquence LinkedIn",
  CSO_LAUNCH_EMAIL: "Lancer séquence Email",
  CSO_FOLLOWUP: "Relancer le prospect",
  CSO_STALE_REJECT: "Archiver (inactif)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function getTemp(p: ScoredProspectForDashboard): "HOT" | "WARM" | "COLD" {
  const t = (p.temperature ?? "").toUpperCase();
  if (t === "HOT" || t === "WARM" || t === "COLD") return t as "HOT" | "WARM" | "COLD";
  if (p.score >= 85) return "HOT";
  if (p.score >= 70) return "WARM";
  return "COLD";
}

function tempStyle(temp: "HOT" | "WARM" | "COLD") {
  if (temp === "HOT") return { background: "var(--danger-soft)", color: "var(--danger-fg)" };
  if (temp === "WARM") return { background: "var(--amber-soft)", color: "var(--amber-fg)" };
  return { background: "var(--cold-soft)", color: "var(--cold-fg)" };
}

function scoreColor(score: number) {
  if (score >= 85) return "var(--danger-fg)";
  if (score >= 70) return "var(--amber-fg)";
  return "var(--cold-fg)";
}

function formatPlatform(p: ScoredProspectForDashboard) {
  const src = (p.platform ?? "").toLowerCase();
  if (src === "linkedin") return "LinkedIn";
  if (src === "instagram") return "Instagram";
  if (src === "facebook") return "Facebook";
  return "Skalle";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [prospects, setProspects] = useState<ScoredProspectForDashboard[]>([]);
  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("pipeline");
  const [activeFilter, setActiveFilter] = useState<TempFilter>("all");
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [localStatuses, setLocalStatuses] = useState<Record<string, string>>({});

  useEffect(() => {
    getUserWorkspace().then((r) => {
      if (r.success && r.workspaceId) setWorkspaceId(r.workspaceId);
    });
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    Promise.all([
      getScoredProspectsForDashboard(workspaceId),
      fetch(`/api/cso-agent?workspaceId=${workspaceId}`)
        .then((r) => (r.ok ? r.json() : { decisions: [] }))
        .catch(() => ({ decisions: [] })),
    ])
      .then(([prospectRes, agentRes]) => {
        setProspects(prospectRes.success && prospectRes.data ? prospectRes.data : []);
        setDecisions((agentRes as { decisions: AgentDecision[] }).decisions ?? []);
      })
      .finally(() => setLoading(false));
  }, [workspaceId]);

  // Derived data
  const visibleProspects = useMemo(
    () => prospects.filter((p) => STATUS_TO_COL[p.status] !== undefined),
    [prospects]
  );

  const filteredProspects = useMemo(() => {
    if (activeFilter === "all") return visibleProspects;
    return visibleProspects.filter((p) => getTemp(p) === activeFilter.toUpperCase());
  }, [visibleProspects, activeFilter]);

  const pendingDecisions = useMemo(
    () => decisions.filter((d) => d.status === "PENDING"),
    [decisions]
  );

  const tempCounts = useMemo(
    () => ({
      hot: visibleProspects.filter((p) => getTemp(p) === "HOT").length,
      warm: visibleProspects.filter((p) => getTemp(p) === "WARM").length,
      cold: visibleProspects.filter((p) => getTemp(p) === "COLD").length,
    }),
    [visibleProspects]
  );

  const TABS = [
    { id: "pipeline" as const, label: "Pipeline" },
    { id: "liste" as const, label: "Liste", count: visibleProspects.length },
    { id: "agent" as const, label: "Agent IA", count: pendingDecisions.length },
  ];

  const handleAdvance = useCallback(async (prospectId: string, currentStatus: string) => {
    const nextStatus = NEXT_STATUS[currentStatus];
    if (!nextStatus || !workspaceId || advancingId) return;
    setAdvancingId(prospectId);
    const r = await updateProspectStatusAction(prospectId, workspaceId, nextStatus).catch(() => ({ success: false }));
    if (r.success) setLocalStatuses((prev) => ({ ...prev, [prospectId]: nextStatus }));
    setAdvancingId(null);
  }, [workspaceId, advancingId]);

  const TEMP_FILTERS = [
    { id: "hot" as const, label: "HOT", count: tempCounts.hot, color: "danger" as const },
    { id: "warm" as const, label: "WARM", count: tempCounts.warm, color: "amber" as const },
    { id: "cold" as const, label: "COLD", count: tempCounts.cold, color: "cold" as const },
    { id: "all" as const, label: "Tous" },
  ];

  return (
    <>
      <AppTopBar
        title="Leads"
        breadcrumb="sales-os / leads"
        cta="Importer"
        ctaHref="/sales-os/hunt"
        accent="violet"
      />

      <div className="p-6 space-y-5 max-w-[1400px]">

        {/* Tabs + Temp filters */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all"
                  style={
                    active
                      ? { background: "var(--violet-soft)", color: "var(--violet-fg)", border: "1px solid var(--violet-line)" }
                      : { color: "var(--fg-dim)", border: "1px solid transparent" }
                  }
                >
                  {tab.label}
                  {"count" in tab && (
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{
                        background: active ? "var(--violet-fg)" : "oklch(0.21 0.03 260 / 0.05)",
                        color: active ? "white" : "var(--fg-mute)",
                      }}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            {TEMP_FILTERS.map((f) => {
              const active = activeFilter === f.id;
              const hasColor = "color" in f;
              return (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                  style={
                    active && hasColor
                      ? { background: `var(--${f.color}-soft)`, color: `var(--${f.color}-fg)`, border: `1px solid var(--${f.color}-line)` }
                      : active
                      ? { background: "var(--line-strong)", color: "var(--fg)", border: "1px solid var(--line)" }
                      : { color: "var(--fg-dim)", border: "1px solid transparent" }
                  }
                >
                  {f.label}
                  {"count" in f && (
                    <span className="font-mono">{f.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--violet-fg)" }} />
          </div>
        )}

        {/* Pipeline Kanban */}
        {!loading && activeTab === "pipeline" && (
          visibleProspects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Users className="h-10 w-10" style={{ color: "var(--fg-mute)", opacity: 0.3 }} />
              <p className="text-[13px]" style={{ color: "var(--fg-mute)" }}>Aucun prospect dans le pipeline</p>
              <Link
                href="/sales-os/hunt"
                className="text-[12px] font-semibold px-4 py-2 rounded-[8px] transition-all hover:brightness-110"
                style={{ background: "var(--violet-fg)", color: "white" }}
              >
                Importer des leads →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <div className="flex gap-3 min-w-max">
                {KANBAN_COLS.map((col) => {
                  const colLeads = filteredProspects.filter((p) => STATUS_TO_COL[p.status] === col.id);
                  return (
                    <div key={col.id} className="w-[220px] shrink-0">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>
                          {col.label}
                        </span>
                        <span
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ background: "oklch(0.21 0.03 260 / 0.05)", color: "var(--fg-mute)" }}
                        >
                          {colLeads.length}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {colLeads.map((p) => {
                          const effectiveStatus = localStatuses[p.id] ?? p.status;
                          const temp = getTemp(p);
                          const hasNext = !!NEXT_STATUS[effectiveStatus];
                          const isAdvancing = advancingId === p.id;
                          return (
                            <div
                              key={p.id}
                              className="rounded-[12px] p-3 transition-all"
                              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <div
                                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                  style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}
                                >
                                  {getInitials(p.name)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12px] font-semibold truncate" style={{ color: "var(--fg)" }}>{p.name}</p>
                                  <p className="text-[10.5px] truncate" style={{ color: "var(--fg-mute)" }}>{p.company}</p>
                                </div>
                              </div>
                              <div className="flex items-center justify-between mb-2.5">
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={tempStyle(temp)}>
                                  {temp}
                                </span>
                                <span className="text-[11px] font-mono font-bold" style={{ color: scoreColor(p.score) }}>
                                  {p.score}
                                </span>
                              </div>
                              {/* Action buttons */}
                              <div className="flex items-center gap-1.5" style={{ borderTop: "1px solid var(--line)", paddingTop: "8px" }}>
                                <Link
                                  href={`/sales-os/reply-assistant?prospectId=${p.id}`}
                                  className="flex-1 flex items-center justify-center gap-1 py-1 rounded-[6px] text-[10.5px] font-semibold transition-all hover:brightness-110"
                                  style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}
                                >
                                  <Sparkles className="h-2.5 w-2.5" />
                                  Message
                                </Link>
                                {hasNext && (
                                  <button
                                    onClick={() => handleAdvance(p.id, effectiveStatus)}
                                    disabled={isAdvancing}
                                    className="flex items-center justify-center gap-0.5 px-2 py-1 rounded-[6px] text-[10.5px] font-semibold transition-all hover:brightness-110 disabled:opacity-50"
                                    style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}
                                    title="Avancer dans le pipeline"
                                  >
                                    {isAdvancing
                                      ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                                      : <ChevronRight className="h-3 w-3" />}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {colLeads.length === 0 && (
                          <div
                            className="rounded-[12px] p-4 text-center text-[11px]"
                            style={{ border: "1px dashed var(--line)", color: "var(--fg-mute)" }}
                          >
                            Aucun lead
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}

        {/* Liste view */}
        {!loading && activeTab === "liste" && (
          <section
            className="rounded-[18px] p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
          >
            {filteredProspects.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-[13px]" style={{ color: "var(--fg-mute)" }}>Aucun lead</p>
              </div>
            ) : (
              <div className="space-y-1">
                <div
                  className="grid gap-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr 1fr", color: "var(--fg-mute)" }}
                >
                  <span>Lead</span><span>Entreprise</span><span>Étape</span><span>Temp.</span><span>Score</span><span>Source</span>
                </div>
                {filteredProspects.map((p, i) => {
                  const temp = getTemp(p);
                  const colLabel = KANBAN_COLS.find((c) => c.id === STATUS_TO_COL[p.status])?.label ?? p.status;
                  return (
                    <Link
                      key={p.id}
                      href={`/sales-os/reply-assistant?prospectId=${p.id}`}
                      className="grid items-center gap-4 px-4 py-3 rounded-[10px] cursor-pointer hover:brightness-[0.97] transition-all"
                      style={{
                        gridTemplateColumns: "2fr 1.5fr 1fr 1fr 1fr 1fr",
                        background: i % 2 === 0 ? "var(--bg)" : "transparent",
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                          style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}
                        >
                          {getInitials(p.name)}
                        </div>
                        <span className="text-[13px] font-medium truncate" style={{ color: "var(--fg)" }}>{p.name}</span>
                      </div>
                      <span className="text-[12px] truncate" style={{ color: "var(--fg-dim)" }}>{p.company}</span>
                      <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>{colLabel}</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded w-fit" style={tempStyle(temp)}>
                        {temp}
                      </span>
                      <span className="text-[12px] font-mono font-bold" style={{ color: scoreColor(p.score) }}>{p.score}</span>
                      <span className="text-[12px]" style={{ color: "var(--fg-mute)" }}>{formatPlatform(p)}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* Agent IA tab */}
        {!loading && activeTab === "agent" && (
          <section className="space-y-3">
            {pendingDecisions.length === 0 ? (
              <div
                className="rounded-[14px] p-8 text-center"
                style={{ background: "var(--bg-card)", border: "1px dashed var(--violet-line)" }}
              >
                <Bot className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--violet-fg)", opacity: 0.4 }} />
                <p className="text-[13px] font-medium" style={{ color: "var(--fg-dim)" }}>Aucune action en attente</p>
                <p className="text-[12px] mt-1" style={{ color: "var(--fg-mute)" }}>
                  L&apos;Agent CSO analyse votre pipeline quotidiennement.
                </p>
                <Link
                  href="/sales-os/agent"
                  className="inline-block mt-4 text-[12px] font-semibold px-4 py-2 rounded-[8px] transition-all hover:brightness-110"
                  style={{ background: "var(--violet-fg)", color: "white" }}
                >
                  Voir l&apos;Agent CSO →
                </Link>
              </div>
            ) : (
              pendingDecisions.map((d) => {
                const prospectName = (d.actionData?.prospectName as string) ?? "—";
                const label = ACTION_LABEL[d.actionType] ?? d.actionType;
                return (
                  <div
                    key={d.id}
                    className="rounded-[14px] p-5 flex items-center justify-between gap-4"
                    style={{ background: "var(--bg-card)", border: "1px solid var(--violet-line)", boxShadow: "var(--card-shadow)" }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0"
                        style={{ background: "var(--violet-soft)" }}
                      >
                        <Bot className="h-4 w-4" style={{ color: "var(--violet-fg)" }} />
                      </div>
                      <div>
                        <p className="text-[13px] font-medium" style={{ color: "var(--fg)" }}>
                          {label}
                          {prospectName !== "—" && (
                            <span className="ml-1 font-normal" style={{ color: "var(--fg-mute)" }}>
                              — {prospectName}
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] mt-0.5 line-clamp-1" style={{ color: "var(--fg-mute)" }}>{d.reasoning}</p>
                      </div>
                    </div>
                    <Link
                      href="/sales-os/agent"
                      className="px-4 py-2 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110 shrink-0"
                      style={{ background: "var(--violet-fg)", color: "white" }}
                    >
                      Approuver →
                    </Link>
                  </div>
                );
              })
            )}
          </section>
        )}
      </div>

      {/* Bottom strip — Agent IA propose */}
      {!loading && pendingDecisions.length > 0 && (
        <div
          className="fixed bottom-0 left-[220px] right-0 px-6 py-3 flex items-center justify-between z-40"
          style={{ background: "var(--bg-card)", borderTop: "1px solid var(--line)", backdropFilter: "blur(8px)" }}
        >
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--violet-fg)" }} />
            <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
              Agent IA propose{" "}
              <span className="font-semibold" style={{ color: "var(--fg)" }}>
                {pendingDecisions.length} action{pendingDecisions.length !== 1 ? "s" : ""}
              </span>{" "}
              sur votre pipeline
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="px-4 py-2 rounded-[8px] text-[12px] font-medium transition-all hover:brightness-[0.97]"
              style={{ background: "var(--violet-soft)", border: "1px solid var(--violet-line)", color: "var(--violet-fg)" }}
              onClick={() => setActiveTab("agent")}
            >
              Voir les {pendingDecisions.length}
            </button>
            <Link
              href="/sales-os/agent"
              className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110"
              style={{ background: "var(--violet-fg)", color: "white" }}
            >
              <Zap className="h-3 w-3" />
              Approuver dans l&apos;Agent
            </Link>
          </div>
        </div>
      )}

      <div className="h-16" />
    </>
  );
}
