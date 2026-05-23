"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FlaskConical, Copy, Check, Trophy, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AbVariant {
  id: string;
  label: string;
  content: string;
  hookType: string | null;
  predictedScore: number | null;
  likes: number;
  comments: number;
  views: number;
  engagementRate: number | null;
  isWinner: boolean;
}

interface AbTest {
  id: string;
  name: string;
  platform: string;
  status: string;
  variants: AbVariant[];
}

interface AbTestDialogProps {
  open: boolean;
  onClose: () => void;
  baseContent: string;
  platform: string;
}

const HOOK_LABELS: Record<string, string> = {
  QUESTION: "Question",
  STAT: "Statistique",
  STORY: "Histoire",
  CONTRARIAN: "Contrariant",
  HOW_TO: "How-to",
  CONFESSION: "Confession",
};

const GRADE_COLOR = (score: number) => {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-sky-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
};

export function AbTestDialog({ open, onClose, baseContent, platform }: AbTestDialogProps) {
  const [loading, setLoading] = useState(false);
  const [test, setTest] = useState<AbTest | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/social/ab-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseContent, platform }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as AbTest;
      setTest(data);
    } catch {
      toast.error("Erreur lors de la génération des variants.");
    } finally {
      setLoading(false);
    }
  }

  async function copy(variant: AbVariant) {
    await navigator.clipboard.writeText(variant.content);
    setCopiedId(variant.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleClose() {
    setTest(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="bg-[#0f1117] border-white/[0.08] text-white max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <FlaskConical className="h-4 w-4 text-violet-400" />
            A/B Test — 3 variants
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Not generated yet */}
          {!test && !loading && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="rounded-full bg-violet-500/15 border border-violet-500/30 p-4">
                <FlaskConical className="h-8 w-8 text-violet-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-[14px] font-semibold text-white">Générer 3 variants de ce post</p>
                <p className="text-[12px] text-slate-400">
                  Chaque variant utilise un hook différent (question, stat, story…) pour le même message.
                  Claude les score et tu choisis celui à publier.
                </p>
              </div>
              <Button
                className="gap-2 bg-violet-500/15 hover:bg-violet-500/25 text-violet-400 border border-violet-500/30"
                onClick={generate}
              >
                <FlaskConical className="h-4 w-4" />
                Générer les variants
              </Button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
              <p className="text-[13px] text-slate-400">
                Génération de 3 variants + scoring viral…
              </p>
            </div>
          )}

          {/* Results */}
          {test && (
            <>
              <p className="text-[12px] text-slate-500">
                3 variants générés pour <span className="text-slate-300">{platform}</span> — copie celui qui te convient.
              </p>

              <div className="space-y-3">
                {test.variants.map((variant) => (
                  <div
                    key={variant.id}
                    className={cn(
                      "rounded-xl border p-4 space-y-3 transition-all",
                      variant.isWinner
                        ? "border-amber-500/40 bg-amber-500/5"
                        : "border-white/[0.08] bg-white/[0.03]"
                    )}
                  >
                    {/* Variant header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-white">
                          Variant {variant.label}
                        </span>
                        {variant.hookType && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-violet-500/30 text-violet-400 px-1.5 py-0"
                          >
                            {HOOK_LABELS[variant.hookType] ?? variant.hookType}
                          </Badge>
                        )}
                        {variant.isWinner && (
                          <Badge className="text-[10px] bg-amber-500/20 border-amber-500/30 text-amber-400 gap-1">
                            <Trophy className="h-2.5 w-2.5" />
                            Gagnant
                          </Badge>
                        )}
                      </div>
                      {variant.predictedScore != null && (
                        <div className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-slate-500" />
                          <span className={cn("text-[12px] font-bold", GRADE_COLOR(variant.predictedScore))}>
                            {Math.round(variant.predictedScore)}/100
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="text-[12px] text-slate-300 leading-relaxed whitespace-pre-wrap bg-white/[0.03] rounded-lg p-3 border border-white/[0.06]">
                      {variant.content}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        className={cn(
                          "h-7 text-[11px] gap-1.5 flex-1 transition-all",
                          copiedId === variant.id
                            ? "bg-emerald-600 text-white"
                            : "bg-white/[0.06] hover:bg-white/10 text-slate-300 border border-white/[0.08]"
                        )}
                        onClick={() => copy(variant)}
                      >
                        {copiedId === variant.id ? (
                          <><Check className="h-3 w-3" /> Copié !</>
                        ) : (
                          <><Copy className="h-3 w-3" /> Copier</>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-[11px] text-slate-500 hover:text-slate-300 border border-white/[0.06]"
                onClick={generate}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "↺ Regénérer"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
