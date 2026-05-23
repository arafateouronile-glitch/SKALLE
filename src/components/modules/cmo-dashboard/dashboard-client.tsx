"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:         "oklch(0.14 0.018 260)",
  bgElev:     "oklch(0.165 0.018 260)",
  bgCard:     "oklch(0.185 0.02 260)",
  line:       "oklch(0.98 0.01 260 / 0.07)",
  lineStrong: "oklch(0.98 0.01 260 / 0.12)",
  fg:         "oklch(0.97 0.005 260)",
  fgDim:      "oklch(0.72 0.02 260)",
  fgMute:     "oklch(0.55 0.02 260)",
  emerald:    "oklch(0.74 0.17 158)",
  emeraldSoft:"oklch(0.74 0.17 158 / 0.14)",
  emeraldLine:"oklch(0.74 0.17 158 / 0.35)",
  violet:     "oklch(0.70 0.18 295)",
  violetSoft: "oklch(0.70 0.18 295 / 0.14)",
  violetLine: "oklch(0.70 0.18 295 / 0.35)",
  amber:      "oklch(0.78 0.16 75)",
  amberSoft:  "oklch(0.78 0.16 75 / 0.14)",
  amberLine:  "oklch(0.78 0.16 75 / 0.35)",
  danger:     "oklch(0.68 0.22 22)",
};

type AccentKey = "emerald" | "violet" | "amber";

const ACCENT: Record<AccentKey, { fg: string; soft: string; line: string }> = {
  emerald: { fg: C.emerald, soft: C.emeraldSoft, line: C.emeraldLine },
  violet:  { fg: C.violet,  soft: C.violetSoft,  line: C.violetLine  },
  amber:   { fg: C.amber,   soft: C.amberSoft,   line: C.amberLine   },
};

// ─── Static mock data (visual scaffold — real data injected via props) ────────

const MOCK_KPIS = [
  { key: "rev",  label: "Revenu attribué (30j)", value: "€184 320", delta: "+23.4%", deltaPos: true,  sub: "vs. période précédente",  spark: [12,18,14,22,26,24,32,30,38,42,48,56], accent: "emerald" as AccentKey },
  { key: "pipe", label: "Pipeline généré",        value: "€612k",   delta: "+41 leads",  deltaPos: true,  sub: "342 prospects qualifiés", spark: [8,14,12,18,22,20,28,32,36,34,44,52],  accent: "violet"  as AccentKey },
  { key: "cac",  label: "CAC blended",            value: "€87",     delta: "−12%",       deltaPos: true,  sub: "objectif €95",            spark: [60,56,58,52,50,48,46,44,42,40,38,38], accent: "amber"   as AccentKey },
  { key: "roas", label: "ROAS Superscale",        value: "4.8×",    delta: "+0.6",       deltaPos: true,  sub: "ads actives 12",          spark: [22,26,24,28,32,30,34,38,36,40,44,48], accent: "emerald" as AccentKey },
];

const MOCK_AGENTS = [
  { name: "SEO Sentinel",    status: "thinking", task: "Audit sémantique — 47/120 pages",    accent: "emerald" as AccentKey, icon: "📡" },
  { name: "Ads Optimizer",   status: "active",   task: "Bid pacing Meta + Google",           accent: "violet"  as AccentKey, icon: "⚡" },
  { name: "Content Factory", status: "idle",     task: "En attente de brief",                accent: "amber"   as AccentKey, icon: "✦" },
  { name: "Lead Scorer",     status: "active",   task: "Re-score 1 248 prospects",           accent: "emerald" as AccentKey, icon: "◎" },
  { name: "Outreach Agent",  status: "thinking", task: "Compose 24 messages perso.",         accent: "violet"  as AccentKey, icon: "✉" },
  { name: "Brand Watcher",   status: "active",   task: "Veille mentions × 14 sources",      accent: "emerald" as AccentKey, icon: "◐" },
];

const MOCK_SIGNALS = [
  { time: "2 min",  text: "Concurrent Hubspot a lancé une campagne sur vos kw stratégiques", sev: "high" },
  { time: "14 min", text: "Pic d'engagement détecté sur LinkedIn — post \"AI for Marketing\"", sev: "info" },
  { time: "38 min", text: "47 nouveaux backlinks gagnés cette semaine (+18%)",                sev: "good" },
  { time: "1 h",    text: "Drop de trafic organique sur 3 pages produit — investigation en cours", sev: "warn" },
  { time: "2 h",    text: "Email \"Q2 Pricing\" — taux d'ouverture 64% (top 5%)",              sev: "good" },
];

const MOCK_CHANNELS = [
  { name: "Organic Search",   value: 42, revenue: "€77.4k", accent: "emerald" as AccentKey },
  { name: "Paid Ads",         value: 28, revenue: "€51.6k", accent: "violet"  as AccentKey },
  { name: "Email",            value: 14, revenue: "€25.8k", accent: "amber"   as AccentKey },
  { name: "Social",           value: 9,  revenue: "€16.6k", accent: "emerald" as AccentKey },
  { name: "Direct/Référral",  value: 7,  revenue: "€12.9k", accent: "violet"  as AccentKey },
];

const QUICK_ACTIONS = [
  { title: "SEO Factory",      desc: "Génère du contenu SEO optimisé",     icon: "▤", href: "/marketing-os/seo-factory",      accent: "emerald" as AccentKey },
  { title: "Content Factory",  desc: "30 posts sociaux en un clic",         icon: "✶", href: "/marketing-os/social/factory",    accent: "violet"  as AccentKey },
  { title: "Concurrents",      desc: "Spy pubs & stratégies",               icon: "⌕", href: "/marketing-os/discovery",         accent: "amber"   as AccentKey },
  { title: "Prospection",      desc: "Séquences cold email & LinkedIn",      icon: "◎", href: "/marketing-os/prospection",       accent: "emerald" as AccentKey },
];

// ─── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({ data, accent = "emerald", height = 36 }: { data: number[]; accent?: AccentKey; height?: number }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const w = 120;
  const h = height;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / Math.max(1, max - min)) * h;
    return [x, y] as [number, number];
  });
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(" ");
  const fill = `${d} L${w},${h} L0,${h} Z`;
  const c = ACCENT[accent].fg;
  const gradId = `spark-${accent}-${Math.random().toString(36).slice(2, 7)}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity="0.45" />
          <stop offset="100%" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${gradId})`} />
      <path d={d} stroke={c} strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.5" fill={c} />
    </svg>
  );
}

// ─── PerformanceChart ─────────────────────────────────────────────────────────

function PerformanceChart({ postsByDay }: { postsByDay: Record<string, { total: number; published: number }> }) {
  const days = Object.keys(postsByDay).sort().slice(-30);

  const W = 400, H = 120;

  // Need at least 2 points to draw a meaningful path
  if (days.length < 2) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full opacity-20" style={{ height: 120 }}>
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke={C.emerald} strokeWidth="1.5" strokeDasharray="6 4" />
      </svg>
    );
  }

  const revenueData = days.map((_, i) => 40 + Math.sin(i * 0.4) * 20 + i * 2.5);
  const spendData   = days.map((_, i) => 18 + Math.cos(i * 0.3) * 8  + i * 0.8);

  const maxV = Math.max(...revenueData, ...spendData, 1);
  const pt = (arr: number[]) => arr.map((v, i) => {
    const x = (i / Math.max(arr.length - 1, 1)) * W;
    const y = H - (v / maxV) * (H - 8);
    return `${x},${y}`;
  });
  const revPts = pt(revenueData);
  const spdPts = pt(spendData);
  const revPath = revPts.map((p, i) => (i === 0 ? `M${p}` : `L${p}`)).join(" ");
  const spdPath = spdPts.map((p, i) => (i === 0 ? `M${p}` : `L${p}`)).join(" ");
  const firstRev = revPts[0];
  const lastRev  = revPts[revPts.length - 1];
  const revFill  = `${revPath} L${lastRev.split(",")[0]},${H} L${firstRev.split(",")[0]},${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 120 }}>
      <defs>
        <linearGradient id="rev-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={C.emerald} stopOpacity="0.3" />
          <stop offset="100%" stopColor={C.emerald} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={revFill} fill="url(#rev-grad)" />
      <path d={revPath} stroke={C.emerald} strokeWidth="2" fill="none" strokeLinejoin="round" />
      <path d={spdPath} stroke={C.violet}  strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeDasharray="4 3" />
    </svg>
  );
}

// ─── RadarPulse ──────────────────────────────────────────────────────────────

function RadarPulse({ accent = "emerald" }: { accent?: AccentKey }) {
  const c = ACCENT[accent].fg;
  return (
    <div className="relative flex items-center justify-center" style={{ width: 160, height: 160 }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 40 * i,
            height: 40 * i,
            border: `1px solid ${c}`,
            opacity: 0.15,
            animation: `radar-ring ${2.5 + i * 0.4}s linear infinite`,
            animationDelay: `${i * 0.6}s`,
          }}
        />
      ))}
      <div
        className="absolute rounded-full"
        style={{ width: 28, height: 28, background: ACCENT[accent].soft, border: `1px solid ${c}`, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <div className="rounded-full" style={{ width: 10, height: 10, background: c, boxShadow: `0 0 8px ${c}` }} />
      </div>
    </div>
  );
}

// ─── PulseDot ────────────────────────────────────────────────────────────────

function PulseDot({ accent = "emerald" }: { accent?: AccentKey }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{
        width: 6,
        height: 6,
        background: ACCENT[accent].fg,
        animation: "pulse-dot 1.8s ease-out infinite",
      }}
    />
  );
}

// ─── Map decision actionType → design fields ──────────────────────────────────

function mapDecision(d: AgentDecisionData, idx: number) {
  const priorities: ("P0" | "P1" | "P2")[] = ["P0", "P0", "P1", "P1", "P2"];
  const impacts: ("high" | "medium" | "low")[] = ["high", "high", "medium", "medium", "low"];
  const channels: Record<string, string> = {
    SEO_ARTICLE: "SEO", SEO_REGENERATE: "SEO", SOCIAL_POST: "Social",
    PROSPECT_DM: "Sales", DISCOVERY: "Intel", COMPETITOR_REACT: "Ads",
    BUDGET_REALLOC: "Ads",
  };
  const typeLabels: Record<string, string> = {
    SEO_ARTICLE: "SEO Quick-win", SEO_REGENERATE: "SEO Refresh",
    SOCIAL_POST: "Social Content", PROSPECT_DM: "Prospection",
    DISCOVERY: "Discovery", COMPETITOR_REACT: "Concurrents",
    BUDGET_REALLOC: "Budget Realloc",
  };

  return {
    id: d.id,
    priority: priorities[idx] ?? "P2",
    impact: (d.impact as string | null) ?? impacts[idx] ?? "low",
    type: typeLabels[d.actionType] ?? d.actionType,
    title: d.linkedPost?.title ?? d.reasoning.slice(0, 60),
    why: d.reasoning.slice(0, 120),
    channel: channels[d.actionType] ?? "IA",
    confidence: Math.min(99, 75 + (d.priority ?? 0) * 3 + Math.floor(Math.random() * 10)),
    status: d.status,
  };
}

// ─── DecisionCard ─────────────────────────────────────────────────────────────

function DecisionCard({
  decision, idx, workspaceId, onAction,
}: {
  decision: ReturnType<typeof mapDecision>;
  idx: number;
  workspaceId: string;
  onAction: (id: string, action: "approve" | "reject") => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"approve" | "reject" | null>(null);
  const priColor = decision.priority === "P0" ? C.danger : decision.priority === "P1" ? C.amber : C.fgMute;

  const handle = async (action: "approve" | "reject") => {
    setLoading(action);
    try {
      await fetch(`/api/agents/decisions/${decision.id}/${action}`, { method: "POST" });
      onAction(decision.id, action);
      router.refresh();
    } catch {
      /* noop */
    } finally {
      setLoading(null);
    }
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: `linear-gradient(180deg, oklch(0.185 0.02 260 / 0.85), oklch(0.165 0.02 260 / 0.85))`,
        border: `1px solid ${C.line}`,
        animationDelay: `${idx * 80}ms`,
      }}
    >
      {decision.priority === "P0" && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(90deg, ${C.danger}08, transparent 60%)` }} />
      )}
      <div className="p-4 relative">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded"
            style={{ background: `${priColor}20`, color: priColor, border: `1px solid ${priColor}40` }}
          >
            {decision.priority}
          </span>
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
            style={{ background: C.emeraldSoft, color: C.emerald, border: `1px solid ${C.emeraldLine}` }}
          >
            {decision.type}
          </span>
          <span className="ml-auto text-[11px] font-mono" style={{ color: C.fgMute }}>
            {decision.channel}
          </span>
        </div>

        <p className="text-[14px] font-semibold leading-snug mb-1.5" style={{ color: C.fg }}>
          {decision.title}
        </p>
        <p className="text-[12px] leading-relaxed line-clamp-2" style={{ color: C.fgDim }}>
          {decision.why}
        </p>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => handle("approve")}
            disabled={!!loading}
            className="text-[11.5px] font-semibold px-3 py-1.5 rounded-md transition-all disabled:opacity-50"
            style={{
              background: C.emerald,
              color: C.bg,
              border: `1px solid ${C.emerald}`,
            }}
          >
            {loading === "approve" ? "…" : "Approuver"}
          </button>
          <button
            onClick={() => handle("reject")}
            disabled={!!loading}
            className="text-[11.5px] font-medium px-3 py-1.5 rounded-md transition-all disabled:opacity-50"
            style={{
              background: "oklch(1 0 0 / 0.04)",
              color: C.fgDim,
              border: `1px solid ${C.line}`,
            }}
          >
            {loading === "reject" ? "…" : "Modifier"}
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="h-1.5 w-16 rounded-full overflow-hidden" style={{ background: "oklch(1 0 0 / 0.08)" }}>
              <div className="h-full rounded-full" style={{ width: `${decision.confidence}%`, background: C.emerald }} />
            </div>
            <span className="text-[10px] font-mono" style={{ color: C.fgMute }}>{decision.confidence}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AgentCard ───────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: typeof MOCK_AGENTS[0] }) {
  const c = ACCENT[agent.accent];
  const statusColor = agent.status === "thinking" ? C.violet : agent.status === "active" ? C.emerald : C.fgMute;
  const statusLabel = agent.status === "thinking" ? "Thinking" : agent.status === "active" ? "Active" : "Idle";

  return (
    <div
      className="p-3.5 rounded-2xl relative overflow-hidden"
      style={{
        background: "oklch(0.18 0.02 260 / 0.55)",
        border: `1px solid ${C.line}`,
      }}
    >
      {agent.status === "thinking" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent, ${C.violet}10, transparent)`,
            animation: "scan-line 2.4s ease-in-out infinite",
          }}
        />
      )}
      <div className="relative">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center text-[16px]"
            style={{ background: c.soft, border: `1px solid ${c.line}` }}
          >
            {agent.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-semibold truncate" style={{ color: C.fg }}>{agent.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="rounded-full" style={{ width: 5, height: 5, background: statusColor, animation: agent.status !== "idle" ? "pulse-dot 1.8s ease-out infinite" : "none" }} />
              <span className="text-[10px] font-mono" style={{ color: statusColor }}>{statusLabel}</span>
            </div>
          </div>
        </div>
        <p className="text-[11px] truncate" style={{ color: C.fgMute }}>{agent.task}</p>
      </div>
    </div>
  );
}

// ─── SignalRow ────────────────────────────────────────────────────────────────

function SignalRow({ signal }: { signal: typeof MOCK_SIGNALS[0] }) {
  const sevColor = signal.sev === "high" ? C.danger : signal.sev === "good" ? C.emerald : signal.sev === "warn" ? C.amber : C.violet;

  return (
    <div className="flex gap-3 py-2.5" style={{ borderBottom: `1px solid ${C.line}` }}>
      <div className="mt-1 shrink-0 rounded-full" style={{ width: 6, height: 6, background: sevColor }} />
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] leading-snug" style={{ color: C.fgDim }}>{signal.text}</p>
      </div>
      <span className="text-[10.5px] font-mono shrink-0 mt-0.5" style={{ color: C.fgMute }}>{signal.time}</span>
    </div>
  );
}

// ─── ChannelRow ───────────────────────────────────────────────────────────────

function ChannelRow({ ch }: { ch: typeof MOCK_CHANNELS[0] }) {
  const c = ACCENT[ch.accent];
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] w-32 shrink-0" style={{ color: C.fgDim }}>{ch.name}</span>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(1 0 0 / 0.06)" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${ch.value}%`, background: c.fg, transition: "width 1s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </div>
      <span className="text-[11px] font-mono w-8 text-right" style={{ color: C.fg }}>{ch.value}%</span>
      <span className="text-[11px] font-mono w-14 text-right" style={{ color: C.fgMute }}>{ch.revenue}</span>
    </div>
  );
}

// ─── KpiCard ─────────────────────────────────────────────────────────────────

function KpiCard({ kpi }: { kpi: typeof MOCK_KPIS[0] }) {
  const c = ACCENT[kpi.accent];
  return (
    <div
      className="p-5 rounded-2xl relative overflow-hidden flex flex-col"
      style={{
        background: `linear-gradient(180deg, oklch(0.185 0.02 260 / 0.85), oklch(0.165 0.02 260 / 0.85))`,
        border: `1px solid ${C.line}`,
        backdropFilter: "blur(14px)",
      }}
    >
      <p className="text-[11px] font-mono uppercase tracking-[0.16em] mb-1" style={{ color: C.fgMute }}>{kpi.label}</p>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-display text-[30px] font-bold tabular leading-none" style={{ color: C.fg, fontFamily: "var(--font-space-grotesk), system-ui" }}>
          {kpi.value}
        </span>
        <span
          className="text-[12px] font-semibold tabular px-1.5 py-0.5 rounded"
          style={{ background: kpi.deltaPos ? c.soft : "oklch(0.68 0.22 22 / 0.15)", color: kpi.deltaPos ? c.fg : C.danger, border: `1px solid ${kpi.deltaPos ? c.line : "oklch(0.68 0.22 22 / 0.3)"}` }}
        >
          {kpi.delta}
        </span>
      </div>
      <p className="text-[11.5px] mb-3" style={{ color: C.fgMute }}>{kpi.sub}</p>
      <div className="mt-auto">
        <Sparkline data={kpi.spark} accent={kpi.accent} height={36} />
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export function CMODashboardClient({
  firstName,
  plan,
  credits,
  creditsMax,
  todayDecisions,
  kpiPerf,
  isAutopilotActive,
  workspaceId,
}: DashboardClientProps) {
  const [decisions, setDecisions] = useState(
    todayDecisions.slice(0, 5).map((d, i) => mapDecision(d, i))
  );


  const handleDecisionAction = (id: string, _action: "approve" | "reject") => {
    setDecisions((prev) => prev.filter((d) => d.id !== id));
  };

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
  })();

  const dateStr = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const creditPct = creditsMax ? Math.min(100, Math.round((credits / creditsMax) * 100)) : 0;

  const executionRate = kpiPerf.totalDecisions > 0
    ? Math.round((kpiPerf.executedDecisions / kpiPerf.totalDecisions) * 100)
    : 0;

  // Build real KPIs from actual data, supplemented with design mock values
  const liveKpis = [
    { ...MOCK_KPIS[0], value: `${kpiPerf.agentCreatedPosts} posts`, label: "Contenus créés (30j)", delta: `${kpiPerf.executedDecisions} exécutés` },
    { ...MOCK_KPIS[1], value: String(kpiPerf.totalDecisions), label: "Décisions IA (30j)", delta: `${executionRate}% exec.` },
    { ...MOCK_KPIS[2] },
    { ...MOCK_KPIS[3] },
  ];

  return (
    <>
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { box-shadow: 0 0 0 0 oklch(0.74 0.17 158 / 0.6); }
          70% { box-shadow: 0 0 0 8px oklch(0.74 0.17 158 / 0); }
        }
        @keyframes scan-line {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(120%); }
        }
        @keyframes radar-ring {
          0% { transform: scale(0.4); opacity: 0.7; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .cmo-dash * { box-sizing: border-box; }
        .cmo-card {
          background: linear-gradient(180deg, oklch(0.185 0.02 260 / 0.85), oklch(0.165 0.02 260 / 0.85));
          border: 1px solid oklch(0.98 0.01 260 / 0.07);
          border-radius: 18px;
          backdrop-filter: blur(14px);
        }
        .cmo-card-soft {
          background: oklch(0.18 0.02 260 / 0.55);
          border: 1px solid oklch(0.98 0.01 260 / 0.07);
          border-radius: 14px;
        }
        .fade-in { animation: fade-up 0.5s ease-out both; }
        .font-display-sk { font-family: var(--font-space-grotesk), 'Space Grotesk', system-ui, sans-serif; letter-spacing: -0.02em; }
        .font-mono-sk { font-family: 'JetBrains Mono', ui-monospace, monospace; }
      `}</style>

      <div
        className="cmo-dash"
        style={{
          color: C.fg,
          fontFamily: "var(--font-geist-sans), Inter, system-ui, sans-serif",
          letterSpacing: "-0.011em",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        {/* ── Hero / Morning Brief ── */}
        <div className="cmo-card relative overflow-hidden mb-5 fade-in">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: "linear-gradient(oklch(0.98 0.01 260 / 0.04) 1px, transparent 1px), linear-gradient(90deg, oklch(0.98 0.01 260 / 0.04) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
              opacity: 0.4,
            }}
          />
          <div
            className="absolute pointer-events-none"
            style={{ top: -160, right: -160, width: 384, height: 384, borderRadius: "50%", background: `radial-gradient(circle, ${C.emeraldSoft}, transparent 60%)`, filter: "blur(40px)" }}
          />

          <div className="relative p-8 grid gap-8" style={{ gridTemplateColumns: "1fr auto" }}>
            <div className="space-y-5">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-mono-sk uppercase mb-3" style={{ letterSpacing: "0.2em", color: C.fgMute }}>
                  <PulseDot />
                  Morning Brief · {dateStr}
                </div>
                <h1
                  className="font-display-sk font-semibold leading-tight mb-3"
                  style={{ fontSize: 44, lineHeight: 1.05 }}
                >
                  {greeting},{" "}
                  <span style={{ background: `linear-gradient(135deg, oklch(0.85 0.15 158), oklch(0.70 0.16 175))`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                    {firstName}
                  </span>
                  .<br />
                  <span style={{ color: C.fgDim }}>
                    Votre agent a travaillé{" "}
                    <span style={{ color: C.fg }}>7h21</span>{" "}
                    pendant que vous dormiez.
                  </span>
                </h1>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Décisions prêtes", value: decisions.length, accent: "emerald" as AccentKey },
                  { label: "Actions exécutées", value: kpiPerf.executedDecisions, accent: "violet" as AccentKey },
                  { label: "Contenus créés", value: kpiPerf.agentCreatedPosts, accent: "amber" as AccentKey },
                ].map((stat) => (
                  <div key={stat.label} className="cmo-card-soft p-3">
                    <p className="text-[10px] font-mono-sk uppercase mb-1" style={{ letterSpacing: "0.16em", color: C.fgMute }}>{stat.label}</p>
                    <p className="font-display-sk font-bold text-[26px] tabular" style={{ color: ACCENT[stat.accent].fg }}>
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href="/marketing-os/autopilot"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all hover:brightness-110"
                  style={{ background: C.emerald, color: C.bg }}
                >
                  ✦ Voir l&apos;Autopilot
                </Link>
                <Link
                  href="/marketing-os/analytics"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium"
                  style={{ background: "oklch(1 0 0 / 0.05)", border: `1px solid ${C.line}`, color: C.fgDim }}
                >
                  ↗ Analytics
                </Link>
                {!isAutopilotActive && (
                  <Link
                    href="/marketing-os/settings"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium"
                    style={{ background: C.violetSoft, border: `1px solid ${C.violetLine}`, color: C.violet }}
                  >
                    ✦ Activer l&apos;Autopilot
                  </Link>
                )}
              </div>
            </div>

            <div className="flex items-center justify-center">
              <RadarPulse accent="emerald" />
            </div>
          </div>
        </div>

        {/* ── KPI strip ── */}
        <div className="grid grid-cols-2 gap-4 mb-5 lg:grid-cols-4 fade-in" style={{ animationDelay: "60ms" }}>
          {liveKpis.map((kpi) => (
            <KpiCard key={kpi.key} kpi={kpi} />
          ))}
        </div>

        {/* ── Decisions + Chart ── */}
        <div className="grid gap-5 mb-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {/* Decisions brief */}
          <div className="cmo-card p-5 fade-in" style={{ animationDelay: "120ms" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="font-display-sk font-semibold text-[15px]" style={{ color: C.fg }}>Décisions IA</span>
                {decisions.length > 0 && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono-sk"
                    style={{ background: C.emeraldSoft, color: C.emerald, border: `1px solid ${C.emeraldLine}` }}
                  >
                    {decisions.length}
                  </span>
                )}
              </div>
              <Link href="/marketing-os/autopilot" className="text-[11px] font-medium" style={{ color: C.fgMute }}>
                Voir tout →
              </Link>
            </div>

            {decisions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="text-2xl mb-2">✦</div>
                <p className="text-[13px] font-medium" style={{ color: C.fgDim }}>Aucune décision en attente</p>
                <p className="text-[12px] mt-1" style={{ color: C.fgMute }}>L&apos;agent analysera vos données demain matin.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {decisions.map((d, i) => (
                  <DecisionCard
                    key={d.id}
                    decision={d}
                    idx={i}
                    workspaceId={workspaceId}
                    onAction={handleDecisionAction}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Performance chart */}
          <div className="cmo-card p-5 fade-in" style={{ animationDelay: "160ms" }}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-display-sk font-semibold text-[15px]" style={{ color: C.fg }}>Performance 30j</span>
              <div className="flex items-center gap-3 text-[11px] font-mono-sk" style={{ color: C.fgMute }}>
                <span className="flex items-center gap-1.5"><span style={{ display: "inline-block", width: 12, height: 2, background: C.emerald, borderRadius: 1 }} /> Revenu</span>
                <span className="flex items-center gap-1.5"><span style={{ display: "inline-block", width: 12, height: 2, background: C.violet, borderRadius: 1 }} /> Dépense</span>
              </div>
            </div>
            <PerformanceChart postsByDay={kpiPerf.postsByDay} />

            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { label: "Exécuté", value: kpiPerf.executedDecisions, accent: "emerald" as AccentKey },
                { label: "Approuvé", value: kpiPerf.approvedDecisions, accent: "violet"  as AccentKey },
                { label: "Rejeté",  value: kpiPerf.rejectedDecisions,  accent: "amber"   as AccentKey },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <p className="font-display-sk font-bold text-[22px] tabular" style={{ color: ACCENT[s.accent].fg }}>{s.value}</p>
                  <p className="text-[10px] font-mono-sk mt-0.5" style={{ color: C.fgMute }}>{s.label}</p>
                </div>
              ))}
            </div>

            {/* Credit bar */}
            <div className="mt-4 p-3 rounded-xl" style={{ background: "oklch(0.18 0.02 260 / 0.55)", border: `1px solid ${C.line}` }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px]" style={{ color: C.fgDim }}>Crédits IA</span>
                <span className="text-[11px] font-bold font-mono-sk" style={{ color: C.emerald }}>
                  {credits.toLocaleString("fr-FR")} / {creditsMax.toLocaleString("fr-FR")}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(1 0 0 / 0.08)" }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${creditPct}%`, background: creditPct > 80 ? C.amber : C.emerald }} />
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <PulseDot />
                <span className="text-[10px]" style={{ color: C.fgMute }}>Plan {plan}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Agents + Signals + Channels ── */}
        <div className="grid gap-5 mb-5" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          {/* Agent squad */}
          <div className="cmo-card p-5 fade-in" style={{ animationDelay: "200ms" }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="font-display-sk font-semibold text-[15px]" style={{ color: C.fg }}>Squad IA</span>
              <div className="flex items-center gap-1.5 ml-auto">
                <PulseDot />
                <span className="text-[11px]" style={{ color: C.fgMute }}>3 actifs</span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {MOCK_AGENTS.map((a) => <AgentCard key={a.name} agent={a} />)}
            </div>
          </div>

          {/* Signal feed */}
          <div className="cmo-card p-5 fade-in" style={{ animationDelay: "240ms" }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="font-display-sk font-semibold text-[15px]" style={{ color: C.fg }}>Signal Feed</span>
              <span className="text-[10px] font-mono-sk ml-auto" style={{ color: C.fgMute }}>live</span>
            </div>
            <div>
              {MOCK_SIGNALS.map((s, i) => <SignalRow key={i} signal={s} />)}
            </div>
          </div>

          {/* Channel attribution */}
          <div className="cmo-card p-5 fade-in" style={{ animationDelay: "280ms" }}>
            <div className="flex items-center gap-2 mb-4">
              <span className="font-display-sk font-semibold text-[15px]" style={{ color: C.fg }}>Attribution Canaux</span>
            </div>
            <div className="space-y-3">
              {MOCK_CHANNELS.map((ch) => <ChannelRow key={ch.name} ch={ch} />)}
            </div>
            <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
              <div className="flex justify-between text-[11px]">
                <span style={{ color: C.fgMute }}>Revenu total attribué</span>
                <span className="font-bold font-mono-sk" style={{ color: C.fg }}>€184 320</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div className="fade-in" style={{ animationDelay: "320ms" }}>
          <div className="flex items-center gap-3 mb-3">
            <span className="text-[10px] font-semibold uppercase font-mono-sk" style={{ letterSpacing: "0.18em", color: C.fgMute }}>
              Actions rapides
            </span>
            <div className="flex-1 h-px" style={{ background: C.line }} />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {QUICK_ACTIONS.map((action) => {
              const c = ACCENT[action.accent];
              return (
                <Link key={action.title} href={action.href}>
                  <div
                    className="group p-4 rounded-2xl transition-all cursor-pointer hover:translate-y-[-2px]"
                    style={{
                      background: "linear-gradient(180deg, oklch(0.185 0.02 260 / 0.85), oklch(0.165 0.02 260 / 0.85))",
                      border: `1px solid ${C.line}`,
                      backdropFilter: "blur(14px)",
                    }}
                  >
                    <div
                      className="h-9 w-9 rounded-xl flex items-center justify-center text-[18px] mb-3"
                      style={{ background: c.soft, border: `1px solid ${c.line}` }}
                    >
                      {action.icon}
                    </div>
                    <p className="font-semibold text-[13.5px] mb-0.5" style={{ color: C.fg }}>{action.title}</p>
                    <p className="text-[12px]" style={{ color: C.fgMute }}>{action.desc}</p>
                    <div className="mt-3 text-[12px] font-mono-sk flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all" style={{ color: c.fg }}>
                      Ouvrir <span className="translate-x-0 group-hover:translate-x-1 transition-transform inline-block">→</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
