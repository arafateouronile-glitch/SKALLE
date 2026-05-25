"use client";

import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  Zap,
  Search,
  Mail,
  TrendingUp,
  Target,
  Send,
  AlertCircle,
  Brain,
  CheckCircle2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SalesDashboardClientProps {
  firstName: string;
  plan: string;
  kpis: {
    total: number;
    newThisWeek: number;
    contacted: number;
    replied: number;
    converted: number;
    activeSequences: number;
  };
  isAutopilotActive: boolean;
  csoPendingCount: number;
}

// ─── Mock data (à brancher Prisma) ───────────────────────────────────────────

const MOCK_HOT_LEADS = [
  {
    id: 1, name: "Sarah Nguyen", role: "Head of Growth", co: "Skyward SaaS",
    score: 95, source: "Signals · recrute Sales Mgr × 3",
    insight: "Series A signée · scale agressif en cours · cherche outil pour industrialiser l'outbound.",
    hook: "\"Sarah, j'ai vu que Skyward recrute 3 SDR. Plutôt que d'embaucher, on aide à faire le travail de 3 SDR avec 1 personne — 15min ?\"",
    initials: "SN", color: "rose",
  },
  {
    id: 2, name: "Marc Tessier", role: "VP Sales", co: "Vega Capital",
    score: 92, source: "LinkedIn · a liké votre post",
    insight: "VP Sales chez VC tier-1 · 1 200 connexions communes · engagement chaud (3 likes en 7j).",
    hook: "\"Marc, sympa de voir vos likes sur les posts AI Sales. Vous testez quoi en interne côté outbound ?\"",
    initials: "MT", color: "violet",
  },
  {
    id: 3, name: "Anaïs Dupont", role: "CMO", co: "Helix BioTech",
    score: 91, source: "Signals · levée €4.2M + recrute CMO ext.",
    insight: "Series A · phase d'expansion · son profil match exactement notre meilleur cohort clients.",
    hook: "\"Anaïs, félicitations pour la levée. Helix prévoit de muscler son outbound 'side' ?\"",
    initials: "AD", color: "emerald",
  },
];

const MOCK_REPLIES = [
  { name: "Émilie Blanc", co: "Pixel Forge", intent: "INTÉRESSÉE", color: "emerald", snippet: "Oui, ça m'intéresse — 15min cette semaine ?", time: "12min" },
  { name: "Thomas Vidal", co: "Stellar SaaS", intent: "REFUS POLI", color: "amber", snippet: "Pas pour l'instant, déjà un outil. Merci !", time: "1h" },
  { name: "Hugo Charpentier", co: "Drift Studio", intent: "OBJECTION", color: "violet", snippet: "Comment vous différenciez de Hubspot ?", time: "2h" },
  { name: "Léa Martin", co: "Lumen Coffee", intent: "PAS MAINTENANT", color: "amber", snippet: "Recontactez-moi en septembre svp", time: "hier" },
];

const MOCK_AGENTS = [
  { name: "Hunter", task: "Scan Signals — 142/200 entreprises", status: "thinking" },
  { name: "Scorer", task: "Re-score 1 248 prospects", status: "active" },
  { name: "Outreach", task: "Compose 24 messages perso.", status: "thinking" },
  { name: "Replier", task: "Analyse 5 réponses entrantes", status: "active" },
  { name: "Closer", task: "Suggère 8 relances", status: "active" },
];

const MOCK_SIGNALS = [
  { time: "8 min", text: "Helix BioTech recrute un CMO externe (signal d'achat)", sev: "high" },
  { time: "32 min", text: "Email Q2 envoyé à 84 leads — 64% d'ouverture", sev: "good" },
  { time: "1 h", text: "Skyward vient de lever en Series A", sev: "high" },
  { time: "2 h", text: "8 nouvelles entreprises créées dans votre secteur", sev: "info" },
];

const QUICK_ACTIONS = [
  { title: "Hunt", desc: "Trouver des leads", href: "/sales-os/hunt", icon: Search, accent: "violet" as const },
  { title: "Séquence", desc: "Lancer une campagne", href: "/sales-os/outreach", icon: Zap, accent: "amber" as const },
  { title: "Magic DM", desc: "Message personnalisé IA", href: "/sales-os/leads", icon: Send, accent: "violet" as const },
  { title: "Analyser", desc: "Insights pipeline", href: "/sales-os/insights", icon: TrendingUp, accent: "emerald" as const },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────────────

export function CSODashboardClientV2({
  firstName,
  plan,
  kpis,
  isAutopilotActive,
  csoPendingCount,
}: SalesDashboardClientProps) {
  const replyRate = kpis.contacted > 0 ? Math.round((kpis.replied / kpis.contacted) * 100) : 0;

  return (
    <>
      <AppTopBar
        title="Sales Brief"
        breadcrumb="sales-os / dashboard"
        subtitle={isAutopilotActive ? "Autopilot ON" : "Autopilot OFF"}
        accent="violet"
        cta="Actionner les 12 HOT →"
      />

      <div className="p-6 space-y-5 max-w-[1400px]">

        {/* ── Hero Sales Brief ── */}
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
            style={{ background: "radial-gradient(circle, var(--violet-soft), transparent 60%)", filter: "blur(40px)" }}
          />
          <div className="relative grid grid-cols-12 gap-8">
            {/* Left */}
            <div className="col-span-12 lg:col-span-7 space-y-5">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] mb-3" style={{ color: "var(--fg-mute)" }}>
                  <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--violet-fg)" }} />
                  Sales Brief
                </div>
                <h1 className="font-display text-[38px] leading-[1.08] font-semibold" style={{ color: "var(--fg)" }}>
                  Bonjour <span style={{ color: "var(--violet-fg)" }}>{firstName}</span>.<br />
                  <span style={{ color: "var(--fg-dim)" }}>Votre chasseur a trouvé </span>
                  <span className="tabular-nums" style={{ color: "var(--danger-fg)" }}>12 leads HOT</span>
                  <span style={{ color: "var(--fg-dim)" }}> cette nuit.</span>
                </h1>
                <p className="mt-4 text-[15px] leading-relaxed max-w-xl" style={{ color: "var(--fg-dim)" }}>
                  <strong style={{ color: "var(--fg)" }}>{kpis.total} prospects</strong> dans votre pipeline,{" "}
                  <strong style={{ color: "var(--fg)" }}>{kpis.newThisWeek} nouveaux</strong> cette semaine.{" "}
                  {kpis.activeSequences > 0 && (
                    <><strong style={{ color: "var(--fg)" }}>{kpis.activeSequences} séquences</strong> actives en cours.</>
                  )}
                </p>
              </div>

              {csoPendingCount > 0 && (
                <div
                  className="flex items-center gap-2 px-4 py-3 rounded-[10px] text-[13px]"
                  style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-line)", color: "var(--amber-fg)" }}
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {csoPendingCount} décision{csoPendingCount !== 1 ? "s" : ""} CSO Agent en attente — vérifiez l'onglet Leads.
                </div>
              )}

              <div className="flex items-center gap-3">
                <Link
                  href="/sales-os/leads"
                  className="px-5 py-2.5 rounded-lg font-semibold text-[13px] transition-all hover:brightness-110"
                  style={{ background: "var(--danger-fg)", color: "white" }}
                >
                  Actionner les 12 HOT →
                </Link>
                <Link
                  href="/sales-os/hunt"
                  className="px-5 py-2.5 rounded-lg font-medium text-[13px] transition-all hover:bg-black/[0.04]"
                  style={{ background: "oklch(0.21 0.03 260 / 0.04)", border: "1px solid var(--line-strong)", color: "var(--fg)" }}
                >
                  Lancer un scan
                </Link>
              </div>
            </div>

            {/* Right — Funnel pyramid */}
            <div className="col-span-12 lg:col-span-5">
              <div
                className="rounded-[14px] p-5 h-full"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
              >
                <p className="text-[11px] font-mono uppercase tracking-[0.18em] mb-4" style={{ color: "var(--fg-mute)" }}>
                  Pipeline Funnel
                </p>
                <div className="space-y-2">
                  {[
                    { label: "Nouveaux", value: Math.max(0, kpis.total - kpis.contacted - kpis.replied - kpis.converted), color: "violet" },
                    { label: "Contactés", value: kpis.contacted, color: "violet" },
                    { label: "En discussion", value: kpis.replied, color: "amber" },
                    { label: "Convertis", value: kpis.converted, color: "emerald" },
                  ].map((stage) => {
                    const pct = kpis.total > 0 ? Math.round((stage.value / kpis.total) * 100) : 0;
                    return (
                      <div key={stage.label}>
                        <div className="flex items-center justify-between mb-1 text-[12px]">
                          <span style={{ color: "var(--fg-dim)" }}>{stage.label}</span>
                          <span className="font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{stage.value}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--line-strong)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: `var(--${stage.color}-fg)` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 pt-3 grid grid-cols-2 gap-3" style={{ borderTop: "1px solid var(--line)" }}>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>Total</p>
                    <p className="font-display text-[20px] font-bold tabular-nums" style={{ color: "var(--fg)" }}>{kpis.total}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>Taux réponse</p>
                    <p className="font-display text-[20px] font-bold tabular-nums" style={{ color: "var(--emerald-fg)" }}>{replyRate}%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── KPI Strip ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard label="Leads HOT" value="12" delta="+5 cette nuit" deltaPositive spark={[4,6,5,8,7,10,9,11,13,15,14,17]} accent="danger" />
          <KpiCard label="Pipeline ouvert" value="€612k" delta="+€84k" deltaPositive sub={`${kpis.total} opportunités`} spark={[180,210,200,240,265,280,310,340,360,380,420,460]} accent="violet" />
          <KpiCard label="Taux de réponse 7j" value={`${replyRate}%`} delta="+2.1pts" deltaPositive sub="vs. semaine préc." spark={[9,10,9.5,11,12,11.5,12.4]} accent="emerald" />
          <KpiCard label="Deals gagnés MTD" value={String(kpis.converted)} delta="€42k MRR" deltaPositive sub="objectif mensuel 12" spark={[1,1,2,2,3,4,5,5,6,7,kpis.converted]} accent="emerald" />
        </div>

        {/* ── Main grid ── */}
        <div className="grid grid-cols-12 gap-5">

          {/* Left — Hot Leads (8 cols) */}
          <div className="col-span-12 lg:col-span-8 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em]" style={{ color: "var(--fg-mute)" }}>
                  <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--danger-fg)" }} />
                  Leads HOT · à actionner
                </div>
                <h2 className="font-display text-[22px] font-semibold mt-1" style={{ color: "var(--fg)" }}>Tableau de chasse</h2>
              </div>
              <Link
                href="/sales-os/leads"
                className="text-[11.5px] font-medium px-3 py-1.5 rounded-md transition-all hover:brightness-[0.97]"
                style={{ background: "var(--violet-soft)", border: "1px solid var(--violet-line)", color: "var(--violet-fg)" }}
              >
                Voir tous les leads
              </Link>
            </div>

            <div className="space-y-3">
              {MOCK_HOT_LEADS.map((lead) => (
                <div
                  key={lead.id}
                  className="rounded-[14px] p-5 transition-all hover:-translate-y-0.5"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
                >
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
                      style={{ background: `var(--${lead.color}-soft)`, color: `var(--${lead.color}-fg)`, border: `1px solid var(--${lead.color}-line)` }}
                    >
                      {lead.initials}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-[14px]" style={{ color: "var(--fg)" }}>{lead.name}</p>
                        <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>{lead.role} · {lead.co}</span>
                        <span
                          className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: "var(--danger-soft)", color: "var(--danger-fg)", border: "1px solid var(--danger-line)" }}
                        >
                          {lead.score} HOT
                        </span>
                      </div>
                      <p className="text-[11px] mb-2" style={{ color: "var(--fg-mute)" }}>{lead.source}</p>
                      <p className="text-[12.5px] leading-relaxed mb-3" style={{ color: "var(--fg-dim)" }}>{lead.insight}</p>

                      {/* Magic DM */}
                      <div
                        className="rounded-[10px] p-3 mb-3"
                        style={{ background: "var(--bg)", border: "1px dashed var(--violet-line)" }}
                      >
                        <p className="text-[11px] font-mono mb-1.5" style={{ color: "var(--violet-fg)" }}>✦ Magic DM</p>
                        <p className="text-[12px] leading-relaxed italic" style={{ color: "var(--fg-dim)" }}>{lead.hook}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          href="/sales-os/outreach"
                          className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md transition-all hover:brightness-110"
                          style={{ background: "var(--violet-fg)", color: "white" }}
                        >
                          <Send className="h-3.5 w-3.5" />
                          ✦ Envoyer le DM
                        </Link>
                        <Link
                          href="/sales-os/leads"
                          className="text-[12px] font-medium px-3 py-1.5 rounded-md transition-all hover:bg-black/[0.04]"
                          style={{ background: "oklch(0.21 0.03 260 / 0.04)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
                        >
                          Voir profil
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Inbox + Agents + Signals (4 cols) */}
          <div className="col-span-12 lg:col-span-4 space-y-4">

            {/* Inbox réponses */}
            <div
              className="rounded-[18px] p-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="font-display font-semibold text-[15px]" style={{ color: "var(--fg)" }}>Inbox réponses</p>
                <Link href="/sales-os/outreach" className="text-[11px] font-mono" style={{ color: "var(--violet-fg)" }}>
                  Voir tout →
                </Link>
              </div>
              <div className="space-y-3">
                {MOCK_REPLIES.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 py-1.5" style={{ borderBottom: i < MOCK_REPLIES.length - 1 ? "1px solid var(--line)" : "none" }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-[12.5px] font-medium truncate" style={{ color: "var(--fg)" }}>{r.name}</p>
                        <span
                          className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: `var(--${r.color}-soft)`, color: `var(--${r.color}-fg)` }}
                        >
                          {r.intent}
                        </span>
                      </div>
                      <p className="text-[11.5px] truncate" style={{ color: "var(--fg-mute)" }}>{r.snippet}</p>
                    </div>
                    <span className="text-[10px] font-mono shrink-0 mt-0.5" style={{ color: "var(--fg-mute)" }}>{r.time}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sales Squad */}
            <div
              className="rounded-[18px] p-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="font-display font-semibold text-[15px]" style={{ color: "var(--fg)" }}>Sales Squad</p>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--emerald-fg)" }} />
                  <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>3 actifs</span>
                </div>
              </div>
              <div className="space-y-2">
                {MOCK_AGENTS.map((a) => (
                  <div key={a.name} className="flex items-center gap-3 py-1">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: agentStatusDot(a.status) }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium" style={{ color: "var(--fg)" }}>{a.name}</p>
                      <p className="text-[11px] truncate" style={{ color: "var(--fg-mute)" }}>{a.task}</p>
                    </div>
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
                <p className="font-display font-semibold text-[15px]" style={{ color: "var(--fg)" }}>Signaux</p>
                <span className="text-[10px] font-mono" style={{ color: "var(--fg-mute)" }}>live</span>
              </div>
              <div className="space-y-3">
                {MOCK_SIGNALS.map((s, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="h-1.5 w-1.5 rounded-full mt-1.5 shrink-0" style={{ background: signalStyle(s.sev) }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] leading-snug" style={{ color: "var(--fg-dim)" }}>{s.text}</p>
                    </div>
                    <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--fg-mute)" }}>{s.time}</span>
                  </div>
                ))}
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
                    <action.icon className="h-4 w-4" />
                  </div>
                  <p className="font-semibold text-[13.5px] mb-0.5" style={{ color: "var(--fg)" }}>{action.title}</p>
                  <p className="text-[12px]" style={{ color: "var(--fg-mute)" }}>{action.desc}</p>
                  <div
                    className="mt-3 text-[12px] font-mono flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all"
                    style={{ color: `var(--${action.accent}-fg)` }}
                  >
                    Ouvrir →
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
