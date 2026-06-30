"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  RadialBarChart, RadialBar, ResponsiveContainer, Tooltip,
} from "recharts";
import { AppTopBar } from "@/components/modules/app-topbar";
import {
  Search, Mail, Send, AlertCircle, Calendar,
  CheckCircle2, ExternalLink, Loader2, Sparkles, Copy, Check,
  ArrowUpRight, TrendingUp, Zap,
} from "lucide-react";

// ─── Palette — 3 couleurs max ─────────────────────────────────────────────────
// violet  : actions, pipeline, éléments interactifs
// emerald : succès, conversions
// danger  : urgences, leads HOT
// toute autre nuance = gris neutre

const C = {
  violet:    "var(--violet-fg)",
  violetSoft:"var(--violet-soft)",
  violetLine:"var(--violet-line)",
  emerald:   "var(--emerald-fg)",
  emeraldSoft:"var(--emerald-soft)",
  emeraldLine:"var(--emerald-line)",
  danger:    "var(--danger-fg)",
  dangerSoft:"var(--danger-soft)",
  dangerLine:"var(--danger-line)",
};

// Couleurs hex pour recharts (ne supporte pas les CSS vars)
const H = {
  violet1: "#EDE9FE",   // très léger — ring de fond
  violet2: "#A78BFA",   // médium
  violet3: "#6D28D9",   // profond
  emerald: "#059669",
  gray:    "#E5E7EB",
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface HotLead {
  id: string; name: string; jobTitle: string | null; company: string;
  score: number; source: string | null; aiSummary: string | null;
  suggestedHook: string | null; temperature: string;
}
interface RecentReply {
  id: string; name: string; jobTitle: string | null; company: string;
  linkedInUrl: string | null; status: string; updatedAt: string;
  replyPreview: string | null; respondedAt: string | null;
}
interface RecentDecision {
  id: string; actionType: string; reasoning: string;
  status: string; priority: number; createdAt: string;
}
interface Props {
  firstName: string; plan: string;
  kpis: { total: number; newThisWeek: number; contacted: number; replied: number; converted: number; activeSequences: number };
  isAutopilotActive: boolean; csoPendingCount: number;
  hotLeads: HotLead[]; recentReplies: RecentReply[];
  recentDecisions: RecentDecision[]; calendarLink: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const initials = (n: string) =>
  n.split(" ").map((p) => p[0] ?? "").join("").toUpperCase().slice(0, 2);

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}j`;
}

// Chaque action IA → violet (CRM) ou emerald (contenu)
function agentColor(type: string): string {
  if (["SEO_ARTICLE","SOCIAL_POST","SEO_REGENERATE"].includes(type)) return H.emerald;
  if (type === "CSO_STALE_REJECT") return "#9CA3AF";
  return H.violet3;
}
function agentLabel(type: string): string {
  const MAP: Record<string,string> = {
    CSO_LAUNCH_LINKEDIN:"LinkedIn", CSO_LAUNCH_EMAIL:"Email",
    CSO_FOLLOWUP:"Follow-up", CSO_STALE_REJECT:"Rejet",
    PROSPECT_DM:"DM", SEO_ARTICLE:"SEO", SOCIAL_POST:"Social",
    COMPETITOR_REACT:"Veille", SEO_REGENERATE:"SEO",
  };
  return MAP[type] ?? type;
}

// Tooltip recharts
interface TTP { active?: boolean; payload?: { name: string; value: number }[] }
function ChartTooltip({ active, payload }: TTP) {
  if (!active || !payload?.length) return null;
  return (
    <div className="px-3 py-2 rounded-xl text-xs font-medium shadow-lg"
      style={{ background: "var(--bg-card)", border: "1px solid var(--line)", color: "var(--fg)" }}>
      {payload[0].name}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function CSODashboardClientV2({
  firstName, plan, kpis, isAutopilotActive, csoPendingCount,
  hotLeads, recentReplies, recentDecisions, calendarLink,
}: Props) {
  const replyRate = kpis.contacted > 0 ? Math.round((kpis.replied / kpis.contacted) * 100) : 0;
  const hotCount  = hotLeads.length;
  const nouveaux  = Math.max(0, kpis.total - kpis.contacted - kpis.replied - kpis.converted);
  const max       = Math.max(nouveaux, 1);

  // Radial chart — funnel comme anneaux concentriques
  // Nouv (outermost) → Contactés → Discussion → Convertis (innermost)
  const radialData = [
    { name: "Nouveaux",      value: 100,                                          fill: H.violet1 },
    { name: "Contactés",     value: Math.round((kpis.contacted / max) * 100),     fill: H.violet2 },
    { name: "En discussion", value: Math.round((kpis.replied   / max) * 100),     fill: H.violet3 },
    { name: "Convertis",     value: Math.round((kpis.converted / max) * 100),     fill: H.emerald },
  ];

  // State
  const [markedMeeting, setMarkedMeeting] = useState<Set<string>>(new Set());
  const [markingId,     setMarkingId]     = useState<string | null>(null);
  const [suggestingId,  setSuggestingId]  = useState<string | null>(null);
  const [copiedId,      setCopiedId]      = useState<string | null>(null);
  const [suggestions,   setSuggestions]   = useState<Record<string,{
    intent: string; intentLabel: string; suggestedReply: string; reasoning: string;
  }>>({});

  const markMeeting = useCallback(async (id: string) => {
    setMarkingId(id);
    try {
      await fetch("/api/cso-agent/mark-meeting", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId: id }),
      });
      setMarkedMeeting((p) => new Set([...p, id]));
    } finally { setMarkingId(null); }
  }, []);

  const suggestReply = useCallback(async (id: string) => {
    if (suggestions[id]) return;
    setSuggestingId(id);
    try {
      const res  = await fetch("/api/cso-agent/suggest-reply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId: id }),
      });
      const json = await res.json();
      if (res.ok && json.suggestedReply) setSuggestions((p) => ({ ...p, [id]: json }));
    } finally { setSuggestingId(null); }
  }, [suggestions]);

  const copyReply = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const pendingCount     = recentDecisions.filter((d) => d.status === "PENDING").length;
  const unhandledReplies = recentReplies.filter((r) => !markedMeeting.has(r.id) && r.status !== "MEETING_BOOKED").length;

  return (
    <>
      <AppTopBar
        title="Sales OS"
        breadcrumb="sales-os"
        subtitle={isAutopilotActive ? "Autopilot actif" : "Manuel"}
        accent="violet"
      />

      <div className="p-5 space-y-4 max-w-[1440px]">

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section
          className="rounded-2xl overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <div className="h-px" style={{
            background: `linear-gradient(90deg, transparent, ${H.violet3} 40%, ${H.emerald} 70%, transparent)`,
            opacity: 0.5,
          }} />

          <div className="p-6 lg:p-8 grid grid-cols-12 gap-6 lg:gap-10">

            {/* Left */}
            <div className="col-span-12 lg:col-span-7 flex flex-col gap-6">
              <div>
                <p className="text-[11px] font-mono tracking-[0.18em] uppercase mb-2.5" style={{ color: "var(--fg-mute)" }}>
                  {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                </p>
                <h1 className="font-display text-[38px] font-semibold leading-[1.06] tracking-tight" style={{ color: "var(--fg)" }}>
                  Bonjour {firstName}.
                </h1>
                <p className="mt-2 text-[15px]" style={{ color: "var(--fg-dim)" }}>
                  {hotCount > 0
                    ? <><strong style={{ color: C.danger }}>{hotCount} leads HOT</strong> prêts à contacter.</>
                    : "Pipeline en ordre."}
                  {kpis.newThisWeek > 0 && <span style={{ color: "var(--fg-mute)" }}> {kpis.newThisWeek} nouveaux cette semaine.</span>}
                </p>
              </div>

              {/* 4 métriques en ligne */}
              <div className="grid grid-cols-4">
                {[
                  { label: "HOT",       value: hotCount,           color: hotCount > 0 ? C.danger  : "var(--fg-mute)" },
                  { label: "Pipeline",  value: kpis.total,         color: C.violet  },
                  { label: "Réponse",   value: `${replyRate}%`,    color: C.emerald },
                  { label: "Convertis", value: kpis.converted,     color: "var(--fg)" },
                ].map((m, i) => (
                  <div key={m.label}
                    className="py-3"
                    style={{ borderLeft: i > 0 ? "1px solid var(--line)" : undefined, paddingLeft: i > 0 ? "1.25rem" : 0 }}
                  >
                    <p className="font-display text-[34px] font-bold tabular-nums leading-none" style={{ color: m.color }}>
                      {m.value}
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mt-1.5" style={{ color: "var(--fg-mute)" }}>
                      {m.label}
                    </p>
                  </div>
                ))}
              </div>

              {csoPendingCount > 0 && (
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs w-fit"
                  style={{ background: "var(--violet-soft)", border: "1px solid var(--violet-line)", color: "var(--violet-fg)" }}>
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {csoPendingCount} décision{csoPendingCount !== 1 ? "s" : ""} agent en attente
                </div>
              )}

              <div className="flex items-center gap-3">
                <Link href="/sales-os/leads"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:brightness-105"
                  style={{ background: hotCount > 0 ? C.danger : C.violet }}>
                  {hotCount > 0 ? `Actionner les ${hotCount} HOT` : "Voir le pipeline"}
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
                <Link href="/sales-os/discovery"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{ background: "var(--bg)", border: "1px solid var(--line-strong)", color: "var(--fg-dim)" }}>
                  Lancer un scan
                </Link>
              </div>
            </div>

            {/* Right — funnel radial */}
            <div className="col-span-12 lg:col-span-5 flex">
              <div className="rounded-xl p-5 flex flex-col gap-4 w-full"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>

                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-mono uppercase tracking-[0.16em]" style={{ color: "var(--fg-mute)" }}>
                    Funnel
                  </p>
                  <p className="text-[11px] tabular-nums font-semibold" style={{ color: "var(--fg-mute)" }}>
                    {kpis.total} prospects
                  </p>
                </div>

                <div className="flex items-center gap-5">
                  {/* Radial chart */}
                  <div className="relative w-[140px] h-[140px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadialBarChart
                        innerRadius="22%"
                        outerRadius="100%"
                        data={radialData}
                        startAngle={90}
                        endAngle={-270}
                        barSize={14}
                        barGap={3}
                      >
                        <RadialBar
                          dataKey="value"
                          cornerRadius={7}
                          background={{ fill: H.gray }}
                        />
                        <Tooltip content={<ChartTooltip />} />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    {/* Centre */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="font-display text-[22px] font-bold tabular-nums leading-none" style={{ color: "var(--fg)" }}>
                        {kpis.total}
                      </span>
                      <span className="text-[9px] mt-0.5 font-medium uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>total</span>
                    </div>
                  </div>

                  {/* Légende */}
                  <div className="flex-1 space-y-3">
                    {[
                      { label: "Nouveaux",      value: nouveaux,       hex: H.violet1, border: "#C4B5FD" },
                      { label: "Contactés",     value: kpis.contacted, hex: H.violet2, border: H.violet2 },
                      { label: "En discussion", value: kpis.replied,   hex: H.violet3, border: H.violet3 },
                      { label: "Convertis",     value: kpis.converted, hex: H.emerald, border: H.emerald },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ background: item.hex, boxShadow: `0 0 0 2px ${item.border}22` }} />
                          <span className="text-xs" style={{ color: "var(--fg-dim)" }}>{item.label}</span>
                        </div>
                        <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--fg)" }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Taux de réponse & séquences */}
                <div className="grid grid-cols-2 pt-3 gap-3" style={{ borderTop: "1px solid var(--line)" }}>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>Réponse</p>
                    <p className="font-display text-xl font-bold tabular-nums mt-0.5" style={{ color: C.emerald }}>{replyRate}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>Séquences</p>
                    <p className="font-display text-xl font-bold tabular-nums mt-0.5" style={{ color: "var(--fg)" }}>{kpis.activeSequences}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Grille principale ─────────────────────────────────────────── */}
        <div className="grid grid-cols-12 gap-4">

          {/* Tableau de chasse */}
          <div className="col-span-12 lg:col-span-8">
            <div className="rounded-2xl overflow-hidden h-full"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>

              <div className="flex items-center justify-between px-5 py-3.5"
                style={{ borderBottom: "1px solid var(--line)" }}>
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Tableau de chasse</h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--fg-mute)" }}>
                    {hotCount} lead{hotCount !== 1 ? "s" : ""} · score ≥ 75
                  </p>
                </div>
                <Link href="/sales-os/leads"
                  className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg"
                  style={{ background: C.violetSoft, border: `1px solid ${C.violetLine}`, color: C.violet }}>
                  Tout voir <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>

              {hotLeads.length === 0 ? (
                <div className="py-14 text-center">
                  <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ background: "var(--bg)" }}>
                    <Search className="h-5 w-5" style={{ color: "var(--fg-mute)" }} />
                  </div>
                  <p className="text-sm font-medium mb-1" style={{ color: "var(--fg-dim)" }}>Aucun lead HOT</p>
                  <p className="text-xs mb-4" style={{ color: "var(--fg-mute)" }}>Lancez un scan Hunt pour trouver des prospects.</p>
                  <Link href="/sales-os/discovery"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                    style={{ background: C.violet }}>
                    <Search className="h-3.5 w-3.5" /> Lancer un scan
                  </Link>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--line)" }}>
                      {["Prospect", "Score", "Temp.", "Insight", ""].map((h, i) => (
                        <th key={i} className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-widest"
                          style={{ color: "var(--fg-mute)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {hotLeads.map((lead, idx) => {
                      const isHot  = lead.temperature === "HOT"  || lead.score >= 85;
                      const isWarm = lead.temperature === "WARM" || lead.score >= 65;
                      const rowAccentColor = isHot ? C.danger : isWarm ? C.violet : "var(--fg-mute)";
                      return (
                        <tr key={lead.id}
                          className="group transition-colors"
                          style={{ borderBottom: idx < hotLeads.length - 1 ? "1px solid var(--line)" : undefined }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                        >
                          {/* Prospect */}
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0"
                                style={{ background: `${rowAccentColor}18`, color: rowAccentColor }}>
                                {initials(lead.name)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold truncate" style={{ color: "var(--fg)" }}>{lead.name}</p>
                                <p className="text-xs truncate" style={{ color: "var(--fg-mute)" }}>
                                  {[lead.jobTitle, lead.company].filter(Boolean).join(" · ")}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Score */}
                          <td className="px-5 py-3 w-28">
                            <div className="flex items-center gap-2">
                              <div className="w-14 h-1.5 rounded-full overflow-hidden shrink-0" style={{ background: "var(--line-strong)" }}>
                                <div className="h-full rounded-full"
                                  style={{ width: `${lead.score}%`, background: rowAccentColor, opacity: 0.8 }} />
                              </div>
                              <span className="text-xs font-bold tabular-nums" style={{ color: rowAccentColor }}>{lead.score}</span>
                            </div>
                          </td>

                          {/* Température */}
                          <td className="px-5 py-3 w-16">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: `${rowAccentColor}15`, color: rowAccentColor }}>
                              {lead.temperature}
                            </span>
                          </td>

                          {/* Insight */}
                          <td className="px-5 py-3">
                            <p className="text-xs italic truncate max-w-[180px]" style={{ color: "var(--fg-mute)" }}>
                              {lead.aiSummary || lead.suggestedHook || "—"}
                            </p>
                          </td>

                          {/* Actions */}
                          <td className="px-5 py-3 text-right w-28">
                            <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Link href={`/sales-os/reply-assistant?prospectId=${lead.id}`}
                                className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white"
                                style={{ background: C.violet }}>
                                <Send className="h-3 w-3" /> DM
                              </Link>
                              <Link href="/sales-os/leads"
                                className="inline-flex items-center justify-center h-7 w-7 rounded-lg"
                                style={{ background: "var(--bg)", border: "1px solid var(--line-strong)", color: "var(--fg-mute)" }}>
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Right — Inbox + Activité */}
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">

            {/* Inbox */}
            <div className="rounded-2xl overflow-hidden"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>

              <div className="flex items-center justify-between px-5 py-3.5"
                style={{ borderBottom: "1px solid var(--line)" }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Réponses</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--fg-mute)" }}>À traiter</p>
                </div>
                {unhandledReplies > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: C.dangerSoft, color: C.danger, border: `1px solid ${C.dangerLine}` }}>
                    {unhandledReplies}
                  </span>
                )}
              </div>

              {recentReplies.length === 0 ? (
                <div className="py-8 text-center">
                  <Mail className="h-5 w-5 mx-auto mb-2" style={{ color: "var(--line-strong)" }} />
                  <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Aucune réponse</p>
                </div>
              ) : (
                <div>
                  {recentReplies.map((r, idx) => {
                    const booked = markedMeeting.has(r.id) || r.status === "MEETING_BOOKED";
                    return (
                      <div key={r.id}
                        className="px-5 py-3.5 space-y-2.5"
                        style={{
                          borderBottom: idx < recentReplies.length - 1 ? "1px solid var(--line)" : undefined,
                          borderLeft: `2px solid ${booked ? H.emerald : "#E11D48"}`,
                          background: booked ? `${H.emerald}08` : undefined,
                          opacity: booked ? 0.75 : 1,
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: "var(--fg)" }}>{r.name}</p>
                            <p className="text-xs" style={{ color: "var(--fg-mute)" }}>
                              {[r.jobTitle, r.company].filter(Boolean).join(" · ")}
                            </p>
                            {r.replyPreview && (
                              <p className="text-xs mt-1 italic leading-relaxed" style={{ color: "var(--fg-dim)" }}>
                                &ldquo;{r.replyPreview.slice(0, 80)}{r.replyPreview.length > 80 ? "…" : ""}&rdquo;
                              </p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {booked && <CheckCircle2 className="h-4 w-4" style={{ color: C.emerald }} />}
                            <span className="text-[10px] font-mono" style={{ color: "var(--fg-mute)" }}>
                              {timeAgo(r.respondedAt ?? r.updatedAt)}
                            </span>
                          </div>
                        </div>

                        {!booked && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button onClick={() => suggestReply(r.id)} disabled={suggestingId === r.id}
                              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                              style={{ background: C.violetSoft, border: `1px solid ${C.violetLine}`, color: C.violet }}>
                              {suggestingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                              {suggestions[r.id] ? "Regénérer" : "IA"}
                            </button>
                            {calendarLink && (
                              <a href={r.linkedInUrl ?? "#"} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg"
                                style={{ background: C.emeraldSoft, border: `1px solid ${C.emeraldLine}`, color: C.emerald }}>
                                <Calendar className="h-3 w-3" /> Calendly
                              </a>
                            )}
                            {r.linkedInUrl && (
                              <a href={r.linkedInUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center justify-center h-7 w-7 rounded-lg"
                                style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-mute)" }}>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                            <button onClick={() => markMeeting(r.id)} disabled={markingId === r.id}
                              className="ml-auto flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg"
                              style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-mute)" }}>
                              {markingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                              RDV
                            </button>
                          </div>
                        )}

                        {suggestions[r.id] && !booked && (
                          <div className="rounded-xl p-3 space-y-2"
                            style={{ background: C.violetSoft, border: `1px solid ${C.violetLine}` }}>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold flex items-center gap-1" style={{ color: C.violet }}>
                                <Sparkles className="h-3 w-3" /> {suggestions[r.id].intentLabel}
                              </span>
                              <button onClick={() => copyReply(r.id, suggestions[r.id].suggestedReply)}
                                className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md text-white"
                                style={{ background: C.violet }}>
                                {copiedId === r.id ? <><Check className="h-2.5 w-2.5" /> Copié</> : <><Copy className="h-2.5 w-2.5" /> Copier</>}
                              </button>
                            </div>
                            <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "var(--fg-dim)" }}>
                              {suggestions[r.id].suggestedReply}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Activité IA */}
            <div className="rounded-2xl overflow-hidden"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>

              <div className="flex items-center justify-between px-5 py-3.5"
                style={{ borderBottom: "1px solid var(--line)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Activité IA</p>
                {pendingCount > 0 && (
                  <span className="text-xs font-semibold" style={{ color: C.violet }}>
                    {pendingCount} en attente
                  </span>
                )}
              </div>

              {recentDecisions.length === 0 ? (
                <div className="py-8 text-center px-5">
                  <p className="text-xs" style={{ color: "var(--fg-mute)" }}>Aucune activité.</p>
                  <Link href="/sales-os/agent" className="text-xs font-medium mt-1.5 inline-block" style={{ color: C.violet }}>
                    Lancer une analyse →
                  </Link>
                </div>
              ) : (
                <div>
                  {recentDecisions.slice(0, 7).map((d, idx) => {
                    const color = agentColor(d.actionType);
                    const isDone = d.status === "EXECUTED";
                    return (
                      <div key={d.id}
                        className="flex items-center gap-2.5 px-5 py-2.5"
                        style={{ borderBottom: idx < 6 ? "1px solid var(--line)" : undefined }}>
                        <span className="h-1.5 w-1.5 rounded-full shrink-0"
                          style={{ background: isDone ? H.emerald : color }} />
                        <span className="text-[11px] font-semibold shrink-0 w-16" style={{ color }}>
                          {agentLabel(d.actionType)}
                        </span>
                        <p className="text-xs truncate flex-1" style={{ color: "var(--fg-mute)" }}>
                          {d.reasoning.slice(0, 45)}
                        </p>
                        <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--fg-mute)" }}>
                          {timeAgo(d.createdAt)}
                        </span>
                      </div>
                    );
                  })}
                  <div className="px-5 py-3">
                    <Link href="/sales-os/agent" className="text-xs font-medium" style={{ color: C.violet }}>
                      Tout voir →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Actions rapides ───────────────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
          <div className="grid grid-cols-2 lg:grid-cols-4"
            style={{ borderColor: "var(--line)" }}>
            {[
              { title: "Discovery",  desc: "Trouver des leads",        href: "/sales-os/discovery", icon: Search     },
              { title: "Séquence",  desc: "Lancer une campagne",      href: "/sales-os/outreach", icon: Zap        },
              { title: "Magic DM",  desc: "Message personnalisé IA",  href: "/sales-os/leads",    icon: Send       },
              { title: "Analytics", desc: "Insights pipeline",        href: "/sales-os/insights", icon: TrendingUp },
            ].map((a, i) => (
              <Link key={a.title} href={a.href}
                className="group flex items-center gap-3.5 px-5 py-4 transition-colors hover:bg-[var(--bg)]"
                style={{
                  borderLeft: i > 0 ? "1px solid var(--line)" : undefined,
                  borderRadius: i === 0 ? "1rem 0 0 1rem" : i === 3 ? "0 1rem 1rem 0" : undefined,
                }}>
                <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: C.violetSoft, color: C.violet }}>
                  <a.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "var(--fg)" }}>{a.title}</p>
                  <p className="text-xs truncate" style={{ color: "var(--fg-mute)" }}>{a.desc}</p>
                </div>
                <ArrowUpRight
                  className="h-4 w-4 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: C.violet }}
                />
              </Link>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
