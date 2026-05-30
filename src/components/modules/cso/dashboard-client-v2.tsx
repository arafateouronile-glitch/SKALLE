"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  Zap, Search, Mail, TrendingUp, Send, AlertCircle,
  Calendar, CheckCircle2, ExternalLink, Loader2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface HotLead {
  id: string;
  name: string;
  jobTitle: string | null;
  company: string;
  score: number;
  source: string | null;
  aiSummary: string | null;
  suggestedHook: string | null;
  temperature: string;
}

interface RecentReply {
  id: string;
  name: string;
  jobTitle: string | null;
  company: string;
  linkedInUrl: string | null;
  status: string;
  updatedAt: string;
  replyPreview: string | null;
  respondedAt: string | null;
}

interface RecentDecision {
  id: string;
  actionType: string;
  reasoning: string;
  status: string;
  priority: number;
  createdAt: string;
}

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
  hotLeads: HotLead[];
  recentReplies: RecentReply[];
  recentDecisions: RecentDecision[];
  calendarLink: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(" ").map((p) => p[0] ?? "").join("").toUpperCase().slice(0, 2);
}

function getLeadColor(score: number, temperature: string): string {
  if (temperature === "HOT" || score >= 85) return "rose";
  if (score >= 70) return "violet";
  return "emerald";
}

function getIntentBadge(status: string) {
  if (status === "MEETING_BOOKED") return { label: "RDV BOOKÉ", color: "emerald" };
  if (status === "CONVERTED") return { label: "CONVERTI", color: "emerald" };
  return { label: "A RÉPONDU", color: "violet" };
}

function timeAgo(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

const AGENT_NAMES: Record<string, string> = {
  CSO_LAUNCH_LINKEDIN: "Hunter",
  CSO_LAUNCH_EMAIL: "Outreach",
  CSO_FOLLOWUP: "Closer",
  CSO_STALE_REJECT: "Nettoyeur",
  PROSPECT_DM: "Prospector",
  SEO_ARTICLE: "Content",
  SOCIAL_POST: "Social",
  COMPETITOR_REACT: "Veille",
  SEO_REGENERATE: "SEO",
};

function agentStatusDot(status: string) {
  if (status === "EXECUTED") return "var(--emerald-fg)";
  if (status === "PENDING") return "var(--amber-fg)";
  return "var(--fg-mute)";
}

function signalSev(priority: number): string {
  return priority === 1 ? "high" : priority === 2 ? "warn" : "good";
}

function signalStyle(sev: string) {
  if (sev === "high") return "var(--danger-fg)";
  if (sev === "good") return "var(--emerald-fg)";
  if (sev === "warn") return "var(--amber-fg)";
  return "var(--fg-mute)";
}

const QUICK_ACTIONS = [
  { title: "Hunt", desc: "Trouver des leads", href: "/sales-os/hunt", icon: Search, accent: "violet" as const },
  { title: "Séquence", desc: "Lancer une campagne", href: "/sales-os/outreach", icon: Zap, accent: "amber" as const },
  { title: "Magic DM", desc: "Message personnalisé IA", href: "/sales-os/leads", icon: Send, accent: "violet" as const },
  { title: "Analyser", desc: "Insights pipeline", href: "/sales-os/insights", icon: TrendingUp, accent: "emerald" as const },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function CSODashboardClientV2({
  firstName,
  plan,
  kpis,
  isAutopilotActive,
  csoPendingCount,
  hotLeads,
  recentReplies,
  recentDecisions,
  calendarLink,
}: SalesDashboardClientProps) {
  const replyRate = kpis.contacted > 0 ? Math.round((kpis.replied / kpis.contacted) * 100) : 0;
  const hotCount = hotLeads.length;

  // Mark meeting state (optimistic)
  const [markedMeeting, setMarkedMeeting] = useState<Set<string>>(new Set());
  const [markingId, setMarkingId] = useState<string | null>(null);

  const markMeeting = useCallback(async (prospectId: string) => {
    setMarkingId(prospectId);
    try {
      await fetch("/api/cso-agent/mark-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId }),
      });
      setMarkedMeeting((prev) => new Set([...prev, prospectId]));
    } finally {
      setMarkingId(null);
    }
  }, []);

  return (
    <>
      <AppTopBar
        title="Sales Brief"
        breadcrumb="sales-os / dashboard"
        subtitle={isAutopilotActive ? "Autopilot ON" : "Autopilot OFF"}
        accent="violet"
        cta={hotCount > 0 ? `Actionner les ${hotCount} HOT →` : "Trouver des leads →"}
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
                  {hotCount > 0 ? (
                    <>
                      <span style={{ color: "var(--fg-dim)" }}>Votre chasseur a trouvé </span>
                      <span className="tabular-nums" style={{ color: "var(--danger-fg)" }}>{hotCount} leads HOT</span>
                      <span style={{ color: "var(--fg-dim)" }}> à actionner.</span>
                    </>
                  ) : (
                    <span style={{ color: "var(--fg-dim)" }}>Votre pipeline est prêt.</span>
                  )}
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
                  {hotCount > 0 ? `Actionner les ${hotCount} HOT →` : "Voir le pipeline →"}
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
          <KpiCard label="Leads HOT" value={String(hotCount)} delta={hotCount > 0 ? `${hotCount} à actionner` : "Aucun pour l'instant"} deltaPositive={hotCount > 0} spark={[4,6,5,8,7,10,9,11,13,15,14,hotCount]} accent="danger" />
          <KpiCard label="Pipeline total" value={String(kpis.total)} delta={`+${kpis.newThisWeek} cette semaine`} deltaPositive={kpis.newThisWeek > 0} sub={`${kpis.contacted} contactés`} spark={[10,15,20,25,30,35,kpis.total]} accent="violet" />
          <KpiCard label="Taux de réponse" value={`${replyRate}%`} delta={replyRate > 0 ? "vs pipeline" : "—"} deltaPositive={replyRate > 0} sub={`${kpis.replied} en discussion`} spark={[9,10,9.5,11,12,11.5,replyRate]} accent="emerald" />
          <KpiCard label="Deals gagnés MTD" value={String(kpis.converted)} delta={kpis.activeSequences > 0 ? `${kpis.activeSequences} séq. actives` : "—"} deltaPositive={kpis.converted > 0} sub="ce mois-ci" spark={[1,1,2,2,3,4,5,kpis.converted]} accent="emerald" />
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

            {hotLeads.length === 0 ? (
              <div
                className="rounded-[14px] p-8 text-center"
                style={{ background: "var(--bg-card)", border: "1px dashed var(--line)" }}
              >
                <p className="text-[14px] font-medium mb-2" style={{ color: "var(--fg-dim)" }}>Aucun lead HOT pour l'instant</p>
                <p className="text-[12px] mb-4" style={{ color: "var(--fg-mute)" }}>Lancez un scan dans Hunt pour trouver des prospects chauds.</p>
                <Link
                  href="/sales-os/hunt"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all hover:brightness-110"
                  style={{ background: "var(--violet-fg)", color: "white" }}
                >
                  <Search className="h-3.5 w-3.5" />
                  Lancer un scan Hunt
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {hotLeads.map((lead) => {
                  const color = getLeadColor(lead.score, lead.temperature);
                  return (
                    <div
                      key={lead.id}
                      className="rounded-[14px] p-5 transition-all hover:-translate-y-0.5"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className="h-10 w-10 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
                          style={{ background: `var(--${color}-soft)`, color: `var(--${color}-fg)`, border: `1px solid var(--${color}-line)` }}
                        >
                          {getInitials(lead.name)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-semibold text-[14px]" style={{ color: "var(--fg)" }}>{lead.name}</p>
                            <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
                              {lead.jobTitle ? `${lead.jobTitle} · ` : ""}{lead.company}
                            </span>
                            <span
                              className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: "var(--danger-soft)", color: "var(--danger-fg)", border: "1px solid var(--danger-line)" }}
                            >
                              {lead.score} HOT
                            </span>
                          </div>
                          {lead.source && (
                            <p className="text-[11px] mb-2" style={{ color: "var(--fg-mute)" }}>{lead.source}</p>
                          )}
                          {lead.aiSummary && (
                            <p className="text-[12.5px] leading-relaxed mb-3" style={{ color: "var(--fg-dim)" }}>{lead.aiSummary}</p>
                          )}

                          {lead.suggestedHook && (
                            <div
                              className="rounded-[10px] p-3 mb-3"
                              style={{ background: "var(--bg)", border: "1px dashed var(--violet-line)" }}
                            >
                              <p className="text-[11px] font-mono mb-1.5" style={{ color: "var(--violet-fg)" }}>✦ Magic DM</p>
                              <p className="text-[12px] leading-relaxed italic" style={{ color: "var(--fg-dim)" }}>{lead.suggestedHook}</p>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <Link
                              href={`/sales-os/reply-assistant?prospectId=${lead.id}`}
                              className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-md transition-all hover:brightness-110"
                              style={{ background: "var(--violet-fg)", color: "white" }}
                            >
                              <Send className="h-3.5 w-3.5" />
                              ✦ Envoyer le DM
                            </Link>
                            <Link
                              href={`/sales-os/leads`}
                              className="text-[12px] font-medium px-3 py-1.5 rounded-md transition-all hover:bg-black/[0.04]"
                              style={{ background: "oklch(0.21 0.03 260 / 0.04)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
                            >
                              Voir profil
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right — Inbox + Agents + Signals (4 cols) */}
          <div className="col-span-12 lg:col-span-4 space-y-4">

            {/* Inbox réponses — Hot conversations */}
            <div
              className="rounded-[18px] p-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-display font-semibold text-[15px]" style={{ color: "var(--fg)" }}>Prospects chauds</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-mute)" }}>Ils ont répondu — à toi de jouer</p>
                </div>
                {recentReplies.length > 0 && (
                  <span
                    className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: "var(--danger-soft)", color: "var(--danger-fg)" }}
                  >
                    {recentReplies.filter((r) => !markedMeeting.has(r.id) && r.status !== "MEETING_BOOKED").length} à traiter
                  </span>
                )}
              </div>
              {recentReplies.length === 0 ? (
                <div className="py-6 text-center">
                  <Mail className="h-6 w-6 mx-auto mb-2 opacity-20" style={{ color: "var(--fg-mute)" }} />
                  <p className="text-[12px]" style={{ color: "var(--fg-mute)" }}>Aucune réponse pour l'instant</p>
                  <p className="text-[11px] mt-1" style={{ color: "var(--fg-mute)" }}>L'extension détecte les réponses LinkedIn toutes les 12h.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentReplies.map((r, i) => {
                    const isMeetingBooked = markedMeeting.has(r.id) || r.status === "MEETING_BOOKED";
                    return (
                      <div
                        key={r.id}
                        className="rounded-[12px] p-3.5 space-y-2.5"
                        style={{
                          background: isMeetingBooked ? "var(--emerald-soft)" : "var(--bg)",
                          border: `1px solid ${isMeetingBooked ? "var(--emerald-line)" : "var(--line)"}`,
                          borderBottom: i < recentReplies.length - 1 ? undefined : "none",
                          opacity: isMeetingBooked ? 0.8 : 1,
                        }}
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>{r.name}</p>
                              <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
                                {r.jobTitle ? `${r.jobTitle} · ` : ""}{r.company}
                              </span>
                            </div>
                            {r.replyPreview && (
                              <p
                                className="text-[12px] mt-1 leading-relaxed italic"
                                style={{ color: "var(--fg-dim)" }}
                              >
                                "{r.replyPreview.slice(0, 120)}{r.replyPreview.length > 120 ? "…" : ""}"
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isMeetingBooked && (
                              <CheckCircle2 className="h-4 w-4" style={{ color: "var(--emerald-fg)" }} />
                            )}
                            <span className="text-[10px] font-mono" style={{ color: "var(--fg-mute)" }}>
                              {timeAgo(r.respondedAt ?? r.updatedAt)}
                            </span>
                          </div>
                        </div>

                        {/* CTAs */}
                        {!isMeetingBooked && (
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Envoyer Calendly */}
                            {calendarLink ? (
                              <a
                                href={r.linkedInUrl ?? "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`Ouvrir LinkedIn puis envoyer : ${calendarLink}`}
                                className="flex items-center gap-1.5 text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg transition-all hover:brightness-110"
                                style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)", color: "var(--emerald-fg)" }}
                              >
                                <Calendar className="h-3 w-3" />
                                Envoyer Calendly
                              </a>
                            ) : (
                              <Link
                                href="/sales-os/settings"
                                className="flex items-center gap-1.5 text-[11.5px] px-2.5 py-1.5 rounded-lg"
                                style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-mute)" }}
                              >
                                <Calendar className="h-3 w-3" />
                                Configurer Calendly
                              </Link>
                            )}

                            {/* Ouvrir LinkedIn */}
                            {r.linkedInUrl && (
                              <a
                                href={r.linkedInUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-[11.5px] font-medium px-2.5 py-1.5 rounded-lg transition-all hover:brightness-105"
                                style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
                              >
                                <ExternalLink className="h-3 w-3" />
                                LinkedIn
                              </a>
                            )}

                            {/* Marquer RDV */}
                            <button
                              onClick={() => markMeeting(r.id)}
                              disabled={markingId === r.id}
                              className="ml-auto flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg transition-all hover:brightness-105"
                              style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-mute)" }}
                            >
                              {markingId === r.id
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <CheckCircle2 className="h-3 w-3" />}
                              RDV booké
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Agent Activity */}
            <div
              className="rounded-[18px] p-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="font-display font-semibold text-[15px]" style={{ color: "var(--fg)" }}>Sales Squad</p>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--emerald-fg)" }} />
                  <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
                    {recentDecisions.filter((d) => d.status === "PENDING").length} en attente
                  </span>
                </div>
              </div>
              {recentDecisions.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-[12px]" style={{ color: "var(--fg-mute)" }}>L'agent n'a pas encore analysé votre pipeline.</p>
                  <Link href="/sales-os/agent" className="text-[11px] font-medium mt-1.5 inline-block" style={{ color: "var(--violet-fg)" }}>
                    Lancer une analyse →
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentDecisions.slice(0, 5).map((d) => (
                    <div key={d.id} className="flex items-center gap-3 py-1">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: agentStatusDot(d.status) }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium" style={{ color: "var(--fg)" }}>
                          {AGENT_NAMES[d.actionType] ?? d.actionType}
                        </p>
                        <p className="text-[11px] truncate" style={{ color: "var(--fg-mute)" }}>
                          {d.reasoning.slice(0, 55)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Signal Feed */}
            <div
              className="rounded-[18px] p-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="font-display font-semibold text-[15px]" style={{ color: "var(--fg)" }}>Activité Agent</p>
                <span className="text-[10px] font-mono" style={{ color: "var(--fg-mute)" }}>récent</span>
              </div>
              {recentDecisions.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-[12px]" style={{ color: "var(--fg-mute)" }}>Aucune activité récente</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentDecisions.slice(0, 4).map((d) => {
                    const sev = signalSev(d.priority);
                    return (
                      <div key={d.id} className="flex items-start gap-3">
                        <span className="h-1.5 w-1.5 rounded-full mt-1.5 shrink-0" style={{ background: signalStyle(sev) }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] leading-snug" style={{ color: "var(--fg-dim)" }}>
                            {d.reasoning.slice(0, 75)}
                          </p>
                        </div>
                        <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--fg-mute)" }}>
                          {timeAgo(d.createdAt)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
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
