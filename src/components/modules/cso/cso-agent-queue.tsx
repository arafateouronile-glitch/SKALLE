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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

  // Preview of generated content
  let preview: string | null = null;
  if (decision.actionType === "CSO_LAUNCH_LINKEDIN" && data.connectNote) {
    preview = data.connectNote as string;
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
            {preview && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="mt-2 flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-700 font-medium"
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {expanded ? "Masquer le message" : "Voir le message généré"}
              </button>
            )}
          </div>
        </div>

        {/* Expanded preview */}
        {expanded && preview && (
          <div className="mt-3 ml-11 p-3 rounded-lg bg-gray-50 border border-gray-100">
            <pre className="text-[12px] text-gray-700 whitespace-pre-wrap font-sans">{preview}</pre>
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
  const [triggering, setTriggering] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "done">("pending");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    setTriggering(true);
    try {
      const res = await fetch("/api/cso-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) { toast.error("Erreur lors du déclenchement"); return; }

      toast.success("Analyse déclenchée — les décisions arriveront dans quelques secondes");

      // Poll every 3s up to 5 times (15s total), stop early if new decisions arrived
      const prevCount = decisions.filter((d) => d.status === "PENDING").length;
      if (pollRef.current) clearInterval(pollRef.current);
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        const pollRes = await fetch(`/api/cso-agent?workspaceId=${workspaceId}`);
        if (pollRes.ok) {
          const json = (await pollRes.json()) as { decisions: AgentDecision[]; pendingCount: number };
          setDecisions(json.decisions);
          if (json.pendingCount > prevCount || attempts >= 5) {
            clearInterval(pollRef.current!);
            pollRef.current = null;
          }
        } else if (attempts >= 5) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
        }
      }, 3_000);
    } finally {
      setTriggering(false);
    }
  }, [workspaceId, decisions, reload]);

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
            className="h-8 text-[12px] rounded-lg border-gray-200"
          >
            <RefreshCw className="h-3 w-3 mr-1.5" />
            Actualiser
          </Button>
          <Button
            size="sm"
            onClick={handleTrigger}
            disabled={triggering}
            className="h-8 text-[12px] rounded-lg bg-violet-600 hover:bg-violet-700 text-white border-0"
          >
            {triggering ? (
              <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <Zap className="h-3 w-3 mr-1.5" />
            )}
            Analyser maintenant
          </Button>
        </div>
      </div>

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
