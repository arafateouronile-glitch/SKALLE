"use client";

import { useState } from "react";
import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import {
  ArrowLeft,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  BookmarkCheck,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Calendar,
  Linkedin,
} from "lucide-react";
import type {
  SeriesAngle,
  SeriesPost,
  SeriesResponse,
} from "@/app/api/social/linkedin/series/route";

// ─── Config ───────────────────────────────────────────────────────────────────

const ANGLES: { id: SeriesAngle; label: string; icon: string; desc: string }[] =
  [
    {
      id: "founder_journey",
      label: "Parcours fondateur",
      icon: "🧗",
      desc: "Histoire personnelle, hauts et bas, leçons apprises",
    },
    {
      id: "expertise",
      label: "Expertise sectorielle",
      icon: "🎓",
      desc: "Savoir profond, démonstration de maîtrise",
    },
    {
      id: "thought_leadership",
      label: "Thought leadership",
      icon: "🔭",
      desc: "Vision du futur, position forte sur l'industrie",
    },
    {
      id: "case_study",
      label: "Étude de cas",
      icon: "📊",
      desc: "Résultats concrets, avant/après, données mesurables",
    },
    {
      id: "contrarian_take",
      label: "Point de vue contrarian",
      icon: "🔥",
      desc: "Opinion impopulaire mais argumentée",
    },
  ];

const DAY_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  Lundi: {
    bg: "var(--violet-soft)",
    fg: "var(--violet-fg)",
    border: "var(--violet-line)",
  },
  Mardi: {
    bg: "var(--emerald-soft)",
    fg: "var(--emerald-fg)",
    border: "var(--emerald-line)",
  },
  Mercredi: {
    bg: "var(--amber-soft)",
    fg: "var(--amber-fg)",
    border: "var(--amber-line)",
  },
  Jeudi: {
    bg: "var(--cold-soft)",
    fg: "var(--cold-fg)",
    border: "var(--cold-line)",
  },
  Vendredi: {
    bg: "var(--violet-soft)",
    fg: "var(--violet-fg)",
    border: "var(--violet-line)",
  },
};

const FORMAT_LABELS: Record<string, string> = {
  storytelling: "Storytelling",
  listicle: "Listicle",
  how_to: "How-to",
  contrarian: "Contrarian",
  aspiration: "Aspiration + CTA",
};

// ─── Post card ────────────────────────────────────────────────────────────────

function PostCard({
  post,
  onSave,
  saved,
}: {
  post: SeriesPost;
  onSave: () => void;
  saved: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [commentCopied, setCommentCopied] = useState(false);
  const [showComment, setShowComment] = useState(false);

  const colors = DAY_COLORS[post.dayLabel] ?? DAY_COLORS["Lundi"];
  const preview = post.post.slice(0, 220);
  const hasMore = post.post.length > 220;

  function handleCopy() {
    navigator.clipboard.writeText(post.post);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCopyComment() {
    navigator.clipboard.writeText(post.firstComment);
    setCommentCopied(true);
    setTimeout(() => setCommentCopied(false), 2000);
  }

  return (
    <div
      className="rounded-[16px] overflow-hidden transition-all"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--line)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-3.5"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        {/* Day badge */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] shrink-0"
          style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
        >
          <span className="text-[15px]">{post.emoji}</span>
          <div>
            <p
              className="text-[11px] font-bold leading-none"
              style={{ color: colors.fg }}
            >
              {post.dayLabel}
            </p>
            <p
              className="text-[9.5px] font-mono leading-none mt-0.5 opacity-70"
              style={{ color: colors.fg }}
            >
              Jour {post.day}
            </p>
          </div>
        </div>

        {/* Theme + format */}
        <div className="flex-1 min-w-0">
          <p
            className="text-[13px] font-semibold truncate"
            style={{ color: "var(--fg)" }}
          >
            {post.theme}
          </p>
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5 inline-block"
            style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-mute)" }}
          >
            {FORMAT_LABELS[post.format] ?? post.format}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-[7px] transition-all hover:brightness-95"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--line)",
              color: copied ? "var(--emerald-fg)" : "var(--fg-dim)",
            }}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copié" : "Copier"}
          </button>
          <button
            onClick={onSave}
            disabled={saved}
            className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1.5 rounded-[7px] transition-all hover:brightness-110 disabled:opacity-60"
            style={{
              background: saved ? "var(--emerald-soft)" : "var(--violet-fg)",
              color: saved ? "var(--emerald-fg)" : "white",
              border: saved ? "1px solid var(--emerald-line)" : "none",
            }}
          >
            <BookmarkCheck className="h-3 w-3" />
            {saved ? "Sauvegardé" : "Brouillon"}
          </button>
        </div>
      </div>

      {/* Post content */}
      <div className="px-5 pt-4 pb-3">
        <div
          className="text-[13px] leading-[1.75] whitespace-pre-wrap"
          style={{ color: "var(--fg-dim)" }}
        >
          {expanded ? post.post : preview}
          {!expanded && hasMore && (
            <span style={{ color: "var(--fg-mute)" }}>…</span>
          )}
        </div>

        {hasMore && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 mt-2 text-[11.5px] font-medium transition-all hover:opacity-70"
            style={{ color: "var(--fg-mute)" }}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3" /> Réduire
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" /> Voir le post complet
              </>
            )}
          </button>
        )}
      </div>

      {/* First comment toggle */}
      <div
        className="px-5 pb-4"
        style={{ borderTop: showComment ? "1px solid var(--line)" : undefined }}
      >
        <button
          onClick={() => setShowComment((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-medium mt-3 transition-all hover:opacity-70"
          style={{ color: "var(--violet-fg)" }}
        >
          <MessageSquare className="h-3 w-3" />
          {showComment ? "Masquer le commentaire" : "Voir le premier commentaire"}
          <span
            className="text-[9px] px-1.5 py-0.5 rounded"
            style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}
          >
            Poster 2-3 min après
          </span>
        </button>

        {showComment && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10.5px] font-mono" style={{ color: "var(--fg-mute)" }}>
                Premier commentaire
              </span>
              <button
                onClick={handleCopyComment}
                className="flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-[5px] transition-all hover:brightness-95"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--line)",
                  color: commentCopied ? "var(--emerald-fg)" : "var(--fg-dim)",
                }}
              >
                {commentCopied ? (
                  <Check className="h-2.5 w-2.5" />
                ) : (
                  <Copy className="h-2.5 w-2.5" />
                )}
                {commentCopied ? "Copié" : "Copier"}
              </button>
            </div>
            <div
              className="rounded-[9px] px-3.5 py-2.5 text-[12px] leading-relaxed whitespace-pre-wrap"
              style={{
                background: "var(--bg)",
                border: "1px solid var(--line)",
                color: "var(--fg-dim)",
              }}
            >
              {post.firstComment}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LinkedInSeriesPage() {
  const [topic, setTopic] = useState("");
  const [angle, setAngle] = useState<SeriesAngle>("founder_journey");

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<SeriesResponse | null>(null);

  const [savedPosts, setSavedPosts] = useState<Set<number>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  const [allSaved, setAllSaved] = useState(false);

  const canGenerate = topic.trim().length > 10 && !generating;

  async function handleGenerate() {
    if (!canGenerate) return;
    setGenerating(true);
    setError(null);
    setSeries(null);
    setSavedPosts(new Set());
    setAllSaved(false);

    try {
      const res = await fetch("/api/social/linkedin/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, angle }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Erreur de génération");
      }
      const data = (await res.json()) as SeriesResponse;
      setSeries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setGenerating(false);
    }
  }

  async function savePost(post: SeriesPost) {
    try {
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "LINKEDIN",
          content: post.post,
          title: `[Série] ${series?.seriesTitle ?? ""} — ${post.dayLabel}`,
          sources: {
            seriesTitle: series?.seriesTitle,
            day: post.day,
            dayLabel: post.dayLabel,
            format: post.format,
            firstComment: post.firstComment,
            angle,
          },
        }),
      });
      if (!res.ok) throw new Error();
      setSavedPosts((prev) => new Set([...prev, post.day]));
    } catch {
      // silent
    }
  }

  async function handleSaveAll() {
    if (!series || savingAll) return;
    setSavingAll(true);
    await Promise.all(series.posts.map((p) => savePost(p)));
    setAllSaved(true);
    setSavingAll(false);
  }

  return (
    <>
      <AppTopBar
        title="Série LinkedIn"
        breadcrumb="marketing-os / studio / linkedin / série"
        accent="violet"
      />

      <div className="p-6 max-w-[1300px]">
        <Link
          href="/marketing-os/studio/linkedin"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium mb-6 transition-all hover:opacity-70"
          style={{ color: "var(--fg-mute)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour au LinkedIn Studio
        </Link>

        {/* Explainer */}
        <div
          className="flex items-start gap-4 rounded-[16px] p-5 mb-6"
          style={{ background: "var(--violet-soft)", border: "1px solid var(--violet-line)" }}
        >
          <Calendar className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--violet-fg)" }} />
          <div>
            <p className="text-[13.5px] font-semibold" style={{ color: "var(--violet-fg)" }}>
              5 posts LinkedIn · Arc narratif Lun → Ven
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--violet-fg)", opacity: 0.8 }}>
              Storytelling → Listicle → How-to → Contrarian → Aspiration. Chaque post est autonome
              et s'inscrit dans une narration cohérente qui fidélise l'audience semaine après semaine.
            </p>
          </div>
          <span
            className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-[8px]"
            style={{ background: "var(--violet-fg)", color: "white" }}
          >
            12 crédits
          </span>
        </div>

        <div className="grid gap-6" style={{ gridTemplateColumns: "380px 1fr" }}>
          {/* ── LEFT : Config ─────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Topic */}
            <section
              className="rounded-[18px] p-5"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--line)",
                boxShadow: "var(--card-shadow)",
              }}
            >
              <label
                className="text-[11px] font-mono uppercase tracking-[0.15em] mb-2.5 block"
                style={{ color: "var(--fg-mute)" }}
              >
                Sujet de la série
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ex : Comment j'ai scalé mon pipeline B2B de 0 à 50K€ MRR · Les erreurs que je faisais en prospection · Pourquoi la plupart des SaaS B2B ratent leur go-to-market..."
                rows={5}
                className="w-full rounded-[10px] px-3.5 py-3 text-[13px] leading-relaxed resize-none outline-none transition-all"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--line)",
                  color: "var(--fg)",
                }}
                onFocus={(e) =>
                  (e.target.style.borderColor = "var(--violet-fg)")
                }
                onBlur={(e) =>
                  (e.target.style.borderColor = "var(--line)")
                }
              />
              <p className="text-[10.5px] mt-2" style={{ color: "var(--fg-mute)" }}>
                Plus le sujet est précis et ancré dans votre vécu, plus les posts seront authentiques.
              </p>
            </section>

            {/* Angle */}
            <section
              className="rounded-[18px] p-5"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--line)",
                boxShadow: "var(--card-shadow)",
              }}
            >
              <label
                className="text-[11px] font-mono uppercase tracking-[0.15em] mb-3 block"
                style={{ color: "var(--fg-mute)" }}
              >
                Angle narratif de la série
              </label>
              <div className="space-y-2">
                {ANGLES.map((a) => {
                  const active = angle === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setAngle(a.id)}
                      className="w-full flex items-start gap-3 px-3.5 py-3 rounded-[10px] transition-all text-left"
                      style={
                        active
                          ? {
                              background: "var(--violet-soft)",
                              border: "2px solid var(--violet-fg)",
                            }
                          : {
                              background: "var(--bg)",
                              border: "1px solid var(--line)",
                            }
                      }
                    >
                      <span className="text-[16px] shrink-0 mt-0.5">{a.icon}</span>
                      <div>
                        <p
                          className="text-[12.5px] font-semibold"
                          style={{
                            color: active ? "var(--violet-fg)" : "var(--fg)",
                          }}
                        >
                          {a.label}
                        </p>
                        <p
                          className="text-[10.5px] mt-0.5"
                          style={{
                            color: active ? "var(--violet-fg)" : "var(--fg-mute)",
                            opacity: 0.85,
                          }}
                        >
                          {a.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Generate */}
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-[12px] text-[14px] font-bold transition-all hover:brightness-110 disabled:opacity-40"
              style={{ background: "var(--violet-fg)", color: "white" }}
            >
              {generating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Génération des 5 posts…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Générer la série
                </>
              )}
            </button>

            {error && (
              <div
                className="flex items-center gap-2 px-4 py-3 rounded-[10px] text-[12.5px]"
                style={{
                  background: "var(--danger-soft)",
                  border: "1px solid var(--danger-line)",
                  color: "var(--danger-fg)",
                }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Arc preview (static) */}
            <section
              className="rounded-[18px] p-5"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--line)",
                boxShadow: "var(--card-shadow)",
              }}
            >
              <p
                className="text-[11px] font-mono uppercase tracking-[0.15em] mb-3"
                style={{ color: "var(--fg-mute)" }}
              >
                Arc de la semaine
              </p>
              <div className="space-y-2">
                {[
                  { day: "Lun", format: "Storytelling", desc: "Hook émotionnel — contexte", emoji: "🎯" },
                  { day: "Mar", format: "Listicle", desc: "Valeur dense — insights clés", emoji: "📋" },
                  { day: "Mer", format: "How-to", desc: "Méthode concrète — étapes", emoji: "🛠" },
                  { day: "Jeu", format: "Contrarian", desc: "Tension — opinion forte", emoji: "🔥" },
                  { day: "Ven", format: "Aspiration", desc: "Conclusion — leçon + CTA", emoji: "🚀" },
                ].map((row, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 text-[12px]"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    <span
                      className="font-mono text-[10px] w-8 shrink-0"
                      style={{ color: "var(--fg-mute)" }}
                    >
                      {row.day}
                    </span>
                    <span className="text-[13px]">{row.emoji}</span>
                    <span className="font-semibold" style={{ color: "var(--fg)" }}>
                      {row.format}
                    </span>
                    <span
                      className="text-[11px]"
                      style={{ color: "var(--fg-mute)" }}
                    >
                      — {row.desc}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* ── RIGHT : Series output ──────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Generating skeleton */}
            {generating && (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="rounded-[16px] p-5 animate-pulse"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--line)",
                      height: 140,
                    }}
                  >
                    <div
                      className="h-4 rounded mb-3 w-1/3"
                      style={{ background: "var(--line-strong)" }}
                    />
                    <div
                      className="h-3 rounded mb-2 w-full"
                      style={{ background: "var(--line-strong)" }}
                    />
                    <div
                      className="h-3 rounded w-2/3"
                      style={{ background: "var(--line-strong)" }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Results */}
            {series && !generating && (
              <>
                {/* Series header */}
                <div
                  className="flex items-center justify-between px-5 py-4 rounded-[16px]"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--line)",
                    boxShadow: "var(--card-shadow)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Linkedin
                      className="h-5 w-5"
                      style={{ color: "var(--violet-fg)" }}
                    />
                    <div>
                      <p
                        className="text-[15px] font-semibold"
                        style={{ color: "var(--fg)" }}
                      >
                        {series.seriesTitle}
                      </p>
                      <p
                        className="text-[11px]"
                        style={{ color: "var(--fg-mute)" }}
                      >
                        5 posts · Lundi → Vendredi
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleSaveAll}
                    disabled={savingAll || allSaved}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-[13px] font-bold transition-all hover:brightness-110 disabled:opacity-60"
                    style={{
                      background: allSaved
                        ? "var(--emerald-soft)"
                        : "var(--violet-fg)",
                      color: allSaved ? "var(--emerald-fg)" : "white",
                      border: allSaved
                        ? "1px solid var(--emerald-line)"
                        : "none",
                    }}
                  >
                    <BookmarkCheck className="h-4 w-4" />
                    {allSaved
                      ? "Tous sauvegardés ✓"
                      : savingAll
                      ? "Sauvegarde…"
                      : "Sauvegarder les 5 brouillons"}
                  </button>
                </div>

                {/* Post cards */}
                {series.posts.map((post) => (
                  <PostCard
                    key={post.day}
                    post={post}
                    onSave={() => savePost(post)}
                    saved={savedPosts.has(post.day)}
                  />
                ))}

                {/* Regenerate */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-[12.5px] font-medium transition-all hover:brightness-95 disabled:opacity-40"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--line)",
                      color: "var(--fg-dim)",
                    }}
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Régénérer la série
                  </button>
                  <Link
                    href="/marketing-os/studio/linkedin"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-[12.5px] font-medium transition-all hover:brightness-95"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--line)",
                      color: "var(--fg-dim)",
                    }}
                  >
                    <Linkedin className="h-3.5 w-3.5" />
                    Affiner un post dans le Studio
                  </Link>
                </div>
              </>
            )}

            {/* Empty state */}
            {!series && !generating && (
              <div
                className="rounded-[16px] p-12 flex flex-col items-center justify-center text-center"
                style={{ border: "1px dashed var(--line)" }}
              >
                <Calendar
                  className="h-10 w-10 mb-4 opacity-20"
                  style={{ color: "var(--violet-fg)" }}
                />
                <p
                  className="text-[14px] font-semibold mb-2"
                  style={{ color: "var(--fg)" }}
                >
                  Votre série apparaîtra ici
                </p>
                <p
                  className="text-[12px] max-w-[340px]"
                  style={{ color: "var(--fg-mute)" }}
                >
                  Renseignez votre sujet et votre angle narratif, puis cliquez sur "Générer la série".
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
