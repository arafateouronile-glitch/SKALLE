"use client";

import { useState, useCallback, useRef } from "react";
import {
  Brain,
  Linkedin,
  Mail,
  MessageCircle,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Zap,
  Clock,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ─── Analysis step tracker ────────────────────────────────────────────────────

type StepStatus = "pending" | "running" | "done" | "error";

interface StepState {
  status: StepStatus;
  label: string;
}

const STEP_DEFS = [
  { id: "observe",     defaultLabel: "Observation du pipeline"   },
  { id: "research",    defaultLabel: "Recherche de signaux"       },
  { id: "generate",    defaultLabel: "Analyse IA"                 },
  { id: "personalize", defaultLabel: "Personnalisation messages"  },
  { id: "store",       defaultLabel: "Sauvegarde"                 },
] as const;

type StepId = (typeof STEP_DEFS)[number]["id"];

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "running")
    return <Loader2 className="h-3.5 w-3.5 text-violet-500 animate-spin shrink-0" />;
  if (status === "done")
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />;
  if (status === "error")
    return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
  return <Circle className="h-3.5 w-3.5 text-gray-300 shrink-0" />;
}

function AnalysisProgress({ steps }: { steps: Partial<Record<StepId, StepState>> }) {
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Loader2 className="h-3.5 w-3.5 text-violet-500 animate-spin" />
        <span className="text-[12px] font-semibold text-violet-700">Analyse en cours…</span>
      </div>
      <div className="space-y-2">
        {STEP_DEFS.map((def) => {
          const state = steps[def.id];
          const status = state?.status ?? "pending";
          const label = state?.label ?? def.defaultLabel;
          return (
            <div key={def.id} className="flex items-center gap-2">
              <StepIcon status={status} />
              <span
                className={`text-[12px] ${
                  status === "running"  ? "text-violet-700 font-medium" :
                  status === "done"     ? "text-gray-700"                :
                  status === "error"    ? "text-red-600"                 :
                                          "text-gray-400"
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CsoActionType =
  | "CSO_LAUNCH_LINKEDIN"
  | "CSO_LAUNCH_EMAIL"
  | "CSO_FOLLOWUP"
  | "CSO_STALE_REJECT";

interface AgentDecision {
  id: string;
  actionType: string;
  reasoning: string;
  priority: number;
  status: string;
  actionData: Record<string, unknown> | null;
  createdAt: string;
}

interface Props {
  workspaceId: string;
  initialDecisions: AgentDecision[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<CsoActionType, {
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
}> = {
  CSO_LAUNCH_LINKEDIN: {
    label: "Lancer séquence LinkedIn",
    icon: Linkedin,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
  },
  CSO_LAUNCH_EMAIL: {
    label: "Lancer séquence Email",
    icon: Mail,
    color: "text-violet-600",
    bg: "bg-violet-50",
    border: "border-violet-200",
  },
  CSO_FOLLOWUP: {
    label: "Relance",
    icon: MessageCircle,
    color: "text-amber-600",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  CSO_STALE_REJECT: {
    label: "Archiver (inactif)",
    icon: Trash2,
    color: "text-slate-500",
    bg: "bg-slate-50",
    border: "border-slate-200",
  },
};

const STATUS_CONFIG: Record<string, { label: string; dot: string; textColor: string }> = {
  PENDING:  { label: "En attente",  dot: "bg-amber-400",   textColor: "text-amber-700"  },
  APPROVED: { label: "Approuvé",   dot: "bg-emerald-500", textColor: "text-emerald-700" },
  EXECUTED: { label: "Exécuté",    dot: "bg-violet-500",  textColor: "text-violet-700"  },
  REJECTED: { label: "Rejeté",     dot: "bg-slate-400",   textColor: "text-slate-500"   },
  FAILED:   { label: "Échoué",     dot: "bg-red-500",     textColor: "text-red-600"     },
};

const PRIORITY_LABEL = ["", "Urgent", "Haute", "Normale", "Faible", "Très faible"];

// ─── Decision Card ────────────────────────────────────────────────────────────

function DecisionCard({
  decision,
  onApprove,
  onReject,
  loading,
}: {
  decision: AgentDecision;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  loading: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const cfg = ACTION_CONFIG[decision.actionType as CsoActionType] ?? {
    label: decision.actionType,
    icon: Zap,
    color: "text-gray-500",
    bg: "bg-gray-50",
    border: "border-gray-200",
  };
  const statusCfg = STATUS_CONFIG[decision.status] ?? { label: decision.status, dot: "bg-gray-300", textColor: "text-gray-500" };
  const data = decision.actionData ?? {};
  const isPending = decision.status === "PENDING";
  const isLoading = loading === decision.id;
  const prospectName = (data.prospectName as string) ?? "—";

  // Preview — pour LinkedIn on préfère le message post-connexion (plus informatif que la note courte)
  let preview: string | null = null;
  const hasLinkedInMessages =
    decision.actionType === "CSO_LAUNCH_LINKEDIN" &&
    Boolean(data.connectNote || data.postConnectionMessage);

  if (decision.actionType === "CSO_LAUNCH_LINKEDIN") {
    // Afficher le message post-connexion en preview principale s'il existe
    preview = (data.postConnectionMessage as string) ?? (data.connectNote as string) ?? null;
  } else if (decision.actionType === "CSO_LAUNCH_EMAIL" && data.content) {
    preview = `Objet : ${data.subject as string}\n\n${data.content as string}`;
  } else if (decision.actionType === "CSO_FOLLOWUP" && data.content) {
    preview = data.content as string;
  }

  return (
    <div className={`rounded-xl border ${isPending ? cfg.border : "border-gray-100"} bg-white shadow-sm overflow-hidden transition-all`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`h-8 w-8 rounded-lg ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0 mt-0.5`}>
            <cfg.icon className={`h-4 w-4 ${cfg.color}`} />
          </div>

          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[11px] font-semibold ${cfg.color}`}>{cfg.label}</span>
              <span className="text-[11px] text-gray-500 font-medium">{prospectName}</span>
              <span className={`ml-auto flex items-center gap-1 text-[11px] ${statusCfg.textColor}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                {statusCfg.label}
              </span>
            </div>

            {/* Priority + age */}
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[10px] text-gray-400 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                P{decision.priority} — {PRIORITY_LABEL[decision.priority] ?? ""}
              </span>
              <span className="text-[10px] text-gray-400">
                {new Date(decision.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
              </span>
            </div>

            {/* Reasoning */}
            <p className="text-[12px] text-gray-600 line-clamp-2">{decision.reasoning}</p>

            {/* Expand toggle */}
            {(preview || hasLinkedInMessages) && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="mt-2 flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-700 font-medium"
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {expanded
                  ? "Masquer les messages"
                  : hasLinkedInMessages && data.postConnectionMessage
                  ? "Voir note de connexion + message post-connexion"
                  : "Voir le message généré"}
              </button>
            )}
          </div>
        </div>

        {/* Expanded preview */}
        {expanded && (
          <div className="mt-3 ml-11 space-y-3">
            {/* LinkedIn : affiche les deux messages séparément */}
            {hasLinkedInMessages ? (
              <>
                {data.connectNote && (
                  <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                    <p className="text-[10px] font-semibold text-blue-600 mb-1.5 uppercase tracking-wide">
                      Note de connexion (invitation)
                    </p>
                    <pre className="text-[12px] text-gray-700 whitespace-pre-wrap font-sans">
                      {data.connectNote as string}
                    </pre>
                    <p className="text-[10px] text-blue-400 mt-1.5">
                      {(data.connectNote as string).length}/280 caractères
                    </p>
                  </div>
                )}
                {data.postConnectionMessage && (
                  <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                    <p className="text-[10px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                      Message après acceptation
                    </p>
                    <pre className="text-[12px] text-gray-700 whitespace-pre-wrap font-sans">
                      {data.postConnectionMessage as string}
                    </pre>
                  </div>
                )}
                {data._angle && (
                  <p className="text-[10.5px] text-gray-400 italic">
                    Angle : {data._angle as string}
                  </p>
                )}
                {data.linkedInUrl && (
                  <a
                    href={data.linkedInUrl as string}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                  >
                    <Linkedin className="h-3 w-3" />
                    Voir le profil LinkedIn
                  </a>
                )}
              </>
            ) : preview ? (
              <div className="rounded-lg bg-gray-50 border border-gray-100 p-3">
                <pre className="text-[12px] text-gray-700 whitespace-pre-wrap font-sans">{preview}</pre>
              </div>
            ) : null}
          </div>
        )}

        {/* Action buttons */}
        {isPending && (
          <div className="mt-3 ml-11 flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => onApprove(decision.id)}
              disabled={isLoading}
              className="h-7 text-[12px] px-3 bg-emerald-600 hover:bg-emerald-700 text-white border-0 rounded-lg"
            >
              {isLoading ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3 mr-1" />
              )}
              Approuver
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReject(decision.id)}
              disabled={isLoading}
              className="h-7 text-[12px] px-3 rounded-lg border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200"
            >
              <X className="h-3 w-3 mr-1" />
              Rejeter
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CsoAgentQueue({ workspaceId, initialDecisions }: Props) {
  const [decisions, setDecisions] = useState<AgentDecision[]>(initialDecisions);
  const [loading, setLoading] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisSteps, setAnalysisSteps] = useState<Partial<Record<StepId, StepState>>>({});
  const [filter, setFilter] = useState<"all" | "pending" | "done">("pending");
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/cso-agent?workspaceId=${workspaceId}`);
    if (res.ok) {
      const json = (await res.json()) as { decisions: AgentDecision[] };
      setDecisions(json.decisions);
    }
  }, [workspaceId]);

  const handleApprove = useCallback(async (decisionId: string) => {
    setLoading(decisionId);
    try {
      const res = await fetch("/api/cso-agent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId, workspaceId, action: "approve" }),
      });
      if (res.ok) {
        toast.success("Décision approuvée — exécution en cours");
        setDecisions((prev) =>
          prev.map((d) => (d.id === decisionId ? { ...d, status: "APPROVED" } : d))
        );
      } else {
        toast.error("Erreur lors de l'approbation");
      }
    } finally {
      setLoading(null);
    }
  }, [workspaceId]);

  const handleReject = useCallback(async (decisionId: string) => {
    setLoading(decisionId);
    try {
      const res = await fetch("/api/cso-agent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId, workspaceId, action: "reject" }),
      });
      if (res.ok) {
        toast.success("Décision rejetée");
        setDecisions((prev) =>
          prev.map((d) => (d.id === decisionId ? { ...d, status: "REJECTED" } : d))
        );
      } else {
        toast.error("Erreur lors du rejet");
      }
    } finally {
      setLoading(null);
    }
  }, [workspaceId]);

  const handleTrigger = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setIsAnalyzing(true);
    setAnalysisSteps({});

    try {
      const res = await fetch("/api/cso-agent/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        toast.error("Erreur lors du déclenchement");
        setIsAnalyzing(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as
              | { type: "step"; id: StepId; status: "running" | "done" | "error"; label: string }
              | { type: "done"; newCount: number; totalGenerated: number }
              | { type: "error"; message: string };

            if (evt.type === "step") {
              setAnalysisSteps((prev) => ({
                ...prev,
                [evt.id]: { status: evt.status, label: evt.label },
              }));
            } else if (evt.type === "done") {
              await reload();
              if (evt.newCount > 0) {
                toast.success(`${evt.newCount} nouvelle${evt.newCount !== 1 ? "s" : ""} décision${evt.newCount !== 1 ? "s" : ""} en attente`);
              } else {
                toast.info("Analyse terminée — aucune nouvelle décision");
              }
              setIsAnalyzing(false);
            } else if (evt.type === "error") {
              toast.error(`Erreur : ${evt.message}`);
              setIsAnalyzing(false);
            }
          } catch { /* ignore malformed SSE lines */ }
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        toast.error("Analyse interrompue");
      }
      setIsAnalyzing(false);
    }
  }, [workspaceId, reload]);

  const pendingDecisions = decisions.filter((d) => d.status === "PENDING");
  const doneDecisions = decisions.filter((d) => d.status !== "PENDING");

  const filtered =
    filter === "pending" ? pendingDecisions :
    filter === "done" ? doneDecisions :
    decisions;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
            <Brain className="h-4 w-4 text-violet-600" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-gray-900">File d&apos;approbation CSO</h2>
            <p className="text-[11px] text-gray-500">
              {pendingDecisions.length} décision{pendingDecisions.length !== 1 ? "s" : ""} en attente
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={reload}
            disabled={isAnalyzing}
            className="h-8 text-[12px] rounded-lg border-gray-200"
          >
            <RefreshCw className="h-3 w-3 mr-1.5" />
            Actualiser
          </Button>
          <Button
            size="sm"
            onClick={handleTrigger}
            disabled={isAnalyzing}
            className="h-8 text-[12px] rounded-lg bg-violet-600 hover:bg-violet-700 text-white border-0"
          >
            {isAnalyzing ? (
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <Zap className="h-3 w-3 mr-1.5" />
            )}
            {isAnalyzing ? "Analyse…" : "Analyser maintenant"}
          </Button>
        </div>
      </div>

      {/* Analysis progress */}
      {isAnalyzing && <AnalysisProgress steps={analysisSteps} />}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(["pending", "done", "all"] as const).map((tab) => {
          const count = tab === "pending" ? pendingDecisions.length : tab === "done" ? doneDecisions.length : decisions.length;
          return (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3 py-1 rounded-md text-[12px] font-medium transition-all ${
                filter === tab
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "pending" ? "En attente" : tab === "done" ? "Traitées" : "Toutes"}
              {count > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                  filter === tab ? "bg-violet-100 text-violet-700" : "bg-gray-200 text-gray-500"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-12 rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
          {filter === "pending" ? (
            <>
              <Zap className="h-8 w-8 mx-auto mb-3 text-gray-300" />
              <p className="text-[13px] font-medium text-gray-500">Aucune décision en attente</p>
              <p className="text-[12px] text-gray-400 mt-1">
                Cliquez sur &quot;Analyser maintenant&quot; pour lancer une analyse
              </p>
            </>
          ) : (
            <>
              <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-gray-300" />
              <p className="text-[13px] font-medium text-gray-500">Aucune décision traitée</p>
            </>
          )}
        </div>
      )}

      {/* Decision list */}
      <div className="space-y-3">
        {filtered.map((decision) => (
          <DecisionCard
            key={decision.id}
            decision={decision}
            onApprove={handleApprove}
            onReject={handleReject}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
}
