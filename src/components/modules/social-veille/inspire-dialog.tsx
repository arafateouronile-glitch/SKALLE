"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Copy, Check, Loader2, Wand2, BookOpen, Calendar, Send, Linkedin, Twitter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

type Platform = "LINKEDIN" | "X";
type ActionState = "idle" | "loading" | "done";

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
  const [platform, setPlatform] = useState<Platform>("LINKEDIN");
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [actionLabel, setActionLabel] = useState("");

  useEffect(() => {
    if (!open) return;
    // Reset if postId changed (new post opened)
    setResult(null);
    setError(null);
    setEditedPost("");
  }, [postId]);

  useEffect(() => {
    if (!open || result) return;
    setLoading(true);
    setError(null);
    fetch(`/api/social/veille/${postId}/inspire`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : r.json().then((e: { error?: string }) => Promise.reject(e.error ?? "Erreur"))))
      .then((data: InspireResult) => {
        setResult(data);
        setEditedPost(data.generatedPost);
        // Pre-select platform from the viral post
        if (data.brief.platform === "LINKEDIN") setPlatform("LINKEDIN");
        else if (data.brief.platform === "TWITTER") setPlatform("X");
      })
      .catch((e: unknown) => setError(typeof e === "string" ? e : "Erreur lors de la génération"))
      .finally(() => setLoading(false));
  }, [open, postId, result]);

  function handleClose() {
    setResult(null);
    setError(null);
    setShowSchedule(false);
    setScheduledAt("");
    setActionState("idle");
    onClose();
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(editedPost);
    setCopied(true);
    toast.success("Post copié !");
    setTimeout(() => setCopied(false), 2000);
  }

  async function createPost(action: "draft" | "schedule" | "publish") {
    if (actionState === "loading") return;
    setActionState("loading");
    setActionLabel(action);
    try {
      const res = await fetch("/api/social/veille/create-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editedPost,
          platform,
          action,
          scheduledAt: action === "schedule" ? scheduledAt : undefined,
          sourcePostId: postId,
        }),
      });
      const data = await res.json() as { success?: boolean; post?: { status: string; scheduledAt?: string }; error?: string };
      if (!res.ok || !data.success) { toast.error(data.error ?? "Erreur"); setActionState("idle"); return; }

      if (action === "draft") toast.success("Post sauvegardé en brouillon !");
      else if (action === "schedule") toast.success(`Post programmé pour le ${new Date(scheduledAt).toLocaleString("fr-FR")} !`);
      else if (action === "publish") toast.success("Post publié sur LinkedIn !");

      setActionState("done");
      setTimeout(() => handleClose(), 1500);
    } catch { toast.error("Erreur réseau"); setActionState("idle"); }
  }

  // Minimum datetime = now + 5 min
  const minDatetime = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="bg-[#0f1117] border-white/[0.08] text-white max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <Wand2 className="h-4 w-4 text-emerald-400" />
            Post inspiré par le viral
          </DialogTitle>
          <DialogDescription className="sr-only">
            Génère un post adapté à ta marque depuis un post viral
          </DialogDescription>
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

              {/* Platform selector */}
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-slate-500">Plateforme :</span>
                <button
                  onClick={() => setPlatform("LINKEDIN")}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all",
                    platform === "LINKEDIN"
                      ? "bg-blue-500/20 border-blue-500/40 text-blue-400"
                      : "border-white/10 text-slate-500 hover:border-white/20"
                  )}
                >
                  <Linkedin className="h-3 w-3" /> LinkedIn
                </button>
                <button
                  onClick={() => setPlatform("X")}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-all",
                    platform === "X"
                      ? "bg-white/15 border-white/30 text-white"
                      : "border-white/10 text-slate-500 hover:border-white/20"
                  )}
                >
                  <Twitter className="h-3 w-3" /> X / Twitter
                </button>
                <Badge variant="outline" className="ml-auto text-[10px] border-emerald-500/30 text-emerald-400">
                  {editedPost.length} car.
                </Badge>
              </div>

              {/* Editable post */}
              <Textarea
                value={editedPost}
                onChange={(e) => setEditedPost(e.target.value)}
                className="min-h-[180px] bg-white/[0.04] border-white/[0.08] text-[13px] text-slate-200 leading-relaxed resize-none focus:border-emerald-500/50 focus:ring-0"
              />

              {/* Scheduler */}
              {showSchedule && (
                <div className="flex items-center gap-2 rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2">
                  <Calendar className="h-3.5 w-3.5 text-violet-400 flex-shrink-0" />
                  <input
                    type="datetime-local"
                    min={minDatetime}
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="flex-1 bg-transparent text-[12px] text-slate-300 outline-none [color-scheme:dark]"
                  />
                  <Button
                    size="sm"
                    disabled={!scheduledAt || actionState === "loading"}
                    onClick={() => createPost("schedule")}
                    className="h-7 text-[11px] bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/30"
                  >
                    {actionState === "loading" && actionLabel === "schedule"
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : "Confirmer"}
                  </Button>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1 flex-wrap">
                {/* Copy */}
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 text-[12px] gap-1.5 border border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.06]",
                    copied && "text-emerald-400 border-emerald-500/30"
                  )}
                  onClick={handleCopy}
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copié" : "Copier"}
                </Button>

                {/* Draft */}
                <Button
                  size="sm"
                  disabled={actionState === "loading" || actionState === "done"}
                  onClick={() => createPost("draft")}
                  className="h-8 text-[12px] gap-1.5 bg-slate-500/15 hover:bg-slate-500/25 text-slate-300 border border-slate-500/30"
                >
                  {actionState === "loading" && actionLabel === "draft"
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <BookOpen className="h-3.5 w-3.5" />}
                  Brouillon
                </Button>

                {/* Schedule */}
                <Button
                  size="sm"
                  disabled={actionState === "loading" || actionState === "done"}
                  onClick={() => setShowSchedule(!showSchedule)}
                  className={cn(
                    "h-8 text-[12px] gap-1.5 border transition-all",
                    showSchedule
                      ? "bg-violet-500/25 border-violet-500/40 text-violet-300"
                      : "bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border-violet-500/30"
                  )}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  Programmer
                </Button>

                {/* Publish LinkedIn */}
                {platform === "LINKEDIN" && (
                  <Button
                    size="sm"
                    disabled={actionState === "loading" || actionState === "done"}
                    onClick={() => createPost("publish")}
                    className="h-8 text-[12px] gap-1.5 bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 ml-auto"
                  >
                    {actionState === "loading" && actionLabel === "publish"
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Send className="h-3.5 w-3.5" />}
                    Publier sur LinkedIn
                  </Button>
                )}

                {/* Done state */}
                {actionState === "done" && (
                  <div className="flex items-center gap-1.5 ml-auto text-[12px] text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                    Enregistré !
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
