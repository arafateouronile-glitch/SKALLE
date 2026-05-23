"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  FlaskConical,
  Trophy,
  TrendingUp,
  Mail,
  Check,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getEmailAbData, applySubjectVariant, type EmailAbStep } from "@/actions/ab-tests";
import { getUserWorkspace } from "@/actions/leads";
import { toast } from "sonner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function gradeColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-sky-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "En attente", cls: "text-slate-400 bg-slate-500/10 border-slate-500/20" },
  SENT: { label: "Envoyé", cls: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  DELIVERED: { label: "Délivré", cls: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  OPENED: { label: "Ouvert ✓", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  CLICKED: { label: "Cliqué ✓", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  REPLIED: { label: "Réponse !", cls: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  FAILED: { label: "Échoué", cls: "text-red-400 bg-red-500/10 border-red-500/20" },
  SKIPPED: { label: "Ignoré", cls: "text-slate-500 bg-slate-500/10 border-slate-500/20" },
};

// ─── Step card ────────────────────────────────────────────────────────────────

function AbStepCard({ step, onApply }: { step: EmailAbStep; onApply: (stepId: string, variant: string) => Promise<void> }) {
  const [applying, setApplying] = useState<string | null>(null);

  const allSubjects = [step.subject, ...step.subjectVariants.filter((v) => v !== step.subject)].filter(Boolean) as string[];
  const bestScore = step.personalizationScore ?? 0;
  const statusCfg = STATUS_LABEL[step.status] ?? STATUS_LABEL.PENDING;

  async function handleApply(variant: string) {
    if (variant === step.subject || step.status !== "PENDING") return;
    setApplying(variant);
    await onApply(step.stepId, variant);
    setApplying(null);
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[13px] font-semibold text-white truncate">
              {step.sequenceName}
            </span>
            <span className="text-[11px] text-slate-500">— Étape {step.stepNumber}</span>
          </div>
          <p className="text-[11px] text-slate-500">
            {step.prospectName} · {step.prospectCompany}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {step.personalizationScore !== null && (
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-slate-500" />
              <span className={cn("text-[12px] font-bold", gradeColor(bestScore))}>
                {Math.round(bestScore)}/100
              </span>
            </div>
          )}
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusCfg.cls)}>
            {statusCfg.label}
          </Badge>
        </div>
      </div>

      {/* Variants */}
      <div className="space-y-2">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider">
          Variants de sujet ({allSubjects.length})
        </p>
        {allSubjects.map((variant, i) => {
          const isCurrent = variant === step.subject;
          const isApplying = applying === variant;
          const canApply = step.status === "PENDING" && !isCurrent;

          return (
            <div
              key={i}
              className={cn(
                "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-all",
                isCurrent
                  ? "border-violet-500/40 bg-violet-500/8"
                  : "border-white/[0.06] bg-white/[0.02]"
              )}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span
                  className={cn(
                    "text-[11px] font-bold shrink-0 w-5 h-5 rounded flex items-center justify-center",
                    isCurrent
                      ? "bg-violet-500/20 text-violet-400"
                      : "bg-white/[0.06] text-slate-500"
                  )}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span
                  className={cn(
                    "text-[12px] truncate",
                    isCurrent ? "text-white font-medium" : "text-slate-400"
                  )}
                >
                  {variant}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isCurrent && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 border-violet-500/30 text-violet-400 bg-violet-500/10 flex items-center gap-1"
                  >
                    <Check className="h-2.5 w-2.5" />
                    Actuel
                  </Badge>
                )}
                {!isCurrent && i === 1 && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-400 bg-amber-500/10 flex items-center gap-1"
                  >
                    <Trophy className="h-2.5 w-2.5" />
                    Recommandé
                  </Badge>
                )}
                {canApply && (
                  <Button
                    size="sm"
                    onClick={() => handleApply(variant)}
                    disabled={!!applying}
                    className="h-6 text-[10px] gap-1 bg-white/[0.06] hover:bg-white/10 text-slate-300 border border-white/[0.08] px-2"
                  >
                    {isApplying ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "Appliquer"
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AbTestsPage() {
  const [workspaceId, setWorkspaceId] = useState<string>("");
  const [steps, setSteps] = useState<EmailAbStep[]>([]);
  const [openRate, setOpenRate] = useState(0);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const ws = await getUserWorkspace();
      if (!ws.success || !ws.workspaceId) return;
      setWorkspaceId(ws.workspaceId);

      const result = await getEmailAbData(ws.workspaceId);
      if (result.success && result.data) {
        setSteps(result.data.steps);
        setOpenRate(result.data.openRate);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleApply(stepId: string, variant: string) {
    const result = await applySubjectVariant(stepId, variant);
    if (result.success) {
      toast.success("Variant appliqué — sujet mis à jour");
      setSteps((prev) =>
        prev.map((s) => (s.stepId === stepId ? { ...s, subject: variant } : s))
      );
    } else {
      toast.error(result.error ?? "Erreur lors de l'application");
    }
  }

  const pending = steps.filter((s) => s.status === "PENDING").length;
  const sent = steps.filter((s) =>
    ["SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED"].includes(s.status)
  ).length;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-bold text-white flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-violet-400" />
            A/B Email
          </h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Comparez et choisissez les meilleurs sujets générés par l&apos;AI
          </p>
        </div>
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
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Variants générés", value: steps.length, icon: FlaskConical, color: "text-violet-400" },
          { label: "À optimiser", value: pending, icon: Sparkles, color: "text-amber-400" },
          { label: "Déjà envoyés", value: sent, icon: Mail, color: "text-blue-400" },
          { label: "Taux d'ouverture", value: `${openRate}%`, icon: TrendingUp, color: "text-emerald-400" },
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

      {/* Steps list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
        </div>
      ) : steps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="rounded-full bg-violet-500/10 border border-violet-500/20 p-6">
            <FlaskConical className="h-10 w-10 text-violet-400" />
          </div>
          <div className="text-center space-y-1">
            <p className="text-[15px] font-semibold text-white">Aucun variant disponible</p>
            <p className="text-[12px] text-slate-500 max-w-xs">
              Les variants de sujet apparaissent après avoir lancé une campagne en mode{" "}
              <span className="text-violet-400">personnalisation AI</span>.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {pending > 0 && (
            <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              {pending} étape{pending > 1 ? "s" : ""} en attente — appliquez le variant recommandé avant l&apos;envoi
            </p>
          )}
          {steps.map((step) => (
            <AbStepCard key={step.stepId} step={step} onApply={handleApply} />
          ))}
        </div>
      )}
    </div>
  );
}
