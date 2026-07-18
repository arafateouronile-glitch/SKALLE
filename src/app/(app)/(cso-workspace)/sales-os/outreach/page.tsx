"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppTopBar } from "@/components/modules/app-topbar";
import {
  Send,
  Mail,
  Linkedin,
  Loader2,
  Inbox,
  Clock,
  Zap,
  Search,
  X,
  Sparkles,
} from "lucide-react";
import { getUserWorkspace } from "@/actions/leads";
import { getSequences } from "@/actions/sequences";
import { getScoredProspectsForDashboard } from "@/actions/cso-sales";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InboxReply {
  id: string;
  receivedAt: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  sentMessage: string | null;
  prospect: {
    id: string;
    name: string;
    email: string | null;
    company: string | null;
    linkedInUrl: string | null;
    platform: string | null;
  } | null;
}

interface SeqStep {
  channel: "EMAIL" | "LINKEDIN";
  status: string;
}

interface RealSequence {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  prospect: { id: string; name: string; email: string | null; company: string };
  steps: SeqStep[];
}

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

function getReplyRate(steps: SeqStep[]) {
  const sentCount = steps.filter((s) =>
    ["SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED"].includes(s.status)
  ).length;
  if (!sentCount) return "—";
  const replied = steps.filter((s) => s.status === "REPLIED").length;
  return `${Math.round((replied / sentCount) * 100)}%`;
}

function getChannels(steps: SeqStep[]): Array<"EMAIL" | "LINKEDIN"> {
  return [...new Set(steps.map((s) => s.channel))];
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

const CHANNEL_ICON: Record<string, React.ElementType> = {
  EMAIL: Mail,
  LINKEDIN: Linkedin,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

interface ProspectOption { id: string; name: string; company: string; }

export default function OutreachPage() {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"inbox" | "sequences">("inbox");
  const [inbox, setInbox] = useState<InboxReply[]>([]);
  const [sequences, setSequences] = useState<RealSequence[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingSeq, setLoadingSeq] = useState(true);
  const [selectedReply, setSelectedReply] = useState<InboxReply | null>(null);
  const [replyText, setReplyText] = useState("");
  const [showNewSeq, setShowNewSeq] = useState(false);
  const [prospects, setProspects] = useState<ProspectOption[]>([]);
  const [prospectSearch, setProspectSearch] = useState("");

  useEffect(() => {
    getUserWorkspace().then((r) => {
      if (r.success && r.workspaceId) setWorkspaceId(r.workspaceId);
    });
  }, []);

  useEffect(() => {
    setLoadingInbox(true);
    fetch("/api/sales/reply-inbox")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: InboxReply[]) => {
        setInbox(data);
        if (data.length > 0 && !selectedReply) setSelectedReply(data[0]);
      })
      .catch(() => setInbox([]))
      .finally(() => setLoadingInbox(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    setLoadingSeq(true);
    getSequences(workspaceId)
      .then((r) => setSequences(r.success && r.data ? (r.data as RealSequence[]) : []))
      .finally(() => setLoadingSeq(false));
  }, [workspaceId]);

  useEffect(() => {
    if (!showNewSeq || !workspaceId || prospects.length > 0) return;
    getScoredProspectsForDashboard(workspaceId).then((r) => {
      setProspects(r.success && r.data ? r.data.map((p) => ({ id: p.id, name: p.name, company: p.company })) : []);
    });
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [showNewSeq, workspaceId, prospects.length]);

  const TABS = [
    { id: "inbox" as const, label: "Boîte de réponses", count: inbox.length },
    { id: "sequences" as const, label: "Mes séquences", count: sequences.length },
  ];

  return (
    <>
      <AppTopBar
        title="Outreach"
        breadcrumb="sales-os / outreach"
        cta="+ Nouvelle séquence"
        onCta={() => setShowNewSeq(true)}
        accent="emerald"
      />

      {/* ── Nouvelle séquence dialog ── */}
      {showNewSeq && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "oklch(0 0 0 / 0.5)", backdropFilter: "blur(4px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewSeq(false); }}
        >
          <div
            className="w-full max-w-md rounded-[20px] p-6 flex flex-col gap-4"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[16px] font-semibold" style={{ color: "var(--fg)" }}>Nouvelle séquence</h2>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--fg-mute)" }}>Choisissez un prospect pour générer des messages IA</p>
              </div>
              <button
                onClick={() => setShowNewSeq(false)}
                className="p-1.5 rounded-lg transition-all hover:bg-black/[0.05]"
                style={{ color: "var(--fg-mute)" }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search */}
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-[10px]"
              style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
            >
              <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--fg-mute)" }} />
              <input
                ref={searchRef}
                value={prospectSearch}
                onChange={(e) => setProspectSearch(e.target.value)}
                placeholder="Rechercher un prospect…"
                className="flex-1 bg-transparent text-[13px] outline-none"
                style={{ color: "var(--fg)" }}
              />
            </div>

            {/* Prospect list */}
            <div className="overflow-y-auto max-h-64 space-y-1 -mx-1 px-1">
              {prospects
                .filter((p) =>
                  prospectSearch.trim() === "" ||
                  p.name.toLowerCase().includes(prospectSearch.toLowerCase()) ||
                  p.company.toLowerCase().includes(prospectSearch.toLowerCase())
                )
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setShowNewSeq(false);
                      router.push(`/sales-os/reply-assistant?prospectId=${p.id}`);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-[10px] text-left transition-all hover:brightness-[0.97]"
                    style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
                  >
                    <div>
                      <p className="text-[13px] font-medium" style={{ color: "var(--fg)" }}>{p.name}</p>
                      <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>{p.company}</p>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: "var(--violet-fg)" }}>
                      <Sparkles className="h-3 w-3" />
                      Générer
                    </div>
                  </button>
                ))}
              {prospects.length === 0 && (
                <div className="text-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" style={{ color: "var(--fg-mute)" }} />
                </div>
              )}
              {prospects.length > 0 &&
                prospects.filter((p) =>
                  p.name.toLowerCase().includes(prospectSearch.toLowerCase()) ||
                  p.company.toLowerCase().includes(prospectSearch.toLowerCase())
                ).length === 0 && (
                  <p className="text-center text-[12px] py-6" style={{ color: "var(--fg-mute)" }}>
                    Aucun prospect trouvé
                  </p>
                )}
            </div>

            <Link
              href="/sales-os/hunt"
              className="text-center text-[12px] font-medium py-2 rounded-[8px] transition-all hover:brightness-[0.97]"
              style={{ background: "var(--amber-soft)", color: "var(--amber-fg)", border: "1px solid var(--amber-line)" }}
              onClick={() => setShowNewSeq(false)}
            >
              Aucun prospect ? Trouver des leads dans Hunt →
            </Link>
          </div>
        </div>
      )}

      <div className="px-6 pt-4 pb-6 space-y-4 max-w-[1400px]">

        {/* Tabs */}
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
                    ? { background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" }
                    : { color: "var(--fg-dim)", border: "1px solid transparent" }
                }
              >
                {tab.label}
                <span
                  className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                  style={{
                    background: active ? "var(--emerald-fg)" : "oklch(0.21 0.03 260 / 0.05)",
                    color: active ? "white" : "var(--fg-mute)",
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── INBOX TAB ── */}
        {activeTab === "inbox" && (
          <div className="grid grid-cols-12 gap-4" style={{ height: "calc(100vh - 200px)" }}>

            {/* Left — conversation list */}
            <div
              className="col-span-4 rounded-[18px] overflow-hidden flex flex-col"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="p-4 pb-3" style={{ borderBottom: "1px solid var(--line)" }}>
                <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-mute)" }}>
                  Réponses reçues
                </p>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loadingInbox && (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--emerald-fg)" }} />
                  </div>
                )}

                {!loadingInbox && inbox.length === 0 && (
                  <div className="text-center py-12 px-4">
                    <Inbox className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--fg-mute)", opacity: 0.4 }} />
                    <p className="text-[13px] font-medium" style={{ color: "var(--fg-dim)" }}>Aucune réponse détectée</p>
                    <p className="text-[12px] mt-1" style={{ color: "var(--fg-mute)" }}>
                      Les réponses à vos séquences email apparaîtront ici.
                    </p>
                  </div>
                )}

                {inbox.map((reply) => {
                  const name = reply.prospect?.name ?? reply.fromEmail;
                  const company = reply.prospect?.company ?? "";
                  const active = selectedReply?.id === reply.id;
                  return (
                    <button
                      key={reply.id}
                      onClick={() => setSelectedReply(reply)}
                      className="w-full text-left px-4 py-3.5 transition-all hover:brightness-[0.97]"
                      style={{
                        background: active ? "var(--emerald-soft)" : "transparent",
                        borderBottom: "1px solid var(--line)",
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5"
                          style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}
                        >
                          {getInitials(name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>{name}</p>
                            <span className="text-[10px] font-mono" style={{ color: "var(--fg-mute)" }}>
                              {timeAgo(reply.receivedAt)}
                            </span>
                          </div>
                          {company && (
                            <p className="text-[11px] mb-1" style={{ color: "var(--fg-mute)" }}>{company}</p>
                          )}
                          <p className="text-[11.5px] truncate" style={{ color: "var(--fg-dim)" }}>{reply.snippet}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right — conversation detail */}
            <div
              className="col-span-8 rounded-[18px] flex flex-col overflow-hidden"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
            >
              {selectedReply ? (
                <>
                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold"
                        style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)" }}
                      >
                        {getInitials(selectedReply.prospect?.name ?? selectedReply.fromEmail)}
                      </div>
                      <div>
                        <p className="text-[14px] font-semibold" style={{ color: "var(--fg)" }}>
                          {selectedReply.prospect?.name ?? selectedReply.fromEmail}
                        </p>
                        {selectedReply.prospect?.company && (
                          <p className="text-[12px]" style={{ color: "var(--fg-mute)" }}>{selectedReply.prospect.company}</p>
                        )}
                      </div>
                    </div>
                    {selectedReply.subject && (
                      <p className="text-[12px] truncate max-w-[280px]" style={{ color: "var(--fg-mute)" }}>
                        Objet : {selectedReply.subject}
                      </p>
                    )}
                  </div>

                  {/* Messages timeline */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {selectedReply.sentMessage && (
                      <div className="flex justify-start">
                        <div
                          className="max-w-[70%] rounded-[12px] px-4 py-3"
                          style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
                        >
                          <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--fg)" }}>
                            {selectedReply.sentMessage}
                          </p>
                          <p className="text-[10px] mt-1.5 flex items-center gap-1" style={{ color: "var(--fg-mute)" }}>
                            <Clock className="h-3 w-3" /> Message envoyé
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-end">
                      <div
                        className="max-w-[70%] rounded-[12px] px-4 py-3"
                        style={{ background: "var(--emerald-soft)", border: "1px solid var(--emerald-line)" }}
                      >
                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--fg)" }}>
                          {selectedReply.snippet}
                        </p>
                        <p className="text-[10px] mt-1.5" style={{ color: "var(--fg-mute)" }}>
                          {new Date(selectedReply.receivedAt).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Reply zone */}
                  <div className="px-6 py-4 space-y-3" style={{ borderTop: "1px solid var(--line)" }}>
                    {/* CTA Reply Assistant */}
                    {selectedReply.prospect && (
                      <div
                        className="flex items-center justify-between px-4 py-3 rounded-[12px]"
                        style={{ background: "oklch(0.97 0.02 270)", border: "1px solid oklch(0.91 0.04 270)" }}
                      >
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 shrink-0" style={{ color: "var(--emerald-fg)" }} />
                          <span className="text-[12px] font-medium" style={{ color: "var(--fg-dim)" }}>
                            Générer une réponse IA personnalisée avec le Reply Assistant
                          </span>
                        </div>
                        <Link
                          href={`/sales-os/reply-assistant?prospectId=${selectedReply.prospect.id}`}
                          className="text-[12px] font-semibold px-3 py-1.5 rounded-[8px] shrink-0 transition-all hover:brightness-110"
                          style={{ background: "var(--emerald-fg)", color: "white" }}
                        >
                          Ouvrir →
                        </Link>
                      </div>
                    )}

                    {/* Quick reply composer */}
                    <div
                      className="flex items-end gap-3 px-4 py-3 rounded-[12px]"
                      style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
                    >
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={2}
                        className="flex-1 bg-transparent text-[13px] outline-none resize-none placeholder:opacity-50"
                        style={{ color: "var(--fg)" }}
                        placeholder="Répondre rapidement..."
                      />
                      <button
                        onClick={() => setReplyText("")}
                        disabled={!replyText.trim()}
                        className="p-2 rounded-[8px] transition-all hover:brightness-110 shrink-0 disabled:opacity-40"
                        style={{ background: "var(--emerald-fg)", color: "white" }}
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <Inbox className="h-10 w-10" style={{ color: "var(--fg-mute)", opacity: 0.3 }} />
                  <p className="text-[13px]" style={{ color: "var(--fg-mute)" }}>
                    Sélectionne une réponse pour voir la conversation
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SEQUENCES TAB ── */}
        {activeTab === "sequences" && (
          <section
            className="rounded-[18px] p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
          >
            {loadingSeq ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--emerald-fg)" }} />
              </div>
            ) : sequences.length === 0 ? (
              <div className="text-center py-12">
                <Mail className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--fg-mute)", opacity: 0.4 }} />
                <p className="text-[13px] font-medium" style={{ color: "var(--fg-dim)" }}>Aucune séquence</p>
                <p className="text-[12px] mt-1" style={{ color: "var(--fg-mute)" }}>
                  Créez une séquence depuis la page Prospects.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div
                  className="grid gap-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ gridTemplateColumns: "2.5fr 1.5fr 1fr 1fr 1fr", color: "var(--fg-mute)" }}
                >
                  <span>Séquence / Prospect</span>
                  <span>Canaux</span>
                  <span>Étapes</span>
                  <span>Taux rép.</span>
                  <span>Statut</span>
                </div>

                {sequences.map((seq) => {
                  const channels = getChannels(seq.steps);
                  const replyRate = getReplyRate(seq.steps);
                  const totalSteps = seq.steps.length;
                  const sentSteps = seq.steps.filter((s) =>
                    ["SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED"].includes(s.status)
                  ).length;

                  return (
                    <div
                      key={seq.id}
                      className="grid items-center gap-4 px-4 py-4 rounded-[12px]"
                      style={{ gridTemplateColumns: "2.5fr 1.5fr 1fr 1fr 1fr", background: "var(--bg)", border: "1px solid var(--line)" }}
                    >
                      <div>
                        <p className="text-[13px] font-medium truncate" style={{ color: "var(--fg)" }}>{seq.name}</p>
                        <p className="text-[11px] truncate mt-0.5" style={{ color: "var(--fg-mute)" }}>
                          {seq.prospect.name}
                          {seq.prospect.company ? ` · ${seq.prospect.company}` : ""}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {channels.map((ch) => {
                          const Icon = CHANNEL_ICON[ch] ?? Mail;
                          return <Icon key={ch} className="h-3.5 w-3.5" style={{ color: "var(--fg-mute)" }} />;
                        })}
                      </div>

                      <span className="text-[13px] font-mono" style={{ color: "var(--fg-dim)" }}>
                        {sentSteps}/{totalSteps}
                      </span>

                      <span
                        className="text-[13px] font-semibold tabular-nums"
                        style={{ color: replyRate !== "—" ? "var(--emerald-fg)" : "var(--fg-mute)" }}
                      >
                        {replyRate}
                      </span>

                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded w-fit"
                        style={
                          seq.isActive
                            ? { background: "var(--emerald-soft)", color: "var(--emerald-fg)" }
                            : { background: "oklch(0.21 0.03 260 / 0.06)", color: "var(--fg-mute)" }
                        }
                      >
                        {seq.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}
