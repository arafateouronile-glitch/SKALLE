"use client";

import { useState } from "react";
import { ThumbsUp, MessageSquare, Repeat2, Send, MoreHorizontal, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

const CHAR_OPTIMAL_MIN = 900;
const CHAR_OPTIMAL_MAX = 1500;
const CHAR_MAX = 3000;

function highlightHashtags(text: string) {
  const parts = text.split(/(#\w+)/g);
  return parts.map((part, i) =>
    part.startsWith("#") ? (
      <span key={i} className="text-[#0a66c2] hover:underline cursor-pointer">
        {part}
      </span>
    ) : (
      part
    )
  );
}

function CharBar({ length }: { length: number }) {
  const pct = Math.min((length / CHAR_MAX) * 100, 100);
  const color =
    length >= CHAR_OPTIMAL_MIN && length <= CHAR_OPTIMAL_MAX
      ? "bg-emerald-500"
      : length > CHAR_OPTIMAL_MAX && length <= CHAR_MAX
      ? "bg-amber-400"
      : length > CHAR_MAX
      ? "bg-red-500"
      : "bg-gray-300";

  const label =
    length === 0
      ? "Commence à écrire…"
      : length < CHAR_OPTIMAL_MIN
      ? `${length} / ${CHAR_OPTIMAL_MIN} min recommandés`
      : length <= CHAR_OPTIMAL_MAX
      ? `${length} chars — zone optimale ✓`
      : length <= CHAR_MAX
      ? `${length} / ${CHAR_MAX} — un peu long`
      : `${length} — dépasse la limite LinkedIn (${CHAR_MAX})`;

  const labelColor =
    length >= CHAR_OPTIMAL_MIN && length <= CHAR_OPTIMAL_MAX
      ? "text-emerald-600"
      : length > CHAR_MAX
      ? "text-red-600"
      : "text-gray-500";

  return (
    <div className="mt-2 space-y-1">
      <div className="h-1.5 w-full rounded-full bg-gray-200 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className={cn("text-[10px]", labelColor)}>{label}</p>
    </div>
  );
}

interface LinkedInPreviewProps {
  content: string;
  imageUrl?: string | null;
  authorName?: string;
  authorHeadline?: string;
  authorAvatar?: string | null;
  isCarousel?: boolean;
}

const PREVIEW_CUTOFF = 280;

export function LinkedInPreview({
  content,
  imageUrl,
  authorName = "Votre nom",
  authorHeadline = "Votre titre · LinkedIn",
  authorAvatar,
  isCarousel = false,
}: LinkedInPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const needsCut = content.length > PREVIEW_CUTOFF;
  const displayed = expanded || !needsCut ? content : content.slice(0, PREVIEW_CUTOFF) + "…";

  const hashtags = (content.match(/#\w+/g) ?? []).length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 pb-2">
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-white text-[15px] font-bold overflow-hidden">
          {authorAvatar ? (
            <img src={authorAvatar} alt="" className="w-full h-full object-cover" />
          ) : (
            authorName.slice(0, 2).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-[14px] font-semibold text-gray-900 leading-tight">{authorName}</p>
            <span className="text-[11px] text-[#0a66c2] border border-[#0a66c2] rounded px-1 leading-tight">
              1er
            </span>
          </div>
          <p className="text-[12px] text-gray-500 leading-tight line-clamp-1">{authorHeadline}</p>
          <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
            À l&apos;instant ·{" "}
            <Globe className="inline h-2.5 w-2.5" />
          </p>
        </div>
        <button className="text-gray-400 hover:text-gray-600 p-1 rounded">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 pb-2">
        <p className="text-[14px] text-gray-800 leading-relaxed whitespace-pre-wrap break-words">
          {highlightHashtags(displayed)}
          {needsCut && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="text-gray-500 font-semibold ml-1 hover:text-gray-700"
            >
              voir plus
            </button>
          )}
        </p>

        {hashtags > 0 && (
          <p className="text-[11px] text-gray-400 mt-1">
            {hashtags} hashtag{hashtags > 1 ? "s" : ""}
          </p>
        )}

        <CharBar length={content.length} />
      </div>

      {/* Image or Carousel placeholder */}
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="w-full max-h-80 object-cover border-t border-gray-100"
        />
      ) : isCarousel ? (
        <div className="mx-4 mb-2 rounded-lg border border-gray-200 bg-gradient-to-br from-violet-50 to-blue-50 h-48 flex flex-col items-center justify-center gap-2">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-12 h-16 rounded bg-white shadow-sm border border-gray-200 flex items-center justify-center text-[10px] text-gray-400 font-medium"
              >
                {i + 1}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">Carousel document</p>
        </div>
      ) : null}

      {/* Engagement bar */}
      <div className="px-4 pt-1 pb-0">
        <div className="flex items-center justify-between text-[12px] text-gray-500 border-b border-gray-100 pb-2">
          <span className="flex items-center gap-1">
            <span className="bg-[#0a66c2] text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px]">
              👍
            </span>
            <span>Aperçu — réactions réelles après publication</span>
          </span>
          <span>0 commentaires</span>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-around px-4 py-1 text-gray-500">
        {[
          { icon: ThumbsUp, label: "J'aime" },
          { icon: MessageSquare, label: "Commenter" },
          { icon: Repeat2, label: "Republier" },
          { icon: Send, label: "Envoyer" },
        ].map(({ icon: Icon, label }) => (
          <button
            key={label}
            className="flex items-center gap-1.5 text-[12px] font-semibold hover:bg-gray-100 rounded px-2 py-1.5 transition-colors"
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <p className="text-center text-[10px] text-gray-300 pb-2">
        Aperçu approximatif — le rendu final peut légèrement varier
      </p>
    </div>
  );
}
