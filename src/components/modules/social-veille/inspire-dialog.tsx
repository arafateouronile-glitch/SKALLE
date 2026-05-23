"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, ExternalLink, Loader2, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface InspireBrief {
  platform: string;
  hookType: string;
  authorName: string;
  viralScore: number;
  angle: string;
}

interface InspireResult {
  generatedPost: string;
  brief: InspireBrief;
  workspaceId: string;
}

interface InspireDialogProps {
  postId: string;
  open: boolean;
  onClose: () => void;
}

export function InspireDialog({ postId, open, onClose }: InspireDialogProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InspireResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editedPost, setEditedPost] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (!open || result) return;
    setLoading(true);
    setError(null);
    fetch(`/api/social/veille/${postId}/inspire`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : r.json().then((e: { error?: string }) => Promise.reject(e.error ?? "Erreur"))))
      .then((data: InspireResult) => {
        setResult(data);
        setEditedPost(data.generatedPost);
      })
      .catch((e: unknown) => setError(typeof e === "string" ? e : "Erreur lors de la génération"))
      .finally(() => setLoading(false));
  }, [open, postId, result]);

  function handleClose() {
    setResult(null);
    setError(null);
    onClose();
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(editedPost);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleOpenFactory() {
    const encoded = encodeURIComponent(editedPost);
    router.push(`/marketing-os/social/factory?inspire=${encoded}`);
    handleClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="bg-[#0f1117] border-white/[0.08] text-white max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Wand2 className="h-4 w-4 text-emerald-400" />
            Post inspiré par le viral
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
              <p className="text-[13px] text-slate-400">Analyse du post viral et adaptation à ta marque…</p>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-[13px] text-red-400">
              {error}
            </div>
          )}

          {result && !loading && (
            <>
              {/* Brief */}
              <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] p-3 text-[12px] text-slate-400 space-y-1">
                <p>
                  <span className="text-slate-500">Inspiré de :</span>{" "}
                  <span className="text-slate-300">{result.brief.authorName}</span>
                  {" · "}
                  <span className="text-amber-400">⚡ {Math.round(result.brief.viralScore)}</span>
                </p>
                <p>
                  <span className="text-slate-500">Hook :</span>{" "}
                  <span className="text-emerald-400">{result.brief.hookType}</span>
                  {" · "}
                  <span className="text-slate-300">{result.brief.angle}</span>
                </p>
              </div>

              {/* Editable post */}
              <div className="space-y-1.5">
                <label className="text-[12px] text-slate-400 font-medium">Post généré (éditable)</label>
                <Textarea
                  value={editedPost}
                  onChange={(e) => setEditedPost(e.target.value)}
                  className="min-h-[200px] bg-white/[0.04] border-white/[0.08] text-[13px] text-slate-200 leading-relaxed resize-none focus:border-emerald-500/50 focus:ring-0"
                />
                <p className="text-[11px] text-slate-600 text-right">{editedPost.length} caractères</p>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <Button
                  className={cn(
                    "flex-1 h-8 text-[12px] gap-1.5 transition-all",
                    copied
                      ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                      : "bg-white/[0.06] hover:bg-white/10 text-slate-300 border border-white/[0.08]"
                  )}
                  onClick={handleCopy}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copié !" : "Copier"}
                </Button>
                <Button
                  className="flex-1 h-8 text-[12px] gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30"
                  onClick={handleOpenFactory}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ouvrir dans Factory
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
