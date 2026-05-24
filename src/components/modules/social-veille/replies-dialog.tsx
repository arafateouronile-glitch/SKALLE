"use client";

import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Heart, Repeat2, MessageCircle, ExternalLink } from "lucide-react";
import type { XReply } from "@/app/api/social/veille/[postId]/replies/route";

interface RepliesDialogProps {
  postId: string;
  open: boolean;
  onClose: () => void;
}

type PollStatus = "idle" | "starting" | "polling" | "done" | "error";

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch { return ""; }
}

export function RepliesDialog({ postId, open, onClose }: RepliesDialogProps) {
  const [pollStatus, setPollStatus] = useState<PollStatus>("idle");
  const [replies, setReplies] = useState<XReply[]>([]);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runIdRef = useRef<string | null>(null);

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  // Reset and start when dialog opens
  useEffect(() => {
    if (!open) { stopPoll(); return; }
    setPollStatus("starting");
    setReplies([]);
    setError(null);
    runIdRef.current = null;

    fetch(`/api/social/veille/${postId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxReplies: 30 }),
    })
      .then((r) => r.json() as Promise<{ ok?: boolean; runId?: string; error?: string }>)
      .then((data) => {
        if (!data.ok || !data.runId) {
          setError(data.error ?? "Erreur lancement scraper");
          setPollStatus("error");
          return;
        }
        runIdRef.current = data.runId;
        setPollStatus("polling");
        let attempts = 0;
        pollRef.current = setInterval(async () => {
          attempts++;
          try {
            const cr = await fetch(`/api/social/veille/${postId}/replies?collect=1`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ runId: runIdRef.current }),
            });
            const cd = await cr.json() as {
              status: "running" | "done";
              replies?: XReply[];
              error?: string;
              runStatus?: string;
            };
            if (cd.status === "done") {
              stopPoll();
              setReplies(cd.replies ?? []);
              if (!cd.replies?.length && cd.error) setError(cd.error);
              setPollStatus("done");
            }
          } catch { /* ignore transient */ }
          if (attempts >= 8) {
            stopPoll();
            setError("Timeout — réessaie.");
            setPollStatus("error");
          }
        }, 15_000);
      })
      .catch(() => { setError("Erreur réseau"); setPollStatus("error"); });

    return () => stopPoll();
  }, [open, postId]);

  useEffect(() => () => stopPoll(), []);

  const statusLabel: Record<PollStatus, string> = {
    idle: "",
    starting: "Lancement du scraper…",
    polling: "Chargement des réponses X…",
    done: "",
    error: "",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#0f1117] border-white/[0.08] text-white max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-[15px]">
            <MessageCircle className="h-4 w-4 text-sky-400" />
            Réponses du post Twitter / X
          </DialogTitle>
          <DialogDescription className="sr-only">
            Réponses scrappées pour ce post viral Twitter
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 mt-2 pr-1">
          {/* Loading */}
          {(pollStatus === "starting" || pollStatus === "polling") && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-sky-400" />
              <p className="text-[13px] text-slate-400">{statusLabel[pollStatus]}</p>
            </div>
          )}

          {/* Error */}
          {pollStatus === "error" && error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-[13px] text-red-400">
              {error}
            </div>
          )}

          {/* Empty */}
          {pollStatus === "done" && replies.length === 0 && !error && (
            <div className="py-12 text-center text-[13px] text-slate-500">
              Aucune réponse trouvée pour ce tweet.
            </div>
          )}

          {/* Replies list */}
          {replies.map((reply) => {
            const initials = reply.authorName
              .split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
            return (
              <div
                key={reply.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 space-y-2"
              >
                {/* Author */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarImage src={reply.authorAvatar} />
                      <AvatarFallback className="text-[10px] font-bold bg-slate-700 text-slate-300">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <span className="text-[12px] font-semibold text-white truncate block">
                        {reply.authorName}
                      </span>
                      {reply.authorHandle && (
                        <span className="text-[11px] text-slate-500">@{reply.authorHandle}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {reply.createdAt && (
                      <span className="text-[10px] text-slate-600">{formatDate(reply.createdAt)}</span>
                    )}
                    {reply.url && (
                      <a href={reply.url} target="_blank" rel="noopener noreferrer"
                        className="text-slate-600 hover:text-sky-400 transition-colors">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Text */}
                <p className="text-[12px] text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {reply.text}
                </p>

                {/* Engagement */}
                <div className="flex items-center gap-4 text-[11px] text-slate-600">
                  <span className="flex items-center gap-1">
                    <Heart className="h-3 w-3 text-rose-400/60" />
                    {formatCount(reply.likeCount)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Repeat2 className="h-3 w-3 text-emerald-400/60" />
                    {formatCount(reply.retweetCount)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3 text-sky-400/60" />
                    {formatCount(reply.replyCount)}
                  </span>
                  {reply.authorFollowers != null && (
                    <span className="ml-auto text-slate-700">
                      {formatCount(reply.authorFollowers)} followers
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
