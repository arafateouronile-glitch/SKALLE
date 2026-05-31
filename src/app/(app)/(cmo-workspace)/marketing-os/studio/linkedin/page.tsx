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
  Linkedin,
  MessageSquare,
  Calendar,
  Link2,
  FileText,
  Mic2,
  Gauge,
  TrendingUp,
  Wand2,
  Layers,
} from "lucide-react";
import type {
  LinkedInTrigger,
  LinkedInFormat,
} from "@/app/api/social/linkedin/generate/route";
import type { FromUrlResponse } from "@/app/api/social/linkedin/from-url/route";
import type { PostScore } from "@/app/api/social/linkedin/score/route";

// ─── Constants ────────────────────────────────────────────────────────────────

const LINKEDIN_PREVIEW_CHARS = 210;
const LINKEDIN_MAX_CHARS = 3000;

const TRIGGERS: {
  id: LinkedInTrigger;
  label: string;
  icon: string;
  desc: string;
}[] = [
  {
    id: "curiosity_gap",
    label: "Curiosity gap",
    icon: "🔍",
    desc: "Le lecteur ne peut pas ne pas scroller",
  },
  {
    id: "identity_validation",
    label: "Validation d'identité",
    icon: "🪞",
    desc: "La cible se sent enfin comprise",
  },
  {
    id: "tribal_belonging",
    label: "Appartenance",
    icon: "⚡",
    desc: "In-group / out-group clair",
  },
  {
    id: "productive_discomfort",
    label: "Inconfort productif",
    icon: "🔥",
    desc: "Challenge + voie de sortie concrète",
  },
  {
    id: "aspiration",
    label: "Aspiration",
    icon: "🚀",
    desc: "Ambitieux mais atteignable",
  },
  {
    id: "status_signal",
    label: "Signal de statut",
    icon: "✨",
    desc: "Partager valorise le lecteur",
  },
];

const FORMATS: { id: LinkedInFormat; label: string; desc: string }[] = [
  { id: "post_court", label: "Post court", desc: "150-250 mots percutants" },
  {
    id: "storytelling",
    label: "Storytelling",
    desc: "Situation → tension → résolution",
  },
  { id: "listicle", label: "Listicle", desc: "Points numérotés autonomes" },
  { id: "how_to", label: "How-to", desc: "Étapes actionnables" },
  {
    id: "contrarian",
    label: "Contrarian",
    desc: "Opinion surprenante + débat",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function charCountColor(n: number) {
  if (n > LINKEDIN_MAX_CHARS || n > 2700) return "var(--danger-fg)";
  if (n > 2000) return "var(--amber-fg)";
  return "var(--emerald-fg)";
}

function charCountBg(n: number) {
  if (n > LINKEDIN_MAX_CHARS || n > 2700) return "var(--danger-soft)";
  if (n > 2000) return "var(--amber-soft)";
  return "var(--emerald-soft)";
}

function linkedInCutoff(content: string): { preview: string; hasMore: boolean } {
  if (content.length <= LINKEDIN_PREVIEW_CHARS) return { preview: content, hasMore: false };
  let cut = LINKEDIN_PREVIEW_CHARS;
  while (cut > 180 && content[cut] !== "\n" && content[cut] !== " ") cut--;
  return { preview: content.slice(0, cut), hasMore: true };
}

function swapFirstLine(post: string, hook: string) {
  const idx = post.indexOf("\n");
  return idx === -1 ? hook : hook + post.slice(idx);
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ─── LinkedIn Preview ─────────────────────────────────────────────────────────

function LinkedInPreview({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const { preview, hasMore } = linkedInCutoff(content);

  return (
    <div
      className="rounded-[14px] overflow-hidden w-full"
      style={{
        background: "white",
        border: "1px solid #e0e0e0",
        boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      {/* Profile header */}
      <div className="flex items-start gap-3 p-4 pb-3">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 text-white text-[15px] font-bold"
          style={{ background: "#0A66C2" }}
        >
          <Linkedin className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-[14px]" style={{ color: "#191919" }}>
              Votre nom
            </span>
            <span className="text-[12px]" style={{ color: "#00000066" }}>
              • 1er
            </span>
          </div>
          <p className="text-[12px]" style={{ color: "#666" }}>
            Votre titre • Votre entreprise
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[11px]" style={{ color: "#888" }}>
              Maintenant
            </span>
            <span style={{ color: "#888", fontSize: 11 }}>·</span>
            <span className="text-[11px]">🌐</span>
          </div>
        </div>
        <button
          className="text-[13px] font-semibold px-3 py-1 rounded-full border"
          style={{ color: "#0A66C2", borderColor: "#0A66C2" }}
        >
          + Suivre
        </button>
      </div>

      {/* Post content */}
      <div className="px-4 pb-3">
        {content ? (
          <>
            <div
              className="text-[14px] leading-[1.65] whitespace-pre-wrap"
              style={{ color: "#191919" }}
            >
              {expanded ? content : preview}
            </div>
            {hasMore && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="text-[14px] font-semibold"
                style={{ color: "#555" }}
              >
                {expanded ? " voir moins" : "…voir plus"}
              </button>
            )}
          </>
        ) : (
          <p className="text-[13px] italic py-2" style={{ color: "#aaa" }}>
            Votre post LinkedIn apparaîtra ici…
          </p>
        )}
      </div>

      {/* Engagement bar */}
      {content && (
        <>
          <div
            className="mx-4 flex items-center justify-between pb-2"
            style={{ borderBottom: "1px solid #e0e0e0" }}
          >
            <div className="flex items-center gap-1">
              <span className="text-[14px]">👍</span>
              <span className="text-[14px]">💡</span>
              <span className="text-[14px]">❤️</span>
              <span className="text-[12px] ml-1" style={{ color: "#666" }}>
                47 réactions
              </span>
            </div>
            <span className="text-[12px]" style={{ color: "#666" }}>
              12 commentaires
            </span>
          </div>
          <div className="flex items-center px-2 py-1">
            {[
              { label: "J'aime", emoji: "👍" },
              { label: "Commenter", emoji: "💬" },
              { label: "Republier", emoji: "🔁" },
              { label: "Envoyer", emoji: "✉️" },
            ].map(({ label, emoji }) => (
              <button
                key={label}
                className="flex items-center gap-1.5 flex-1 justify-center py-2.5 rounded-lg text-[12px] font-semibold hover:bg-gray-100 transition-all"
                style={{ color: "#555" }}
              >
                <span className="text-[13px]">{emoji}</span>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LinkedInStudioPage() {
  const [mode, setMode] = useState<"idea" | "url">("idea");
  const [subject, setSubject] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [urlMeta, setUrlMeta] = useState<{ title: string; type: string; angle: string } | null>(null);
  const [trigger, setTrigger] = useState<LinkedInTrigger>("curiosity_gap");
  const [format, setFormat] = useState<LinkedInFormat>("post_court");

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [post, setPost] = useState("");
  const [hooks, setHooks] = useState<string[]>([]);
  const [selectedHookIdx, setSelectedHookIdx] = useState<number | null>(null);
  const [firstComment, setFirstComment] = useState("");

  const [activeTab, setActiveTab] = useState<"editor" | "preview" | "score">("editor");
  const [score, setScore] = useState<PostScore | null>(null);
  const [scoring, setScoring] = useState(false);
  const [copiedPost, setCopiedPost] = useState(false);
  const [copiedComment, setCopiedComment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [regenHooks, setRegenHooks] = useState(false);

  const charLen = post.length;
  const canGenerate =
    mode === "idea"
      ? subject.trim().length > 10 && !generating
      : urlInput.trim().length > 5 && !generating;

  async function handleGenerate() {
    if (!canGenerate) return;
    setGenerating(true);
    setError(null);
    setSaved(false);
    setSelectedHookIdx(null);
    setHooks([]);
    setFirstComment("");
    setUrlMeta(null);

    try {
      if (mode === "url") {
        const res = await fetch("/api/social/linkedin/from-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urlInput.trim() }),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? "Erreur de génération");
        }
        const data = (await res.json()) as FromUrlResponse;
        setPost(data.post);
        setHooks(data.hooks);
        setFirstComment(data.firstComment);
        setUrlMeta({ title: data.sourceTitle, type: data.sourceType, angle: data.angle });
      } else {
        const res = await fetch("/api/social/linkedin/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trigger, subject, format }),
        });
        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? "Erreur de génération");
        }
        const data = (await res.json()) as {
          post: string;
          hooks: string[];
          firstComment: string;
        };
        setPost(data.post);
        setHooks(data.hooks);
        setFirstComment(data.firstComment);
      }
      setActiveTab("editor");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRegenHooks() {
    if (!post || regenHooks) return;
    setRegenHooks(true);
    setSelectedHookIdx(null);
    try {
      const res = await fetch("/api/social/linkedin/hooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post, subject }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { hooks: string[] };
      setHooks(data.hooks);
    } catch {
      // silent
    } finally {
      setRegenHooks(false);
    }
  }

  function handleSelectHook(idx: number) {
    if (!post) return;
    setSelectedHookIdx(idx);
    setPost(swapFirstLine(post, hooks[idx]));
  }

  async function handleSave() {
    if (!post || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "LINKEDIN",
          content: post,
          title: post.split("\n")[0].slice(0, 80),
          sources: { trigger, format, firstComment },
        }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleScore() {
    if (!post || scoring) return;
    setScoring(true);
    setScore(null);
    try {
      const res = await fetch("/api/social/linkedin/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post }),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as PostScore;
      setScore(data);
    } catch {
      // silent
    } finally {
      setScoring(false);
    }
  }

  const accentFg = "var(--violet-fg)";
  const accentSoft = "var(--violet-soft)";

  return (
    <>
      <AppTopBar
        title="LinkedIn Studio"
        breadcrumb="marketing-os / studio / linkedin"
        accent="violet"
      />

      <div className="p-6 max-w-[1400px]">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/marketing-os/studio"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium transition-all hover:opacity-70"
            style={{ color: "var(--fg-mute)" }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour au Studio
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/marketing-os/studio/linkedin/voice"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12px] font-semibold transition-all hover:brightness-110"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
            >
              <Mic2 className="h-3.5 w-3.5" />
              Voix
            </Link>
            <Link
              href="/marketing-os/studio/linkedin/carousel"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12px] font-semibold transition-all hover:brightness-110"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
            >
              <Layers className="h-3.5 w-3.5" />
              Carousel
            </Link>
            <Link
              href="/marketing-os/studio/linkedin/series"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[10px] text-[12.5px] font-semibold transition-all hover:brightness-110"
              style={{ background: "var(--violet-soft)", border: "1px solid var(--violet-line)", color: "var(--violet-fg)" }}
            >
              <Calendar className="h-3.5 w-3.5" />
              Série Lun → Ven
            </Link>
          </div>
        </div>

        <div className="grid gap-6" style={{ gridTemplateColumns: "400px 1fr" }}>
          {/* ── LEFT : Config ─────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Mode toggle */}
            <div
              className="flex items-center p-1 rounded-[12px] gap-1"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}
            >
              {(
                [
                  { id: "idea", label: "Depuis une idée", Icon: FileText },
                  { id: "url", label: "Depuis une URL", Icon: Link2 },
                ] as const
              ).map(({ id, label, Icon }) => {
                const active = mode === id;
                return (
                  <button
                    key={id}
                    onClick={() => { setMode(id); setError(null); }}
                    className="flex items-center gap-2 flex-1 justify-center py-2 rounded-[9px] text-[12.5px] font-semibold transition-all"
                    style={
                      active
                        ? { background: accentFg, color: "white" }
                        : { color: "var(--fg-mute)" }
                    }
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Subject (idea mode) */}
            {mode === "idea" && (
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
                Sujet & angle
              </label>
              <textarea
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Décrivez votre idée, l'angle ou la vérité que vous voulez exprimer. Plus c'est précis, plus le post sera percutant."
                rows={4}
                className="w-full rounded-[10px] px-3.5 py-3 text-[13px] leading-relaxed resize-none outline-none transition-all"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--line)",
                  color: "var(--fg)",
                }}
                onFocus={(e) => (e.target.style.borderColor = accentFg)}
                onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
              />
            </section>
            )}

            {/* URL (url mode) */}
            {mode === "url" && (
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
                URL à repurposer
              </label>
              <div className="flex items-center gap-2 rounded-[10px] px-3.5 py-2.5 transition-all"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
                onFocus={() => {}}
              >
                <Link2 className="h-4 w-4 shrink-0" style={{ color: "var(--fg-mute)" }} />
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => { setUrlInput(e.target.value); setUrlMeta(null); }}
                  placeholder="https://monblog.com/article · youtube.com/watch?v=..."
                  className="flex-1 bg-transparent text-[13px] outline-none"
                  style={{ color: "var(--fg)" }}
                />
              </div>
              <p className="text-[10.5px] mt-2" style={{ color: "var(--fg-mute)" }}>
                Articles, posts de blog, vidéos YouTube, newsletters — l'IA choisit automatiquement le meilleur angle.
              </p>
              {/* Source meta badge (after generation) */}
              {urlMeta && (
                <div
                  className="mt-3 rounded-[9px] px-3 py-2.5 flex items-start gap-2"
                  style={{ background: accentSoft, border: `1px solid var(--violet-line)` }}
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: accentFg }} />
                  <div>
                    <p className="text-[11.5px] font-semibold" style={{ color: accentFg }}>
                      {urlMeta.title.slice(0, 60)}{urlMeta.title.length > 60 ? "…" : ""}
                    </p>
                    <p className="text-[10.5px] mt-0.5" style={{ color: accentFg, opacity: 0.8 }}>
                      {urlMeta.type} · Angle : {urlMeta.angle}
                    </p>
                  </div>
                </div>
              )}
            </section>
            )}

            {/* Trigger — idea mode only */}
            {mode === "idea" && <section
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
                Déclencheur émotionnel
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TRIGGERS.map((t) => {
                  const active = trigger === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTrigger(t.id)}
                      className="text-left p-3 rounded-[10px] transition-all"
                      style={
                        active
                          ? {
                              background: accentSoft,
                              border: `2px solid ${accentFg}`,
                            }
                          : {
                              background: "var(--bg)",
                              border: "1px solid var(--line)",
                            }
                      }
                    >
                      <span className="text-[15px] block mb-1">{t.icon}</span>
                      <p
                        className="text-[11.5px] font-semibold leading-tight"
                        style={{ color: active ? accentFg : "var(--fg)" }}
                      >
                        {t.label}
                      </p>
                      <p
                        className="text-[10px] mt-0.5 leading-snug opacity-75"
                        style={{ color: active ? accentFg : "var(--fg-mute)" }}
                      >
                        {t.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>}

            {/* Format — idea mode only */}
            {mode === "idea" && <section
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
                Format du post
              </label>
              <div className="space-y-2">
                {FORMATS.map((f) => {
                  const active = format === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFormat(f.id)}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] transition-all text-left"
                      style={
                        active
                          ? { background: accentSoft, border: `2px solid ${accentFg}` }
                          : { background: "var(--bg)", border: "1px solid var(--line)" }
                      }
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: active ? accentFg : "var(--line-strong)" }}
                      />
                      <div>
                        <p className="text-[12.5px] font-semibold" style={{ color: active ? accentFg : "var(--fg)" }}>
                          {f.label}
                        </p>
                        <p className="text-[10.5px]" style={{ color: active ? accentFg : "var(--fg-mute)", opacity: 0.8 }}>
                          {f.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>}

            {/* CTA */}
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-[12px] text-[14px] font-bold transition-all hover:brightness-110 disabled:opacity-40"
              style={{ background: accentFg, color: "white" }}
            >
              {generating ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Génération en cours…
                </>
              ) : mode === "url" ? (
                <>
                  <Link2 className="h-4 w-4" />
                  Analyser & Générer
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Générer le post LinkedIn
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

            {/* Hook variations */}
            {hooks.length > 0 && (
              <section
                className="rounded-[18px] p-5"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--line)",
                  boxShadow: "var(--card-shadow)",
                }}
              >
                <div className="flex items-center justify-between mb-2.5">
                  <label
                    className="text-[11px] font-mono uppercase tracking-[0.15em]"
                    style={{ color: "var(--fg-mute)" }}
                  >
                    Variations de hook
                  </label>
                  <button
                    onClick={handleRegenHooks}
                    disabled={regenHooks}
                    className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-[6px] transition-all hover:brightness-95 disabled:opacity-50"
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--line)",
                      color: "var(--fg-dim)",
                    }}
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${regenHooks ? "animate-spin" : ""}`}
                    />
                    Régénérer
                  </button>
                </div>
                <p className="text-[10.5px] mb-3" style={{ color: "var(--fg-mute)" }}>
                  Cliquez pour remplacer la 1ère ligne du post
                </p>
                <div className="space-y-2">
                  {hooks.map((hook, i) => {
                    const selected = selectedHookIdx === i;
                    return (
                      <button
                        key={i}
                        onClick={() => handleSelectHook(i)}
                        className="w-full text-left p-3 rounded-[10px] transition-all"
                        style={
                          selected
                            ? {
                                background: accentSoft,
                                border: `2px solid ${accentFg}`,
                              }
                            : {
                                background: "var(--bg)",
                                border: "1px solid var(--line)",
                              }
                        }
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className="shrink-0 mt-0.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                            style={{
                              background: selected
                                ? accentFg
                                : "var(--line-strong)",
                              color: selected ? "white" : "var(--fg-mute)",
                            }}
                          >
                            {selected ? "✓" : i + 1}
                          </span>
                          <p
                            className="text-[12px] leading-snug"
                            style={{
                              color: selected ? accentFg : "var(--fg-dim)",
                            }}
                          >
                            {hook}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>

          {/* ── RIGHT : Editor + Preview ───────────────────────────────────── */}
          <div className="space-y-4">
            {/* Tab bar */}
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: "editor", label: "Éditer" },
                  { id: "preview", label: "Aperçu" },
                  { id: "score", label: "Score", icon: Gauge },
                ] as const
              ).map((tab) => {
                const active = activeTab === tab.id;
                const Icon = (tab as { icon?: typeof Gauge }).icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      if (tab.id === "score" && post && !score && !scoring) handleScore();
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
                    style={
                      active
                        ? { background: accentSoft, color: accentFg, border: "1px solid var(--violet-line)" }
                        : { color: "var(--fg-dim)", border: "1px solid transparent" }
                    }
                  >
                    {Icon && <Icon className="h-3.5 w-3.5" />}
                    {tab.label}
                    {tab.id === "score" && score && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded ml-0.5"
                        style={{
                          background: score.globalScore >= 75 ? "var(--emerald-soft)" : score.globalScore >= 55 ? "var(--amber-soft)" : "var(--danger-soft)",
                          color: score.globalScore >= 75 ? "var(--emerald-fg)" : score.globalScore >= 55 ? "var(--amber-fg)" : "var(--danger-fg)",
                        }}
                      >
                        {score.globalScore}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Editor tab */}
            {activeTab === "editor" && (
              <section
                className="rounded-[18px] p-5"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--line)",
                  boxShadow: "var(--card-shadow)",
                }}
              >
                {/* Zone "voir plus" indicator */}
                {post && charLen > LINKEDIN_PREVIEW_CHARS && (
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="text-[10.5px] font-medium px-2.5 py-1 rounded-[6px] flex items-center gap-1.5"
                      style={{ background: accentSoft, color: accentFg }}
                    >
                      <span>📱</span>
                      Zone visible avant "voir plus" : {LINKEDIN_PREVIEW_CHARS} chars
                    </div>
                    <div
                      className="text-[10.5px] font-medium px-2.5 py-1 rounded-[6px]"
                      style={{
                        background: "var(--amber-soft)",
                        color: "var(--amber-fg)",
                      }}
                    >
                      ⚠ Hook critique dans les {LINKEDIN_PREVIEW_CHARS} premiers chars
                    </div>
                  </div>
                )}

                <textarea
                  value={post}
                  onChange={(e) => { setPost(e.target.value); setScore(null); }}
                  placeholder={
                    generating
                      ? "Génération en cours…"
                      : "Générez un post ou écrivez directement…"
                  }
                  rows={20}
                  className="w-full rounded-[10px] px-4 py-3.5 text-[13.5px] leading-[1.8] resize-none outline-none transition-all"
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--line)",
                    color: "var(--fg)",
                    fontFamily:
                      "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = accentFg)}
                  onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
                />

                {/* Stats bar */}
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded"
                      style={{
                        background: charCountBg(charLen),
                        color: charCountColor(charLen),
                      }}
                    >
                      {charLen} / {LINKEDIN_MAX_CHARS}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
                      {wordCount(post)} mots
                    </span>
                    {charLen > 0 && charLen <= 300 && (
                      <span
                        className="text-[11px] font-medium"
                        style={{ color: "var(--emerald-fg)" }}
                      >
                        ✓ Longueur optimale
                      </span>
                    )}
                    {charLen > 300 && charLen <= 600 && (
                      <span
                        className="text-[11px]"
                        style={{ color: "var(--amber-fg)" }}
                      >
                        ↑ Post long — assurez la valeur dense
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                {charLen > 0 && (
                  <div
                    className="mt-2 h-1 rounded-full overflow-hidden"
                    style={{ background: "var(--line-strong)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min((charLen / LINKEDIN_MAX_CHARS) * 100, 100)}%`,
                        background: charCountColor(charLen),
                      }}
                    />
                  </div>
                )}
              </section>
            )}

            {/* Preview tab */}
            {activeTab === "preview" && (
              <LinkedInPreview content={post} />
            )}

            {/* Score tab */}
            {activeTab === "score" && (
              <div className="space-y-3">
                {!post && (
                  <div className="rounded-[16px] p-8 text-center" style={{ border: "1px dashed var(--line)" }}>
                    <Gauge className="h-8 w-8 mx-auto mb-3 opacity-20" style={{ color: accentFg }} />
                    <p className="text-[13px]" style={{ color: "var(--fg-mute)" }}>
                      Générez ou écrivez un post pour l'analyser.
                    </p>
                  </div>
                )}

                {post && !score && (
                  <div className="flex flex-col items-center gap-4 py-10">
                    {scoring ? (
                      <>
                        <RefreshCw className="h-7 w-7 animate-spin" style={{ color: accentFg }} />
                        <p className="text-[13px]" style={{ color: "var(--fg-mute)" }}>Analyse en cours…</p>
                      </>
                    ) : (
                      <button
                        onClick={handleScore}
                        className="flex items-center gap-2 px-6 py-3 rounded-[12px] text-[14px] font-bold transition-all hover:brightness-110"
                        style={{ background: accentFg, color: "white" }}
                      >
                        <Gauge className="h-4 w-4" />
                        Analyser le post
                      </button>
                    )}
                  </div>
                )}

                {score && (
                  <>
                    {/* Global score ring */}
                    <div
                      className="rounded-[18px] p-5 flex items-center gap-5"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
                    >
                      {/* Score circle */}
                      <div className="relative shrink-0 w-20 h-20">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--line-strong)" strokeWidth="3" />
                          <circle
                            cx="18" cy="18" r="15.9" fill="none" strokeWidth="3"
                            stroke={score.globalScore >= 75 ? "var(--emerald-fg)" : score.globalScore >= 55 ? "var(--amber-fg)" : "var(--danger-fg)"}
                            strokeDasharray={`${score.globalScore} 100`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[22px] font-bold" style={{
                            color: score.globalScore >= 75 ? "var(--emerald-fg)" : score.globalScore >= 55 ? "var(--amber-fg)" : "var(--danger-fg)",
                          }}>
                            {score.globalScore}
                          </span>
                        </div>
                      </div>
                      <div>
                        <p className="text-[15px] font-bold" style={{ color: "var(--fg)" }}>
                          {score.verdict === "publish_now" ? "Prêt à publier ✓" : score.verdict === "minor_fixes" ? "Quelques ajustements" : "Révision nécessaire"}
                        </p>
                        <p className="text-[12px] mt-0.5" style={{ color: "var(--fg-mute)" }}>
                          Score global sur 100
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={handleScore}
                            disabled={scoring}
                            className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-[6px] transition-all hover:brightness-95"
                            style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
                          >
                            <RefreshCw className={`h-3 w-3 ${scoring ? "animate-spin" : ""}`} />
                            Ré-analyser
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Top priority */}
                    <div
                      className="rounded-[14px] p-4"
                      style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-line)" }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <TrendingUp className="h-3.5 w-3.5" style={{ color: "var(--amber-fg)" }} />
                        <span className="text-[11.5px] font-bold" style={{ color: "var(--amber-fg)" }}>
                          Priorité #1 — {score.topPriority}
                        </span>
                      </div>
                      <p className="text-[12.5px] leading-snug" style={{ color: "var(--amber-fg)" }}>
                        {score.topPrioritySuggestion}
                      </p>
                    </div>

                    {/* Improved hook */}
                    {score.improvedHook && (
                      <div
                        className="rounded-[14px] p-4"
                        style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-mono uppercase tracking-[0.1em]" style={{ color: "var(--fg-mute)" }}>
                            Hook amélioré
                          </span>
                          <button
                            onClick={() => setPost(swapFirstLine(post, score.improvedHook!))}
                            className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-[6px] transition-all hover:brightness-110"
                            style={{ background: accentFg, color: "white" }}
                          >
                            <Wand2 className="h-3 w-3" />
                            Appliquer
                          </button>
                        </div>
                        <p className="text-[12.5px] italic" style={{ color: "var(--fg)" }}>
                          "{score.improvedHook}"
                        </p>
                      </div>
                    )}

                    {/* Improved CTA */}
                    {score.improvedCta && (
                      <div
                        className="rounded-[14px] p-4"
                        style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-mono uppercase tracking-[0.1em]" style={{ color: "var(--fg-mute)" }}>
                            CTA amélioré
                          </span>
                          <button
                            onClick={() => {
                              const lines = post.trimEnd().split("\n");
                              const lastNonEmpty = lines.findLastIndex((l) => l.trim().length > 0);
                              if (lastNonEmpty !== -1) {
                                lines[lastNonEmpty] = score.improvedCta!;
                                setPost(lines.join("\n"));
                              }
                            }}
                            className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-[6px] transition-all hover:brightness-110"
                            style={{ background: accentFg, color: "white" }}
                          >
                            <Wand2 className="h-3 w-3" />
                            Appliquer
                          </button>
                        </div>
                        <p className="text-[12.5px] italic" style={{ color: "var(--fg)" }}>
                          "{score.improvedCta}"
                        </p>
                      </div>
                    )}

                    {/* Dimension breakdown */}
                    <div
                      className="rounded-[18px] p-5 space-y-3"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
                    >
                      <p className="text-[11px] font-mono uppercase tracking-[0.12em]" style={{ color: "var(--fg-mute)" }}>
                        Détail par dimension
                      </p>
                      {(Object.entries(score.dimensions) as [string, PostScore["dimensions"]["hook"]][]).map(([key, dim]) => {
                        const s = dim.score;
                        const color = s >= 8 ? "var(--emerald-fg)" : s >= 6 ? "var(--amber-fg)" : "var(--danger-fg)";
                        const bg = s >= 8 ? "var(--emerald-soft)" : s >= 6 ? "var(--amber-soft)" : "var(--danger-soft)";
                        return (
                          <div key={key} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span
                                  className="text-[11px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ background: bg, color }}
                                >
                                  {s}/10
                                </span>
                                <span className="text-[12.5px] font-semibold" style={{ color: "var(--fg)" }}>
                                  {dim.label}
                                </span>
                              </div>
                              <div
                                className="h-1.5 rounded-full overflow-hidden"
                                style={{ width: 80, background: "var(--line-strong)" }}
                              >
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${s * 10}%`, background: color }}
                                />
                              </div>
                            </div>
                            <p className="text-[11.5px] pl-10" style={{ color: "var(--fg-dim)" }}>
                              {dim.explanation}
                            </p>
                            {dim.suggestion && s < 8 && (
                              <p className="text-[11px] pl-10" style={{ color: "var(--amber-fg)" }}>
                                → {dim.suggestion}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* First comment */}
            {firstComment && (
              <section
                className="rounded-[18px] p-5"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--line)",
                  boxShadow: "var(--card-shadow)",
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare
                      className="h-3.5 w-3.5"
                      style={{ color: accentFg }}
                    />
                    <span
                      className="text-[12px] font-semibold"
                      style={{ color: "var(--fg)" }}
                    >
                      Premier commentaire
                    </span>
                    <span
                      className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: accentSoft, color: accentFg }}
                    >
                      Poster 2-3 min après publication
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(firstComment);
                      setCopiedComment(true);
                      setTimeout(() => setCopiedComment(false), 2000);
                    }}
                    className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-[6px] transition-all hover:brightness-95"
                    style={{
                      background: "var(--bg)",
                      border: "1px solid var(--line)",
                      color: "var(--fg-dim)",
                    }}
                  >
                    {copiedComment ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {copiedComment ? "Copié" : "Copier"}
                  </button>
                </div>
                <div
                  className="rounded-[10px] p-3.5 text-[12.5px] leading-relaxed whitespace-pre-wrap"
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--line)",
                    color: "var(--fg-dim)",
                  }}
                >
                  {firstComment}
                </div>
              </section>
            )}

            {/* Action bar */}
            {post && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-[12.5px] font-medium transition-all hover:brightness-95 disabled:opacity-40"
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--line)",
                    color: "var(--fg-dim)",
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Régénérer
                </button>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(post);
                    setCopiedPost(true);
                    setTimeout(() => setCopiedPost(false), 2000);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-[12.5px] font-medium transition-all hover:brightness-95"
                  style={{
                    background: "var(--bg)",
                    border: "1px solid var(--line)",
                    color: copiedPost ? "var(--emerald-fg)" : "var(--fg-dim)",
                  }}
                >
                  {copiedPost ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copiedPost ? "Copié !" : "Copier"}
                </button>

                <button
                  onClick={handleSave}
                  disabled={saving || saved}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-[13px] font-bold transition-all hover:brightness-110 flex-1 justify-center"
                  style={{
                    background: saved ? "var(--emerald-soft)" : accentFg,
                    color: saved ? "var(--emerald-fg)" : "white",
                    border: saved ? "1px solid var(--emerald-line)" : "none",
                  }}
                >
                  <BookmarkCheck className="h-4 w-4" />
                  {saved
                    ? "Sauvegardé ✓"
                    : saving
                    ? "Sauvegarde…"
                    : "Sauvegarder en brouillon"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
