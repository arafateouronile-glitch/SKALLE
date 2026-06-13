"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import {
  ArrowLeft, Mail, Linkedin, MapPin, Building2, Briefcase,
  Flame, Zap, Snowflake, CheckCircle2, AlertCircle, Copy,
  Check, RefreshCw, Sparkles, MessageSquare, ExternalLink,
  ChevronDown, ChevronUp,
} from "lucide-react";
import type { MessageType, MessageResult } from "@/app/api/cso-agent/prospects/[prospectId]/message/route";
import { SequenceFlow } from "@/components/modules/cso/sequence-flow";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Interaction {
  id: string;
  channel: string;
  type: string;
  content: string;
  createdAt: string;
}

interface AiNote {
  id: string;
  content: string;
  type: string;
  createdAt: string;
}

interface SeqStep {
  id: string;
  stepNumber: number;
  channel: string;
  linkedInAction: string | null;
  content: string;
  status: string;
  sentAt: string | null;
  scheduledAt: string | null;
  metadata: Record<string, unknown> | null;
  repliedAt: string | null;
  openedAt: string | null;
  error: string | null;
}

interface OutreachSequence {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  steps: SeqStep[];
}

interface Prospect {
  id: string;
  name: string;
  company: string;
  jobTitle: string | null;
  email: string | null;
  emailVerified: boolean;
  emailStatus: string | null;
  linkedInUrl: string;
  phone: string | null;
  location: string | null;
  industry: string | null;
  revenue: string | null;
  companySize: string | null;
  platform: string | null;
  score: number;
  temperature: string;
  status: string;
  aiSummary: string | null;
  suggestedHook: string | null;
  notes: string | null;
  enrichmentData: unknown;
  createdAt: string;
  lastInteractionAt: string | null;
  persona: { name: string } | null;
  interactions: Interaction[];
  aiNotes: AiNote[];
  sequences: OutreachSequence[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "à l'instant";
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "hier";
  if (d < 30) return `il y a ${d}j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function scoreColor(s: number) {
  if (s >= 75) return { fg: "var(--emerald-fg)", bg: "var(--emerald-soft)" };
  if (s >= 50) return { fg: "var(--amber-fg)", bg: "var(--amber-soft)" };
  return { fg: "var(--cold-fg)", bg: "var(--cold-soft)" };
}

function TempBadge({ temp }: { temp: string }) {
  const map: Record<string, { icon: React.ReactNode; label: string; fg: string; bg: string }> = {
    HOT:  { icon: <Flame  className="h-3 w-3" />, label: "HOT",  fg: "var(--danger-fg)",  bg: "var(--danger-soft)"  },
    WARM: { icon: <Zap    className="h-3 w-3" />, label: "WARM", fg: "var(--amber-fg)",   bg: "var(--amber-soft)"   },
    COLD: { icon: <Snowflake className="h-3 w-3" />, label: "COLD", fg: "var(--cold-fg)", bg: "var(--cold-soft)"    },
  };
  const t = map[temp] ?? map.COLD;
  return (
    <span className="flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded"
      style={{ background: t.bg, color: t.fg }}>
      {t.icon}{t.label}
    </span>
  );
}

function EmailBadge({ verified, status, email }: { verified: boolean; status: string | null; email: string | null }) {
  if (!email) return <span className="text-[10.5px] px-2 py-0.5 rounded" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-mute)" }}>Pas d'email</span>;
  if (verified || status === "verified") return <span className="flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded" style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}><CheckCircle2 className="h-3 w-3" />Vérifié</span>;
  if (status === "likely to engage") return <span className="flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded" style={{ background: "var(--amber-soft)", color: "var(--amber-fg)" }}><AlertCircle className="h-3 w-3" />Probable</span>;
  return <span className="text-[10.5px] px-2 py-0.5 rounded" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-mute)" }}>Non vérifié</span>;
}

function ScoreBar({ label, value, max = 40 }: { label: string; value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = pct >= 75 ? "var(--emerald-fg)" : pct >= 50 ? "var(--amber-fg)" : "var(--cold-fg)";
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>{label}</span>
        <span className="text-[11px] font-mono font-bold" style={{ color }}>{value}/{max}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--line-strong)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

const STATUS_OPTIONS = [
  "NEW", "RESEARCHED", "CONTACTED", "RESPONDED", "MEETING_BOOKED", "CONVERTED", "REJECTED",
] as const;

const STATUS_LABELS: Record<string, string> = {
  NEW: "Nouveau", RESEARCHED: "Enrichi", CONTACTED: "Contacté",
  RESPONDED: "A répondu", MEETING_BOOKED: "Meeting booké",
  CONVERTED: "Converti", REJECTED: "Écarté",
};

const MESSAGE_TYPES: { id: MessageType; label: string; desc: string }[] = [
  { id: "linkedin_connection", label: "Connexion LinkedIn",   desc: "≤ 300 chars" },
  { id: "linkedin_followup",   label: "Follow-up LinkedIn",   desc: "≤ 300 chars" },
  { id: "email_cold",          label: "Cold email",           desc: "80-120 mots"  },
  { id: "email_followup",      label: "Email follow-up",      desc: "50-80 mots"   },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [msgType, setMsgType] = useState<MessageType>("linkedin_connection");
  const [msgContext, setMsgContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<MessageResult | null>(null);
  const [copied, setCopied] = useState(false);

  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [showAllInteractions, setShowAllInteractions] = useState(false);

  useEffect(() => {
    fetch(`/api/cso-agent/prospects/${id}`)
      .then((r) => r.json() as Promise<{ prospect?: Prospect; error?: string }>)
      .then(({ prospect: p, error }) => {
        if (error || !p) { setNotFound(true); return; }
        setProspect(p);
        setNotes(p.notes ?? "");
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleGenerateMessage() {
    if (!prospect || generating) return;
    setGenerating(true);
    setGenerated(null);
    try {
      const res = await fetch(`/api/cso-agent/prospects/${id}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: msgType, context: msgContext }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as MessageResult;
      setGenerated(data);
    } catch {
      // silent
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveNotes() {
    if (!prospect) return;
    setSavingNotes(true);
    await fetch(`/api/cso-agent/prospects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    }).catch(() => null);
    setSavingNotes(false);
  }

  async function handleStatusChange(status: string) {
    if (!prospect) return;
    await fetch(`/api/cso-agent/prospects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => null);
    setProspect((prev) => prev ? { ...prev, status } : prev);
  }

  if (loading) return (
    <>
      <AppTopBar title="Prospect" breadcrumb="sales-os / prospects" accent="violet" />
      <div className="p-6 flex items-center gap-2" style={{ color: "var(--fg-mute)" }}>
        <RefreshCw className="h-4 w-4 animate-spin" /> Chargement…
      </div>
    </>
  );

  if (notFound || !prospect) return (
    <>
      <AppTopBar title="Prospect" breadcrumb="sales-os / prospects" accent="violet" />
      <div className="p-6">
        <p style={{ color: "var(--fg-mute)" }}>Prospect introuvable.</p>
        <Link href="/sales-os/pipeline" className="text-[13px] mt-2 inline-block" style={{ color: "var(--violet-fg)" }}>← Retour au pipeline</Link>
      </div>
    </>
  );

  const sc = scoreColor(prospect.score);
  const interactions = showAllInteractions ? prospect.interactions : prospect.interactions.slice(0, 5);

  return (
    <>
      <AppTopBar
        title={prospect.name}
        breadcrumb={`sales-os / pipeline / ${prospect.name}`}
        accent="violet"
      />

      <div className="p-6 max-w-[1300px]">
        <Link
          href="/sales-os/pipeline"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium mb-5 hover:opacity-70 transition-all"
          style={{ color: "var(--fg-mute)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Retour au pipeline
        </Link>

        <div className="grid gap-6" style={{ gridTemplateColumns: "340px 1fr" }}>
          {/* ── LEFT : Profile ────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Main profile card */}
            <section className="rounded-[18px] p-5 space-y-4"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
              {/* Avatar + name */}
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-[15px] font-bold shrink-0"
                  style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}>
                  {prospect.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>{prospect.name}</h1>
                  <p className="text-[12px] truncate" style={{ color: "var(--fg-mute)" }}>
                    {prospect.jobTitle ? `${prospect.jobTitle} @ ${prospect.company}` : prospect.company}
                  </p>
                </div>
              </div>

              {/* Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded"
                  style={{ background: sc.bg, color: sc.fg }}>
                  {prospect.score}/100
                </span>
                <TempBadge temp={prospect.temperature} />
                <EmailBadge verified={prospect.emailVerified} status={prospect.emailStatus} email={prospect.email} />
              </div>

              {/* Contact info */}
              <div className="space-y-2">
                {prospect.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--fg-mute)" }} />
                    <span className="text-[12px] truncate" style={{ color: "var(--fg-dim)" }}>{prospect.email}</span>
                    <button onClick={() => navigator.clipboard.writeText(prospect.email!)}
                      className="shrink-0 hover:opacity-70 transition-all">
                      <Copy className="h-3 w-3" style={{ color: "var(--fg-mute)" }} />
                    </button>
                  </div>
                )}
                {prospect.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--fg-mute)" }} />
                    <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>{prospect.location}</span>
                  </div>
                )}
                {prospect.company && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--fg-mute)" }} />
                    <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
                      {prospect.company}{prospect.companySize ? ` · ${prospect.companySize}` : ""}
                    </span>
                  </div>
                )}
                {prospect.industry && (
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--fg-mute)" }} />
                    <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>{prospect.industry}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <a href={prospect.linkedInUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-2 rounded-[8px] transition-all hover:brightness-110"
                  style={{ background: "var(--violet-soft)", border: "1px solid var(--violet-line)", color: "var(--violet-fg)" }}>
                  <Linkedin className="h-3.5 w-3.5" /> LinkedIn
                  <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                </a>
                {prospect.email && (
                  <a href={`mailto:${prospect.email}`}
                    className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-[8px] transition-all hover:brightness-95"
                    style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                    <Mail className="h-3.5 w-3.5" /> Email
                  </a>
                )}
              </div>
            </section>

            {/* Score breakdown */}
            <section className="rounded-[18px] p-5 space-y-3"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
              <p className="text-[11px] font-mono uppercase tracking-[0.12em]" style={{ color: "var(--fg-mute)" }}>Score breakdown</p>
              <ScoreBar label="Qualité email" value={prospect.emailVerified ? 40 : prospect.emailStatus === "likely to engage" ? 25 : prospect.email ? 10 : 0} max={40} />
              <ScoreBar label="LinkedIn URL" value={prospect.linkedInUrl ? 15 : 0} max={15} />
              <ScoreBar label="Titre de poste" value={prospect.jobTitle ? 10 : 0} max={10} />
              <ScoreBar label="Persona ICP" value={prospect.persona ? 20 : 0} max={20} />
              <ScoreBar label="Localisation" value={prospect.location ? 5 : 0} max={5} />
              <ScoreBar label="Entreprise" value={prospect.company?.length > 2 ? 5 : 0} max={5} />
              <div className="pt-1 border-t" style={{ borderColor: "var(--line)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>Total</span>
                  <span className="text-[14px] font-bold" style={{ color: sc.fg }}>{prospect.score}/100</span>
                </div>
              </div>
            </section>

            {/* Status */}
            <section className="rounded-[18px] p-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
              <p className="text-[11px] font-mono uppercase tracking-[0.12em] mb-3" style={{ color: "var(--fg-mute)" }}>Statut pipeline</p>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_OPTIONS.map((s) => {
                  const active = prospect.status === s;
                  return (
                    <button key={s} onClick={() => handleStatusChange(s)}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-[7px] transition-all"
                      style={active
                        ? { background: "var(--violet-fg)", color: "white" }
                        : { background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                      {STATUS_LABELS[s]}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Persona */}
            {prospect.persona && (
              <div className="px-4 py-3 rounded-[12px] text-[12px]"
                style={{ background: "var(--violet-soft)", border: "1px solid var(--violet-line)", color: "var(--violet-fg)" }}>
                Persona : <strong>{prospect.persona.name}</strong>
              </div>
            )}

            {/* Notes */}
            <section className="rounded-[18px] p-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
              <p className="text-[11px] font-mono uppercase tracking-[0.12em] mb-2.5" style={{ color: "var(--fg-mute)" }}>Notes</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="Notes internes sur ce prospect…"
                className="w-full rounded-[10px] px-3 py-2.5 text-[12.5px] leading-relaxed resize-none outline-none"
                style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
              />
              <button onClick={handleSaveNotes} disabled={savingNotes}
                className="mt-2 text-[11.5px] font-semibold px-3 py-1.5 rounded-[8px] transition-all hover:brightness-95 disabled:opacity-50"
                style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                {savingNotes ? "Sauvegarde…" : "Sauvegarder"}
              </button>
            </section>
          </div>

          {/* ── RIGHT : Timeline + Message Generator ──────────────────────── */}
          <div className="space-y-5">

            {/* AI summary */}
            {prospect.aiSummary && (
              <section className="rounded-[18px] p-5"
                style={{ background: "var(--violet-soft)", border: "1px solid var(--violet-line)", boxShadow: "var(--card-shadow)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--violet-fg)" }} />
                  <p className="text-[11px] font-mono uppercase tracking-[0.12em]" style={{ color: "var(--violet-fg)" }}>Résumé IA</p>
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--violet-fg)" }}>{prospect.aiSummary}</p>
                {prospect.suggestedHook && (
                  <p className="text-[11.5px] mt-2 font-semibold italic" style={{ color: "var(--violet-fg)", opacity: 0.8 }}>
                    Hook suggéré : "{prospect.suggestedHook}"
                  </p>
                )}
              </section>
            )}

            {/* Message generator */}
            <section className="rounded-[18px] p-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="h-4 w-4" style={{ color: "var(--violet-fg)" }} />
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--fg)" }}>Générateur de message IA</h2>
              </div>

              {/* Type picker */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {MESSAGE_TYPES.map((t) => {
                  const active = msgType === t.id;
                  return (
                    <button key={t.id} onClick={() => { setMsgType(t.id); setGenerated(null); }}
                      className="text-left px-3 py-2.5 rounded-[10px] transition-all"
                      style={active
                        ? { background: "var(--violet-soft)", border: "2px solid var(--violet-fg)" }
                        : { background: "var(--bg)", border: "1px solid var(--line)" }}>
                      <p className="text-[12.5px] font-semibold" style={{ color: active ? "var(--violet-fg)" : "var(--fg)" }}>{t.label}</p>
                      <p className="text-[10.5px]" style={{ color: active ? "var(--violet-fg)" : "var(--fg-mute)", opacity: 0.8 }}>{t.desc}</p>
                    </button>
                  );
                })}
              </div>

              {/* Context */}
              <input
                value={msgContext}
                onChange={(e) => setMsgContext(e.target.value)}
                placeholder="Contexte additionnel (ex : a liké un de vos posts, sort d'un événement…)"
                className="w-full rounded-[10px] px-3.5 py-2.5 text-[12.5px] outline-none mb-3"
                style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
              />

              <button onClick={handleGenerateMessage} disabled={generating}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] text-[13px] font-bold transition-all hover:brightness-110 disabled:opacity-40"
                style={{ background: "var(--violet-fg)", color: "white" }}>
                {generating ? <><RefreshCw className="h-4 w-4 animate-spin" />Génération…</> : <><Sparkles className="h-4 w-4" />Générer le message</>}
              </button>

              {/* Generated message */}
              {generated && (
                <div className="mt-4 space-y-3">
                  {/* Score */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded"
                      style={{
                        background: generated.personalizationScore >= 80 ? "var(--emerald-soft)" : generated.personalizationScore >= 60 ? "var(--amber-soft)" : "var(--danger-soft)",
                        color: generated.personalizationScore >= 80 ? "var(--emerald-fg)" : generated.personalizationScore >= 60 ? "var(--amber-fg)" : "var(--danger-fg)",
                      }}>
                      Personnalisation : {generated.personalizationScore}/100
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {generated.personalizationNotes.map((note, i) => (
                        <span key={i} className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-mute)" }}>
                          {note}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Subject if email */}
                  {generated.subject && (
                    <div className="rounded-[8px] px-3 py-2" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                      <span className="text-[10px] font-mono uppercase" style={{ color: "var(--fg-mute)" }}>Objet : </span>
                      <span className="text-[12.5px] font-semibold" style={{ color: "var(--fg)" }}>{generated.subject}</span>
                    </div>
                  )}

                  {/* Message */}
                  <div className="relative">
                    <div className="rounded-[10px] p-4 text-[13px] leading-relaxed whitespace-pre-wrap"
                      style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                      {generated.message}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generated.message);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className="absolute top-2.5 right-2.5 flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-[6px] transition-all hover:brightness-95"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--line)", color: copied ? "var(--emerald-fg)" : "var(--fg-dim)" }}>
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied ? "Copié" : "Copier"}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* ── Sequence flows ─────────────────────────────────────────── */}
            {prospect.sequences && prospect.sequences.length > 0 && (
              <section className="space-y-3">
                <p className="text-[11px] font-mono uppercase tracking-[0.12em]" style={{ color: "var(--fg-mute)" }}>
                  Séquences actives · {prospect.sequences.length}
                </p>
                {prospect.sequences.map((seq) => (
                  <SequenceFlow
                    key={seq.id}
                    name={seq.name}
                    isActive={seq.isActive}
                    createdAt={seq.createdAt}
                    steps={seq.steps as Parameters<typeof SequenceFlow>[0]["steps"]}
                  />
                ))}
              </section>
            )}

            {/* Timeline */}
            <section className="rounded-[18px] p-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
              <p className="text-[11px] font-mono uppercase tracking-[0.12em] mb-4" style={{ color: "var(--fg-mute)" }}>
                Timeline · {prospect.interactions.length} événements
              </p>

              {/* Creation event */}
              <div className="flex items-start gap-3 mb-3">
                <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: "var(--fg-mute)" }} />
                <div>
                  <p className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>Prospect créé</p>
                  <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>{relDate(prospect.createdAt)}</p>
                </div>
              </div>

              {interactions.map((inter) => {
                const typeColors: Record<string, string> = {
                  STATUS_CHANGE: "var(--violet-fg)",
                  EMAIL_SENT: "var(--emerald-fg)",
                  LINKEDIN_MESSAGE: "var(--violet-fg)",
                  REPLY_RECEIVED: "var(--amber-fg)",
                  INTERNAL: "var(--fg-mute)",
                };
                const color = typeColors[inter.type] ?? "var(--fg-mute)";
                return (
                  <div key={inter.id} className="flex items-start gap-3 mb-3">
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{ background: color + "22", color }}>
                          {inter.type.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px]" style={{ color: "var(--fg-mute)" }}>{relDate(inter.createdAt)}</span>
                      </div>
                      <p className="text-[12px] mt-0.5 line-clamp-2" style={{ color: "var(--fg-dim)" }}>
                        {inter.content}
                      </p>
                    </div>
                  </div>
                );
              })}

              {prospect.interactions.length > 5 && (
                <button onClick={() => setShowAllInteractions((v) => !v)}
                  className="flex items-center gap-1 text-[11.5px] font-medium mt-1 transition-all hover:opacity-70"
                  style={{ color: "var(--violet-fg)" }}>
                  {showAllInteractions
                    ? <><ChevronUp className="h-3.5 w-3.5" /> Réduire</>
                    : <><ChevronDown className="h-3.5 w-3.5" /> Voir les {prospect.interactions.length - 5} autres</>}
                </button>
              )}

              {prospect.interactions.length === 0 && (
                <p className="text-[12px] italic" style={{ color: "var(--fg-mute)" }}>
                  Aucune interaction enregistrée.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
