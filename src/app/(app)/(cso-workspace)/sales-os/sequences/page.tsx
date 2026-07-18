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
  Trash2,
  ChevronRight,
  GitBranch,
  X,
  Copy,
  Search,
  FlaskConical,
  Plane,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSequences, deleteSequence, getSequenceDetail, cloneSequence, createAbVariant } from "@/actions/sequences";
import { getProspects } from "@/actions/prospects";
import { getUserWorkspace } from "@/actions/leads";
import { SequenceBuilder } from "@/components/sequences/sequence-builder";
import { SequenceSuggestionsPanel } from "@/components/modules/cso/sequence-suggestions-panel";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type SequenceChannel = "EMAIL" | "LINKEDIN";
type StepStatus = "PENDING" | "SENT" | "DELIVERED" | "OPENED" | "CLICKED" | "REPLIED" | "FAILED" | "SKIPPED";

interface SequenceStep {
  id: string;
  stepNumber: number;
  channel: SequenceChannel;
  subject: string | null;
  content?: string;
  status: StepStatus;
  delayDays: number;
  sentAt: string | null;
  openedAt?: string | null;
  repliedAt?: string | null;
  scheduledAt?: string | null;
  metadata?: Record<string, unknown> | null;
  error?: string | null;
}

interface SequenceDetail {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  prospect: { id: string; name: string; email: string | null; company: string; jobTitle: string | null; linkedInUrl: string | null };
  steps: SequenceStep[];
}

interface ProspectOption {
  id: string;
  name: string;
  company: string;
  email: string | null;
  jobTitle: string | null;
}

interface Sequence {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  abTestId: string | null;
  abVariant: string | null;
  prospect: { id: string; name: string; email: string | null; company: string };
  steps: SequenceStep[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_ICONS: Record<SequenceChannel, React.ElementType> = {
  EMAIL: Mail,
  LINKEDIN: Linkedin,
};

const CHANNEL_COLORS: Record<SequenceChannel, string> = {
  EMAIL: "text-violet-400",
  LINKEDIN: "text-blue-400",
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

function getSequenceStatus(seq: Sequence): "active" | "paused" | "completed" | "not_started" {
  const hasReplied = seq.steps.some((s) => s.status === "REPLIED");
  if (hasReplied) return "completed";
  const allDone = seq.steps.every((s) =>
    ["SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED", "FAILED", "SKIPPED"].includes(s.status)
  );
  if (allDone) return "completed";
  // Never sent yet (all steps PENDING, nothing ever sent)
  const neverSent = seq.steps.every((s) => s.status === "PENDING") && !seq.isActive;
  if (neverSent) return "not_started";
  if (!seq.isActive) return "paused";
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [detailSeq, setDetailSeq] = useState<SequenceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // A/B test state
  const [creatingAbId, setCreatingAbId] = useState<string | null>(null);

  // Clone modal state
  const [cloneSourceId, setCloneSourceId] = useState<string | null>(null);
  const [cloneSourceName, setCloneSourceName] = useState<string>("");
  const [cloneProspects, setCloneProspects] = useState<ProspectOption[]>([]);
  const [cloneProspectsLoading, setCloneProspectsLoading] = useState(false);
  const [cloneSearch, setCloneSearch] = useState("");
  const [cloneSelected, setCloneSelected] = useState<Set<string>>(new Set());
  const [cloning, setCloning] = useState(false);

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

  async function handleDelete(sequenceId: string) {
    setDeletingId(sequenceId);
    try {
      const res = await deleteSequence(sequenceId);
      if (!res.success) { toast.error(res.error ?? "Erreur lors de la suppression"); return; }
      toast.success("Séquence supprimée");
      setDeleteConfirmId(null);
      await loadData();
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setDeletingId(null);
    }
  }

  async function openDetail(sequenceId: string) {
    setDetailLoading(true);
    setDetailSeq(null);
    const res = await getSequenceDetail(sequenceId);
    setDetailLoading(false);
    if (res.success && res.data) setDetailSeq(res.data as SequenceDetail);
    else toast.error("Impossible de charger le détail");
  }

  async function handleCreateAbVariant(seqId: string) {
    setCreatingAbId(seqId);
    try {
      const res = await createAbVariant(seqId);
      if (res.success) {
        toast.success("Variante B créée — modifiez son contenu puis lancez les deux en parallèle");
        await loadData();
      } else {
        toast.error(res.error ?? "Erreur lors de la création de la variante B");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setCreatingAbId(null);
    }
  }

  async function openClone(seq: Sequence) {
    setCloneSourceId(seq.id);
    setCloneSourceName(seq.name);
    setCloneSelected(new Set());
    setCloneSearch("");
    setCloneProspectsLoading(true);
    const all = await getProspects(workspaceId) as ProspectOption[];
    // Exclude the prospect already targeted by this sequence
    setCloneProspects(all.filter((p) => p.id !== seq.prospect.id));
    setCloneProspectsLoading(false);
  }

  async function handleClone() {
    if (!cloneSourceId || cloneSelected.size === 0) return;
    setCloning(true);
    try {
      const res = await cloneSequence(cloneSourceId, Array.from(cloneSelected));
      if (res.created > 0) {
        toast.success(`${res.created} séquence${res.created > 1 ? "s" : ""} créée${res.created > 1 ? "s" : ""}`);
        setCloneSourceId(null);
        await loadData();
      }
      if (res.errors.length > 0) {
        toast.error(res.errors[0]);
      }
    } catch {
      toast.error("Erreur lors du clonage");
    } finally {
      setCloning(false);
    }
  }

  const total = sequences.length;
  const active = sequences.filter((s) => getSequenceStatus(s) === "active").length;
  const notStarted = sequences.filter((s) => getSequenceStatus(s) === "not_started").length;
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
          { label: "Prêtes", value: notStarted, icon: PauseCircle, color: "text-slate-400" },
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

      {/* AI Suggestions Panel */}
      <SequenceSuggestionsPanel />

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
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                          status === "not_started" && "text-slate-400 bg-slate-500/10 border-slate-500/20"
                        )}
                      >
                        {status === "active" && "Active"}
                        {status === "completed" && "Terminée"}
                        {status === "paused" && "En pause"}
                        {status === "not_started" && "Prête"}
                      </Badge>
                      {seq.abVariant && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0 rounded-full border shrink-0"
                          style={{
                            background: seq.abVariant === "A" ? "rgba(139,92,246,0.15)" : "rgba(251,146,60,0.15)",
                            borderColor: seq.abVariant === "A" ? "rgba(139,92,246,0.4)" : "rgba(251,146,60,0.4)",
                            color: seq.abVariant === "A" ? "rgb(167,139,250)" : "rgb(251,146,60)",
                          }}>
                          <FlaskConical className="h-2.5 w-2.5" />
                          Variante {seq.abVariant}
                        </span>
                      )}
                      {seq.steps.some((s) => (s.metadata as { isOOO?: boolean } | null)?.isOOO) && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0 rounded-full border shrink-0"
                          style={{ background: "rgba(14,165,233,0.15)", borderColor: "rgba(14,165,233,0.4)", color: "#38bdf8" }}>
                          <Plane className="h-2.5 w-2.5" />
                          OOO
                        </span>
                      )}
                    </div>

                    {/* Prospect */}
                    <p className="text-[11px] text-slate-500 mb-3">
                      <span className="text-slate-400">{seq.prospect.name}</span>
                      {" · "}
                      {seq.prospect.company}
                    </p>

                    {/* Steps mini-timeline */}
                    <div className="flex items-center gap-1 flex-wrap">
                      {seq.steps.map((step, i) => {
                        const Icon = CHANNEL_ICONS[step.channel];
                        const meta = step.metadata as { smartBranch?: boolean; waitingFor?: string; isOOO?: boolean; rescheduledForOOO?: boolean } | null;
                        const isBranch = meta?.smartBranch && i > 0;
                        const isOOOStep = meta?.isOOO || meta?.rescheduledForOOO;
                        return (
                          <div key={step.id} className="flex items-center gap-1">
                            {isBranch && (
                              <div className="flex items-center gap-0.5 text-violet-400 opacity-60">
                                <GitBranch className="h-2.5 w-2.5" />
                              </div>
                            )}
                            <div
                              className={cn(
                                "flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-medium",
                                isOOOStep
                                  ? "border-dashed"
                                  : "",
                                step.status === "REPLIED"
                                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                                  : step.status === "OPENED" || step.status === "CLICKED"
                                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                  : step.status === "SENT" || step.status === "DELIVERED"
                                  ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                                  : step.status === "FAILED"
                                  ? "bg-red-500/10 border-red-500/20 text-red-400"
                                  : step.status === "SKIPPED"
                                  ? "bg-slate-500/05 border-white/[0.04] text-slate-600 line-through"
                                  : isOOOStep
                                  ? "bg-sky-500/10 border-sky-500/30 text-sky-400"
                                  : "bg-white/[0.04] border-white/[0.08] text-slate-500"
                              )}
                            >
                              <Icon className="h-3 w-3" />
                              <span>{i + 1}</span>
                            </div>
                            {i < seq.steps.length - 1 && !isBranch && (
                              <div className="w-2 h-px bg-white/[0.08]" />
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
                      {(status === "paused" || status === "not_started") ? (
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

                    {/* Detail + clone + A/B + delete */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openDetail(seq.id)}
                        className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-white/[0.06] transition-all"
                        title="Voir le détail"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => openClone(seq)}
                        className="p-1.5 rounded text-slate-500 hover:text-violet-400 hover:bg-violet-500/10 transition-all"
                        title="Appliquer à d'autres prospects"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {!seq.abTestId && (
                        <button
                          onClick={() => handleCreateAbVariant(seq.id)}
                          disabled={creatingAbId === seq.id}
                          className="p-1.5 rounded text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-all disabled:opacity-40"
                          title="Créer variante B (A/B test)"
                        >
                          {creatingAbId === seq.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <FlaskConical className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      {/* Placeholder to keep spacing */}
                      {seq.abTestId && <div className="w-[28px]" />}
                      {deleteConfirmId === seq.id ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-red-400">Supprimer ?</span>
                          <button
                            onClick={() => handleDelete(seq.id)}
                            disabled={deletingId === seq.id}
                            className="text-[10px] text-red-400 hover:text-red-300 font-medium disabled:opacity-50"
                          >
                            {deletingId === seq.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Oui"}
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="text-[10px] text-slate-500 hover:text-slate-300"
                          >
                            Non
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(seq.id)}
                          className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Supprimer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
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

      {/* Clone modal */}
      {cloneSourceId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setCloneSourceId(null)} />
          <div className="relative w-full max-w-md bg-[#0f1117] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
              <div>
                <h2 className="text-[14px] font-bold text-white flex items-center gap-2">
                  <Copy className="h-4 w-4 text-violet-400" />
                  Appliquer à d&apos;autres prospects
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[280px]">{cloneSourceName}</p>
              </div>
              <button onClick={() => setCloneSourceId(null)} className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-white/[0.06] transition-all">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search */}
            <div className="px-5 py-3 border-b border-white/[0.06]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                <Input
                  value={cloneSearch}
                  onChange={(e) => setCloneSearch(e.target.value)}
                  placeholder="Rechercher un prospect…"
                  className="pl-8 bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-600 text-[12px] h-8"
                />
              </div>
              {cloneSelected.size > 0 && (
                <p className="text-[11px] text-violet-400 mt-2">
                  {cloneSelected.size} prospect{cloneSelected.size > 1 ? "s" : ""} sélectionné{cloneSelected.size > 1 ? "s" : ""}
                </p>
              )}
            </div>

            {/* Prospect list */}
            <div className="max-h-72 overflow-y-auto">
              {cloneProspectsLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
                </div>
              ) : cloneProspects.length === 0 ? (
                <p className="text-[12px] text-slate-500 text-center py-8">Aucun autre prospect</p>
              ) : (
                cloneProspects
                  .filter((p) =>
                    `${p.name} ${p.company}`.toLowerCase().includes(cloneSearch.toLowerCase())
                  )
                  .map((p) => {
                    const checked = cloneSelected.has(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setCloneSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.id)) next.delete(p.id);
                            else next.add(p.id);
                            return next;
                          });
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 px-5 py-3 text-left transition-all border-b border-white/[0.04] last:border-0",
                          checked ? "bg-violet-500/10" : "hover:bg-white/[0.03]"
                        )}
                      >
                        <div className={cn(
                          "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-all",
                          checked ? "bg-violet-500 border-violet-500" : "border-white/[0.15]"
                        )}>
                          {checked && <CheckCircle2 className="h-3 w-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-white truncate">{p.name}</p>
                          <p className="text-[11px] text-slate-500 truncate">{p.company}{p.jobTitle ? ` · ${p.jobTitle}` : ""}</p>
                        </div>
                        {!p.email && (
                          <span className="text-[10px] text-amber-500/70 shrink-0">sans email</span>
                        )}
                      </button>
                    );
                  })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.08] bg-white/[0.02]">
              <button
                onClick={() => {
                  const visible = cloneProspects.filter((p) =>
                    `${p.name} ${p.company}`.toLowerCase().includes(cloneSearch.toLowerCase())
                  );
                  const allVisibleSelected = visible.every((p) => cloneSelected.has(p.id));
                  setCloneSelected((prev) => {
                    const next = new Set(prev);
                    if (allVisibleSelected) visible.forEach((p) => next.delete(p.id));
                    else visible.forEach((p) => next.add(p.id));
                    return next;
                  });
                }}
                className="text-[11px] text-slate-400 hover:text-white transition-all"
              >
                Tout sélectionner
              </button>
              <Button
                onClick={handleClone}
                disabled={cloneSelected.size === 0 || cloning}
                className="gap-2 bg-violet-600 hover:bg-violet-700 text-white border-0 text-[12px] h-8 px-4 disabled:opacity-40"
              >
                {cloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
                Créer {cloneSelected.size > 0 ? `(${cloneSelected.size})` : ""}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sequence detail slide-over */}
      {(detailSeq || detailLoading) && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDetailSeq(null)}
          />
          {/* Panel */}
          <div className="relative w-full max-w-lg bg-[#0f1117] border-l border-white/[0.08] overflow-y-auto shadow-2xl">
            {detailLoading ? (
              <div className="flex items-center justify-center h-full py-32">
                <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
              </div>
            ) : detailSeq ? (
              <div className="p-6 space-y-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[15px] font-bold text-white">{detailSeq.name}</h2>
                    <p className="text-[12px] text-slate-400 mt-0.5">
                      {detailSeq.prospect.name} · {detailSeq.prospect.company}
                    </p>
                    {detailSeq.prospect.jobTitle && (
                      <p className="text-[11px] text-slate-600">{detailSeq.prospect.jobTitle}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setDetailSeq(null)}
                    className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-white/[0.06] transition-all shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Steps timeline */}
                <div className="space-y-0">
                  {detailSeq.steps.map((step, idx) => {
                    const Icon = CHANNEL_ICONS[step.channel as SequenceChannel];
                    const chColor = CHANNEL_COLORS[step.channel as SequenceChannel];
                    const meta = step.metadata as { smartBranch?: boolean; waitingFor?: string } | null;
                    const isBranch = meta?.smartBranch && idx > 0;
                    const isLast = idx === detailSeq.steps.length - 1;

                    const WAITING_LABELS: Record<string, string> = {
                      NO_REPLY: "Si pas de réponse",
                      EMAIL_OPENED_NO_REPLY: "Si ouvert sans réponse",
                      CONNECTION_ACCEPTED: "Si connexion acceptée",
                      NOT_ACCEPTED: "Si non accepté",
                    };

                    return (
                      <div key={step.id} className="flex gap-3">
                        {/* Timeline track */}
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            "h-8 w-8 rounded-full border-2 flex items-center justify-center shrink-0 mt-1",
                            step.status === "REPLIED" ? "border-amber-500/50 bg-amber-500/10"
                            : step.status === "OPENED" || step.status === "CLICKED" ? "border-emerald-500/50 bg-emerald-500/10"
                            : step.status === "SENT" || step.status === "DELIVERED" ? "border-blue-500/40 bg-blue-500/10"
                            : step.status === "FAILED" ? "border-red-500/40 bg-red-500/10"
                            : step.status === "SKIPPED" ? "border-white/[0.06] bg-white/[0.02]"
                            : "border-white/[0.12] bg-white/[0.04]"
                          )}>
                            <Icon className={cn("h-3.5 w-3.5", chColor)} />
                          </div>
                          {!isLast && (
                            <div className={cn("w-px flex-1 my-1", isBranch ? "bg-violet-500/20 border-l border-dashed border-violet-500/30 w-0" : "bg-white/[0.06]")} style={{ minHeight: "20px" }} />
                          )}
                        </div>

                        {/* Content */}
                        <div className={cn("pb-4 flex-1 min-w-0", isLast && "pb-0")}>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-[12px] font-semibold text-white">
                              Étape {step.stepNumber}
                              {step.channel === "EMAIL" ? " — Email" : step.channel === "LINKEDIN" ? " — LinkedIn" : ""}
                            </span>
                            {isBranch && meta?.waitingFor && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded border border-violet-500/30 bg-violet-500/10 text-violet-400 flex items-center gap-1">
                                <GitBranch className="h-2.5 w-2.5" />
                                {WAITING_LABELS[meta.waitingFor] ?? meta.waitingFor}
                              </span>
                            )}
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded border font-medium",
                              STATUS_CONFIG[step.status]?.bg ?? "bg-slate-500/10 border-slate-500/20",
                              STATUS_CONFIG[step.status]?.color ?? "text-slate-400"
                            )}>
                              {STATUS_CONFIG[step.status]?.label ?? step.status}
                            </span>
                          </div>

                          {/* Timing */}
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mb-2">
                            <span>J+{step.delayDays}</span>
                            {step.sentAt && <span>Envoyé {format(new Date(step.sentAt), "d MMM à HH:mm", { locale: fr })}</span>}
                            {step.openedAt && <span className="text-emerald-500">Ouvert ✓</span>}
                            {step.repliedAt && <span className="text-amber-400">Répondu ✓</span>}
                          </div>

                          {/* Subject */}
                          {step.subject && (
                            <p className="text-[11px] text-slate-400 mb-1.5">
                              <span className="text-slate-500">Objet :</span> {step.subject}
                            </p>
                          )}

                          {/* Content preview */}
                          {step.content && (
                            <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3 text-[11px] text-slate-400 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                              {step.content}
                            </div>
                          )}

                          {/* Error */}
                          {step.error && (
                            <p className="text-[11px] text-red-400 mt-1.5 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 shrink-0" />
                              {step.error}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
