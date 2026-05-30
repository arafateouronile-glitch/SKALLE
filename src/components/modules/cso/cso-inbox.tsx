"use client";

import { useState, useCallback } from "react";
import {
  Mail, Linkedin, MessageSquare, ExternalLink, Calendar,
  Copy, Check, Sparkles, Loader2, CheckCircle2, Clock,
  User, Building2, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SentStep {
  id: string;
  channel: string;
  subject: string | null;
  content: string;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
}

interface Conversation {
  id: string;
  name: string;
  jobTitle: string | null;
  company: string;
  linkedInUrl: string | null;
  email: string | null;
  status: string;
  score: number;
  updatedAt: string;
  headline: string | null;
  about: string | null;
  replyPreview: string | null;
  respondedAt: string | null;
  pendingMessage: string | null;
  sentSteps: SentStep[];
}

interface Props {
  conversations: Conversation[];
  calendarLink: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}j`;
}

function statusColor(status: string) {
  if (status === "RESPONDED" || status === "REPLIED") return { bg: "var(--violet-soft)", fg: "var(--violet-fg)", label: "A répondu" };
  if (status === "MEETING_BOOKED") return { bg: "var(--emerald-soft)", fg: "var(--emerald-fg)", label: "RDV booké" };
  if (status === "CONTACTED") return { bg: "var(--amber-soft)", fg: "var(--amber-fg)", label: "Contacté" };
  return { bg: "var(--bg-2)", fg: "var(--fg-mute)", label: status };
}

function channelIcon(channel: string) {
  if (channel === "LINKEDIN") return <Linkedin className="h-3 w-3" />;
  if (channel === "EMAIL") return <Mail className="h-3 w-3" />;
  return <MessageSquare className="h-3 w-3" />;
}

function stepStatusDot(status: string) {
  if (status === "OPENED") return <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />;
  if (status === "REPLIED") return <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />;
  if (status === "SENT" || status === "DELIVERED") return <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-gray-300 shrink-0" />;
}

function getInitials(name: string) {
  return name.split(" ").map((p) => p[0] ?? "").join("").slice(0, 2).toUpperCase();
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CsoInbox({ conversations, calendarLink }: Props) {
  const [selected, setSelected] = useState<string | null>(conversations[0]?.id ?? null);

  const [suggestions, setSuggestions] = useState<Record<string, { intent: string; intentLabel: string; suggestedReply: string; reasoning: string }>>({});
  const [suggestingId, setSuggestingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [bookedIds, setBookedIds] = useState<Set<string>>(new Set());

  const conversation = conversations.find((c) => c.id === selected) ?? null;

  const suggestReply = useCallback(async (prospectId: string) => {
    if (suggestions[prospectId]) {
      setSuggestions((prev) => { const n = { ...prev }; delete n[prospectId]; return n; });
      return;
    }
    setSuggestingId(prospectId);
    try {
      const res = await fetch("/api/cso-agent/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId }),
      });
      const json = await res.json();
      if (res.ok && json.suggestedReply) {
        setSuggestions((prev) => ({ ...prev, [prospectId]: json }));
      } else {
        toast.error("Erreur lors de la génération");
      }
    } finally {
      setSuggestingId(null);
    }
  }, [suggestions]);

  const copyReply = useCallback((prospectId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(prospectId);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const markMeeting = useCallback(async (prospectId: string) => {
    setMarkingId(prospectId);
    try {
      await fetch("/api/cso-agent/mark-meeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId }),
      });
      setBookedIds((prev) => new Set([...prev, prospectId]));
      toast.success("RDV marqué !");
    } finally {
      setMarkingId(null);
    }
  }, []);

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <MessageSquare className="h-10 w-10 opacity-20" style={{ color: "var(--fg-mute)" }} />
        <p className="text-[14px]" style={{ color: "var(--fg-mute)" }}>Aucune conversation pour l'instant</p>
        <p className="text-[12px]" style={{ color: "var(--fg-mute)" }}>L'extension détecte les réponses LinkedIn toutes les 12h.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-80px)] overflow-hidden rounded-[16px]"
      style={{ border: "1px solid var(--line)", background: "var(--bg-card)" }}>

      {/* ── Panel gauche — Liste des conversations ───────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col"
        style={{ borderRight: "1px solid var(--line)" }}>

        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--fg)" }}>Inbox</h2>
          <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
            {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.map((c) => {
            const s = statusColor(c.status);
            const isBooked = bookedIds.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c.id)}
                className="w-full text-left px-4 py-3 transition-colors flex items-start gap-3"
                style={{
                  background: selected === c.id ? "var(--violet-soft)" : "transparent",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                {/* Avatar */}
                <div className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5"
                  style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}>
                  {getInitials(c.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 justify-between">
                    <p className="text-[12.5px] font-semibold truncate" style={{ color: "var(--fg)" }}>{c.name}</p>
                    <span className="text-[10px] shrink-0" style={{ color: "var(--fg-mute)" }}>{timeAgo(c.respondedAt ?? c.updatedAt)}</span>
                  </div>
                  <p className="text-[11px] truncate" style={{ color: "var(--fg-mute)" }}>{c.jobTitle ? `${c.jobTitle} · ` : ""}{c.company}</p>
                  {c.replyPreview && (
                    <p className="text-[11px] truncate mt-0.5 italic" style={{ color: "var(--fg-dim)" }}>
                      "{c.replyPreview.slice(0, 50)}…"
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: isBooked ? "var(--emerald-soft)" : s.bg, color: isBooked ? "var(--emerald-fg)" : s.fg }}>
                      {isBooked ? "RDV BOOKÉ" : s.label}
                    </span>
                    {selected === c.id && <ChevronRight className="h-2.5 w-2.5 ml-auto shrink-0" style={{ color: "var(--violet-fg)" }} />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Panel centre — Conversation ──────────────────────────────────── */}
      {conversation && (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-5 py-3 flex items-center gap-3 shrink-0"
            style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
              style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}>
              {getInitials(conversation.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate" style={{ color: "var(--fg)" }}>{conversation.name}</p>
              <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
                {conversation.jobTitle ? `${conversation.jobTitle} · ` : ""}{conversation.company}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {conversation.linkedInUrl && (
                <a href={conversation.linkedInUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg transition-colors hover:brightness-105"
                  style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                  <ExternalLink className="h-3 w-3" /> LinkedIn
                </a>
              )}
              {!bookedIds.has(conversation.id) && conversation.status !== "MEETING_BOOKED" && (
                <Button size="sm" onClick={() => markMeeting(conversation.id)} disabled={markingId === conversation.id}
                  className="h-7 text-[11px]"
                  style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)", color: "var(--emerald-fg)" }}>
                  {markingId === conversation.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  RDV booké
                </Button>
              )}
            </div>
          </div>

          {/* Thread */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Messages envoyés */}
            {conversation.sentSteps.map((step) => (
              <div key={step.id} className="flex justify-end">
                <div className="max-w-[75%] space-y-1">
                  <div className="flex items-center gap-1.5 justify-end text-[10px]" style={{ color: "var(--fg-mute)" }}>
                    {channelIcon(step.channel)}
                    <span>{step.channel === "EMAIL" ? step.subject ?? "Email" : "LinkedIn"}</span>
                    {stepStatusDot(step.status)}
                    <span>{step.status === "OPENED" ? "Ouvert" : step.status === "SENT" ? "Envoyé" : step.status}</span>
                    <span>· {timeAgo(step.sentAt)}</span>
                  </div>
                  <div className="rounded-[12px] px-3.5 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap"
                    style={{ background: "var(--violet-fg)", color: "white" }}>
                    {step.content.slice(0, 600)}{step.content.length > 600 ? "…" : ""}
                  </div>
                </div>
              </div>
            ))}

            {/* Message post-connexion (si pas dans les steps) */}
            {conversation.pendingMessage && conversation.sentSteps.length === 0 && (
              <div className="flex justify-end">
                <div className="max-w-[75%] space-y-1">
                  <div className="flex items-center gap-1.5 justify-end text-[10px]" style={{ color: "var(--fg-mute)" }}>
                    <Linkedin className="h-3 w-3" />
                    <span>LinkedIn</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    <span>Envoyé</span>
                  </div>
                  <div className="rounded-[12px] px-3.5 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap"
                    style={{ background: "var(--violet-fg)", color: "white" }}>
                    {conversation.pendingMessage.slice(0, 600)}
                  </div>
                </div>
              </div>
            )}

            {/* Réponse du prospect */}
            {conversation.replyPreview && (
              <div className="flex justify-start">
                <div className="max-w-[75%] space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--fg-mute)" }}>
                    <Linkedin className="h-3 w-3" />
                    <span>{conversation.name}</span>
                    <span>· {timeAgo(conversation.respondedAt)}</span>
                  </div>
                  <div className="rounded-[12px] px-3.5 py-2.5 text-[12.5px] leading-relaxed italic"
                    style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                    "{conversation.replyPreview}"
                  </div>
                </div>
              </div>
            )}

            {/* Suggestion IA inline */}
            {suggestions[conversation.id] && (
              <div className="flex justify-end">
                <div className="max-w-[75%] space-y-1">
                  <div className="flex items-center gap-1.5 justify-end text-[10px]" style={{ color: "var(--violet-fg)" }}>
                    <Sparkles className="h-3 w-3" />
                    <span>Suggestion IA · {suggestions[conversation.id].intentLabel}</span>
                  </div>
                  <div className="rounded-[12px] px-3.5 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap space-y-2"
                    style={{ background: "var(--violet-soft)", border: "1px dashed var(--violet-line)", color: "var(--fg-dim)" }}>
                    <p>{suggestions[conversation.id].suggestedReply}</p>
                    <p className="text-[10.5px] italic" style={{ color: "var(--fg-mute)" }}>
                      {suggestions[conversation.id].reasoning}
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => copyReply(conversation.id, suggestions[conversation.id].suggestedReply)}
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg transition-colors"
                      style={{ background: "var(--violet-fg)", color: "white" }}>
                      {copiedId === conversation.id ? <><Check className="h-3 w-3" /> Copié</> : <><Copy className="h-3 w-3" /> Copier</>}
                    </button>
                    {calendarLink && (
                      <a href={calendarLink} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg"
                        style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)", color: "var(--emerald-fg)" }}>
                        <Calendar className="h-3 w-3" /> Envoyer Calendly
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Barre d'action */}
          <div className="px-5 py-3 shrink-0 flex items-center gap-2"
            style={{ borderTop: "1px solid var(--line)" }}>
            <Button
              onClick={() => suggestReply(conversation.id)}
              disabled={suggestingId === conversation.id}
              size="sm"
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {suggestingId === conversation.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              {suggestions[conversation.id] ? "Regénérer" : "Rédiger avec IA"}
            </Button>
            {calendarLink && conversation.replyPreview && (
              <a href={conversation.linkedInUrl ?? calendarLink} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg transition-colors hover:brightness-105"
                style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)", color: "var(--emerald-fg)" }}>
                <Calendar className="h-3.5 w-3.5" /> Calendly
              </a>
            )}
            <span className="flex items-center gap-1 text-[11px] ml-auto" style={{ color: "var(--fg-mute)" }}>
              <Clock className="h-3 w-3" /> Réponse {timeAgo(conversation.respondedAt)}
            </span>
          </div>
        </div>
      )}

      {/* ── Panel droit — Profil prospect ────────────────────────────────── */}
      {conversation && (
        <div className="w-72 shrink-0 flex flex-col overflow-y-auto"
          style={{ borderLeft: "1px solid var(--line)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--line)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-mute)" }}>Profil</p>
          </div>

          <div className="px-4 py-4 space-y-4">
            {/* Identité */}
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
                style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}>
                {getInitials(conversation.name)}
              </div>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>{conversation.name}</p>
                {conversation.jobTitle && (
                  <p className="text-[11.5px]" style={{ color: "var(--fg-dim)" }}>{conversation.jobTitle}</p>
                )}
                <div className="flex items-center gap-1 mt-0.5" style={{ color: "var(--fg-mute)" }}>
                  <Building2 className="h-3 w-3 shrink-0" />
                  <p className="text-[11px]">{conversation.company}</p>
                </div>
              </div>
            </div>

            {/* Score */}
            <div className="rounded-[10px] p-3 flex items-center justify-between"
              style={{ background: "var(--bg-2)", border: "1px solid var(--line)" }}>
              <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>Score ICP</p>
              <p className="text-[18px] font-bold tabular-nums" style={{ color: conversation.score >= 70 ? "var(--emerald-fg)" : "var(--amber-fg)" }}>
                {conversation.score}
              </p>
            </div>

            {/* Headline LinkedIn */}
            {conversation.headline && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--fg-mute)" }}>
                  Headline LinkedIn
                </p>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
                  {conversation.headline}
                </p>
              </div>
            )}

            {/* Section "À propos" */}
            {conversation.about && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--fg-mute)" }}>
                  À propos
                </p>
                <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
                  {conversation.about.slice(0, 300)}{conversation.about.length > 300 ? "…" : ""}
                </p>
              </div>
            )}

            {/* Email */}
            {conversation.email && !conversation.email.includes("@discovery.skalle") && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--fg-mute)" }}>
                  Email
                </p>
                <p className="text-[11.5px] font-mono" style={{ color: "var(--fg-dim)" }}>
                  {conversation.email}
                </p>
              </div>
            )}

            {/* Liens */}
            <div className="space-y-2 pt-1">
              {conversation.linkedInUrl && (
                <a href={conversation.linkedInUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[12px] w-full px-3 py-2 rounded-lg transition-colors hover:brightness-105"
                  style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                  <Linkedin className="h-3.5 w-3.5 shrink-0" />
                  Voir sur LinkedIn
                  <ExternalLink className="h-3 w-3 ml-auto" />
                </a>
              )}
              {conversation.email && !conversation.email.includes("@discovery.skalle") && (
                <a href={`mailto:${conversation.email}`}
                  className="flex items-center gap-2 text-[12px] w-full px-3 py-2 rounded-lg transition-colors hover:brightness-105"
                  style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  Envoyer un email
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
