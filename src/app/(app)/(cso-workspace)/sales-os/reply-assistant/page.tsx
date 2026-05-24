"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReplyAssistant } from "@/components/sales/reply-assistant";
import { MessageCircle, Users, Loader2, Inbox, Mail, Clock, ArrowRight, Linkedin, RefreshCw } from "lucide-react";
import Link from "next/link";
import { getScoredProspectsForDashboard } from "@/actions/cso-sales";
import { getUserWorkspace } from "@/actions/leads";
import type { ScoredProspectForDashboard } from "@/actions/cso-sales";
import { buildMessagingLink } from "@/lib/services/sales/closer";
import { cn } from "@/lib/utils";

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

interface LinkedInReply {
  id: string;
  linkedInUrl: string;
  senderName: string;
  messageText: string;
  conversationUrn: string;
  receivedAt: string;
  isRead: boolean;
  prospect: {
    id: string;
    name: string;
    company: string | null;
    jobTitle: string | null;
    linkedInUrl: string;
    status: string;
  } | null;
}

export default function ReplyAssistantPage() {
  const searchParams = useSearchParams();
  const prospectIdFromUrl = useMemo(() => searchParams.get("prospectId"), [searchParams]);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [prospects, setProspects] = useState<ScoredProspectForDashboard[]>([]);
  const [selectedProspect, setSelectedProspect] = useState<ScoredProspectForDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  // Inbox
  const [tab, setTab] = useState<"inbox" | "linkedin" | "manual">("inbox");
  const [inbox, setInbox] = useState<InboxReply[]>([]);
  const [inboxLoading, setInboxLoading] = useState(true);
  const [selectedReply, setSelectedReply] = useState<InboxReply | null>(null);

  // LinkedIn inbox
  const [linkedInReplies, setLinkedInReplies] = useState<LinkedInReply[]>([]);
  const [linkedInLoading, setLinkedInLoading] = useState(false);
  const [selectedLinkedInReply, setSelectedLinkedInReply] = useState<LinkedInReply | null>(null);
  const [isRefreshingLinkedIn, setIsRefreshingLinkedIn] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await getUserWorkspace();
      if (res.success && res.workspaceId) setWorkspaceId(res.workspaceId);
    })();
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    (async () => {
      setLoading(true);
      const res = await getScoredProspectsForDashboard(workspaceId);
      if (res.success && res.data) setProspects(res.data);
      setLoading(false);
    })();
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    setInboxLoading(true);
    fetch("/api/sales/reply-inbox")
      .then((r) => r.ok ? r.json() : [])
      .then((data: InboxReply[]) => setInbox(data))
      .catch(() => setInbox([]))
      .finally(() => setInboxLoading(false));
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    setLinkedInLoading(true);
    fetch(`/api/linkedin-inbox?workspaceId=${workspaceId}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: LinkedInReply[]) => setLinkedInReplies(data))
      .catch(() => setLinkedInReplies([]))
      .finally(() => setLinkedInLoading(false));
  }, [workspaceId]);

  async function refreshLinkedInInbox() {
    if (!workspaceId) return;
    setIsRefreshingLinkedIn(true);
    try {
      await fetch("/api/linkedin-inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      // Recharge après 3s (le job Inngest est async)
      setTimeout(async () => {
        const r = await fetch(`/api/linkedin-inbox?workspaceId=${workspaceId}`);
        if (r.ok) setLinkedInReplies(await r.json());
        setIsRefreshingLinkedIn(false);
      }, 3_000);
    } catch {
      setIsRefreshingLinkedIn(false);
    }
  }

  async function markLinkedInRead(replyId: string) {
    await fetch("/api/linkedin-inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyId }),
    });
    setLinkedInReplies((prev) => prev.map((r) => r.id === replyId ? { ...r, isRead: true } : r));
  }

  useEffect(() => {
    if (!prospectIdFromUrl || !prospects.length) return;
    const p = prospects.find((x) => x.id === prospectIdFromUrl) ?? null;
    setSelectedProspect(p);
    if (p) setTab("manual");
  }, [prospectIdFromUrl, prospects]);

  const platform = (selectedProspect?.platform as "LINKEDIN" | "INSTAGRAM" | "FACEBOOK") || "LINKEDIN";
  const messagingLink = selectedProspect
    ? buildMessagingLink(
        { linkedInUrl: selectedProspect.linkedInUrl, profileUrl: null, metaUserId: null },
        platform
      )
    : undefined;

  // Quand on clique sur une reply de l'inbox, on trouve le prospect correspondant
  function selectInboxReply(reply: InboxReply) {
    setSelectedReply(reply);
    if (reply.prospect) {
      const p = prospects.find((x) => x.id === reply.prospect!.id) ?? null;
      setSelectedProspect(p);
    }
  }

  const activeProspectId = selectedProspect?.id ?? null;
  const initialMessage = selectedReply?.snippet ?? "";

  return (
    <div className="min-h-screen text-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200/60 bg-white/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                <MessageCircle className="h-7 w-7 text-violet-500" />
                Reply Assistant
                {inbox.length > 0 && (
                  <span className="ml-1 text-[12px] font-bold bg-violet-500 text-white rounded-full px-2 py-0.5">
                    {inbox.length}
                  </span>
                )}
              </h1>
              <p className="mt-1 text-gray-500 text-sm">
                Master Closer : analyse la réponse et génère les réponses parfaites.
              </p>
            </div>
            <Link href="/sales-os">
              <Button variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-50">
                Retour Sales OS
              </Button>
            </Link>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            <button
              onClick={() => setTab("inbox")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-t-lg border-b-2 transition-all",
                tab === "inbox"
                  ? "border-violet-500 text-violet-700 bg-violet-50"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <Inbox className="h-4 w-4" />
              Inbox auto
              {inbox.length > 0 && (
                <span className="text-[11px] bg-violet-100 text-violet-700 rounded-full px-1.5 py-0.5 font-bold">
                  {inbox.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("linkedin")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-t-lg border-b-2 transition-all",
                tab === "linkedin"
                  ? "border-sky-500 text-sky-700 bg-sky-50"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <Linkedin className="h-4 w-4" />
              LinkedIn
              {linkedInReplies.filter((r) => !r.isRead).length > 0 && (
                <span className="text-[11px] bg-sky-100 text-sky-700 rounded-full px-1.5 py-0.5 font-bold">
                  {linkedInReplies.filter((r) => !r.isRead).length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("manual")}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-[13px] font-medium rounded-t-lg border-b-2 transition-all",
                tab === "manual"
                  ? "border-violet-500 text-violet-700 bg-violet-50"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              <Mail className="h-4 w-4" />
              Saisie manuelle
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">

        {/* ── INBOX TAB ── */}
        {tab === "inbox" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Liste des réponses reçues */}
            <div className="lg:col-span-1 space-y-2">
              <p className="text-[12px] text-gray-500 font-medium mb-3">
                Réponses détectées depuis vos séquences email
              </p>

              {inboxLoading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
                </div>
              )}

              {!inboxLoading && inbox.length === 0 && (
                <Card className="bg-white/80 border-gray-200/60">
                  <CardContent className="py-10 text-center text-gray-400">
                    <Inbox className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Aucune réponse détectée.</p>
                    <p className="text-xs mt-1">Les réponses à vos séquences email apparaîtront ici.</p>
                  </CardContent>
                </Card>
              )}

              {inbox.map((reply) => (
                <button
                  key={reply.id}
                  onClick={() => selectInboxReply(reply)}
                  className={cn(
                    "w-full text-left rounded-xl border p-3 transition-all hover:shadow-sm",
                    selectedReply?.id === reply.id
                      ? "border-violet-400 bg-violet-50 shadow-sm"
                      : "border-gray-200/60 bg-white/80 hover:border-violet-200"
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-[13px] font-semibold text-gray-800 truncate">
                      {reply.prospect?.name ?? reply.fromEmail}
                    </p>
                    <span className="text-[10px] text-gray-400 whitespace-nowrap flex items-center gap-0.5">
                      <Clock className="h-2.5 w-2.5" />
                      {new Date(reply.receivedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                    </span>
                  </div>
                  {reply.prospect?.company && (
                    <p className="text-[11px] text-gray-400 mb-1">{reply.prospect.company}</p>
                  )}
                  <p className="text-[12px] text-gray-600 line-clamp-2">{reply.snippet}</p>
                  {selectedReply?.id === reply.id && (
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-violet-600 font-medium">
                      <ArrowRight className="h-3 w-3" /> Analyse en cours →
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Colonne droite : Reply Assistant pré-rempli */}
            <div className="lg:col-span-2">
              {selectedReply && activeProspectId && workspaceId ? (
                <div className="space-y-3">
                  {/* Context du message envoyé */}
                  {selectedReply.sentMessage && (
                    <Card className="bg-gray-50/80 border-gray-200/60">
                      <CardHeader className="pb-2 pt-3 px-4">
                        <CardTitle className="text-[12px] text-gray-500 font-medium">
                          Message envoyé (contexte)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pb-3 px-4">
                        <p className="text-[12px] text-gray-600 line-clamp-3">
                          {selectedReply.sentMessage}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                  <ReplyAssistant
                    prospectId={activeProspectId}
                    workspaceId={workspaceId}
                    platform={platform}
                    messagingLink={messagingLink}
                    prospectName={selectedReply.prospect?.name ?? "Prospect"}
                    initialMessage={initialMessage}
                    paymentLink={process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK || undefined}
                    calendarLink={process.env.NEXT_PUBLIC_CALENDLY_LINK || undefined}
                  />
                </div>
              ) : (
                <Card className="bg-white/80 border-gray-200/60">
                  <CardContent className="py-12 text-center text-gray-500">
                    <Inbox className="h-12 w-12 mx-auto mb-3 opacity-40" />
                    <p>Sélectionne une réponse dans l&apos;inbox pour l&apos;analyser.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ── LINKEDIN TAB ── */}
        {tab === "linkedin" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Liste des réponses LinkedIn */}
            <div className="lg:col-span-1 space-y-2">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[12px] text-gray-500 font-medium">
                  Réponses LinkedIn détectées (auto · 4h)
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] border-sky-200 text-sky-600 hover:bg-sky-50 gap-1"
                  onClick={refreshLinkedInInbox}
                  disabled={isRefreshingLinkedIn}
                >
                  <RefreshCw className={cn("h-3 w-3", isRefreshingLinkedIn && "animate-spin")} />
                  {isRefreshingLinkedIn ? "Vérif…" : "Actualiser"}
                </Button>
              </div>

              {linkedInLoading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
                </div>
              )}

              {!linkedInLoading && linkedInReplies.length === 0 && (
                <Card className="bg-white/80 border-gray-200/60">
                  <CardContent className="py-10 text-center text-gray-400">
                    <Linkedin className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Aucune réponse LinkedIn détectée.</p>
                    <p className="text-xs mt-1">Le cron vérifie automatiquement toutes les 4h.</p>
                  </CardContent>
                </Card>
              )}

              {linkedInReplies.map((reply) => (
                <button
                  key={reply.id}
                  onClick={() => {
                    setSelectedLinkedInReply(reply);
                    if (!reply.isRead) markLinkedInRead(reply.id);
                    if (reply.prospect) {
                      const p = prospects.find((x) => x.id === reply.prospect!.id) ?? null;
                      setSelectedProspect(p);
                    }
                  }}
                  className={cn(
                    "w-full text-left rounded-xl border p-3 transition-all hover:shadow-sm",
                    selectedLinkedInReply?.id === reply.id
                      ? "border-sky-400 bg-sky-50 shadow-sm"
                      : reply.isRead
                      ? "border-gray-200/60 bg-white/80 hover:border-sky-200"
                      : "border-sky-300 bg-sky-50/50 hover:border-sky-400"
                  )}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      {!reply.isRead && (
                        <span className="h-2 w-2 rounded-full bg-sky-500 shrink-0" />
                      )}
                      <p className="text-[13px] font-semibold text-gray-800 truncate">
                        {reply.prospect?.name ?? reply.senderName}
                      </p>
                    </div>
                    <span className="text-[10px] text-gray-400 whitespace-nowrap flex items-center gap-0.5 shrink-0">
                      <Clock className="h-2.5 w-2.5" />
                      {new Date(reply.receivedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                    </span>
                  </div>
                  {reply.prospect?.company && (
                    <p className="text-[11px] text-gray-400 mb-1">{reply.prospect.company}</p>
                  )}
                  <p className="text-[12px] text-gray-600 line-clamp-2">{reply.messageText}</p>
                  <div className="flex items-center gap-1 mt-1.5">
                    <Linkedin className="h-2.5 w-2.5 text-sky-400" />
                    <a
                      href={reply.linkedInUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] text-sky-500 hover:underline"
                    >
                      Voir profil
                    </a>
                  </div>
                </button>
              ))}
            </div>

            {/* Colonne droite : Reply Assistant pré-rempli */}
            <div className="lg:col-span-2">
              {selectedLinkedInReply && workspaceId ? (
                <div className="space-y-3">
                  <Card className="bg-sky-50/60 border-sky-200/60">
                    <CardHeader className="pb-2 pt-3 px-4">
                      <CardTitle className="text-[12px] text-sky-700 font-medium flex items-center gap-1.5">
                        <Linkedin className="h-3.5 w-3.5" />
                        Message LinkedIn reçu
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-3 px-4">
                      <p className="text-[13px] text-gray-700 whitespace-pre-wrap">
                        {selectedLinkedInReply.messageText}
                      </p>
                    </CardContent>
                  </Card>
                  {selectedProspect ? (
                    <ReplyAssistant
                      prospectId={selectedProspect.id}
                      workspaceId={workspaceId}
                      platform="LINKEDIN"
                      messagingLink={selectedLinkedInReply.linkedInUrl}
                      prospectName={selectedLinkedInReply.prospect?.name ?? selectedLinkedInReply.senderName}
                      initialMessage={selectedLinkedInReply.messageText}
                      paymentLink={process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK || undefined}
                      calendarLink={process.env.NEXT_PUBLIC_CALENDLY_LINK || undefined}
                    />
                  ) : (
                    <Card className="bg-white/80 border-gray-200/60">
                      <CardContent className="py-8 text-center text-gray-500 text-sm">
                        Ce contact n&apos;est pas encore dans tes prospects.
                        <br />
                        <a
                          href={selectedLinkedInReply.linkedInUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-500 hover:underline mt-2 inline-block"
                        >
                          Voir sur LinkedIn →
                        </a>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <Card className="bg-white/80 border-gray-200/60">
                  <CardContent className="py-12 text-center text-gray-500">
                    <Linkedin className="h-12 w-12 mx-auto mb-3 opacity-40 text-sky-400" />
                    <p>Sélectionne une réponse LinkedIn pour l&apos;analyser.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ── MANUAL TAB ── */}
        {tab === "manual" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <Card className="bg-white/80 border-gray-200/60">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2 text-gray-900">
                    <Users className="h-5 w-5 text-violet-500" />
                    Choisir un prospect
                  </CardTitle>
                  <CardDescription className="text-gray-500">
                    Sélectionne le prospect qui vient de te répondre.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                    </div>
                  ) : (
                    <Select
                      value={selectedProspect?.id ?? ""}
                      onValueChange={(id) => {
                        const p = prospects.find((x) => x.id === id) ?? null;
                        setSelectedProspect(p);
                        setSelectedReply(null);
                      }}
                    >
                      <SelectTrigger className="bg-white border-gray-200 text-gray-900">
                        <SelectValue placeholder="Sélectionner..." />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-gray-200">
                        {prospects.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-gray-900 focus:bg-gray-50">
                            {p.name} — {p.company}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2">
              {selectedProspect && workspaceId ? (
                <ReplyAssistant
                  prospectId={selectedProspect.id}
                  workspaceId={workspaceId}
                  platform={platform}
                  messagingLink={messagingLink}
                  prospectName={selectedProspect.name}
                  paymentLink={process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK || undefined}
                  calendarLink={process.env.NEXT_PUBLIC_CALENDLY_LINK || undefined}
                />
              ) : (
                <Card className="bg-white/80 border-gray-200/60">
                  <CardContent className="py-12 text-center text-gray-500">
                    <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Sélectionne un prospect pour afficher le Reply Assistant.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
