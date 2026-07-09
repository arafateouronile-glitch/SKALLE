"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  TrendingUp,
  Mail,
  Clock,
  FileText,
  PowerOff,
  ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Types ─────────────────────────────────────────────────────────────────────

type SuggestionType =
  | "SUBJECT_REWRITE"
  | "DELAY_CHANGE"
  | "CONTENT_REWRITE"
  | "DEACTIVATE"
  | "CHANNEL_SWITCH";

interface Suggestion {
  id: string;
  type: SuggestionType;
  reason: string;
  currentValue: Record<string, unknown>;
  suggestedValue: Record<string, unknown>;
  estimatedImpact: string;
  status: string;
  stepId: string | null;
  sequence: {
    id: string;
    name: string;
    prospect: { name: string; company: string };
  };
}

// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  SuggestionType,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  SUBJECT_REWRITE: {
    label: "Objet email",
    icon: Mail,
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
  },
  DELAY_CHANGE: {
    label: "Délai entre steps",
    icon: Clock,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
  CONTENT_REWRITE: {
    label: "Corps du message",
    icon: FileText,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
  },
  DEACTIVATE: {
    label: "Désactiver séquence",
    icon: PowerOff,
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
  },
  CHANNEL_SWITCH: {
    label: "Changer de canal",
    icon: ArrowLeftRight,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
};

function renderValue(type: SuggestionType, val: Record<string, unknown>): string {
  if (type === "SUBJECT_REWRITE") return (val.subject as string) ?? JSON.stringify(val);
  if (type === "DELAY_CHANGE") return val.delayDays !== undefined ? `J+${val.delayDays}` : JSON.stringify(val);
  if (type === "CONTENT_REWRITE") {
    const c = (val.content as string) ?? "";
    return c.length > 120 ? c.slice(0, 120) + "…" : c;
  }
  if (type === "DEACTIVATE") return (val.action as string) ?? "Désactiver";
  if (type === "CHANNEL_SWITCH") return (val.channel as string) ?? JSON.stringify(val);
  return JSON.stringify(val);
}

// ─── SuggestionCard ────────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  onAction,
  actioning,
}: {
  suggestion: Suggestion;
  onAction: (id: string, action: "approve" | "reject") => void;
  actioning: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = TYPE_CONFIG[suggestion.type];
  const Icon = cfg.icon;
  const isBusy = actioning === suggestion.id;

  return (
    <div className={cn("rounded-xl border p-4 transition-all", cfg.bg)}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 rounded-lg p-1.5", cfg.bg)}>
          <Icon className={cn("h-4 w-4", cfg.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <Badge
              className={cn("text-[10px] px-1.5 py-0.5 font-medium border", cfg.bg, cfg.color)}
            >
              {cfg.label}
            </Badge>
            <span className="text-[11px] text-slate-500 truncate">
              {suggestion.sequence.prospect.name} · {suggestion.sequence.name}
            </span>
          </div>

          <p className="text-[13px] text-slate-300 leading-snug">{suggestion.reason}</p>

          <div className="flex items-center gap-1 mt-1.5">
            <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />
            <span className="text-[11px] text-emerald-400">{suggestion.estimatedImpact}</span>
          </div>
        </div>

        <button
          onClick={() => setExpanded((x) => !x)}
          className="text-slate-500 hover:text-slate-300 transition-colors mt-0.5 shrink-0"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      {/* Expanded diff */}
      {expanded && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-red-500/5 border border-red-500/10 p-3">
            <p className="text-[10px] text-red-400 font-medium mb-1.5 uppercase tracking-wide">Actuel</p>
            <p className="text-[11px] text-slate-400 whitespace-pre-wrap break-words">
              {renderValue(suggestion.type, suggestion.currentValue)}
            </p>
          </div>
          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-3">
            <p className="text-[10px] text-emerald-400 font-medium mb-1.5 uppercase tracking-wide">Suggéré</p>
            <p className="text-[11px] text-slate-300 whitespace-pre-wrap break-words">
              {renderValue(suggestion.type, suggestion.suggestedValue)}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3">
        <Button
          size="sm"
          disabled={isBusy}
          onClick={() => onAction(suggestion.id, "approve")}
          className="h-7 px-3 text-[11px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/20"
        >
          {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
          Appliquer
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={isBusy}
          onClick={() => onAction(suggestion.id, "reject")}
          className="h-7 px-3 text-[11px] text-slate-500 hover:text-slate-300"
        >
          <XCircle className="h-3 w-3 mr-1" />
          Ignorer
        </Button>
      </div>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export function SequenceSuggestionsPanel() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/sequences/suggestions");
      const data = await res.json() as { suggestions?: Suggestion[] };
      setSuggestions(data.suggestions ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function analyze() {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/sequences/suggestions", { method: "POST" });
      const data = await res.json() as { generated?: number; analyzed?: number; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Erreur lors de l'analyse");
        return;
      }
      toast.success(`Analyse terminée — ${data.generated ?? 0} suggestion(s) générée(s)`);
      await load();
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleAction(id: string, action: "approve" | "reject") {
    setActioning(id);
    try {
      const res = await fetch("/api/sequences/suggestions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        toast.error(data.error ?? "Erreur");
        return;
      }
      if (action === "approve") toast.success("Suggestion appliquée");
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setActioning(null);
    }
  }

  const pendingCount = suggestions.length;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed((x) => !x)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-xl p-2 bg-violet-500/10 border border-violet-500/20">
            <Sparkles className="h-4 w-4 text-violet-400" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-slate-200">Suggestions IA</h3>
            <p className="text-[11px] text-slate-500">
              Optimisations générées automatiquement chaque lundi
            </p>
          </div>
          {pendingCount > 0 && (
            <Badge className="text-[10px] px-2 py-0.5 bg-violet-500/15 text-violet-400 border border-violet-500/20">
              {pendingCount}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={analyzing}
            onClick={(e) => { e.stopPropagation(); void analyze(); }}
            className="h-7 px-3 text-[11px] text-slate-400 hover:text-slate-200"
          >
            {analyzing ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Analyser
          </Button>
          {collapsed ? (
            <ChevronRight className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          )}
        </div>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="px-5 pb-5">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : suggestions.length === 0 ? (
            <div className="text-center py-8">
              <Sparkles className="h-8 w-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Aucune suggestion en attente</p>
              <p className="text-[11px] text-slate-600 mt-1">
                Cliquez sur &ldquo;Analyser&rdquo; pour lancer une analyse IA de vos séquences
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {suggestions.map((s) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  onAction={handleAction}
                  actioning={actioning}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
