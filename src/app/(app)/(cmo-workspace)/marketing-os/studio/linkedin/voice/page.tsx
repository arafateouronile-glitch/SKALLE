"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Mic2,
  Plus,
  Trash2,
  Sparkles,
} from "lucide-react";
import type { LinkedInVoice } from "@/app/api/social/linkedin/voice-calibrate/route";

// ─── Labels ───────────────────────────────────────────────────────────────────

const HOOK_LABELS: Record<string, string> = {
  curiosity_gap: "Curiosity gap",
  storytelling: "Storytelling",
  contrarian: "Contrarian",
  how_to: "How-to",
  confession: "Confession",
  stat_choc: "Stat choc",
  question_identitaire: "Question identitaire",
};

const TONE_LABELS: Record<string, string> = {
  direct_expert: "Direct & expert",
  storytelling_personnel: "Storytelling personnel",
  contrarian_assume: "Contrarian assumé",
  educational_didactique: "Éducatif & didactique",
  inspirationnel: "Inspirationnel",
};

const SENTENCE_LABELS: Record<string, string> = {
  court_percutant: "Court & percutant",
  moyen_fluide: "Moyen & fluide",
  long_nuance: "Long & nuancé",
};

const VULNERABILITY_LABELS: Record<string, string> = {
  low: "Faible — professionnel distant",
  medium: "Moyen — expériences partagées",
  high: "Élevé — vulnérabilité assumée",
};

const VULNERABILITY_COLORS: Record<string, string> = {
  low: "var(--cold-fg)",
  medium: "var(--amber-fg)",
  high: "var(--violet-fg)",
};

const CTA_LABELS: Record<string, string> = {
  question_ouverte: "Question ouverte",
  invitation_commenter: "Invitation à commenter",
  challenge: "Challenge",
  aucun: "Aucun CTA explicite",
};

function relDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

// ─── Voice Profile Card ───────────────────────────────────────────────────────

function VoiceCard({ voice }: { voice: LinkedInVoice }) {
  return (
    <div
      className="rounded-[18px] p-6 space-y-5"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--violet-line)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5" style={{ color: "var(--violet-fg)" }} />
          <span className="text-[14px] font-bold" style={{ color: "var(--violet-fg)" }}>
            Profil de voix LinkedIn calibré
          </span>
        </div>
        <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
          Calibré le {relDate(voice.calibratedAt)}
        </span>
      </div>

      {/* Writing style description */}
      <div
        className="rounded-[12px] p-4"
        style={{ background: "var(--violet-soft)", border: "1px solid var(--violet-line)" }}
      >
        <p className="text-[11px] font-mono uppercase tracking-[0.12em] mb-2" style={{ color: "var(--violet-fg)" }}>
          Description du style
        </p>
        <p className="text-[13.5px] leading-relaxed italic" style={{ color: "var(--fg)" }}>
          "{voice.writingStyleDescription}"
        </p>
      </div>

      {/* Best hook example */}
      <div
        className="rounded-[12px] p-4"
        style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
      >
        <p className="text-[11px] font-mono uppercase tracking-[0.12em] mb-2" style={{ color: "var(--fg-mute)" }}>
          Meilleur hook détecté
        </p>
        <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>
          "{voice.bestHookExample}"
        </p>
        <p className="text-[11px] mt-1.5" style={{ color: "var(--fg-mute)" }}>
          {voice.hookPattern}
        </p>
      </div>

      {/* Attributes grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Hook dominant", value: HOOK_LABELS[voice.dominantHookType] ?? voice.dominantHookType },
          { label: "Ton", value: TONE_LABELS[voice.tone] ?? voice.tone },
          { label: "Style de phrase", value: SENTENCE_LABELS[voice.sentenceStyle] ?? voice.sentenceStyle },
          { label: "CTA habituel", value: CTA_LABELS[voice.ctaStyle] ?? voice.ctaStyle },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-[10px] p-3"
            style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
          >
            <p className="text-[10px] font-mono uppercase tracking-[0.1em] mb-1" style={{ color: "var(--fg-mute)" }}>
              {label}
            </p>
            <p className="text-[12.5px] font-semibold" style={{ color: "var(--fg)" }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Vulnerability */}
      <div
        className="rounded-[10px] p-3 flex items-center justify-between"
        style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
      >
        <p className="text-[10px] font-mono uppercase tracking-[0.1em]" style={{ color: "var(--fg-mute)" }}>
          Niveau de vulnérabilité
        </p>
        <span
          className="text-[12px] font-semibold px-2.5 py-0.5 rounded"
          style={{
            background: "oklch(from " + VULNERABILITY_COLORS[voice.vulnerabilityLevel] + " l c h / 0.12)",
            color: VULNERABILITY_COLORS[voice.vulnerabilityLevel],
          }}
        >
          {VULNERABILITY_LABELS[voice.vulnerabilityLevel]}
        </span>
      </div>

      {/* Signature words */}
      {voice.signatureWords.length > 0 && (
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.12em] mb-2" style={{ color: "var(--fg-mute)" }}>
            Mots signature
          </p>
          <div className="flex flex-wrap gap-2">
            {voice.signatureWords.map((w) => (
              <span
                key={w}
                className="text-[12px] font-medium px-2.5 py-1 rounded-[6px]"
                style={{
                  background: "var(--violet-soft)",
                  border: "1px solid var(--violet-line)",
                  color: "var(--violet-fg)",
                }}
              >
                {w}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px]" style={{ color: "var(--emerald-fg)" }}>
        ✓ Ce profil est automatiquement injecté dans tous vos posts LinkedIn générés.
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VoicePage() {
  const [posts, setPosts] = useState<string[]>(["", "", ""]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState<LinkedInVoice | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);

  // Load existing voice profile on mount
  useEffect(() => {
    fetch("/api/social/linkedin/voice-calibrate")
      .then((r) => r.json() as Promise<{ voice: LinkedInVoice | null }>)
      .then(({ voice: v }) => {
        if (v) setVoice(v);
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false));
  }, []);

  const filledPosts = posts.filter((p) => p.trim().length > 30);
  const canAnalyze = filledPosts.length >= 2 && !analyzing;

  function addPost() {
    if (posts.length < 5) setPosts((prev) => [...prev, ""]);
  }

  function removePost(idx: number) {
    if (posts.length <= 2) return;
    setPosts((prev) => prev.filter((_, i) => i !== idx));
  }

  function updatePost(idx: number, val: string) {
    setPosts((prev) => prev.map((p, i) => (i === idx ? val : p)));
  }

  async function handleAnalyze() {
    if (!canAnalyze) return;
    setAnalyzing(true);
    setError(null);

    try {
      const res = await fetch("/api/social/linkedin/voice-calibrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posts: filledPosts }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Erreur d'analyse");
      }
      const data = (await res.json()) as { voice: LinkedInVoice };
      setVoice(data.voice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <>
      <AppTopBar
        title="Calibration de voix"
        breadcrumb="marketing-os / studio / linkedin / voix"
        accent="violet"
      />

      <div className="p-6 max-w-[1200px]">
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
          <Mic2 className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "var(--violet-fg)" }} />
          <div>
            <p className="text-[13.5px] font-semibold" style={{ color: "var(--violet-fg)" }}>
              L'IA apprend votre style d'écriture unique
            </p>
            <p className="text-[12px] mt-0.5 leading-relaxed" style={{ color: "var(--violet-fg)", opacity: 0.85 }}>
              Collez 2 à 5 de vos meilleurs posts LinkedIn. L'IA en extrait votre signature stylistique —
              type de hook, ton, longueur de phrase, mots récurrents — et l'injecte automatiquement
              dans tous les posts que vous générerez ensuite. Résultat : des posts qui sonnent
              vraiment comme vous.
            </p>
          </div>
          <span
            className="shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-[8px]"
            style={{ background: "var(--violet-fg)", color: "white" }}
          >
            1 crédit
          </span>
        </div>

        <div className="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {/* ── Left : Input ──────────────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--fg)" }}>
                Vos posts LinkedIn
                <span className="ml-2 text-[11px] font-normal" style={{ color: "var(--fg-mute)" }}>
                  ({filledPosts.length} / {posts.length} remplis)
                </span>
              </h2>
              {posts.length < 5 && (
                <button
                  onClick={addPost}
                  className="flex items-center gap-1 text-[12px] font-medium px-3 py-1.5 rounded-[8px] transition-all hover:brightness-95"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--line)",
                    color: "var(--fg-dim)",
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter un post
                </button>
              )}
            </div>

            {posts.map((post, idx) => (
              <div key={idx} className="relative">
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className="text-[11px] font-mono"
                    style={{ color: "var(--fg-mute)" }}
                  >
                    Post {idx + 1}
                    {post.trim().length > 30 && (
                      <span style={{ color: "var(--emerald-fg)" }}> ✓</span>
                    )}
                  </span>
                  {posts.length > 2 && (
                    <button
                      onClick={() => removePost(idx)}
                      className="p-1 rounded transition-all hover:opacity-70"
                      style={{ color: "var(--fg-mute)" }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <textarea
                  value={post}
                  onChange={(e) => updatePost(idx, e.target.value)}
                  placeholder={
                    idx === 0
                      ? "Collez ici votre meilleur post LinkedIn — celui qui a eu le plus d'engagement..."
                      : `Post ${idx + 1}...`
                  }
                  rows={6}
                  className="w-full rounded-[12px] px-4 py-3 text-[13px] leading-relaxed resize-none outline-none transition-all"
                  style={{
                    background: "var(--bg-card)",
                    border: post.trim().length > 30
                      ? "1px solid var(--violet-line)"
                      : "1px solid var(--line)",
                    color: "var(--fg)",
                    boxShadow: "var(--card-shadow)",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "var(--violet-fg)")}
                  onBlur={(e) =>
                    (e.target.style.borderColor =
                      post.trim().length > 30 ? "var(--violet-line)" : "var(--line)")
                  }
                />
                <span
                  className="absolute bottom-2.5 right-3 text-[10px]"
                  style={{ color: "var(--fg-mute)" }}
                >
                  {post.length} chars
                </span>
              </div>
            ))}

            {/* Analyze button */}
            <button
              onClick={handleAnalyze}
              disabled={!canAnalyze}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-[12px] text-[14px] font-bold transition-all hover:brightness-110 disabled:opacity-40"
              style={{ background: "var(--violet-fg)", color: "white" }}
            >
              {analyzing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Analyse en cours…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Calibrer ma voix
                  {filledPosts.length >= 2
                    ? ` (${filledPosts.length} posts)`
                    : " — 2 posts min"}
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

            {/* Tips */}
            <div
              className="rounded-[12px] p-4 space-y-1.5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}
            >
              <p className="text-[11px] font-mono uppercase tracking-[0.12em] mb-2" style={{ color: "var(--fg-mute)" }}>
                Pour une calibration optimale
              </p>
              {[
                "Choisissez vos posts avec le plus d'engagement",
                "Variez les formats (story, listicle, how-to…)",
                "Incluez au moins un post où vous parlez de vous",
                "Évitez les posts trop courts (< 5 lignes)",
              ].map((tip) => (
                <p key={tip} className="text-[12px] flex items-start gap-2" style={{ color: "var(--fg-dim)" }}>
                  <span style={{ color: "var(--violet-fg)" }}>•</span>
                  {tip}
                </p>
              ))}
            </div>
          </div>

          {/* ── Right : Result ────────────────────────────────────────────── */}
          <div>
            {loadingExisting && (
              <div
                className="rounded-[18px] p-8 flex items-center justify-center"
                style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}
              >
                <RefreshCw className="h-5 w-5 animate-spin" style={{ color: "var(--fg-mute)" }} />
              </div>
            )}

            {!loadingExisting && voice && <VoiceCard voice={voice} />}

            {!loadingExisting && !voice && (
              <div
                className="rounded-[18px] p-12 flex flex-col items-center justify-center text-center"
                style={{ border: "1px dashed var(--line)" }}
              >
                <Mic2 className="h-10 w-10 mb-4 opacity-20" style={{ color: "var(--violet-fg)" }} />
                <p className="text-[14px] font-semibold mb-2" style={{ color: "var(--fg)" }}>
                  Aucun profil de voix calibré
                </p>
                <p className="text-[12px] max-w-[280px]" style={{ color: "var(--fg-mute)" }}>
                  Collez vos meilleurs posts LinkedIn et cliquez sur "Calibrer ma voix".
                  Le profil sera automatiquement utilisé pour tous les posts générés.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
