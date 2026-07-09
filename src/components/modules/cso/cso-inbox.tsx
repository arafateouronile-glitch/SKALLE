"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Mail, Linkedin, MessageSquare, ExternalLink, Calendar,
  Copy, Check, Sparkles, Loader2, CheckCircle2, Clock,
  Building2, RefreshCw, Search, Send, Plane, Filter,
  ChevronDown, ChevronUp, Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmailReplyInStep {
  id: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  isOOO?: boolean;
}

interface SentStep {
  id: string;
  channel: string;
  subject: string | null;
  content: string;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  repliedAt: string | null;
  isOOO: boolean;
  emailReplies: EmailReplyInStep[];
}

interface LinkedInReply {
  id: string;
  senderName: string;
  messageText: string;
  receivedAt: string;
  isRead: boolean;
  linkedInUrl: string;
}

interface EmailReply {
  id: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  isOOO: boolean;
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
  hubspotContactId: string | null;
  sentSteps: SentStep[];
  linkedInReplies: LinkedInReply[];
  emailReplies: EmailReply[];
}

interface Props {
  conversations: Conversation[];
  calendarLink: string | null;
  workspaceId: string;
  unreadCount: number;
}

type ChannelFilter = "all" | "email" | "linkedin" | "unread";

// ─── Thread item type ─────────────────────────────────────────────────────────

type ThreadItem =
  | { kind: "sent"; step: SentStep }
  | { kind: "email-reply"; reply: EmailReply; ts: string }
  | { kind: "li-reply"; reply: LinkedInReply; ts: string }
  | { kind: "li-preview"; text: string; respondedAt: string | null; name: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function statusColor(status: string) {
  if (status === "RESPONDED" || status === "REPLIED") return { bg: "var(--violet-soft)", fg: "var(--violet-fg)", label: "A répondu" };
  if (status === "MEETING_BOOKED") return { bg: "var(--emerald-soft)", fg: "var(--emerald-fg)", label: "RDV booké" };
  if (status === "CONTACTED") return { bg: "var(--amber-soft)", fg: "var(--amber-fg)", label: "Contacté" };
  if (status === "RESEARCHED") return { bg: "var(--bg-2)", fg: "var(--fg-mute)", label: "Recherché" };
  return { bg: "var(--bg-2)", fg: "var(--fg-mute)", label: status };
}

function getInitials(name: string) {
  return name.split(" ").map((p) => p[0] ?? "").join("").slice(0, 2).toUpperCase();
}

function buildThread(c: Conversation): ThreadItem[] {
  const items: ThreadItem[] = [];

  for (const step of c.sentSteps) {
    items.push({ kind: "sent", step });
    for (const er of step.emailReplies) {
      items.push({ kind: "email-reply", reply: { ...er, isOOO: er.isOOO ?? false }, ts: er.receivedAt });
    }
  }
  for (const r of c.emailReplies) {
    // Avoid duplicates already added via sentSteps
    const alreadyAdded = c.sentSteps.some((s) => s.emailReplies.some((er) => er.id === r.id));
    if (!alreadyAdded) items.push({ kind: "email-reply", reply: r, ts: r.receivedAt });
  }
  for (const r of c.linkedInReplies) {
    items.push({ kind: "li-reply", reply: r, ts: r.receivedAt });
  }
  if (c.replyPreview && c.linkedInReplies.length === 0) {
    items.push({ kind: "li-preview", text: c.replyPreview, respondedAt: c.respondedAt, name: c.name });
  }

  // Sort chronologically
  items.sort((a, b) => {
    const tsA = a.kind === "sent" ? (a.step.sentAt ?? "9999") : a.kind === "li-preview" ? (a.respondedAt ?? "9999") : a.ts;
    const tsB = b.kind === "sent" ? (b.step.sentAt ?? "9999") : b.kind === "li-preview" ? (b.respondedAt ?? "9999") : b.ts;
    return new Date(tsA).getTime() - new Date(tsB).getTime();
  });

  return items;
}

function getLastActivity(c: Conversation): string {
  const dates: string[] = [c.updatedAt];
  if (c.respondedAt) dates.push(c.respondedAt);
  c.linkedInReplies.forEach((r) => dates.push(r.receivedAt));
  c.emailReplies.forEach((r) => dates.push(r.receivedAt));
  c.sentSteps.forEach((s) => { if (s.sentAt) dates.push(s.sentAt); });
  return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? c.updatedAt;
}

function getLastMessage(c: Conversation): string | null {
  if (c.emailReplies.length > 0) {
    const last = c.emailReplies.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0];
    return last?.snippet ?? null;
  }
  if (c.linkedInReplies.length > 0) {
    const last = c.linkedInReplies.sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())[0];
    return last?.messageText.slice(0, 60) ?? null;
  }
  if (c.replyPreview) return c.replyPreview.slice(0, 60);
  return null;
}

function hasUnread(c: Conversation): boolean {
  return c.linkedInReplies.some((r) => !r.isRead) || c.emailReplies.length > 0;
}

function hasEmailActivity(c: Conversation): boolean {
  return c.emailReplies.length > 0 || c.sentSteps.some((s) => s.channel === "EMAIL");
}

function hasLinkedInActivity(c: Conversation): boolean {
  return c.linkedInReplies.length > 0 || c.sentSteps.some((s) => s.channel === "LINKEDIN") || !!c.replyPreview;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CsoInbox({ conversations, calendarLink, workspaceId, unreadCount }: Props) {
  const router = useRouter();
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(conversations[0]?.id ?? null);
  const [suggestions, setSuggestions] = useState<Record<string, { intent: string; intentLabel: string; suggestedReply: string; reasoning: string }>>({});
  const [suggestingId, setSuggestingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [bookedIds, setBookedIds] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [composeEmail, setComposeEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const composeRef = useRef<HTMLTextAreaElement>(null);

  const filtered = useMemo(() => {
    let list = conversations;

    if (channelFilter === "email") list = list.filter(hasEmailActivity);
    else if (channelFilter === "linkedin") list = list.filter(hasLinkedInActivity);
    else if (channelFilter === "unread") list = list.filter(hasUnread);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q) ||
          (c.jobTitle ?? "").toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) =>
      new Date(getLastActivity(b)).getTime() - new Date(getLastActivity(a)).getTime()
    );
  }, [conversations, channelFilter, search]);

  const conversation = filtered.find((c) => c.id === selected) ?? filtered[0] ?? null;

  const thread = useMemo(() => (conversation ? buildThread(conversation) : []), [conversation]);

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
        if (composeRef.current && conversation?.email) {
          setComposeEmail(json.suggestedReply);
          composeRef.current.focus();
        }
      } else {
        toast.error("Erreur lors de la génération");
      }
    } finally {
      setSuggestingId(null);
    }
  }, [suggestions, conversation?.email]);

  const copyReply = useCallback((prospectId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(prospectId);
    toast.success("Copié dans le presse-papier");
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

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetch("/api/linkedin-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      toast.success("Vérification lancée — actualisation dans quelques secondes");
      setTimeout(() => router.refresh(), 3000);
    } catch {
      toast.error("Erreur lors de la vérification");
    } finally {
      setIsRefreshing(false);
    }
  }, [workspaceId, router]);

  const markReplyRead = useCallback(async (replyId: string) => {
    setReadIds((prev) => new Set([...prev, replyId]));
    await fetch("/api/linkedin-inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyId }),
    }).catch(() => {});
  }, []);

  const sendEmailReply = useCallback(async () => {
    if (!conversation?.email || !composeEmail.trim()) return;
    setSendingEmail(true);
    try {
      const res = await fetch("/api/sequences/reply-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospectId: conversation.id,
          email: conversation.email,
          body: composeEmail,
        }),
      });
      if (res.ok) {
        toast.success("Email envoyé");
        setComposeEmail("");
      } else {
        const j = await res.json();
        toast.error(j.error ?? "Erreur d'envoi");
      }
    } finally {
      setSendingEmail(false);
    }
  }, [conversation, composeEmail]);

  const tabs: { key: ChannelFilter; label: string; count?: number }[] = [
    { key: "all", label: "Tout", count: conversations.length },
    { key: "unread", label: "Non lus", count: unreadCount > 0 ? unreadCount : undefined },
    { key: "email", label: "Email" },
    { key: "linkedin", label: "LinkedIn" },
  ];

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
        <MessageSquare className="h-10 w-10 opacity-20" style={{ color: "var(--fg-mute)" }} />
        <p className="text-[14px]" style={{ color: "var(--fg-mute)" }}>Aucune conversation pour l'instant</p>
        <p className="text-[12px] text-center max-w-xs" style={{ color: "var(--fg-mute)" }}>
          Les réponses email et LinkedIn apparaîtront ici dès qu'un prospect interagit avec vos séquences.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-80px)] overflow-hidden rounded-[16px]"
      style={{ border: "1px solid var(--line)", background: "var(--bg-card)" }}>

      {/* ── Panel gauche — Liste ─────────────────────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col" style={{ borderRight: "1px solid var(--line)" }}>

        {/* Header + refresh */}
        <div className="px-4 py-3 flex items-center justify-between shrink-0"
          style={{ borderBottom: "1px solid var(--line)" }}>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--fg)" }}>Inbox</h2>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                  style={{ background: "var(--violet-fg)", color: "white" }}>
                  {unreadCount}
                </span>
              )}
            </div>
            <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
              {filtered.length} / {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button onClick={handleRefresh} disabled={isRefreshing}
            className="p-1.5 rounded-lg transition-colors hover:brightness-110 disabled:opacity-40"
            style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-mute)" }}
            title="Vérifier les nouvelles réponses LinkedIn">
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
            style={{ background: "var(--bg-2)", border: "1px solid var(--line)" }}>
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--fg-mute)" }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="bg-transparent text-[12px] flex-1 outline-none"
              style={{ color: "var(--fg)" }}
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="px-3 py-1.5 flex gap-1 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setChannelFilter(tab.key)}
              className="flex items-center gap-1 text-[10.5px] font-medium px-2 py-1 rounded-md transition-colors"
              style={{
                background: channelFilter === tab.key ? "var(--violet-soft)" : "transparent",
                color: channelFilter === tab.key ? "var(--violet-fg)" : "var(--fg-mute)",
              }}
            >
              {tab.key === "email" && <Mail className="h-2.5 w-2.5" />}
              {tab.key === "linkedin" && <Linkedin className="h-2.5 w-2.5" />}
              {tab.key === "unread" && <Circle className="h-2.5 w-2.5 fill-current" />}
              {tab.label}
              {tab.count !== undefined && (
                <span className="ml-0.5 text-[9px] font-bold"
                  style={{ color: channelFilter === tab.key ? "var(--violet-fg)" : "var(--fg-mute)" }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <Filter className="h-5 w-5 opacity-20" style={{ color: "var(--fg-mute)" }} />
              <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>Aucun résultat</p>
            </div>
          ) : (
            filtered.map((c) => {
              const s = statusColor(c.status);
              const isBooked = bookedIds.has(c.id);
              const unread = hasUnread(c);
              const lastMsg = getLastMessage(c);
              const lastTs = getLastActivity(c);
              const hasEmail = hasEmailActivity(c);
              const hasLi = hasLinkedInActivity(c);

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
                  {/* Avatar with unread dot */}
                  <div className="relative shrink-0 mt-0.5">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold"
                      style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}>
                      {getInitials(c.name)}
                    </div>
                    {unread && !readIds.has(c.id) && (
                      <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg-card)]"
                        style={{ background: "var(--violet-fg)" }} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 justify-between">
                      <p className="text-[12.5px] font-semibold truncate" style={{ color: "var(--fg)" }}>{c.name}</p>
                      <span className="text-[10px] shrink-0" style={{ color: "var(--fg-mute)" }}>{timeAgo(lastTs)}</span>
                    </div>
                    <p className="text-[11px] truncate" style={{ color: "var(--fg-mute)" }}>
                      {c.jobTitle ? `${c.jobTitle} · ` : ""}{c.company}
                    </p>
                    {lastMsg && (
                      <p className="text-[11px] truncate mt-0.5 italic" style={{ color: "var(--fg-dim)" }}>
                        {lastMsg.slice(0, 55)}{lastMsg.length > 55 ? "…" : ""}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded"
                        style={{ background: isBooked ? "var(--emerald-soft)" : s.bg, color: isBooked ? "var(--emerald-fg)" : s.fg }}>
                        {isBooked ? "RDV BOOKÉ" : s.label}
                      </span>
                      {hasEmail && <Mail className="h-2.5 w-2.5" style={{ color: "var(--fg-mute)" }} />}
                      {hasLi && <Linkedin className="h-2.5 w-2.5" style={{ color: "var(--fg-mute)" }} />}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Panel centre — Thread ─────────────────────────────────────────── */}
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
                {conversation.hubspotContactId && (
                  <span className="ml-2 text-[9px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(255,122,89,0.15)", color: "#FF7A59" }}>
                    HS
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {conversation.linkedInUrl && (
                <a href={conversation.linkedInUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg"
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

          {/* Thread interleaved */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {thread.map((item, idx) => {
              if (item.kind === "sent") {
                const step = item.step;
                const isExpanded = expandedStepId === step.id;
                return (
                  <div key={step.id} className="flex justify-end">
                    <div className="max-w-[75%] space-y-1">
                      <div className="flex items-center gap-1.5 justify-end text-[10px]" style={{ color: "var(--fg-mute)" }}>
                        {step.channel === "EMAIL" ? <Mail className="h-3 w-3" /> : <Linkedin className="h-3 w-3" />}
                        <span>{step.channel === "EMAIL" ? step.subject ?? "Email" : "LinkedIn"}</span>
                        {step.status === "OPENED" && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />}
                        {step.status === "REPLIED" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />}
                        {(step.status === "SENT" || step.status === "DELIVERED") && <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />}
                        <span>{step.status === "OPENED" ? "Ouvert" : step.status === "REPLIED" ? "Répondu" : "Envoyé"}</span>
                        <span>· {timeAgo(step.sentAt)}</span>
                        {step.isOOO && (
                          <span className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold"
                            style={{ background: "rgba(14,165,233,0.15)", color: "#38bdf8" }}>
                            <Plane className="h-2.5 w-2.5" /> OOO
                          </span>
                        )}
                      </div>
                      <div
                        className="rounded-[12px] text-[12.5px] leading-relaxed overflow-hidden cursor-pointer"
                        onClick={() => setExpandedStepId(isExpanded ? null : step.id)}
                        style={{ background: "var(--violet-fg)", color: "white" }}
                      >
                        <div className="px-3.5 py-2.5">
                          {isExpanded ? (
                            <span className="whitespace-pre-wrap">{step.content}</span>
                          ) : (
                            <span>{step.content.slice(0, 200)}{step.content.length > 200 ? "…" : ""}</span>
                          )}
                        </div>
                        {step.content.length > 200 && (
                          <div className="flex items-center justify-end gap-1 px-3 py-1.5 text-[10px] opacity-70">
                            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            {isExpanded ? "Réduire" : "Voir tout"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              if (item.kind === "email-reply") {
                const r = item.reply;
                return (
                  <div key={r.id} className="flex justify-start">
                    <div className="max-w-[75%] space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--fg-mute)" }}>
                        <Mail className="h-3 w-3" />
                        <span>{r.fromEmail}</span>
                        {r.subject && <span className="truncate max-w-[120px]">· {r.subject}</span>}
                        <span>· {timeAgo(r.receivedAt)}</span>
                        {r.isOOO && (
                          <span className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold"
                            style={{ background: "rgba(14,165,233,0.15)", color: "#38bdf8" }}>
                            <Plane className="h-2.5 w-2.5" /> OOO
                          </span>
                        )}
                      </div>
                      <div className="rounded-[12px] px-3.5 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap"
                        style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                        {r.snippet}
                      </div>
                    </div>
                  </div>
                );
              }

              if (item.kind === "li-reply") {
                const r = item.reply;
                const isUnread = !r.isRead && !readIds.has(r.id);
                return (
                  <div key={r.id} className="flex justify-start"
                    onMouseEnter={() => isUnread && markReplyRead(r.id)}>
                    <div className="max-w-[75%] space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--fg-mute)" }}>
                        <Linkedin className="h-3 w-3" />
                        <span>{r.senderName}</span>
                        <span>· {timeAgo(r.receivedAt)}</span>
                        {isUnread && <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: "var(--violet-fg)" }} />}
                      </div>
                      <div className="rounded-[12px] px-3.5 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap"
                        style={{
                          background: "var(--bg-2)",
                          border: isUnread ? "1px solid var(--violet-line)" : "1px solid var(--line)",
                          color: "var(--fg-dim)",
                        }}>
                        {r.messageText}
                      </div>
                    </div>
                  </div>
                );
              }

              if (item.kind === "li-preview") {
                return (
                  <div key={`preview-${idx}`} className="flex justify-start">
                    <div className="max-w-[75%] space-y-1">
                      <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--fg-mute)" }}>
                        <Linkedin className="h-3 w-3" />
                        <span>{item.name}</span>
                        <span>· {timeAgo(item.respondedAt)}</span>
                      </div>
                      <div className="rounded-[12px] px-3.5 py-2.5 text-[12.5px] leading-relaxed italic"
                        style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                        &ldquo;{item.text}&rdquo;
                      </div>
                    </div>
                  </div>
                );
              }

              return null;
            })}

            {/* AI suggestion inline */}
            {conversation && suggestions[conversation.id] && (
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
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg"
                      style={{ background: "var(--violet-fg)", color: "white" }}>
                      {copiedId === conversation.id ? <><Check className="h-3 w-3" /> Copié</> : <><Copy className="h-3 w-3" /> Copier</>}
                    </button>
                    {calendarLink && (
                      <a href={calendarLink} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg"
                        style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)", color: "var(--emerald-fg)" }}>
                        <Calendar className="h-3 w-3" /> Calendly
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Compose / Actions bar ─────────────────────────────────────── */}
          <div className="shrink-0" style={{ borderTop: "1px solid var(--line)" }}>
            {/* Email compose (si le prospect a un email) */}
            {conversation.email && (
              <div className="px-4 pt-3 pb-1">
                <textarea
                  ref={composeRef}
                  rows={2}
                  value={composeEmail}
                  onChange={(e) => setComposeEmail(e.target.value)}
                  placeholder={`Répondre à ${conversation.email}…`}
                  className="w-full resize-none text-[12.5px] leading-relaxed bg-transparent outline-none"
                  style={{ color: "var(--fg)", caretColor: "var(--violet-fg)" }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendEmailReply();
                  }}
                />
              </div>
            )}

            <div className="px-4 py-3 flex items-center gap-2">
              <Button
                onClick={() => conversation && suggestReply(conversation.id)}
                disabled={suggestingId === conversation?.id}
                size="sm"
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                {suggestingId === conversation?.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                )}
                {conversation && suggestions[conversation.id] ? "Regénérer" : "Rédiger avec IA"}
              </Button>

              {conversation.email && composeEmail.trim() && (
                <Button
                  onClick={sendEmailReply}
                  disabled={sendingEmail}
                  size="sm"
                  variant="outline"
                  className="text-[12px]"
                  style={{ borderColor: "var(--line)", color: "var(--fg)" }}
                >
                  {sendingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                  Envoyer ⌘↵
                </Button>
              )}

              {calendarLink && (
                <a href={calendarLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg"
                  style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)", color: "var(--emerald-fg)" }}>
                  <Calendar className="h-3.5 w-3.5" /> Calendly
                </a>
              )}

              <span className="flex items-center gap-1 text-[11px] ml-auto" style={{ color: "var(--fg-mute)" }}>
                <Clock className="h-3 w-3" />
                {timeAgo(getLastActivity(conversation))}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Panel droit — Profil ──────────────────────────────────────────── */}
      {conversation && (
        <div className="w-64 shrink-0 flex flex-col overflow-y-auto"
          style={{ borderLeft: "1px solid var(--line)" }}>
          <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--line)" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-mute)" }}>Profil</p>
          </div>

          <div className="px-4 py-4 space-y-4">
            {/* Identité */}
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}>
                {getInitials(conversation.name)}
              </div>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>{conversation.name}</p>
                {conversation.jobTitle && (
                  <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>{conversation.jobTitle}</p>
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
              <p className="text-[18px] font-bold tabular-nums"
                style={{ color: conversation.score >= 70 ? "var(--emerald-fg)" : "var(--amber-fg)" }}>
                {conversation.score}
              </p>
            </div>

            {/* Stats conversation */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg p-2 text-center"
                style={{ background: "var(--bg-2)", border: "1px solid var(--line)" }}>
                <p className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>
                  {conversation.sentSteps.length}
                </p>
                <p className="text-[9px] uppercase tracking-wide" style={{ color: "var(--fg-mute)" }}>Envoyés</p>
              </div>
              <div className="rounded-lg p-2 text-center"
                style={{ background: "var(--bg-2)", border: "1px solid var(--line)" }}>
                <p className="text-[16px] font-bold" style={{ color: "var(--fg)" }}>
                  {conversation.emailReplies.length + conversation.linkedInReplies.length}
                </p>
                <p className="text-[9px] uppercase tracking-wide" style={{ color: "var(--fg-mute)" }}>Réponses</p>
              </div>
            </div>

            {/* HubSpot badge */}
            {conversation.hubspotContactId && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: "rgba(255,122,89,0.08)", border: "1px solid rgba(255,122,89,0.2)" }}>
                <span className="h-4 w-4 rounded flex items-center justify-center text-[8px] font-bold shrink-0"
                  style={{ background: "#FF7A59", color: "white" }}>HS</span>
                <p className="text-[11px]" style={{ color: "#FF7A59" }}>Synchro HubSpot</p>
              </div>
            )}

            {/* Headline */}
            {conversation.headline && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--fg-mute)" }}>
                  Headline LinkedIn
                </p>
                <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
                  {conversation.headline}
                </p>
              </div>
            )}

            {/* À propos */}
            {conversation.about && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--fg-mute)" }}>
                  À propos
                </p>
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
                  {conversation.about.slice(0, 250)}{conversation.about.length > 250 ? "…" : ""}
                </p>
              </div>
            )}

            {/* Liens */}
            <div className="space-y-2 pt-1">
              {conversation.linkedInUrl && (
                <a href={conversation.linkedInUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[11.5px] w-full px-3 py-2 rounded-lg"
                  style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                  <Linkedin className="h-3.5 w-3.5 shrink-0" />
                  Voir sur LinkedIn
                  <ExternalLink className="h-3 w-3 ml-auto" />
                </a>
              )}
              {conversation.email && !conversation.email.includes("@discovery.skalle") && (
                <a href={`mailto:${conversation.email}`}
                  className="flex items-center gap-2 text-[11.5px] w-full px-3 py-2 rounded-lg"
                  style={{ background: "var(--bg-2)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {conversation.email}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
