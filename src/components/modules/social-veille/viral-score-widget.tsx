"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Zap, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViralPrediction } from "@/lib/services/social/viral-predictor";

interface ViralScoreWidgetProps {
  content: string;
  platform: string;
  /** Afficher en mode compact (sidebar) ou expansé */
  compact?: boolean;
}

const GRADE_CONFIG = {
  A: { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-400", label: "Excellent" },
  B: { bg: "bg-sky-500/15", border: "border-sky-500/30", text: "text-sky-400", label: "Bon" },
  C: { bg: "bg-amber-500/15", border: "border-amber-500/30", text: "text-amber-400", label: "Moyen" },
  D: { bg: "bg-red-500/15", border: "border-red-500/30", text: "text-red-400", label: "Faible" },
} as const;

const BREAKDOWN_KEYS = [
  { key: "hook", label: "Hook", max: 25, icon: "🎣" },
  { key: "structure", label: "Structure", max: 25, icon: "📐" },
  { key: "length", label: "Longueur", max: 20, icon: "📏" },
  { key: "cta", label: "CTA", max: 15, icon: "🎯" },
  { key: "engagement_triggers", label: "Déclencheurs", max: 15, icon: "⚡" },
] as const;

export function ViralScoreWidget({ content, platform, compact = false }: ViralScoreWidgetProps) {
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<ViralPrediction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function analyze() {
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/social/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, platform }),
      });
      if (!res.ok) throw new Error("Erreur serveur");
      const data = await res.json() as ViralPrediction;
      setPrediction(data);
      setExpanded(true);
    } catch {
      setError("Impossible d'analyser le post.");
    } finally {
      setLoading(false);
    }
  }

  const gradeConfig = prediction ? GRADE_CONFIG[prediction.grade] : null;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      {/* Header / trigger */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-3.5 w-3.5 text-violet-400" />
          <span className="text-[12px] font-semibold text-slate-300">Score Viral</span>
          {prediction && gradeConfig && (
            <span className={cn("text-[11px] font-bold px-1.5 py-0.5 rounded border", gradeConfig.bg, gradeConfig.border, gradeConfig.text)}>
              {prediction.grade} — {Math.round(prediction.score)}/100
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {prediction && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-slate-500 hover:text-slate-300 transition-colors"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
          <Button
            size="sm"
            className="h-7 text-[11px] gap-1 bg-violet-500/15 hover:bg-violet-500/25 text-violet-400 border border-violet-500/30"
            onClick={analyze}
            disabled={loading || !content.trim()}
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            {prediction ? "Ré-analyser" : "Analyser"}
          </Button>
        </div>
      </div>

      {error && (
        <p className="px-3 pb-3 text-[11px] text-red-400">{error}</p>
      )}

      {/* Results */}
      {prediction && expanded && (
        <div className="border-t border-white/[0.06] p-3 space-y-3">
          {/* Score bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-500">Score global</span>
              <span className={cn("text-[12px] font-bold", gradeConfig?.text)}>
                {gradeConfig?.label}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/[0.08]">
              <div
                className={cn(
                  "h-2 rounded-full transition-all duration-700",
                  prediction.grade === "A" ? "bg-emerald-500" :
                  prediction.grade === "B" ? "bg-sky-500" :
                  prediction.grade === "C" ? "bg-amber-500" : "bg-red-500"
                )}
                style={{ width: `${prediction.score}%` }}
              />
            </div>
          </div>

          {/* Summary */}
          <p className="text-[12px] text-slate-400 leading-relaxed">{prediction.summary}</p>

          {/* Breakdown */}
          {!compact && (
            <div className="space-y-2">
              {BREAKDOWN_KEYS.map(({ key, label, max, icon }) => {
                const item = prediction.breakdown[key];
                const pct = Math.round((item.score / max) * 100);
                return (
                  <div key={key} className="space-y-0.5">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <span>{icon}</span> {label}
                        <span className="text-slate-600 ml-1">— {item.label}</span>
                      </span>
                      <span className="text-[11px] font-medium text-slate-400">{item.score}/{max}</span>
                    </div>
                    <div className="w-full h-1 rounded-full bg-white/[0.06]">
                      <div
                        className={cn(
                          "h-1 rounded-full transition-all",
                          pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-sky-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {item.tip && (
                      <p className="text-[10px] text-slate-600 italic">{item.tip}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Top suggestion */}
          <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-2.5">
            <p className="text-[11px] font-semibold text-violet-400 mb-0.5">💡 Action prioritaire</p>
            <p className="text-[12px] text-slate-300">{prediction.topSuggestion}</p>
          </div>

          {/* Similar viral posts */}
          {prediction.similarViralPosts.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] text-slate-500 font-medium">Posts viraux similaires :</p>
              {prediction.similarViralPosts.map((p, i) => (
                <div key={i} className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2 text-[11px] text-slate-400">
                  <span className="text-amber-400 font-bold">⚡{p.score}</span>
                  {" · "}{p.content}…
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
