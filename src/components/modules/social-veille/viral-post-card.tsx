"use client";

import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bookmark, ExternalLink, Heart, MessageCircle, Repeat2, Eye, Wand2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { InspireDialog } from "./inspire-dialog";
import type { ViralPost } from "@prisma/client";

const PLATFORM_COLORS = {
  LINKEDIN: "bg-blue-600",
  TWITTER: "bg-sky-500",
} as const;

const PLATFORM_LABELS = {
  LINKEDIN: "LinkedIn",
  TWITTER: "Twitter / X",
} as const;

const HOOK_LABELS: Record<string, string> = {
  QUESTION: "Question",
  STAT: "Statistique",
  STORY: "Histoire",
  CONTRARIAN: "Contrariant",
  LIST: "Liste",
  HOW_TO: "How-to",
  CONFESSION: "Confession",
  PREDICTION: "Prédiction",
  OTHER: "Autre",
};

interface ViralPostCardProps {
  post: ViralPost;
  onBookmarkToggle?: (postId: string) => void;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function ViralPostCard({ post, onBookmarkToggle }: ViralPostCardProps) {
  const [bookmarked, setBookmarked] = useState(post.isBookmarked);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [inspireOpen, setInspireOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isLong = post.content.length > 280;
  const displayContent = !expanded && isLong ? post.content.slice(0, 280) + "…" : post.content;

  async function handleBookmark() {
    setBookmarkLoading(true);
    try {
      const res = await fetch(`/api/social/veille/${post.id}/bookmark`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setBookmarked(data.isBookmarked);
        onBookmarkToggle?.(post.id);
      }
    } finally {
      setBookmarkLoading(false);
    }
  }

  const initials = post.authorName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <div className="group rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] transition-all duration-200 p-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={post.authorAvatar ?? undefined} />
              <AvatarFallback className="text-[11px] font-bold bg-slate-700 text-slate-300">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white truncate">{post.authorName}</p>
              {post.authorHandle && (
                <p className="text-[11px] text-slate-500 truncate">@{post.authorHandle}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded text-white",
                PLATFORM_COLORS[post.platform]
              )}
            >
              {PLATFORM_LABELS[post.platform]}
            </span>
            <Badge
              variant="outline"
              className="text-[10px] border-slate-700 text-slate-400 px-1.5 py-0"
            >
              {HOOK_LABELS[post.hookType]}
            </Badge>
          </div>
        </div>

        {/* Content */}
        <div className="text-[13px] text-slate-300 leading-relaxed whitespace-pre-wrap">
          {displayContent}
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-1 text-emerald-400 hover:text-emerald-300 text-[12px] font-medium"
            >
              {expanded ? "Voir moins" : "Voir plus"}
            </button>
          )}
        </div>

        {/* Metrics */}
        <div className="flex items-center gap-4 text-[12px] text-slate-500">
          <span className="flex items-center gap-1">
            <Heart className="h-3.5 w-3.5 text-rose-400" />
            {formatCount(post.likes)}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5 text-sky-400" />
            {formatCount(post.comments)}
          </span>
          {post.shares > 0 && (
            <span className="flex items-center gap-1">
              <Repeat2 className="h-3.5 w-3.5 text-emerald-400" />
              {formatCount(post.shares)}
            </span>
          )}
          {post.views != null && (
            <span className="flex items-center gap-1">
              <Eye className="h-3.5 w-3.5 text-violet-400" />
              {formatCount(post.views)}
            </span>
          )}
          <span className="ml-auto text-[11px] font-bold text-amber-400">
            ⚡ {Math.round(post.viralScore)}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-white/[0.06]">
          <Button
            size="sm"
            className="h-7 text-[12px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 gap-1.5 flex-1"
            onClick={() => setInspireOpen(true)}
          >
            <Wand2 className="h-3.5 w-3.5" />
            Inspirer mon post
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn(
              "h-7 w-7 p-0 text-slate-500 hover:text-amber-400 hover:bg-amber-400/10",
              bookmarked && "text-amber-400"
            )}
            onClick={handleBookmark}
            disabled={bookmarkLoading}
          >
            {bookmarkLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Bookmark className={cn("h-3.5 w-3.5", bookmarked && "fill-current")} />
            )}
          </Button>
          <a href={post.postUrl} target="_blank" rel="noopener noreferrer">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-500 hover:text-white hover:bg-white/10"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </a>
        </div>
      </div>

      <InspireDialog postId={post.id} open={inspireOpen} onClose={() => setInspireOpen(false)} />
    </>
  );
}
