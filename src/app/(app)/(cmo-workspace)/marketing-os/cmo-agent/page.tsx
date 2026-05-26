"use client";

import { useState, useEffect, useCallback } from "react";
import { AppTopBar } from "@/components/modules/app-topbar";
import {
  Bot, Plus, Target, Sparkles, Check, X, RefreshCw, ChevronDown,
  FileText, BarChart2, Zap, TrendingUp, Calendar, Loader2,
  AlertCircle, CheckCircle2, Clock, Play, Pencil, Trash2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ObjType = "CONTENT" | "AUDIENCE" | "LEADS" | "SEO";
type ObjPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "CUSTOM";
type ProposalType = "GENERATE_POSTS" | "GENERATE_ARTICLE" | "SCHEDULE_POSTS" | "ANALYZE" | "ADJUST_STRATEGY";
type ProposalStatus = "PENDING" | "APPROVED" | "REJECTED" | "IN_PROGRESS" | "DONE" | "FAILED";

interface Objective {
  id: string;
  type: ObjType;
  period: ObjPeriod;
  title: string;
  description?: string | null;
  target: { metric: string; value: number; unit: string };
  status: "ACTIVE" | "PAUSED" | "COMPLETED";
  createdAt: string;
  _count: { proposals: number };
}

interface Proposal {
  id: string;
  type: ProposalType;
  title: string;
  description: string;
  agentReason?: string | null;
  payload: Record<string, unknown>;
  status: ProposalStatus;
  creditsEst: number;
  userFeedback?: string | null;
  result?: Record<string, unknown> | null;
  createdAt: string;
  objective?: { title: string; type: ObjType } | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

type LIcon = React.FC<{ className?: string; style?: React.CSSProperties }>;

const OBJ_TYPE_LABELS: Record<ObjType, { label: string; color: string; bg: string; icon: LIcon }> = {
  CONTENT:  { label: "Contenu",  color: "var(--emerald-fg)", bg: "var(--emerald-soft)", icon: FileText },
  AUDIENCE: { label: "Audience", color: "var(--violet-fg)",  bg: "var(--violet-soft)",  icon: TrendingUp },
  LEADS:    { label: "Leads",    color: "var(--amber-fg)",   bg: "var(--amber-soft)",   icon: Target },
  SEO:      { label: "SEO",      color: "var(--cold-fg)",    bg: "var(--cold-soft)",    icon: BarChart2 },
};

const PERIOD_LABELS: Record<ObjPeriod, string> = {
  DAILY: "Quotidien", WEEKLY: "Hebdomadaire", MONTHLY: "Mensuel", CUSTOM: "Personnalisé",
};

const PROPOSAL_TYPE_META: Record<ProposalType, { label: string; icon: LIcon; color: string; bg: string }> = {
  GENERATE_POSTS:    { label: "Générer posts",   icon: Sparkles,   color: "var(--violet-fg)",  bg: "var(--violet-soft)"  },
  GENERATE_ARTICLE:  { label: "Article SEO",     icon: FileText,   color: "var(--cold-fg)",    bg: "var(--cold-soft)"    },
  SCHEDULE_POSTS:    { label: "Programmer",      icon: Calendar,   color: "var(--amber-fg)",   bg: "var(--amber-soft)"   },
  ANALYZE:           { label: "Analyser",        icon: BarChart2,  color: "var(--emerald-fg)", bg: "var(--emerald-soft)" },
  ADJUST_STRATEGY:   { label: "Ajuster stratégie", icon: Zap,      color: "var(--amber-fg)",   bg: "var(--amber-soft)"   },
};

const STATUS_META: Record<ProposalStatus, { label: string; color: string; bg: string; icon: LIcon }> = {
  PENDING:     { label: "En attente",    color: "var(--amber-fg)",   bg: "var(--amber-soft)",   icon: Clock },
  APPROVED:    { label: "Approuvé",      color: "var(--violet-fg)",  bg: "var(--violet-soft)",  icon: Check },
  REJECTED:    { label: "Rejeté",        color: "var(--fg-mute)",    bg: "var(--line-strong)",  icon: X },
  IN_PROGRESS: { label: "En cours…",     color: "var(--cold-fg)",    bg: "var(--cold-soft)",    icon: Loader2 },
  DONE:        { label: "Terminé",       color: "var(--emerald-fg)", bg: "var(--emerald-soft)", icon: CheckCircle2 },
  FAILED:      { label: "Échoué",        color: "var(--danger-fg)",  bg: "var(--danger-soft)",  icon: AlertCircle },
};

const FILTER_TABS: { id: ProposalStatus | "ALL"; label: string }[] = [
  { id: "ALL",        label: "Tout" },
  { id: "PENDING",    label: "En attente" },
  { id: "IN_PROGRESS", label: "En cours" },
  { id: "DONE",       label: "Terminé" },
  { id: "REJECTED",   label: "Rejeté" },
];

// ─── Objective form modal ─────────────────────────────────────────────────────

function ObjectiveModal({
  onClose, onSaved,
}: { onClose: () => void; onSaved: () => void }) {
  const [type, setType]     = useState<ObjType>("CONTENT");
  const [period, setPeriod] = useState<ObjPeriod>("MONTHLY");
  const [title, setTitle]   = useState("");
  const [metric, setMetric] = useState("");
  const [value, setValue]   = useState("");
  const [unit, setUnit]     = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState<string | null>(null);

  async function save() {
    if (!title.trim() || !metric.trim() || !value || !unit.trim()) {
      setErr("Tous les champs sont requis"); return;
    }
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/cmo/objectives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, period, title, target: { metric, value: Number(value), unit } }),
      });
      if (!res.ok) throw new Error((await res.json() as { error: string }).error);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[480px] rounded-[18px] p-6 flex flex-col gap-4"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold" style={{ color: "var(--fg)" }}>Nouvel objectif</p>
            <button onClick={onClose} className="p-1.5 rounded-[8px] hover:brightness-[0.97]"
              style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
              <X className="h-4 w-4" style={{ color: "var(--fg-mute)" }} />
            </button>
          </div>

          {/* Type */}
          <div>
            <p className="text-[11.5px] font-semibold mb-2" style={{ color: "var(--fg-dim)" }}>Type</p>
            <div className="grid grid-cols-4 gap-2">
              {(Object.entries(OBJ_TYPE_LABELS) as [ObjType, typeof OBJ_TYPE_LABELS[ObjType]][]).map(([t, meta]) => {
                const Icon = meta.icon;
                const active = type === t;
                return (
                  <button key={t} onClick={() => setType(t)}
                    className="flex flex-col items-center gap-1.5 p-2.5 rounded-[10px] transition-all"
                    style={active ? { background: meta.bg, border: `2px solid ${meta.color}` } : { background: "var(--bg)", border: "1px solid var(--line)" }}>
                    <Icon className="h-4 w-4" style={{ color: active ? meta.color : "var(--fg-mute)" }} />
                    <span className="text-[10.5px] font-semibold" style={{ color: active ? meta.color : "var(--fg-mute)" }}>{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Period */}
          <div>
            <p className="text-[11.5px] font-semibold mb-2" style={{ color: "var(--fg-dim)" }}>Fréquence</p>
            <div className="grid grid-cols-4 gap-2">
              {(["DAILY","WEEKLY","MONTHLY","CUSTOM"] as ObjPeriod[]).map((p) => (
                <button key={p} onClick={() => setPeriod(p)}
                  className="py-2 rounded-[8px] text-[11px] font-semibold transition-all"
                  style={period === p
                    ? { background: "var(--emerald-soft)", border: "2px solid var(--emerald-fg)", color: "var(--emerald-fg)" }
                    : { background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-mute)" }}>
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <p className="text-[11.5px] font-semibold mb-1.5" style={{ color: "var(--fg-dim)" }}>Intitulé de l'objectif</p>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 rounded-[8px] text-[13px] outline-none"
              style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
              placeholder="Ex: Publier 30 posts LinkedIn ce mois" />
          </div>

          {/* Target */}
          <div>
            <p className="text-[11.5px] font-semibold mb-1.5" style={{ color: "var(--fg-dim)" }}>Cible</p>
            <div className="grid grid-cols-3 gap-2">
              <input value={metric} onChange={(e) => setMetric(e.target.value)}
                className="px-3 py-2.5 rounded-[8px] text-[12.5px] outline-none"
                style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
                placeholder="Métrique" />
              <input value={value} onChange={(e) => setValue(e.target.value)} type="number"
                className="px-3 py-2.5 rounded-[8px] text-[12.5px] outline-none"
                style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
                placeholder="Valeur" />
              <input value={unit} onChange={(e) => setUnit(e.target.value)}
                className="px-3 py-2.5 rounded-[8px] text-[12.5px] outline-none"
                style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
                placeholder="Unité" />
            </div>
          </div>

          {err && <p className="text-[12px] px-3 py-2 rounded-[8px]"
            style={{ background: "var(--danger-soft)", color: "var(--danger-fg)" }}>{err}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-[8px] text-[12.5px] font-medium"
              style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
              Annuler
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 rounded-[8px] text-[12.5px] font-semibold transition-all hover:brightness-110 disabled:opacity-60"
              style={{ background: "var(--emerald-fg)", color: "white" }}>
              {saving ? "Enregistrement…" : "Créer l'objectif →"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Reject modal ─────────────────────────────────────────────────────────────

function RejectModal({ proposalId, onClose, onDone }: { proposalId: string; onClose: () => void; onDone: () => void }) {
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving]     = useState(false);

  async function reject() {
    setSaving(true);
    await fetch(`/api/cmo/proposals/${proposalId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback }),
    });
    onDone();
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-[400px] rounded-[18px] p-6 flex flex-col gap-4"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
          <p className="text-[15px] font-semibold" style={{ color: "var(--fg)" }}>Rejeter la proposition</p>
          <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3}
            className="w-full px-3 py-2.5 rounded-[8px] text-[13px] outline-none resize-none"
            style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
            placeholder="Pourquoi ? (optionnel — aide l'agent à s'améliorer)" />
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-[8px] text-[12.5px] font-medium"
              style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
              Annuler
            </button>
            <button onClick={reject} disabled={saving}
              className="flex-1 py-2.5 rounded-[8px] text-[12.5px] font-semibold disabled:opacity-60"
              style={{ background: "var(--danger-soft)", border: "1px solid var(--danger-line)", color: "var(--danger-fg)" }}>
              {saving ? "…" : "Rejeter"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CMOAgentPage() {
  const [objectives,     setObjectives]     = useState<Objective[]>([]);
  const [proposals,      setProposals]      = useState<Proposal[]>([]);
  const [filterTab,      setFilterTab]      = useState<ProposalStatus | "ALL">("ALL");
  const [showObjModal,   setShowObjModal]   = useState(false);
  const [rejectId,       setRejectId]       = useState<string | null>(null);
  const [analyzing,      setAnalyzing]      = useState(false);
  const [analyzeErr,     setAnalyzeErr]     = useState<string | null>(null);
  const [approvingId,    setApprovingId]    = useState<string | null>(null);
  const [expandedId,     setExpandedId]     = useState<string | null>(null);
  const [loadingInit,    setLoadingInit]    = useState(true);

  const reload = useCallback(async () => {
    const [oRes, pRes] = await Promise.all([
      fetch("/api/cmo/objectives"),
      fetch("/api/cmo/proposals"),
    ]);
    const [od, pd] = await Promise.all([
      oRes.json() as Promise<{ objectives: Objective[] }>,
      pRes.json() as Promise<{ proposals: Proposal[] }>,
    ]);
    setObjectives(od.objectives ?? []);
    setProposals(pd.proposals ?? []);
  }, []);

  useEffect(() => {
    reload().finally(() => setLoadingInit(false));
  }, [reload]);

  // Poll while proposals are IN_PROGRESS
  useEffect(() => {
    const inProgress = proposals.some((p) => p.status === "IN_PROGRESS");
    if (!inProgress) return;
    const t = setTimeout(() => void reload(), 3000);
    return () => clearTimeout(t);
  }, [proposals, reload]);

  async function runAgent() {
    setAnalyzing(true); setAnalyzeErr(null);
    try {
      const res = await fetch("/api/cmo/agent/analyze", { method: "POST" });
      const data = await res.json() as { error?: string; created?: number };
      if (!res.ok) throw new Error(data.error ?? "Erreur agent");
      await reload();
    } catch (e) {
      setAnalyzeErr(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setAnalyzing(false);
    }
  }

  async function approve(id: string) {
    setApprovingId(id);
    try {
      await fetch(`/api/cmo/proposals/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      await reload();
    } finally {
      setApprovingId(null);
    }
  }

  async function toggleObjectiveStatus(obj: Objective) {
    const newStatus = obj.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    await fetch(`/api/cmo/objectives/${obj.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await reload();
  }

  async function deleteObjective(id: string) {
    await fetch(`/api/cmo/objectives/${id}`, { method: "DELETE" });
    await reload();
  }

  const filteredProposals = filterTab === "ALL"
    ? proposals
    : proposals.filter((p) => p.status === filterTab);

  const pendingCount = proposals.filter((p) => p.status === "PENDING").length;
  const activeObjCount = objectives.filter((o) => o.status === "ACTIVE").length;

  return (
    <>
      <AppTopBar
        title="Agent CMO"
        breadcrumb="marketing-os / cmo-agent"
        cta="+ Objectif"
        onCta={() => setShowObjModal(true)}
        accent="emerald"
      />

      <div className="p-6 max-w-[1300px]">
        {/* Header stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Objectifs actifs",      value: activeObjCount,  color: "emerald", icon: Target },
            { label: "Propositions en attente", value: pendingCount,  color: "amber",   icon: Clock },
            { label: "Actions complétées",    value: proposals.filter((p) => p.status === "DONE").length, color: "violet", icon: CheckCircle2 },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="rounded-[14px] p-4 flex items-center gap-4"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
              <div className="h-10 w-10 rounded-[10px] flex items-center justify-center shrink-0"
                style={{ background: `var(--${color}-soft)` }}>
                <Icon className="h-5 w-5" style={{ color: `var(--${color}-fg)` }} />
              </div>
              <div>
                <p className="text-[22px] font-bold leading-none" style={{ color: "var(--fg)" }}>{value}</p>
                <p className="text-[11.5px] mt-0.5" style={{ color: "var(--fg-mute)" }}>{label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[300px_1fr] gap-5">

          {/* ── Left: Objectives ─────────────────────────────────────────── */}
          <aside className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>Objectifs</p>
              <button onClick={() => setShowObjModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-[8px] text-[11.5px] font-semibold transition-all hover:brightness-110"
                style={{ background: "var(--emerald-fg)", color: "white" }}>
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </button>
            </div>

            {loadingInit ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--fg-mute)" }} />
              </div>
            ) : objectives.length === 0 ? (
              <div className="rounded-[14px] p-6 text-center" style={{ border: "1px dashed var(--line)" }}>
                <Target className="h-8 w-8 mx-auto mb-2 opacity-20" style={{ color: "var(--fg-mute)" }} />
                <p className="text-[12.5px] mb-3" style={{ color: "var(--fg-mute)" }}>Aucun objectif. Créez-en un pour démarrer l'agent.</p>
                <button onClick={() => setShowObjModal(true)}
                  className="px-4 py-2 rounded-[8px] text-[12px] font-semibold hover:brightness-110"
                  style={{ background: "var(--emerald-fg)", color: "white" }}>
                  + Premier objectif
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {objectives.map((obj) => {
                  const meta = OBJ_TYPE_LABELS[obj.type as ObjType];
                  const Icon = meta.icon;
                  const paused = obj.status === "PAUSED";
                  return (
                    <div key={obj.id} className="rounded-[12px] p-3.5 group"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--line)", opacity: paused ? 0.6 : 1 }}>
                      <div className="flex items-start gap-2.5">
                        <div className="h-8 w-8 rounded-[8px] flex items-center justify-center shrink-0"
                          style={{ background: meta.bg }}>
                          <Icon className="h-4 w-4" style={{ color: meta.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: meta.bg, color: meta.color }}>
                              {meta.label}
                            </span>
                            <span className="text-[9.5px] font-medium px-1.5 py-0.5 rounded"
                              style={{ background: "var(--line-strong)", color: "var(--fg-mute)" }}>
                              {PERIOD_LABELS[obj.period as ObjPeriod]}
                            </span>
                          </div>
                          <p className="text-[12px] font-semibold leading-snug" style={{ color: "var(--fg)" }}>{obj.title}</p>
                          <p className="text-[10.5px] mt-0.5" style={{ color: "var(--fg-mute)" }}>
                            Cible : {obj.target.value} {obj.target.unit}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => toggleObjectiveStatus(obj)}
                            className="p-1 rounded hover:brightness-[0.97]"
                            title={paused ? "Réactiver" : "Mettre en pause"}>
                            {paused ? <Play className="h-3.5 w-3.5" style={{ color: "var(--emerald-fg)" }} />
                                    : <ChevronDown className="h-3.5 w-3.5" style={{ color: "var(--fg-mute)" }} />}
                          </button>
                          <button onClick={() => deleteObjective(obj.id)} className="p-1 rounded hover:brightness-[0.97]">
                            <Trash2 className="h-3.5 w-3.5" style={{ color: "var(--danger-fg)" }} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Run agent CTA */}
            {activeObjCount > 0 && (
              <button
                onClick={runAgent}
                disabled={analyzing}
                className="mt-2 flex items-center justify-center gap-2 px-4 py-3 rounded-[12px] text-[13px] font-semibold transition-all hover:brightness-110 disabled:opacity-60 w-full"
                style={{ background: "var(--emerald-fg)", color: "white" }}
              >
                {analyzing
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyse en cours…</>
                  : <><Bot className="h-4 w-4" /> Analyser et proposer</>
                }
              </button>
            )}
            {analyzeErr && (
              <p className="text-[11.5px] px-3 py-2 rounded-[8px] text-center"
                style={{ background: "var(--danger-soft)", color: "var(--danger-fg)" }}>
                {analyzeErr}
              </p>
            )}
          </aside>

          {/* ── Right: Proposal queue ─────────────────────────────────────── */}
          <main className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {FILTER_TABS.map((tab) => {
                  const count = tab.id === "ALL" ? proposals.length : proposals.filter((p) => p.status === tab.id).length;
                  const active = filterTab === tab.id;
                  return (
                    <button key={tab.id} onClick={() => setFilterTab(tab.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-all"
                      style={active
                        ? { background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)", color: "var(--emerald-fg)" }
                        : { background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                      {tab.label}
                      {count > 0 && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                          style={{ background: active ? "var(--emerald-fg)" : "var(--line-strong)", color: active ? "white" : "var(--fg-mute)" }}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button onClick={reload} className="p-1.5 rounded-[8px] hover:brightness-[0.97]"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                <RefreshCw className="h-3.5 w-3.5" style={{ color: "var(--fg-mute)" }} />
              </button>
            </div>

            {loadingInit ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--fg-mute)" }} />
              </div>
            ) : filteredProposals.length === 0 ? (
              <div className="rounded-[14px] p-12 text-center" style={{ border: "1px dashed var(--line)" }}>
                <Bot className="h-10 w-10 mx-auto mb-3 opacity-15" style={{ color: "var(--fg-mute)" }} />
                <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--fg)" }}>
                  {filterTab === "ALL" ? "Aucune proposition pour l'instant" : `Aucune proposition "${FILTER_TABS.find((t) => t.id === filterTab)?.label}"`}
                </p>
                <p className="text-[12.5px]" style={{ color: "var(--fg-mute)" }}>
                  {filterTab === "ALL" && activeObjCount > 0
                    ? 'Cliquez sur "Analyser et proposer" pour que l\'agent génère des actions.'
                    : "Changez le filtre ou ajoutez des objectifs."}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filteredProposals.map((p) => {
                  const typeMeta = PROPOSAL_TYPE_META[p.type as ProposalType];
                  const statusMeta = STATUS_META[p.status as ProposalStatus];
                  const TypeIcon = typeMeta.icon;
                  const StatusIcon = statusMeta.icon;
                  const expanded = expandedId === p.id;
                  const isPending = p.status === "PENDING";
                  const isApproving = approvingId === p.id;

                  return (
                    <div key={p.id} className="rounded-[14px] overflow-hidden"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
                      {/* Card header */}
                      <div className="flex items-start gap-3 p-4">
                        <div className="h-9 w-9 rounded-[10px] flex items-center justify-center shrink-0 mt-0.5"
                          style={{ background: typeMeta.bg }}>
                          <TypeIcon className="h-4.5 w-4.5" style={{ color: typeMeta.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: typeMeta.bg, color: typeMeta.color }}>
                              {typeMeta.label}
                            </span>
                            {p.objective && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{ background: OBJ_TYPE_LABELS[p.objective.type as ObjType]?.bg, color: OBJ_TYPE_LABELS[p.objective.type as ObjType]?.color }}>
                                {p.objective.title}
                              </span>
                            )}
                            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ml-auto"
                              style={{ background: statusMeta.bg, color: statusMeta.color }}>
                              <StatusIcon className={`h-3 w-3 ${p.status === "IN_PROGRESS" ? "animate-spin" : ""}`} />
                              {statusMeta.label}
                            </span>
                          </div>
                          <p className="text-[13.5px] font-semibold leading-snug" style={{ color: "var(--fg)" }}>{p.title}</p>
                          <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: "var(--fg-mute)" }}>{p.description}</p>
                        </div>
                      </div>

                      {/* Agent reason */}
                      {p.agentReason && (
                        <div className="mx-4 mb-3 px-3 py-2 rounded-[8px] flex items-start gap-2"
                          style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                          <Bot className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "var(--emerald-fg)" }} />
                          <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>{p.agentReason}</p>
                        </div>
                      )}

                      {/* Expandable detail */}
                      {(p.result ?? p.userFeedback) && (
                        <div className="mx-4 mb-3">
                          <button onClick={() => setExpandedId(expanded ? null : p.id)}
                            className="flex items-center gap-1.5 text-[11px] font-semibold"
                            style={{ color: "var(--fg-mute)" }}>
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                            {expanded ? "Masquer" : "Voir le résultat"}
                          </button>
                          {expanded && (
                            <div className="mt-2 px-3 py-2.5 rounded-[8px] text-[11.5px] leading-relaxed space-y-1"
                              style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                              {p.result && Object.entries(p.result).map(([k, v]) => (
                                <p key={k}><span className="font-semibold" style={{ color: "var(--fg)" }}>{k}:</span> {String(v)}</p>
                              ))}
                              {p.userFeedback && (
                                <p><span className="font-semibold" style={{ color: "var(--fg)" }}>Feedback:</span> {p.userFeedback}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Credits + actions */}
                      <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--line)" }}>
                        {p.creditsEst > 0 && (
                          <span className="text-[10.5px] font-mono px-2 py-1 rounded"
                            style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}>
                            ~{p.creditsEst} cr
                          </span>
                        )}
                        <span className="text-[10.5px] ml-auto" style={{ color: "var(--fg-mute)" }}>
                          {new Date(p.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {isPending && (
                          <>
                            <button
                              onClick={() => setRejectId(p.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-semibold"
                              style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                              <X className="h-3.5 w-3.5" /> Rejeter
                            </button>
                            <button
                              onClick={() => approve(p.id)}
                              disabled={isApproving}
                              className="flex items-center gap-1.5 px-4 py-1.5 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110 disabled:opacity-60"
                              style={{ background: "var(--emerald-fg)", color: "white" }}>
                              {isApproving
                                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lancement…</>
                                : <><Check className="h-3.5 w-3.5" /> Valider et lancer</>
                              }
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>

      {showObjModal && (
        <ObjectiveModal
          onClose={() => setShowObjModal(false)}
          onSaved={() => { setShowObjModal(false); void reload(); }}
        />
      )}
      {rejectId && (
        <RejectModal
          proposalId={rejectId}
          onClose={() => setRejectId(null)}
          onDone={() => { setRejectId(null); void reload(); }}
        />
      )}
    </>
  );
}
