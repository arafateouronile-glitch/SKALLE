"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  Loader2,
  GitMerge,
  Mail,
  Linkedin,
  Phone,
  MessageSquare,
  CheckCircle2,
  Clock,
  PauseCircle,
  Play,
  Pause,
  Users,
  RefreshCw,
  Eye,
  Reply,
  Send,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSequences } from "@/actions/sequences";
import { getUserWorkspace } from "@/actions/leads";
import { SequenceBuilder } from "@/components/sequences/sequence-builder";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

type SequenceChannel = "EMAIL" | "LINKEDIN" | "PHONE" | "SMS";
type StepStatus = "PENDING" | "SENT" | "DELIVERED" | "OPENED" | "CLICKED" | "REPLIED" | "FAILED" | "SKIPPED";

interface SequenceStep {
  id: string;
  stepNumber: number;
  channel: SequenceChannel;
  subject: string | null;
  status: StepStatus;
  delayDays: number;
  sentAt: string | null;
}

interface Sequence {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  prospect: { id: string; name: string; email: string | null; company: string };
  steps: SequenceStep[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_ICONS: Record<SequenceChannel, React.ElementType> = {
  EMAIL: Mail,
  LINKEDIN: Linkedin,
  PHONE: Phone,
  SMS: MessageSquare,
};

const CHANNEL_COLORS: Record<SequenceChannel, string> = {
  EMAIL: "text-violet-400",
  LINKEDIN: "text-blue-400",
  PHONE: "text-green-400",
  SMS: "text-orange-400",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING: { label: "En attente", color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/20" },
  SENT: { label: "Envoyé", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  DELIVERED: { label: "Délivré", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  OPENED: { label: "Ouvert", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  CLICKED: { label: "Cliqué", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  REPLIED: { label: "Répondu", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  FAILED: { label: "Échoué", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  SKIPPED: { label: "Ignoré", color: "text-slate-500", bg: "bg-slate-500/10 border-slate-500/20" },
};

function getSequenceStatus(seq: Sequence): "active" | "paused" | "completed" | "pending" {
  if (!seq.isActive) return "paused";
  const hasReplied = seq.steps.some((s) => s.status === "REPLIED");
  if (hasReplied) return "completed";
  const allDone = seq.steps.every((s) =>
    ["SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED", "FAILED", "SKIPPED"].includes(s.status)
  );
  if (allDone) return "completed";
  const hasPending = seq.steps.some((s) => s.status === "PENDING");
  if (hasPending) return "active";
  return "active";
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SequencesPage() {
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const ws = await getUserWorkspace();
      if (!ws.success || !ws.workspaceId) return;
      setWorkspaceId(ws.workspaceId);
      const result = await getSequences(ws.workspaceId);
      if (result.success && result.data) {
        setSequences(result.data as Sequence[]);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function launchSequence(sequenceId: string) {
    setActioningId(sequenceId);
    setActionError(null);
    try {
      const res = await fetch(`/api/sequences/${sequenceId}/start`, { method: "POST" });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setActionError(data.error ?? "Erreur"); return; }
      await loadData();
    } catch {
      setActionError("Erreur réseau");
    } finally {
      setActioningId(null);
    }
  }

  async function togglePause(sequenceId: string, currentlyActive: boolean) {
    setActioningId(sequenceId);
    setActionError(null);
    try {
      await fetch(`/api/sequences/${sequenceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentlyActive }),
      });
      await loadData();
    } catch {
      setActionError("Erreur réseau");
    } finally {
      setActioningId(null);
    }
  }

  const total = sequences.length;
  const active = sequences.filter((s) => getSequenceStatus(s) === "active").length;
  const completed = sequences.filter((s) => getSequenceStatus(s) === "completed").length;
  const replied = sequences.filter((s) =>
    s.steps.some((step) => step.status === "REPLIED")
  ).length;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-bold text-white flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-violet-400" />
            Séquences
          </h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Gérez vos séquences d&apos;outreach multi-canal
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="text-slate-400 hover:text-white text-[12px] gap-1.5"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Actualiser
          </Button>
          <Button
            size="sm"
            onClick={() => setBuilderOpen(true)}
            disabled={!workspaceId}
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white border-0 text-[12px]"
          >
            <Plus className="h-3.5 w-3.5" />
            Nouvelle séquence
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total", value: total, icon: GitMerge, color: "text-slate-400" },
          { label: "Actives", value: active, icon: Clock, color: "text-blue-400" },
          { label: "Terminées", value: completed, icon: CheckCircle2, color: "text-emerald-400" },
          { label: "Réponses", value: replied, icon: Users, color: "text-amber-400" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="bg-white/[0.03] border-white/[0.06]">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-slate-500">{stat.label}</p>
                  <Icon className={cn("h-4 w-4", stat.color)} />
                </div>
                <p className="text-[22px] font-bold text-white mt-1">{stat.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Sequences list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
        </div>
      ) : sequences.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="rounded-full bg-violet-500/10 border border-violet-500/20 p-6">
            <GitMerge className="h-10 w-10 text-violet-400" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-[15px] font-semibold text-white">Aucune séquence</p>
            <p className="text-[12px] text-slate-500">
              Créez votre première séquence multi-canal pour commencer l&apos;outreach.
            </p>
          </div>
          <Button
            onClick={() => setBuilderOpen(true)}
            className="gap-2 bg-violet-600 hover:bg-violet-700 text-white border-0 text-[12px]"
          >
            <Plus className="h-3.5 w-3.5" />
            Créer une séquence
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sequences.map((seq) => {
            const status = getSequenceStatus(seq);
            return (
              <div
                key={seq.id}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-all"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Name + status */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[13px] font-semibold text-white truncate">
                        {seq.name}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] px-1.5 py-0 shrink-0",
                          status === "active" && "text-blue-400 bg-blue-500/10 border-blue-500/20",
                          status === "completed" && "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
                          status === "paused" && "text-amber-400 bg-amber-500/10 border-amber-500/20",
                          status === "pending" && "text-slate-400 bg-slate-500/10 border-slate-500/20"
                        )}
                      >
                        {status === "active" && "Active"}
                        {status === "completed" && "Terminée"}
                        {status === "paused" && "En pause"}
                        {status === "pending" && "En attente"}
                      </Badge>
                    </div>

                    {/* Prospect */}
                    <p className="text-[11px] text-slate-500 mb-3">
                      <span className="text-slate-400">{seq.prospect.name}</span>
                      {" · "}
                      {seq.prospect.company}
                    </p>

                    {/* Steps mini-timeline */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {seq.steps.map((step, i) => {
                        const Icon = CHANNEL_ICONS[step.channel];
                        const colorClass = CHANNEL_COLORS[step.channel];
                        const stepStatus = STATUS_CONFIG[step.status] ?? STATUS_CONFIG.PENDING;
                        return (
                          <div
                            key={step.id}
                            className="flex items-center gap-1"
                          >
                            <div
                              className={cn(
                                "flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-medium",
                                step.status === "REPLIED"
                                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                  : step.status === "OPENED" || step.status === "CLICKED"
                                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                  : step.status === "SENT" || step.status === "DELIVERED"
                                  ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                                  : step.status === "FAILED"
                                  ? "bg-red-500/10 border-red-500/20 text-red-400"
                                  : "bg-white/[0.04] border-white/[0.08] text-slate-500"
                              )}
                            >
                              <Icon className="h-3 w-3" />
                              <span>{i + 1}</span>
                            </div>
                            {i < seq.steps.length - 1 && (
                              <div className="w-3 h-px bg-white/[0.08]" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Right: metrics + actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {/* Engagement metrics */}
                    <div className="flex items-center gap-2">
                      {(() => {
                        const sent = seq.steps.filter((s) => ["SENT","DELIVERED","OPENED","CLICKED","REPLIED"].includes(s.status)).length;
                        const opened = seq.steps.filter((s) => ["OPENED","CLICKED","REPLIED"].includes(s.status)).length;
                        const replied = seq.steps.filter((s) => s.status === "REPLIED").length;
                        return (
                          <>
                            <span className="flex items-center gap-1 text-[10px] text-slate-500">
                              <Send className="h-2.5 w-2.5" />{sent}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-slate-500">
                              <Eye className="h-2.5 w-2.5" />{opened}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-amber-400">
                              <Reply className="h-2.5 w-2.5" />{replied}
                            </span>
                          </>
                        );
                      })()}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5">
                      {status === "paused" || status === "pending" ? (
                        <Button
                          size="sm"
                          onClick={() => launchSequence(seq.id)}
                          disabled={actioningId === seq.id}
                          className="h-7 px-2.5 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                        >
                          {actioningId === seq.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Play className="h-3 w-3" />}
                          Lancer
                        </Button>
                      ) : status === "active" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => togglePause(seq.id, true)}
                          disabled={actioningId === seq.id}
                          className="h-7 px-2.5 text-[11px] gap-1 border-white/10 text-slate-400 hover:text-amber-400 hover:border-amber-500/30"
                        >
                          {actioningId === seq.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Pause className="h-3 w-3" />}
                          Pause
                        </Button>
                      ) : null}
                    </div>

                    <p className="text-[10px] text-slate-600">
                      {format(new Date(seq.createdAt), "d MMM", { locale: fr })}
                      {" · "}{seq.steps.length}
                      {" "}étape{seq.steps.length > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action error */}
      {actionError && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 px-4 py-3 rounded-xl text-[12.5px] z-50"
          style={{ background: "#1e1e2e", border: "1px solid #ef4444", color: "#ef4444" }}>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {actionError}
          <button onClick={() => setActionError(null)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Builder dialog */}
      {workspaceId && (
        <SequenceBuilder
          workspaceId={workspaceId}
          open={builderOpen}
          onOpenChange={setBuilderOpen}
          onCreated={loadData}
        />
      )}
    </div>
  );
}
