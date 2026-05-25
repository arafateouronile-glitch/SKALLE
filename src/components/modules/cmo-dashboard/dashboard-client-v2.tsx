"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkline } from "@/components/ui/sparkline";
import { KpiCard } from "@/components/ui/kpi-card";
import { AppTopBar } from "@/components/modules/app-topbar";
import {
  CheckCircle2,
  XCircle,
  Edit3,
  Zap,
  FileText,
  Users,
  BarChart2,
  TrendingUp,
  AlertCircle,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentDecisionData {
  id: string;
  actionType: string;
  reasoning: string;
  priority: number;
  impact: string | null;
  status: string;
  linkedPost?: { id: string; type: string; title: string } | null;
}

interface KpiPerf {
  totalDecisions: number;
  executedDecisions: number;
  approvedDecisions: number;
  rejectedDecisions: number;
  agentCreatedPosts: number;
  postsByDay: Record<string, { total: number; published: number }>;
}

interface DashboardClientProps {
  firstName: string;
  plan: string;
  credits: number;
  creditsMax: number;
  todayDecisions: AgentDecisionData[];
  kpiPerf: KpiPerf;
  isAutopilotActive: boolean;
  hasAlerts: boolean;
  workspaceId: string;
}

// ─── Mock data for unrewired metrics (à brancher Prisma) ─────────────────────

const MOCK_AGENTS = [
  { name: "SEO Sentinel", status: "thinking", task: "Audit sémantique — 47/120 pages", color: "emerald" },
  { name: "Ads Optimizer", status: "active", task: "Bid pacing Meta + Google", color: "violet" },
  { name: "Content Factory", status: "idle", task: "En attente de brief", color: "amber" },
  { name: "Lead Scorer", status: "active", task: "Re-score 1 248 prospects", color: "emerald" },
  { name: "Brand Watcher", status: "thinking", task: "Veille mentions × 14 sources", color: "violet" },
];

const MOCK_SIGNALS = [
  { time: "2 min", text: "Hubspot a lancé une campagne sur vos mots-clés stratégiques", sev: "high" },
  { time: "14 min", text: "Pic d'engagement sur LinkedIn — post \"AI for Marketing\"", sev: "info" },
  { time: "38 min", text: "47 nouveaux backlinks gagnés cette semaine (+18%)", sev: "good" },
  { time: "1 h", text: "Drop de trafic organique sur 3 pages produit", sev: "warn" },
];

const MOCK_CHANNELS = [
  { name: "Organic Search", pct: 42, revenue: "€77.4k", color: "emerald" },
  { name: "Paid Ads", pct: 28, revenue: "€51.6k", color: "violet" },
  { name: "Email", pct: 14, revenue: "€25.8k", color: "amber" },
  { name: "Social", pct: 9, revenue: "€16.6k", color: "emerald" },
  { name: "Direct / Ref.", pct: 7, revenue: "€12.9k", color: "violet" },
];

const QUICK_ACTIONS = [
  { title: "Studio", desc: "Créer du contenu", href: "/marketing-os/studio", icon: <FileText className="h-4 w-4" />, accent: "emerald" as const },
  { title: "Spy", desc: "Analyser la concurrence", href: "/marketing-os/spy", icon: <BarChart2 className="h-4 w-4" />, accent: "violet" as const },
  { title: "Ads", desc: "Lancer une campagne", href: "/marketing-os/ads", icon: <Zap className="h-4 w-4" />, accent: "amber" as const },
  { title: "Leads", desc: "Prospecter", href: "/sales-os/leads", icon: <Users className="h-4 w-4" />, accent: "violet" as const },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACTION_LABEL: Record<string, string> = {
  SEO_ARTICLE: "Article SEO",
  SOCIAL_POST: "Post Social",
  AD_REMIX: "Remix Pub",
  PROSPECT_DM: "DM Prospect",
  DISCOVERY_SCAN: "Scan Concurrents",
  SEO_REGENERATE: "Regénérer SEO",
  COMPETITOR_REACT: "Réaction Concurrent",
};

const PRIORITY_LABEL: Record<number, string> = { 1: "P0", 2: "P1", 3: "P1", 4: "P2", 5: "P2" };

function priorityStyle(p: number) {
  if (p === 1) return { bg: "var(--danger-soft)", color: "var(--danger-fg)", border: "1px solid var(--danger-line)" };
  if (p <= 3) return { bg: "var(--amber-soft)", color: "var(--amber-fg)", border: "1px solid var(--amber-line)" };
  return { bg: "oklch(0.21 0.03 260 / 0.05)", color: "var(--fg-dim)", border: "1px solid var(--line)" };
}

function agentStatusDot(status: string) {
  if (status === "active") return "var(--emerald-fg)";
  if (status === "thinking") return "var(--amber-fg)";
  return "var(--fg-mute)";
}

function signalStyle(sev: string) {
  if (sev === "high") return "var(--danger-fg)";
  if (sev === "good") return "var(--emerald-fg)";
  if (sev === "warn") return "var(--amber-fg)";
  return "var(--fg-mute)";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DecisionCard({
  d,
  onAction,
}: {
  d: AgentDecisionData;
  onAction: (id: string, action: "approve" | "reject") => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const pStyle = priorityStyle(d.priority);

  const handle = async (action: "approve" | "reject") => {
    setLoading(action);
    try {
      await fetch(`/api/agents/decisions/${d.id}/${action}`, { method: "POST" });
      onAction(d.id, action);
      router.refresh();
    } finally {
      setLoading(null);
    }
  };

  return (
    <div
      className="rounded-[14px] p-4 transition-all"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--line)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div className="flex items-start gap-3">
        <span
          className="shrink-0 text-[10px] font-bold font-mono px-1.5 py-0.5 rounded mt-0.5"
          style={{ background: pStyle.bg, color: pStyle.color, border: pStyle.border }}
        >
          {PRIORITY_LABEL[d.priority] ?? "P2"}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-wider mb-1.5" style={{ color: "var(--fg-mute)" }}>
            <span>{ACTION_LABEL[d.actionType] ?? d.actionType}</span>
            {d.impact && <><span>·</span><span>{d.impact}</span></>}
          </div>
          <p className="text-[14px] font-semibold leading-snug" style={{ color: "var(--fg)" }}>
            {d.linkedPost?.title ?? d.reasoning.slice(0, 80)}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
            {d.reasoning.slice(0, 140)}{d.reasoning.length > 140 ? "…" : ""}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => handle("approve")}
              disabled={!!loading}
              className="flex items-center gap-1.5 text-[11.5px] font-semibold px-3 py-1.5 rounded-md transition-all hover:brightness-110 disabled:opacity-60"
              style={{ background: "var(--emerald-fg)", color: "white" }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {loading === "approve" ? "…" : "Approuver"}
            </button>
            <button
              disabled={!!loading}
              className="flex items-center gap-1.5 text-[11.5px] font-medium px-3 py-1.5 rounded-md transition-all disabled:opacity-60"
              style={{ background: "oklch(0.21 0.03 260 / 0.04)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
            >
              <Edit3 className="h-3.5 w-3.5" />
              Modifier
            </button>
            <button
              onClick={() => handle("reject")}
              disabled={!!loading}
              className="ml-auto flex items-center gap-1.5 text-[11.5px] font-medium px-3 py-1.5 rounded-md transition-all disabled:opacity-60"
              style={{ color: "var(--fg-mute)" }}
            >
              <XCircle className="h-3.5 w-3.5" />
              {loading === "reject" ? "…" : "Rejeter"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CMODashboardClientV2({
  firstName,
  plan,
  credits,
  creditsMax,
  todayDecisions,
  kpiPerf,
  isAutopilotActive,
  hasAlerts,
  workspaceId,
}: DashboardClientProps) {
  const [decisions, setDecisions] = useState(todayDecisions);
  const pendingDecisions = decisions.filter((d) => d.status === "PENDING");

  const handleAction = (id: string, _action: "approve" | "reject") => {
    setDecisions((prev) => prev.filter((d) => d.id !== id));
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon après-midi" : "Bonsoir";

  // Build sparkline data from postsByDay
  const days = Object.keys(kpiPerf.postsByDay).sort().slice(-12);
  const postsSpark = days.map((d) => kpiPerf.postsByDay[d]?.total ?? 0);
  const decisionsSpark = [
    kpiPerf.executedDecisions, kpiPerf.approvedDecisions,
    kpiPerf.totalDecisions * 0.4, kpiPerf.totalDecisions * 0.6,
    kpiPerf.executedDecisions, kpiPerf.approvedDecisions,
    kpiPerf.totalDecisions * 0.5, kpiPerf.executedDecisions * 0.8,
    kpiPerf.executedDecisions, kpiPerf.totalDecisions * 0.7,
    kpiPerf.approvedDecisions, kpiPerf.executedDecisions,
  ].map(Math.round);

  return (
    <>
      <AppTopBar
        title="Command Center"
        breadcrumb="marketing-os / dashboard"
        subtitle={isAutopilotActive ? "Autopilot ON" : "Autopilot OFF"}
        accent="emerald"
      />

      <div className="p-6 space-y-5 max-w-[1400px]">

        {/* ── Hero Morning Brief ── */}
        <section
          className="rounded-[18px] p-8 relative overflow-hidden"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--line)",
            boxShadow: "var(--card-shadow)",
          }}
        >
          <div
            className="absolute -top-32 -right-32 w-80 h-80 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, var(--emerald-soft), transparent 60%)", filter: "blur(40px)" }}
          />

          <div className="relative grid grid-cols-12 gap-8">
            {/* Left */}
            <div className="col-span-12 lg:col-span-7 space-y-5">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] mb-3" style={{ color: "var(--fg-mute)" }}>
                  <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--emerald-fg)" }} />
                  Morning Brief
                </div>
                <h1 className="font-display text-[38px] leading-[1.08] font-semibold" style={{ color: "var(--fg)" }}>
                  {greeting} <span style={{ color: "var(--emerald-fg)" }}>{firstName}</span>.<br />
                  <span style={{ color: "var(--fg-dim)" }}>Votre agent a traité </span>
                  <span className="tabular-nums">{kpiPerf.totalDecisions}</span>
                  <span style={{ color: "var(--fg-dim)" }}> décisions ce mois.</span>
                </h1>
                <p className="mt-4 text-[15px] leading-relaxed max-w-xl" style={{ color: "var(--fg-dim)" }}>
                  <strong style={{ color: "var(--fg)" }}>{pendingDecisions.length} décision{pendingDecisions.length !== 1 ? "s" : ""}</strong>{" "}
                  {pendingDecisions.length > 0 ? "sont prêtes à être validées" : "en attente aujourd'hui"}.{" "}
                  {kpiPerf.executedDecisions > 0 && (
                    <>
                      <strong style={{ color: "var(--fg)" }}>{kpiPerf.executedDecisions} exécutées</strong> sur les 30 derniers jours.
                    </>
                  )}
                </p>
              </div>

              {hasAlerts && (
                <div
                  className="flex items-center gap-2 px-4 py-3 rounded-[10px] text-[13px]"
                  style={{ background: "var(--danger-soft)", border: "1px solid var(--danger-line)", color: "var(--danger-fg)" }}
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Taux d'échec des décisions élevé — vérifiez la configuration des agents.
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  className="px-5 py-2.5 rounded-lg font-semibold text-[13px] transition-all hover:brightness-110"
                  style={{ background: "var(--emerald-fg)", color: "white" }}
                >
                  Examiner les {pendingDecisions.length} décisions →
                </button>
                <button
                  className="px-5 py-2.5 rounded-lg font-medium text-[13px] transition-all hover:bg-black/[0.04]"
                  style={{ background: "oklch(0.21 0.03 260 / 0.04)", border: "1px solid var(--line-strong)", color: "var(--fg)" }}
                >
                  Tout auto-valider
                </button>
                <span className="text-[11px] font-mono ml-1" style={{ color: "var(--fg-mute)" }}>
                  Confiance moy. {kpiPerf.totalDecisions > 0 ? Math.round((kpiPerf.executedDecisions / kpiPerf.totalDecisions) * 100) : 0}%
                </span>
              </div>
            </div>

            {/* Right — Agent radar */}
            <div className="col-span-12 lg:col-span-5">
              <div
                className="rounded-[14px] p-5 h-full relative overflow-hidden"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[11px] font-mono uppercase tracking-[0.18em]" style={{ color: "var(--fg-mute)" }}>Agent activity</p>
                    <p className="font-display text-[18px] font-semibold mt-1" style={{ color: "var(--fg)" }}>Live</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-mono" style={{ color: "var(--fg-mute)" }}>Posts générés</p>
                    <p className="font-display text-[22px] font-bold tabular-nums" style={{ color: "var(--emerald-fg)" }}>
                      {kpiPerf.agentCreatedPosts}
                    </p>
                  </div>
                </div>

                {/* Radar rings */}
                <div className="relative h-[140px] flex items-center justify-center my-2">
                  {[128, 96, 64].map((size, i) => (
                    <div
                      key={size}
                      className="absolute rounded-full"
                      style={{
                        width: size, height: size,
                        border: "1px solid var(--emerald-line)",
                        opacity: 0.4 + i * 0.15,
                      }}
                    />
                  ))}
                  <div
                    className="relative h-10 w-10 rounded-full flex items-center justify-center"
                    style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)", color: "var(--emerald-fg)" }}
                  >
                    <span className="font-mono text-[16px]">◉</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-3" style={{ borderTop: "1px solid var(--line)" }}>
                  {[
                    { label: "Total", value: kpiPerf.totalDecisions },
                    { label: "Exécutées", value: kpiPerf.executedDecisions, accent: true },
                    { label: "Posts IA", value: kpiPerf.agentCreatedPosts },
                  ].map((stat) => (
                    <div key={stat.label}>
                      <p className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>{stat.label}</p>
                      <p className="font-display text-[18px] font-bold tabular-nums" style={{ color: stat.accent ? "var(--emerald-fg)" : "var(--fg)" }}>
                        {stat.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── KPI Strip ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="Décisions (30j)"
            value={String(kpiPerf.totalDecisions)}
            delta={`+${kpiPerf.executedDecisions} exec.`}
            deltaPositive
            sub="Agent Brain actif"
            spark={decisionsSpark.length > 1 ? decisionsSpark : [4, 8, 6, 10, 12, 10, 14, 16, 14, 18, 20, 18]}
            accent="emerald"
          />
          <KpiCard
            label="Posts créés par IA"
            value={String(kpiPerf.agentCreatedPosts)}
            delta={`+${Math.round(kpiPerf.agentCreatedPosts * 0.23)} ce mois`}
            deltaPositive
            sub="Articles + Social"
            spark={postsSpark.length > 1 ? postsSpark : [2, 4, 3, 6, 8, 7, 10, 9, 12, 11, 14, 13]}
            accent="violet"
          />
          <KpiCard
            label="Taux d'approbation"
            value={kpiPerf.totalDecisions > 0 ? `${Math.round(((kpiPerf.approvedDecisions + kpiPerf.executedDecisions) / kpiPerf.totalDecisions) * 100)}%` : "—"}
            delta={kpiPerf.rejectedDecisions > 0 ? `${kpiPerf.rejectedDecisions} rejetées` : undefined}
            deltaPositive={false}
            sub="Sur 30 jours"
            spark={[60, 65, 70, 68, 75, 72, 78, 80, 77, 82, 85, 88]}
            accent="amber"
          />
          <KpiCard
            label="Crédits restants"
            value={credits.toLocaleString("fr-FR")}
            delta={`Plan ${plan}`}
            deltaPositive
            sub={`/ ${creditsMax.toLocaleString("fr-FR")} ce mois`}
            spark={[creditsMax, creditsMax * 0.9, creditsMax * 0.8, creditsMax * 0.75, creditsMax * 0.7, creditsMax * 0.65, creditsMax * 0.6, creditsMax * 0.55, creditsMax * 0.5, creditsMax * 0.45, creditsMax * 0.4, credits].map(Math.round)}
            accent="emerald"
          />
        </div>

        {/* ── Main content grid ── */}
        <div className="grid grid-cols-12 gap-5">

          {/* Left — Decisions Brief (7 cols) */}
          <div className="col-span-12 lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em]" style={{ color: "var(--fg-mute)" }}>
                  <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--emerald-fg)" }} />
                  Décisions IA · à valider
                </div>
                <h2 className="font-display text-[22px] font-semibold mt-1" style={{ color: "var(--fg)" }}>Le brief du jour</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="text-[11.5px] font-medium px-3 py-1.5 rounded-md"
                  style={{ background: "oklch(0.21 0.03 260 / 0.04)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
                >
                  Filtrer
                </button>
                <Link
                  href="/marketing-os/autopilot"
                  className="text-[11.5px] font-medium px-3 py-1.5 rounded-md transition-all hover:brightness-[0.97]"
                  style={{ background: "oklch(0.21 0.03 260 / 0.04)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
                >
                  Historique
                </Link>
              </div>
            </div>

            {pendingDecisions.length === 0 ? (
              <div
                className="rounded-[14px] p-8 text-center"
                style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}
              >
                <p className="text-[14px]" style={{ color: "var(--fg-mute)" }}>
                  Aucune décision en attente — l'agent a tout traité.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingDecisions.slice(0, 5).map((d) => (
                  <DecisionCard key={d.id} d={d} onAction={handleAction} />
                ))}
              </div>
            )}
          </div>

          {/* Right — Agents + Signals + Channels (5 cols) */}
          <div className="col-span-12 lg:col-span-5 space-y-4">

            {/* Agent squad */}
            <div
              className="rounded-[18px] p-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="font-display font-semibold text-[15px]" style={{ color: "var(--fg)" }}>Squad IA</p>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--emerald-fg)" }} />
                  <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>3 actifs</span>
                </div>
              </div>
              <div className="space-y-2">
                {MOCK_AGENTS.map((a) => (
                  <div key={a.name} className="flex items-center gap-3 py-1.5">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: agentStatusDot(a.status) }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-medium truncate" style={{ color: "var(--fg)" }}>{a.name}</p>
                      <p className="text-[11px] truncate" style={{ color: "var(--fg-mute)" }}>{a.task}</p>
                    </div>
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded capitalize shrink-0"
                      style={{
                        background: a.status === "idle" ? "oklch(0.21 0.03 260 / 0.04)" : `var(--${a.color}-soft)`,
                        color: a.status === "idle" ? "var(--fg-mute)" : `var(--${a.color}-fg)`,
                      }}
                    >
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Signal Feed */}
            <div
              className="rounded-[18px] p-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="font-display font-semibold text-[15px]" style={{ color: "var(--fg)" }}>Signal Feed</p>
                <span className="text-[10px] font-mono" style={{ color: "var(--fg-mute)" }}>live</span>
              </div>
              <div className="space-y-3">
                {MOCK_SIGNALS.map((s, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span
                      className="h-1.5 w-1.5 rounded-full mt-1.5 shrink-0"
                      style={{ background: signalStyle(s.sev) }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] leading-snug" style={{ color: "var(--fg-dim)" }}>{s.text}</p>
                    </div>
                    <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--fg-mute)" }}>{s.time}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Channel attribution */}
            <div
              className="rounded-[18px] p-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
            >
              <p className="font-display font-semibold text-[15px] mb-4" style={{ color: "var(--fg)" }}>Attribution Canaux</p>
              <div className="space-y-2.5">
                {MOCK_CHANNELS.map((ch) => (
                  <div key={ch.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>{ch.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono" style={{ color: "var(--fg-mute)" }}>{ch.pct}%</span>
                        <span className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{ch.revenue}</span>
                      </div>
                    </div>
                    <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--line-strong)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${ch.pct}%`, background: `var(--${ch.color}-fg)` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 flex items-center justify-between text-[11px]" style={{ borderTop: "1px solid var(--line)" }}>
                <span style={{ color: "var(--fg-mute)" }}>Revenu total attribué</span>
                <span className="font-bold tabular-nums" style={{ color: "var(--fg)" }}>€184 320</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] font-mono" style={{ color: "var(--fg-mute)" }}>
              Actions rapides
            </span>
            <div className="flex-1 h-px" style={{ background: "var(--line)" }} />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {QUICK_ACTIONS.map((action) => (
              <Link key={action.title} href={action.href}>
                <div
                  className="group p-4 rounded-[14px] transition-all hover:-translate-y-0.5 cursor-pointer"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
                >
                  <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center mb-3"
                    style={{ background: `var(--${action.accent}-soft)`, border: `1px solid var(--${action.accent}-line)`, color: `var(--${action.accent}-fg)` }}
                  >
                    {action.icon}
                  </div>
                  <p className="font-semibold text-[13.5px] mb-0.5" style={{ color: "var(--fg)" }}>{action.title}</p>
                  <p className="text-[12px]" style={{ color: "var(--fg-mute)" }}>{action.desc}</p>
                  <div
                    className="mt-3 text-[12px] font-mono flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all"
                    style={{ color: `var(--${action.accent}-fg)` }}
                  >
                    Ouvrir <TrendingUp className="h-3 w-3 translate-x-0 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
