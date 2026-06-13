"use client";

import {
  Linkedin,
  Mail,
  MessageSquare,
  RefreshCw,
  GitBranch,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ArrowDown,
  Flag,
  Circle,
  Zap,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type StepStatus =
  | "PENDING"
  | "SENT"
  | "DELIVERED"
  | "OPENED"
  | "CLICKED"
  | "REPLIED"
  | "FAILED"
  | "SKIPPED";

interface SeqStep {
  id: string;
  stepNumber: number;
  channel: string;
  linkedInAction: string | null;
  content: string;
  status: StepStatus;
  sentAt: string | null;
  scheduledAt: string | null;
  metadata: Record<string, unknown> | null;
  repliedAt: string | null;
  openedAt: string | null;
  error: string | null;
}

export interface SequenceFlowProps {
  name: string;
  isActive: boolean;
  createdAt: string;
  steps: SeqStep[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const FAR_FUTURE_THRESHOLD = new Date("2090-01-01").getTime();

function isFarFuture(s: string | null): boolean {
  if (!s) return false;
  return new Date(s).getTime() >= FAR_FUTURE_THRESHOLD;
}

type NodeState = "done" | "replied" | "waiting" | "active" | "upcoming" | "skipped" | "failed";

function getNodeState(step: SeqStep): NodeState {
  if (step.status === "SKIPPED") return "skipped";
  if (step.status === "FAILED") return "failed";
  if (step.status === "REPLIED" || !!step.repliedAt) return "replied";
  if (["SENT", "DELIVERED", "OPENED", "CLICKED"].includes(step.status)) return "done";
  if (step.status === "PENDING") {
    if (isFarFuture(step.scheduledAt)) return "waiting";
    if (step.scheduledAt && new Date(step.scheduledAt) > new Date()) return "upcoming";
    return "active";
  }
  return "upcoming";
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// ── Per-state config ───────────────────────────────────────────────────────────

type StateCfg = {
  bar: string;
  bg: string;
  border: string;
  dot: string;
  dotAnim?: string;
  badge: string;
  badgeBg: string;
  label: string;
};

const STATE: Record<NodeState, StateCfg> = {
  done:     { bar: "bg-emerald-400", bg: "bg-white",        border: "border-gray-100",   dot: "bg-emerald-500",   badge: "text-emerald-700",  badgeBg: "bg-emerald-50",  label: "Envoyé"     },
  replied:  { bar: "bg-emerald-600", bg: "bg-emerald-50",   border: "border-emerald-200",dot: "bg-emerald-600",   badge: "text-emerald-800",  badgeBg: "bg-emerald-100", label: "Répondu"    },
  waiting:  { bar: "bg-violet-400",  bg: "bg-violet-50/40", border: "border-violet-100", dot: "bg-violet-400",    dotAnim: "animate-pulse",   badge: "text-violet-700",  badgeBg: "bg-violet-50",  label: "En attente" },
  active:   { bar: "bg-amber-400",   bg: "bg-amber-50/40",  border: "border-amber-100",  dot: "bg-amber-400",     dotAnim: "animate-pulse",   badge: "text-amber-700",   badgeBg: "bg-amber-50",   label: "En cours"   },
  upcoming: { bar: "bg-gray-200",    bg: "bg-gray-50/60",   border: "border-gray-100",   dot: "bg-gray-300",      badge: "text-gray-500",     badgeBg: "bg-gray-100",    label: "Planifié"   },
  skipped:  { bar: "bg-gray-100",    bg: "bg-gray-50/30",   border: "border-gray-100",   dot: "bg-gray-200",      badge: "text-gray-400",     badgeBg: "bg-gray-50",     label: "Ignoré"     },
  failed:   { bar: "bg-red-400",     bg: "bg-red-50/40",    border: "border-red-100",    dot: "bg-red-500",       badge: "text-red-600",      badgeBg: "bg-red-50",      label: "Échec"      },
};

// ── Step metadata helpers ──────────────────────────────────────────────────────

function getStepMeta(step: SeqStep): { Icon: React.ElementType; label: string; sub: string } {
  if (step.linkedInAction === "CONNECTION_REQUEST")
    return { Icon: Linkedin,       label: "Invitation LinkedIn",     sub: "Demande de connexion" };
  if (step.linkedInAction === "POST_CONNECTION_MESSAGE")
    return { Icon: MessageSquare,  label: "Message post-connexion",  sub: "Envoyé après acceptation" };
  if (step.linkedInAction === "FOLLOWUP_MESSAGE")
    return { Icon: RefreshCw,      label: "Relance LinkedIn",        sub: "Si pas de réponse à J+5" };
  const meta = step.metadata as Record<string, unknown> | null;
  const days = meta?.daysThreshold as number | undefined;
  if (step.channel === "EMAIL" && meta?.waitingFor === "NOT_ACCEPTED")
    return { Icon: Mail,           label: "Email fallback",          sub: `Si connexion refusée à J+${days ?? 7}` };
  if (step.channel === "EMAIL")
    return { Icon: Mail,           label: "Email de relance",        sub: `Relance J+${days ?? "?"}` };
  return { Icon: Circle,           label: `Étape ${step.stepNumber}`, sub: step.channel };
}

function stepDate(step: SeqStep): string | null {
  if (step.sentAt) return `Envoyé le ${fmt(step.sentAt)}`;
  if (step.scheduledAt && !isFarFuture(step.scheduledAt))
    return `Prévu le ${fmt(step.scheduledAt)}`;
  if (isFarFuture(step.scheduledAt)) return "En attente de déclencheur";
  return null;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Connector({ slim }: { slim?: boolean }) {
  return (
    <div className={`flex justify-center ${slim ? "py-0.5" : "py-1"}`}>
      <div className={`flex flex-col items-center gap-0.5`}>
        <div className="w-px h-4 bg-gray-200" />
        <ArrowDown className="h-2.5 w-2.5 text-gray-300" />
      </div>
    </div>
  );
}

function NodeCard({
  step,
  dim = false,
}: {
  step: SeqStep;
  dim?: boolean;
}) {
  const state = getNodeState(step);
  const sc = STATE[state];
  const { Icon, label, sub } = getStepMeta(step);
  const date = stepDate(step);

  return (
    <div
      className={`relative flex rounded-xl border overflow-hidden transition-all ${sc.border} ${sc.bg} ${dim ? "opacity-40 grayscale" : ""}`}
    >
      {/* Colored left bar */}
      <div className={`w-1 shrink-0 ${sc.bar}`} />

      <div className="flex-1 px-3 py-3 min-w-0">
        <div className="flex items-start gap-2.5">
          {/* Icon */}
          <div className="h-7 w-7 rounded-lg bg-white border border-gray-100 flex items-center justify-center shrink-0 shadow-sm">
            <Icon className="h-3.5 w-3.5 text-gray-500" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Title + badge */}
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <span className="text-[12.5px] font-semibold text-gray-800 leading-tight">{label}</span>
              <span
                className={`ml-auto flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${sc.badge} ${sc.badgeBg}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${sc.dot} ${sc.dotAnim ?? ""}`} />
                {sc.label}
              </span>
            </div>
            {/* Sub-label */}
            <p className="text-[11px] text-gray-400">{sub}</p>
            {/* Date */}
            {date && (
              <p className="flex items-center gap-1 text-[10.5px] text-gray-400 mt-1">
                <Clock className="h-2.5 w-2.5 shrink-0" />
                {date}
              </p>
            )}
            {/* Error */}
            {step.error && (
              <p className="text-[10.5px] text-red-500 mt-1 truncate">{step.error}</p>
            )}
          </div>
        </div>

        {/* Content preview (only when sent) */}
        {(state === "done" || state === "replied" || state === "waiting") &&
          step.content && step.content.trim().length > 0 && (
            <div className="mt-2 ml-9 border-l-2 border-gray-100 pl-2.5">
              <p className="text-[10.5px] text-gray-400 leading-relaxed line-clamp-2 italic">
                {step.content.slice(0, 140)}
                {step.content.length > 140 ? "…" : ""}
              </p>
            </div>
          )}
      </div>
    </div>
  );
}

function DecisionNode({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-3.5 py-2 shadow-sm">
        <GitBranch className="h-3.5 w-3.5 text-violet-400" />
        <span className="text-[11px] font-semibold text-gray-500">{label}</span>
      </div>
    </div>
  );
}

function PathLabel({
  outcome,
  color,
}: {
  outcome: string;
  color: "green" | "amber" | "gray";
}) {
  const cls = {
    green: "text-emerald-700 bg-emerald-50 border-emerald-200",
    amber: "text-amber-700 bg-amber-50 border-amber-200",
    gray:  "text-gray-500 bg-gray-50 border-gray-200",
  }[color];
  return (
    <div className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold w-fit mb-2 ${cls}`}>
      {color === "green" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
      {outcome}
    </div>
  );
}

function TerminalNode({ type }: { type: "success" | "closed" | "pending" }) {
  if (type === "success")
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        <div>
          <p className="text-[11.5px] font-bold text-emerald-700">Réponse obtenue</p>
          <p className="text-[10px] text-emerald-500">Fin de séquence ✅</p>
        </div>
      </div>
    );
  if (type === "closed")
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-100 px-3 py-2.5">
        <XCircle className="h-4 w-4 text-gray-400 shrink-0" />
        <div>
          <p className="text-[11.5px] font-bold text-gray-500">Clôture de séquence</p>
          <p className="text-[10px] text-gray-400">Pas de réponse ❌</p>
        </div>
      </div>
    );
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-3 py-2">
      <Loader2 className="h-3.5 w-3.5 text-gray-300 animate-spin shrink-0" />
      <p className="text-[10.5px] text-gray-400">En cours…</p>
    </div>
  );
}

function PlaceholderNode({ label, Icon = Circle }: { label: string; Icon?: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 px-3 py-2.5 opacity-50">
      <Icon className="h-3.5 w-3.5 text-gray-300 shrink-0" />
      <p className="text-[11px] text-gray-400 italic">{label}</p>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function SequenceFlow({ name, isActive, createdAt, steps }: SequenceFlowProps) {
  // Map steps to their roles
  const step1 = steps.find((s) => s.linkedInAction === "CONNECTION_REQUEST");
  const step2 = steps.find((s) => s.linkedInAction === "POST_CONNECTION_MESSAGE");
  const step3 = steps.find(
    (s) => s.channel === "EMAIL" && (s.metadata as Record<string, unknown> | null)?.waitingFor === "NOT_ACCEPTED"
  );
  const step4 = steps.find((s) => s.linkedInAction === "FOLLOWUP_MESSAGE");

  // Derive which branch is active
  const leftActive =
    !!step2 && !["SKIPPED"].includes(step2.status); // connection accepted path
  const rightActive =
    !!step3 && step3.status === "SENT"; // email fallback taken

  // If no known structure, fall back to a simple ordered list
  const isLinkedInCso = !!(step1 || step2 || step3 || step4);

  if (!isLinkedInCso && steps.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
        <GitBranch className="h-6 w-6 mx-auto mb-2 text-gray-300" />
        <p className="text-[12px] text-gray-400">Aucune étape enregistrée</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/60 overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white">
        <div className="h-7 w-7 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
          <Zap className="h-3.5 w-3.5 text-violet-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12.5px] font-semibold text-gray-800 truncate">{name}</p>
          <p className="text-[10px] text-gray-400">Séquence créée le {fmt(createdAt)}</p>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"
          }`}
        >
          {isActive ? "Active" : "Terminée"}
        </span>
      </div>

      {/* ── Flow canvas ─────────────────────────────────────────────────────── */}
      <div className="p-4 space-y-0">

        {/* ── STEP 1 : Invitation LinkedIn ─────────────────────────────────── */}
        {step1 ? (
          <NodeCard step={step1} />
        ) : (
          <PlaceholderNode label="Invitation LinkedIn" Icon={Linkedin} />
        )}

        <Connector />

        {/* ── BRANCH: Connexion acceptée? ──────────────────────────────────── */}
        {(step2 || step3) && (
          <>
            <DecisionNode label="Connexion acceptée ?" />

            {/* Two-column branch container */}
            <div className="grid grid-cols-2 gap-0 rounded-xl border border-gray-200 bg-white overflow-hidden mt-1">
              {/* ── LEFT: OUI — connexion acceptée ──────────────────────────── */}
              <div className="p-3 border-r border-gray-100 space-y-0">
                <PathLabel outcome="OUI — Acceptée" color="green" />

                {step2 ? (
                  <NodeCard step={step2} dim={rightActive} />
                ) : (
                  <PlaceholderNode label="Message post-connexion" Icon={MessageSquare} />
                )}

                <Connector slim />
                <DecisionNode label="Réponse reçue ?" />
                <Connector slim />

                {/* Sub-branch: réponse ou relance */}
                <div className="grid grid-cols-2 gap-2">
                  {/* OUI → FIN */}
                  <div>
                    <PathLabel outcome="OUI" color="green" />
                    <TerminalNode type="success" />
                  </div>
                  {/* NON → Relance J+5 */}
                  <div>
                    <PathLabel outcome="NON — J+5" color="amber" />
                    {step4 ? (
                      <>
                        <NodeCard step={step4} dim={rightActive} />
                        <Connector slim />
                        <TerminalNode type="closed" />
                      </>
                    ) : (
                      <>
                        <PlaceholderNode label="Relance LinkedIn J+5" Icon={RefreshCw} />
                        <Connector slim />
                        <TerminalNode type="closed" />
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* ── RIGHT: NON — email fallback J+7 ─────────────────────────── */}
              <div className="p-3 space-y-0">
                <PathLabel outcome="NON — J+7" color="amber" />

                {step3 ? (
                  <NodeCard step={step3} dim={leftActive && !rightActive} />
                ) : (
                  <PlaceholderNode label="Email fallback J+7" Icon={Mail} />
                )}

                <Connector slim />
                <DecisionNode label="Réponse reçue ?" />
                <Connector slim />

                {/* Sub-branch email */}
                <div className="grid grid-cols-2 gap-2">
                  {/* OUI → FIN */}
                  <div>
                    <PathLabel outcome="OUI" color="green" />
                    <TerminalNode type="success" />
                  </div>
                  {/* NON → relance email J+10 */}
                  <div>
                    <PathLabel outcome="NON — J+10" color="amber" />
                    <PlaceholderNode label="Relance email J+10" Icon={Mail} />
                    <Connector slim />
                    <TerminalNode type="closed" />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Fallback: steps not matching LinkedIn CSO structure ────────────── */}
        {!step2 && !step3 && steps.filter((s) => s !== step1).length > 0 && (
          <>
            {steps
              .filter((s) => s !== step1)
              .sort((a, b) => a.stepNumber - b.stepNumber)
              .map((step, i, arr) => (
                <div key={step.id}>
                  <Connector />
                  <NodeCard step={step} />
                  {i === arr.length - 1 && (
                    <>
                      <Connector />
                      <TerminalNode type="pending" />
                    </>
                  )}
                </div>
              ))}
          </>
        )}

        {/* ── Bottom padding / end indicator ────────────────────────────────── */}
        {!isActive && (
          <>
            <Connector />
            <div className="flex items-center gap-2 justify-center">
              <Flag className="h-3.5 w-3.5 text-gray-300" />
              <span className="text-[11px] text-gray-400 font-medium">Séquence terminée</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
