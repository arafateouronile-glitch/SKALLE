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
  Database,
  Target,
  Wand2,
  Pencil,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ConfidenceGauge } from "@/components/modules/goskalle/confidence-gauge";
import type { CsoPerformanceInsights } from "@/lib/services/sales/cso-learning";

// ─── Execution steps by action type ──────────────────────────────────────────

const EXECUTION_STEPS: Record<string, { label: string; icon: "pending" | "done" | "waiting" }[]> = {
  CSO_LAUNCH_LINKEDIN: [
    { label: "Invitation en file d'attente — envoi automatique (10h)", icon: "waiting" },
    { label: "Message post-connexion — attend acceptation",             icon: "waiting" },
    { label: "Relance J+5 si pas de réponse",                          icon: "waiting" },
    { label: "Email fallback J+7 si non accepté",                      icon: "waiting" },
  ],
  CSO_LAUNCH_EMAIL: [
    { label: "Email envoyé",                          icon: "done" },
    { label: "Relance J+3 si pas de réponse",         icon: "waiting" },
  ],
  CSO_FOLLOWUP: [
    { label: "Message de relance envoyé",             icon: "done" },
  ],
  CSO_STALE_REJECT: [
    { label: "Prospect archivé",                      icon: "done" },
  ],
};

const PENDING_STEPS: Record<string, string[]> = {
  CSO_LAUNCH_LINKEDIN: [
    "Création de la séquence…",
    "Programmation des étapes post-connexion",
    "Programmation des relances",
  ],
  CSO_LAUNCH_EMAIL: [
    "Envoi de l'email…",
    "Programmation de la relance",
  ],
  CSO_FOLLOWUP: ["Envoi de la relance…"],
  CSO_STALE_REJECT: ["Archivage du prospect…"],
};

function ExecutionPending({ actionType }: { actionType: string }) {
  const steps = PENDING_STEPS[actionType] ?? ["Exécution en cours…"];
  return (
    <div className="mt-3 ml-11 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Loader2 className="h-3.5 w-3.5 text-amber-500 animate-spin shrink-0" />
        <span className="text-[12px] font-semibold text-amber-700">
          {"Création de la séquence…"}
        </span>
      </div>
      <div className="space-y-1.5 pl-5">
        {steps.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <Circle className="h-3 w-3 text-amber-300 shrink-0" />
            <span className="text-[11px] text-amber-600">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExecutionDone({ actionType }: { actionType: string }) {
  const steps = EXECUTION_STEPS[actionType] ?? [{ label: "Action exécutée", icon: "done" as const }];
  return (
    <div className="mt-3 ml-11 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        <span className="text-[12px] font-semibold text-emerald-700">Séquence créée</span>
      </div>
      <div className="space-y-1.5 pl-5">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2">
            {step.icon === "done" ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
            ) : (
              <Clock className="h-3 w-3 text-gray-300 shrink-0" />
            )}
            <span className={`text-[11px] ${step.icon === "done" ? "text-emerald-600" : "text-gray-400"}`}>
              {step.label}
            </span>
          </div>
        ))}
      </div>
      {actionType === "CSO_LAUNCH_LINKEDIN" && (
        <p className="mt-2.5 pl-5 text-[10px] text-amber-600 leading-relaxed">
          Pour envoyer maintenant : onglet <strong>LinkedIn &rsaquo; File d&apos;envoi</strong> dans Prospection,
          ou activez l&apos;automation dans les <strong>Paramètres CSO</strong>.
        </p>
      )}
    </div>
  );
}

function ExecutionFailed({ errorDetail, onRetry }: { errorDetail?: string; onRetry?: () => void }) {
  return (
    <div className="mt-3 ml-11 rounded-xl border border-red-100 bg-red-50/40 p-3">
      <div className="flex items-start gap-2">
        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <span className="text-[12px] font-medium text-red-600">
            Échec de l&apos;exécution
            {errorDetail ? ` — ${errorDetail}` : " — vérifiez que LinkedIn est ouvert dans Chrome"}
          </span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-red-700 hover:text-red-900 underline underline-offset-2 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Réessayer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Analysis step tracker ────────────────────────────────────────────────────

type StepStatus = "pending" | "running" | "done" | "error";

interface StepState {
  status: StepStatus;
  label: string;
}

const STEP_DEFS = [
  { id: "enrich",      defaultLabel: "Enrichissement emails Apollo" },
  { id: "observe",     defaultLabel: "Observation du pipeline"      },
  { id: "research",    defaultLabel: "Recherche de signaux"         },
  { id: "generate",    defaultLabel: "Analyse IA"                   },
  { id: "personalize", defaultLabel: "Personnalisation messages"    },
  { id: "store",       defaultLabel: "Sauvegarde"                   },
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

function AnalysisProgress({ steps, variant = "legacy" }: { steps: Partial<Record<StepId, StepState>>; variant?: CsoQueueVariant }) {
  const isGk = variant === "goskalle";
  return (
    <div
      className={isGk ? "rounded-xl p-4" : "rounded-xl border border-violet-200 bg-violet-50/40 p-4"}
      style={isGk ? { background: "var(--amber-soft)", border: "1px solid var(--amber-line)" } : undefined}
    >
      <div className="flex items-center gap-2 mb-3">
        <Loader2
          className={isGk ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5 text-violet-500 animate-spin"}
          style={isGk ? { color: "var(--amber-fg)" } : undefined}
        />
        <span
          className={isGk ? "text-[12px] font-semibold" : "text-[12px] font-semibold text-violet-700"}
          style={isGk ? { color: "var(--amber-fg)" } : undefined}
        >
          Analyse en cours…
        </span>
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
                className={
                  isGk
                    ? "text-[12px]"
                    : `text-[12px] ${
                        status === "running"  ? "text-violet-700 font-medium" :
                        status === "done"     ? "text-gray-700"                :
                        status === "error"    ? "text-red-600"                 :
                                                "text-gray-400"
                      }`
                }
                style={
                  isGk
                    ? {
                        color:
                          status === "running" ? "var(--amber-fg)" :
                          status === "done"    ? "var(--fg-dim)"   :
                          status === "error"   ? "var(--danger-fg)" :
                                                 "var(--fg-mute)",
                        fontWeight: status === "running" ? 500 : 400,
                      }
                    : undefined
                }
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
  result: Record<string, unknown> | null;
  createdAt: string;
}

type CsoQueueVariant = "legacy" | "goskalle";

interface Props {
  workspaceId: string;
  initialDecisions: AgentDecision[];
  initialExecutedCount: number;
  initialProspectsInPipeline: number;
  /** Optionnel — absent pour l'appelant Sales OS historique (sales-os/agent/page.tsx), sans casse. */
  csoPerformanceInsights?: CsoPerformanceInsights;
  /** "legacy" (défaut) préserve le style Sales OS existant. "goskalle" applique la direction premium (accent ambre unique). */
  variant?: CsoQueueVariant;
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

// Variante goskalle : icône colorée sur chip neutre (accent ambre unique + bleu LinkedIn pour repère de marque)
const ACTION_ICON_COLOR_GOSKALLE: Record<CsoActionType, string> = {
  CSO_LAUNCH_LINKEDIN: "#2563eb",
  CSO_LAUNCH_EMAIL: "var(--fg-dim)",
  CSO_FOLLOWUP: "var(--amber-fg)",
  CSO_STALE_REJECT: "var(--fg-mute)",
};

const STATUS_CONFIG_GOSKALLE: Record<string, { label: string; color: string }> = {
  PENDING:  { label: "En attente", color: "var(--amber-fg)" },
  APPROVED: { label: "Approuvé",   color: "var(--emerald-fg)" },
  EXECUTED: { label: "Exécuté",    color: "var(--emerald-fg)" },
  REJECTED: { label: "Rejeté",     color: "var(--fg-mute)" },
  FAILED:   { label: "Échoué",     color: "var(--danger-fg)" },
};

// ─── Decision Card ────────────────────────────────────────────────────────────

function DecisionCard({
  decision,
  onApprove,
  onReject,
  onRegenerate,
  onUpdate,
  onReset,
  loading,
  isPolling,
  csoPerformanceInsights,
  variant = "legacy",
}: {
  decision: AgentDecision;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRegenerate: (id: string) => Promise<void>;
  onUpdate: (id: string, patch: Record<string, string>) => Promise<void>;
  onReset: (id: string) => void;
  loading: string | null;
  isPolling: boolean;
  csoPerformanceInsights?: CsoPerformanceInsights;
  variant?: CsoQueueVariant;
}) {
  const isGk = variant === "goskalle";
  const [expanded, setExpanded] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const startEdit = (field: string, current: string) => {
    setEditingField(field);
    setDraftValue(current);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setDraftValue("");
  };

  const saveEdit = async (field: string) => {
    setIsSaving(true);
    try {
      await onUpdate(decision.id, { [field]: draftValue });
      setEditingField(null);
    } finally {
      setIsSaving(false);
    }
  };

  const cfg = ACTION_CONFIG[decision.actionType as CsoActionType] ?? {
    label: decision.actionType,
    icon: Zap,
    color: "text-gray-500",
    bg: "bg-gray-50",
    border: "border-gray-200",
  };
  const statusCfg = STATUS_CONFIG[decision.status] ?? { label: decision.status, dot: "bg-gray-300", textColor: "text-gray-500" };
  const statusCfgGk = STATUS_CONFIG_GOSKALLE[decision.status] ?? { label: decision.status, color: "var(--fg-mute)" };
  const gkIconColor = ACTION_ICON_COLOR_GOSKALLE[decision.actionType as CsoActionType] ?? "var(--fg-mute)";
  const data = decision.actionData ?? {};
  const isPending = decision.status === "PENDING";
  const isApproved = decision.status === "APPROVED";
  const isExecuted = decision.status === "EXECUTED";
  const isFailed = decision.status === "FAILED";
  const isLoading = loading === decision.id;
  const prospectName = (data.prospectName as string) ?? "—";

  let preview: string | null = null;
  const hasLinkedInMessages =
    decision.actionType === "CSO_LAUNCH_LINKEDIN" &&
    Boolean(data.postConnectionMessage);

  if (decision.actionType === "CSO_LAUNCH_LINKEDIN") {
    preview = (data.postConnectionMessage as string) ?? null;
  } else if (decision.actionType === "CSO_LAUNCH_EMAIL" && data.content) {
    preview = `Objet : ${data.subject as string}\n\n${data.content as string}`;
  } else if (decision.actionType === "CSO_FOLLOWUP" && data.content) {
    preview = data.content as string;
  }

  const successRate = csoPerformanceInsights?.successRateByType[decision.actionType] ?? null;
  const sampleSize = csoPerformanceInsights?.sampleSizeByType[decision.actionType] ?? 0;

  // Triage visuel instantané : les décisions urgentes se distinguent sans lire le texte de priorité
  const priorityAccent =
    isGk && isPending
      ? decision.priority === 1
        ? "var(--amber-fg)"
        : decision.priority === 2
          ? "var(--amber-line)"
          : "transparent"
      : undefined;

  return (
    <div
      className={
        isGk
          ? "gk-card-hover rounded-2xl overflow-hidden"
          : `rounded-xl border ${isPending ? cfg.border : "border-gray-100"} bg-white shadow-sm overflow-hidden transition-all`
      }
      style={
        isGk
          ? {
              background: "var(--bg-card)",
              border: `1px solid ${isPending ? "var(--amber-line)" : "var(--line)"}`,
              borderLeft: priorityAccent ? `3px solid ${priorityAccent}` : undefined,
            }
          : undefined
      }
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div
            className={isGk ? "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5" : `h-8 w-8 rounded-lg ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0 mt-0.5`}
            style={isGk ? { background: "var(--bg-sidebar)", border: "1px solid var(--line)" } : undefined}
          >
            <cfg.icon className={isGk ? "h-4 w-4" : `h-4 w-4 ${cfg.color}`} style={isGk ? { color: gkIconColor } : undefined} />
          </div>

          {/* Confiance — taux de succès réel de ce type de décision, cf. boucle d'apprentissage CSO */}
          <ConfidenceGauge successRate={successRate} sampleSize={sampleSize} size={36} />

          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {isGk ? (
                <>
                  <span className="text-[13px] font-display font-semibold" style={{ color: "var(--fg)" }}>
                    {prospectName}
                  </span>
                  <span className="text-[10.5px] font-medium" style={{ color: "var(--fg-mute)" }}>
                    {cfg.label}
                  </span>
                </>
              ) : (
                <>
                  <span className={`text-[11px] font-semibold ${cfg.color}`}>{cfg.label}</span>
                  <span className="text-[11px] text-gray-500 font-medium">{prospectName}</span>
                </>
              )}
              <span
                className={isGk ? "ml-auto flex items-center gap-1 text-[11px]" : `ml-auto flex items-center gap-1 text-[11px] ${statusCfg.textColor}`}
                style={isGk ? { color: statusCfgGk.color } : undefined}
              >
                <span className={isGk ? "h-1.5 w-1.5 rounded-full" : `h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} style={isGk ? { background: statusCfgGk.color } : undefined} />
                {isGk ? statusCfgGk.label : statusCfg.label}
              </span>
            </div>

            {/* Priority + age */}
            <div className="flex items-center gap-3 mb-2">
              <span className={isGk ? "text-[10px] flex items-center gap-1" : "text-[10px] text-gray-400 flex items-center gap-1"} style={isGk ? { color: "var(--fg-mute)" } : undefined}>
                <Clock className="h-3 w-3" />
                P{decision.priority} — {PRIORITY_LABEL[decision.priority] ?? ""}
              </span>
              <span className={isGk ? "text-[10px]" : "text-[10px] text-gray-400"} style={isGk ? { color: "var(--fg-mute)" } : undefined}>
                {new Date(decision.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
              </span>
            </div>

            {/* Reasoning */}
            <p className={isGk ? "text-[12px] line-clamp-2" : "text-[12px] text-gray-600 line-clamp-2"} style={isGk ? { color: "var(--fg-dim)" } : undefined}>
              {decision.reasoning}
            </p>

            {/* Expand toggle */}
            {(preview || hasLinkedInMessages) && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className={isGk ? "gk-link mt-2 flex items-center gap-1 text-[11px] font-medium" : "mt-2 flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-700 font-medium"}
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {expanded ? "Masquer le message" : "Voir le message généré"}
              </button>
            )}
          </div>
        </div>

        {/* Expanded preview */}
        {expanded && (
          <div className="mt-3 ml-11 space-y-3">
            {hasLinkedInMessages ? (
              <>
                {data.postConnectionMessage && (
                  <div
                    className={isGk ? "rounded-lg p-3" : "rounded-lg bg-gray-50 border border-gray-100 p-3"}
                    style={isGk ? { background: "var(--bg-sidebar)", border: "1px solid var(--line)" } : undefined}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <p
                        className={isGk ? "text-[10px] font-semibold uppercase tracking-wide" : "text-[10px] font-semibold text-gray-500 uppercase tracking-wide"}
                        style={isGk ? { color: "var(--fg-mute)" } : undefined}
                      >
                        Message après acceptation
                      </p>
                      {isPending && editingField !== "postConnectionMessage" && (
                        <button onClick={() => startEdit("postConnectionMessage", data.postConnectionMessage as string)} className="text-gray-400 hover:text-gray-600 transition-colors">
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {editingField === "postConnectionMessage" ? (
                      <div className="space-y-2">
                        <textarea
                          value={draftValue}
                          onChange={(e) => setDraftValue(e.target.value)}
                          rows={6}
                          className={isGk ? "w-full text-[12px] text-gray-700 bg-white border border-gray-200 rounded-md p-2 resize-none gk-input" : "w-full text-[12px] text-gray-700 bg-white border border-gray-200 rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-violet-400"}
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={cancelEdit} className="text-[11px] text-gray-400 hover:text-gray-600">Annuler</button>
                          <button onClick={() => saveEdit("postConnectionMessage")} disabled={isSaving} className={isGk ? "gk-link flex items-center gap-1 text-[11px] font-medium disabled:opacity-50" : "flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-800 font-medium disabled:opacity-50"}>
                            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                            Enregistrer
                          </button>
                        </div>
                      </div>
                    ) : (
                      <pre className="text-[12px] text-gray-700 whitespace-pre-wrap font-sans">{data.postConnectionMessage as string}</pre>
                    )}
                  </div>
                )}
                {data._angle && (
                  <p className="text-[10.5px] text-gray-400 italic">
                    Angle : {data._angle as string}
                  </p>
                )}
                {data.linkedInUrl && (
                  <div className="flex items-center gap-2">
                    {editingField === "linkedInUrl" ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={draftValue}
                          onChange={(e) => setDraftValue(e.target.value)}
                          className={isGk ? "flex-1 text-[11px] text-gray-700 bg-white border border-gray-200 rounded-md px-2 py-1 gk-input" : "flex-1 text-[11px] text-gray-700 bg-white border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400"}
                          placeholder="https://www.linkedin.com/in/..."
                        />
                        <button onClick={cancelEdit} className="text-[11px] text-gray-400 hover:text-gray-600">Annuler</button>
                        <button onClick={() => saveEdit("linkedInUrl")} disabled={isSaving} className={isGk ? "gk-link flex items-center gap-1 text-[11px] font-medium disabled:opacity-50" : "flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-800 font-medium disabled:opacity-50"}>
                          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                          OK
                        </button>
                      </div>
                    ) : (
                      <>
                        <a
                          href={data.linkedInUrl as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                        >
                          <Linkedin className="h-3 w-3" />
                          {data.linkedInUrl as string}
                        </a>
                        {(isPending || isApproved) && (
                          <button onClick={() => startEdit("linkedInUrl", data.linkedInUrl as string)} className="text-gray-400 hover:text-gray-600 transition-colors">
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            ) : preview ? (
              <div
                className={isGk ? "rounded-lg p-3" : "rounded-lg bg-gray-50 border border-gray-100 p-3"}
                style={isGk ? { background: "var(--bg-sidebar)", border: "1px solid var(--line)" } : undefined}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={isGk ? "text-[10px] font-semibold uppercase tracking-wide" : "text-[10px] font-semibold text-gray-500 uppercase tracking-wide"}
                    style={isGk ? { color: "var(--fg-mute)" } : undefined}
                  >
                    {decision.actionType === "CSO_LAUNCH_EMAIL" ? "Email" : "Message de relance"}
                  </span>
                  {isPending && editingField !== "content" && (
                    <button onClick={() => startEdit("content", (data.content as string) ?? preview ?? "")} className="text-gray-400 hover:text-gray-600 transition-colors">
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {editingField === "content" ? (
                  <div className="space-y-2">
                    {decision.actionType === "CSO_LAUNCH_EMAIL" && (
                      <input
                        type="text"
                        placeholder="Objet"
                        value={(data.subject as string) ?? ""}
                        onChange={(e) => {
                          const subject = e.target.value;
                          setDraftValue((prev) => {
                            const parts = prev.split("\n\n");
                            return [subject, ...parts.slice(1)].join("\n\n");
                          });
                        }}
                        className={isGk ? "w-full text-[12px] text-gray-700 bg-white border border-gray-200 rounded-md px-2 py-1 gk-input" : "w-full text-[12px] text-gray-700 bg-white border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-violet-400"}
                      />
                    )}
                    <textarea
                      value={draftValue}
                      onChange={(e) => setDraftValue(e.target.value)}
                      rows={7}
                      className={isGk ? "w-full text-[12px] text-gray-700 bg-white border border-gray-200 rounded-md p-2 resize-none gk-input" : "w-full text-[12px] text-gray-700 bg-white border border-gray-200 rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-violet-400"}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={cancelEdit} className="text-[11px] text-gray-400 hover:text-gray-600">Annuler</button>
                      <button onClick={() => saveEdit("content")} disabled={isSaving} className={isGk ? "gk-link flex items-center gap-1 text-[11px] font-medium disabled:opacity-50" : "flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-800 font-medium disabled:opacity-50"}>
                        {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Enregistrer
                      </button>
                    </div>
                  </div>
                ) : (
                  <pre className="text-[12px] text-gray-700 whitespace-pre-wrap font-sans">{preview}</pre>
                )}
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
            {(hasLinkedInMessages || preview) && (
              <button
                onClick={async () => {
                  setIsRegenerating(true);
                  try { await onRegenerate(decision.id); } finally { setIsRegenerating(false); }
                }}
                disabled={isRegenerating || isLoading}
                className={isGk ? "gk-link ml-auto flex items-center gap-1.5 text-[11px] font-medium disabled:opacity-50" : "ml-auto flex items-center gap-1.5 text-[11px] text-violet-600 hover:text-violet-800 font-medium disabled:opacity-50 transition-colors"}
              >
                {isRegenerating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wand2 className="h-3 w-3" />
                )}
                {isRegenerating ? "Régénération…" : "Régénérer"}
              </button>
            )}
          </div>
        )}

        {/* Execution feedback */}
        {isApproved && isPolling && <ExecutionPending actionType={decision.actionType} />}
        {isApproved && !isPolling && (
          <div className="mt-3 ml-11 flex items-center gap-2 text-[11px] text-amber-600">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>Approuvé — en attente d&apos;exécution par l&apos;extension Chrome</span>
          </div>
        )}
        {isExecuted && <ExecutionDone actionType={decision.actionType} />}
        {isFailed && (
          <ExecutionFailed
            errorDetail={(decision.result as Record<string, unknown> | null)?.error as string | undefined}
            onRetry={() => onReset(decision.id)}
          />
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CsoAgentQueue({
  workspaceId,
  initialDecisions,
  initialExecutedCount,
  initialProspectsInPipeline,
  csoPerformanceInsights,
  variant = "legacy",
}: Props) {
  const isGk = variant === "goskalle";
  const [decisions, setDecisions] = useState<AgentDecision[]>(initialDecisions);
  const [executedCount, setExecutedCount] = useState(initialExecutedCount);
  const [prospectsInPipeline, setProspectsInPipeline] = useState(initialProspectsInPipeline);
  const [loading, setLoading] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [analysisSteps, setAnalysisSteps] = useState<Partial<Record<StepId, StepState>>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "done">("pending");
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const pollDecisionStatus = useCallback((decisionId: string) => {
    setPollingIds((prev) => new Set(prev).add(decisionId));
    let attempts = 0;
    const MAX = 30; // 2 min à 4s

    const tick = async (): Promise<void> => {
      if (attempts >= MAX) {
        setPollingIds((prev) => { const s = new Set(prev); s.delete(decisionId); return s; });
        return;
      }
      attempts++;
      try {
        const res = await fetch(`/api/cso-agent?workspaceId=${workspaceId}`);
        if (!res.ok) throw new Error();
        const json = (await res.json()) as {
          decisions: AgentDecision[];
          executedCount: number;
          prospectsInPipeline: number;
        };
        const updated = json.decisions.find((d) => d.id === decisionId);
        if (updated?.status === "EXECUTED" || updated?.status === "FAILED") {
          setDecisions(json.decisions);
          setExecutedCount(json.executedCount);
          setProspectsInPipeline(json.prospectsInPipeline);
          setPollingIds((prev) => { const s = new Set(prev); s.delete(decisionId); return s; });
          if (updated.status === "EXECUTED") {
            toast.success("Action exécutée — séquence créée avec succès");
          } else {
            toast.error("Échec de l'exécution — vérifiez l'extension Chrome");
          }
          return;
        }
      } catch { /* ignore */ }
      setTimeout(() => { void tick(); }, 4000);
    };

    setTimeout(() => { void tick(); }, 4000);
  }, [workspaceId]);

  const reload = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const res = await fetch(`/api/cso-agent?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as {
        decisions: AgentDecision[];
        pendingCount: number;
        executedCount: number;
        prospectsInPipeline: number;
      };
      setDecisions(json.decisions);
      setExecutedCount(json.executedCount);
      setProspectsInPipeline(json.prospectsInPipeline);
      if (!silent) toast.success("Données actualisées");
    } catch {
      if (!silent) toast.error("Erreur lors de l'actualisation");
    } finally {
      if (!silent) setIsRefreshing(false);
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
        pollDecisionStatus(decisionId);
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

  const handleReset = useCallback(async (decisionId: string) => {
    setLoading(decisionId);
    try {
      const res = await fetch("/api/cso-agent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId, workspaceId, action: "reset" }),
      });
      if (res.ok) {
        setDecisions((prev) =>
          prev.map((d) => (d.id === decisionId ? { ...d, status: "PENDING", result: null as unknown as Record<string, unknown> } : d))
        );
        toast.success("Décision remise en attente — vous pouvez la réapprouver");
      } else {
        toast.error("Impossible de réinitialiser cette décision");
      }
    } finally {
      setLoading(null);
    }
  }, [workspaceId]);

  const handleUpdate = useCallback(async (decisionId: string, patch: Record<string, string>) => {
    const res = await fetch("/api/cso-agent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisionId, workspaceId, action: "update", patch }),
    });
    const json = await res.json() as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) throw new Error(json.error ?? "Erreur sauvegarde");
    setDecisions((prev) =>
      prev.map((d) =>
        d.id === decisionId ? { ...d, actionData: { ...(d.actionData ?? {}), ...patch } } : d
      )
    );
    toast.success("Message mis à jour");
  }, [workspaceId]);

  const handleRegenerate = useCallback(async (decisionId: string) => {
    try {
      const res = await fetch("/api/cso-agent/regenerate-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId, workspaceId }),
      });
      const json = await res.json() as { ok?: boolean; actionData?: Record<string, unknown>; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Erreur régénération");
      // Mise à jour locale immédiate sans rechargement complet
      setDecisions((prev) =>
        prev.map((d) =>
          d.id === decisionId ? { ...d, actionData: json.actionData ?? d.actionData } : d
        )
      );
      toast.success("Message régénéré");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la régénération");
    }
  }, [workspaceId]);

  const handleApolloImport = useCallback(async () => {
    setIsImporting(true);
    try {
      const res = await fetch("/api/cso-agent/apollo-discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, limit: 25 }),
      });
      const json = await res.json() as { created?: number; skipped?: number; total?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Erreur Apollo");
      if ((json.created ?? 0) > 0) {
        toast.success(`${json.created} prospect${json.created !== 1 ? "s" : ""} importé${json.created !== 1 ? "s" : ""} depuis Apollo`);
      } else {
        toast.info(`Tous les prospects Apollo sont déjà dans votre pipeline (${json.skipped} dédupliqués)`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'import Apollo");
    } finally {
      setIsImporting(false);
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
              await reload(true);
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
  const pendingCount = pendingDecisions.length;

  const filtered =
    filter === "pending" ? pendingDecisions :
    filter === "done" ? doneDecisions :
    decisions;

  const gkStatTiles = [
    { icon: Zap, value: pendingCount, label: "En attente" },
    { icon: Target, value: executedCount, label: "Exécutées" },
    { icon: Brain, value: prospectsInPipeline, label: "Prospects actifs" },
  ];

  return (
    <div className="space-y-4">
      {/* ── Stats cards (live) ── */}
      {isGk ? (
        <div className="grid grid-cols-3 gap-3">
          {gkStatTiles.map((tile) => (
            <div
              key={tile.label}
              className="rounded-xl p-4 flex items-center gap-3"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}
            >
              <div
                className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-line)" }}
              >
                <tile.icon className="h-4 w-4" style={{ color: "var(--amber-fg)" }} />
              </div>
              <div>
                <p className="text-[22px] font-display font-bold tabular-nums leading-tight" style={{ color: "var(--fg)" }}>
                  {tile.value}
                </p>
                <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>{tile.label}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-white border border-amber-200 flex items-center justify-center shrink-0">
              <Zap className="h-4 w-4 text-amber-600" />
            </div>
            <div>
              <p className="text-[22px] font-bold text-gray-900 tabular-nums leading-tight">{pendingCount}</p>
              <p className="text-[11px] text-gray-500">En attente</p>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-white border border-emerald-200 flex items-center justify-center shrink-0">
              <Target className="h-4 w-4 text-emerald-600" />
            </div>
            <div>
              <p className="text-[22px] font-bold text-gray-900 tabular-nums leading-tight">{executedCount}</p>
              <p className="text-[11px] text-gray-500">Exécutées</p>
            </div>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-white border border-violet-200 flex items-center justify-center shrink-0">
              <Brain className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <p className="text-[22px] font-bold text-gray-900 tabular-nums leading-tight">{prospectsInPipeline}</p>
              <p className="text-[11px] text-gray-500">Prospects actifs</p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div
            className={isGk ? "h-8 w-8 rounded-lg flex items-center justify-center shrink-0" : "h-8 w-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0"}
            style={isGk ? { background: "var(--amber-soft)", border: "1px solid var(--amber-line)" } : undefined}
          >
            <Brain className={isGk ? "h-4 w-4" : "h-4 w-4 text-violet-600"} style={isGk ? { color: "var(--amber-fg)" } : undefined} />
          </div>
          <div>
            <h2 className={isGk ? "text-[14px] font-semibold font-display" : "text-[14px] font-semibold text-gray-900"} style={isGk ? { color: "var(--fg)" } : undefined}>
              File d&apos;approbation CSO
            </h2>
            <p className={isGk ? "text-[11px]" : "text-[11px] text-gray-500"} style={isGk ? { color: "var(--fg-mute)" } : undefined}>
              {pendingCount} décision{pendingCount !== 1 ? "s" : ""} en attente
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => reload()}
            disabled={isAnalyzing || isRefreshing}
            className="h-8 text-[12px] rounded-lg border-gray-200"
            style={isGk ? { borderColor: "var(--line)", color: "var(--fg-dim)" } : undefined}
          >
            <RefreshCw className={`h-3 w-3 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Actualisation…" : "Actualiser"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleApolloImport}
            disabled={isImporting || isAnalyzing}
            className={isGk ? "h-8 text-[12px] rounded-lg" : "h-8 text-[12px] rounded-lg border-violet-200 text-violet-700 hover:bg-violet-50"}
            style={isGk ? { borderColor: "var(--amber-line)", color: "var(--amber-fg)" } : undefined}
          >
            {isImporting ? (
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <Database className="h-3 w-3 mr-1.5" />
            )}
            {isImporting ? "Import…" : "Importer Apollo"}
          </Button>
          <Button
            size="sm"
            onClick={handleTrigger}
            disabled={isAnalyzing}
            className={isGk ? "h-8 text-[12px] rounded-lg border-0" : "h-8 text-[12px] rounded-lg bg-violet-600 hover:bg-violet-700 text-white border-0"}
            style={isGk ? { background: "var(--fg)", color: "var(--bg-card)" } : undefined}
          >
            {isAnalyzing ? (
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <Zap className="h-3 w-3 mr-1.5" style={isGk ? { color: "var(--amber-fg)" } : undefined} />
            )}
            {isAnalyzing ? "Analyse…" : "Analyser maintenant"}
          </Button>
        </div>
      </div>

      {/* Analysis progress */}
      {isAnalyzing && <AnalysisProgress steps={analysisSteps} variant={variant} />}

      {/* Filter tabs */}
      <div
        className={isGk ? "flex items-center gap-1 rounded-lg p-1 w-fit" : "flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit"}
        style={isGk ? { background: "var(--bg-sidebar)" } : undefined}
      >
        {(["pending", "done", "all"] as const).map((tab) => {
          const count = tab === "pending" ? pendingDecisions.length : tab === "done" ? doneDecisions.length : decisions.length;
          const active = filter === tab;
          return (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={
                isGk
                  ? `px-3 py-1 rounded-md text-[12px] font-medium transition-all ${active ? "gk-tab-active" : "gk-tab-inactive"}`
                  : `px-3 py-1 rounded-md text-[12px] font-medium transition-all ${active ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`
              }
            >
              {tab === "pending" ? "En attente" : tab === "done" ? "Traitées" : "Toutes"}
              {count > 0 && (
                <span
                  className={
                    isGk
                      ? "ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]"
                      : `ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${active ? "bg-violet-100 text-violet-700" : "bg-gray-200 text-gray-500"}`
                  }
                  style={isGk ? (active ? { background: "var(--amber-soft)", color: "var(--amber-fg)" } : { background: "var(--line-strong)", color: "var(--fg-mute)" }) : undefined}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div
          className={isGk ? "text-center py-12 rounded-xl" : "text-center py-12 rounded-xl border border-dashed border-gray-200 bg-gray-50/50"}
          style={isGk ? { border: "1px dashed var(--line-strong)", background: "var(--bg-sidebar)" } : undefined}
        >
          {filter === "pending" ? (
            <>
              <Zap className={isGk ? "h-8 w-8 mx-auto mb-3" : "h-8 w-8 mx-auto mb-3 text-gray-300"} style={isGk ? { color: "var(--fg-mute)" } : undefined} />
              <p className={isGk ? "text-[13px] font-medium" : "text-[13px] font-medium text-gray-500"} style={isGk ? { color: "var(--fg-mute)" } : undefined}>
                Aucune décision en attente
              </p>
              <p className={isGk ? "text-[12px] mt-1" : "text-[12px] text-gray-400 mt-1"} style={isGk ? { color: "var(--fg-mute)" } : undefined}>
                Cliquez sur &quot;Analyser maintenant&quot; pour lancer une analyse
              </p>
            </>
          ) : (
            <>
              <AlertTriangle className={isGk ? "h-8 w-8 mx-auto mb-3" : "h-8 w-8 mx-auto mb-3 text-gray-300"} style={isGk ? { color: "var(--fg-mute)" } : undefined} />
              <p className={isGk ? "text-[13px] font-medium" : "text-[13px] font-medium text-gray-500"} style={isGk ? { color: "var(--fg-mute)" } : undefined}>
                Aucune décision traitée
              </p>
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
            onRegenerate={handleRegenerate}
            onUpdate={handleUpdate}
            onReset={handleReset}
            loading={loading}
            isPolling={pollingIds.has(decision.id)}
            csoPerformanceInsights={csoPerformanceInsights}
            variant={variant}
          />
        ))}
      </div>
    </div>
  );
}
