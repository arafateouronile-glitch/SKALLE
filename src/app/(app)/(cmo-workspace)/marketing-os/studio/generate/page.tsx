"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppTopBar } from "@/components/modules/app-topbar";
import {
  ArrowLeft, Sparkles, Copy, Check, RefreshCw, BookmarkCheck,
  Linkedin, Twitter, Instagram, Facebook, AlertCircle,
} from "lucide-react";
import type { EmotionalTrigger, PostFormat, PostPlatform } from "@/app/api/social/posts/generate/route";

// ─── Config ───────────────────────────────────────────────────────────────────

const PLATFORMS: { id: PostPlatform; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: "LINKEDIN",  label: "LinkedIn",    Icon: Linkedin  },
  { id: "TWITTER",   label: "Twitter / X", Icon: Twitter   },
  { id: "INSTAGRAM", label: "Instagram",   Icon: Instagram },
  { id: "FACEBOOK",  label: "Facebook",    Icon: Facebook  },
];

const FORMATS: { id: PostFormat; label: string; desc: string }[] = [
  { id: "post_court", label: "Post court",       desc: "< 300 mots, percutant" },
  { id: "thread",     label: "Thread",           desc: "5-8 posts enchaînés"   },
  { id: "carrousel",  label: "Carrousel",        desc: "Slides annotées"        },
  { id: "story",      label: "Story / Reel",     desc: "Script 30-60s"          },
  { id: "email",      label: "Email newsletter", desc: "Sujet + corps + CTA"   },
];

const TRIGGERS: { id: EmotionalTrigger; label: string; desc: string; example: string }[] = [
  {
    id: "curiosity_gap",
    label: "Curiosity gap",
    desc: "Le lecteur ne peut pas ne pas scroller pour savoir la suite",
    example: "\"Le post LinkedIn qui m'a booké 47 appels en 72h (framework exact ci-dessous)\"",
  },
  {
    id: "identity_validation",
    label: "Validation d'identité",
    desc: "Le lecteur se sent enfin compris, vu, articulé",
    example: "\"Tu ne perds pas de clients à cause de ton offre. Tu les perds parce que tu as peur d'afficher ton vrai prix.\"",
  },
  {
    id: "tribal_belonging",
    label: "Appartenance tribale",
    desc: "In-group / out-group clair — personne ne veut être du mauvais côté",
    example: "\"Il y a deux types de fondateurs : ceux qui obsèdent sur leur abonnés, et ceux sur leur ARR.\"",
  },
  {
    id: "productive_discomfort",
    label: "Inconfort productif",
    desc: "Challenge une croyance, mais avec une voie de sortie concrète",
    example: "\"Ton 'lead magnet' est un PDF de 3 pages. Tu demandes des coordonnées contre quelque chose tu ne paierais pas 5€.\"",
  },
  {
    id: "aspiration",
    label: "Aspiration",
    desc: "L'outcome est ambitieux mais atteignable pour la cible",
    example: "\"Comment je suis passé de 0 à 42k€ MRR en 90 jours avec uniquement LinkedIn.\"",
  },
  {
    id: "status_signal",
    label: "Signal de statut",
    desc: "Le lecteur partage parce que ça le valorise auprès de son réseau",
    example: "\"Les 5 frameworks que les meilleurs CMOs utilisent et que personne ne partage jamais.\"",
  },
];

const PLATFORM_COLOR: Record<PostPlatform, string> = {
  LINKEDIN:  "var(--violet-fg)",
  TWITTER:   "var(--fg)",
  INSTAGRAM: "var(--amber-fg)",
  FACEBOOK:  "var(--cold-fg)",
};
const PLATFORM_SOFT: Record<PostPlatform, string> = {
  LINKEDIN:  "var(--violet-soft)",
  TWITTER:   "var(--line-strong)",
  INSTAGRAM: "var(--amber-soft)",
  FACEBOOK:  "var(--cold-soft)",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function GeneratePage() {
  const router = useRouter();

  const [platform, setPlatform]   = useState<PostPlatform>("LINKEDIN");
  const [format, setFormat]       = useState<PostFormat>("post_court");
  const [trigger, setTrigger]     = useState<EmotionalTrigger>("curiosity_gap");
  const [subject, setSubject]     = useState("");

  const [generating, setGenerating] = useState(false);
  const [result, setResult]         = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [copied, setCopied]         = useState(false);
  const [saved, setSaved]           = useState(false);

  async function handleGenerate() {
    if (!subject.trim()) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    setSaved(false);

    try {
      const res = await fetch("/api/social/posts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, format, trigger, subject }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Erreur de génération");
      }
      const data = await res.json() as { content: string };
      setResult(data.content);
      setTimeout(() => document.getElementById("result-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setGenerating(false);
    }
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSave() {
    if (!result) return;
    const formatLabel = FORMATS.find((f) => f.id === format)?.label ?? "Post";
    const triggerLabel = TRIGGERS.find((t) => t.id === trigger)?.label ?? "";
    const draft = {
      id: Date.now(),
      title: `${formatLabel} — ${triggerLabel}`,
      type: "Post",
      status: "Brouillon",
      date: "aujourd'hui",
      statusColor: "amber",
      tab: "posts",
      content: result,
      network: platform,
    };
    try {
      const existing = JSON.parse(localStorage.getItem("studio_drafts") ?? "[]") as typeof draft[];
      localStorage.setItem("studio_drafts", JSON.stringify([draft, ...existing]));
    } catch { /* ignore */ }
    setSaved(true);
    setTimeout(() => router.push("/marketing-os/studio"), 800);
  }

  const canGenerate = subject.trim().length > 10 && !generating;
  const accentFg = "var(--emerald-fg)";
  const accentSoft = "var(--emerald-soft)";
  const accentLine = "var(--emerald-line)";

  return (
    <>
      <AppTopBar
        title="Générer un post"
        breadcrumb="marketing-os / studio / générer"
        accent="emerald"
      />

      <div className="p-6 max-w-[900px] space-y-6">

        {/* Back */}
        <Link
          href="/marketing-os/studio"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium transition-all hover:opacity-70"
          style={{ color: "var(--fg-mute)" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour au Studio
        </Link>

        {/* ── Step 1 : Plateforme ─────────────────────────────────────────────── */}
        <section
          className="rounded-[18px] p-6"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <StepLabel n={1} label="Plateforme cible" />
          <div className="flex flex-wrap gap-2 mt-4">
            {PLATFORMS.map(({ id, label, Icon }) => {
              const active = platform === id;
              return (
                <button
                  key={id}
                  onClick={() => setPlatform(id)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-[13px] font-semibold transition-all"
                  style={
                    active
                      ? { background: PLATFORM_SOFT[id], color: PLATFORM_COLOR[id], border: `2px solid ${PLATFORM_COLOR[id]}` }
                      : { background: "var(--bg)", color: "var(--fg-dim)", border: "1px solid var(--line)" }
                  }
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Step 2 : Format ─────────────────────────────────────────────────── */}
        <section
          className="rounded-[18px] p-6"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <StepLabel n={2} label="Format du contenu" />
          <div className="flex flex-wrap gap-2 mt-4">
            {FORMATS.map(({ id, label, desc }) => {
              const active = format === id;
              return (
                <button
                  key={id}
                  onClick={() => setFormat(id)}
                  className="flex flex-col items-start px-4 py-2.5 rounded-[10px] transition-all text-left"
                  style={
                    active
                      ? { background: accentSoft, color: accentFg, border: `2px solid ${accentFg}` }
                      : { background: "var(--bg)", color: "var(--fg-dim)", border: "1px solid var(--line)" }
                  }
                >
                  <span className="text-[13px] font-semibold">{label}</span>
                  <span className="text-[10.5px] mt-0.5" style={{ color: active ? accentFg : "var(--fg-mute)", opacity: 0.8 }}>{desc}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Step 3 : Déclencheur émotionnel ─────────────────────────────────── */}
        <section
          className="rounded-[18px] p-6"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <StepLabel n={3} label="Déclencheur émotionnel" />
          <p className="text-[12px] mt-1 mb-4" style={{ color: "var(--fg-mute)" }}>
            Le moteur psychologique central du post. Choisissez celui qui colle le mieux à votre angle.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TRIGGERS.map(({ id, label, desc, example }) => {
              const active = trigger === id;
              return (
                <button
                  key={id}
                  onClick={() => setTrigger(id)}
                  className="flex flex-col items-start p-4 rounded-[12px] transition-all text-left"
                  style={
                    active
                      ? { background: accentSoft, border: `2px solid ${accentFg}` }
                      : { background: "var(--bg)", border: "1px solid var(--line)" }
                  }
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: active ? accentFg : "var(--line-strong)" }}
                    />
                    <span className="text-[13px] font-bold" style={{ color: active ? accentFg : "var(--fg)" }}>
                      {label}
                    </span>
                  </div>
                  <p className="text-[11.5px] leading-relaxed mb-2" style={{ color: active ? accentFg : "var(--fg-dim)", opacity: 0.9 }}>
                    {desc}
                  </p>
                  <p className="text-[10.5px] italic leading-relaxed" style={{ color: active ? accentFg : "var(--fg-mute)", opacity: 0.75 }}>
                    {example}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Step 4 : Sujet / angle ──────────────────────────────────────────── */}
        <section
          className="rounded-[18px] p-6"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <StepLabel n={4} label="Sujet et angle" />
          <p className="text-[12px] mt-1 mb-4" style={{ color: "var(--fg-mute)" }}>
            Décrivez votre idée, votre angle, ou la vérité que vous voulez exprimer. Plus c'est précis, plus le post sera percutant.
          </p>
          <textarea
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Ex : Les fondateurs B2B perdent des clients non pas à cause de leur prix, mais parce qu'ils ne communiquent pas la valeur réelle. J'ai vu ce pattern chez 30+ clients..."
            rows={5}
            className="w-full rounded-[12px] px-4 py-3 text-[13px] leading-relaxed resize-none outline-none transition-all"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--line)",
              color: "var(--fg)",
              boxShadow: "none",
            }}
            onFocus={(e) => { e.target.style.borderColor = accentFg; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--line)"; }}
          />
          <div className="flex items-center justify-between mt-4">
            <span className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
              {subject.length} caractères · 3 crédits
            </span>
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-[13px] font-bold transition-all disabled:opacity-40"
              style={{ background: accentFg, color: "white" }}
            >
              {generating ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Génération…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Générer le post
                </>
              )}
            </button>
          </div>

          {error && (
            <div
              className="flex items-center gap-2 mt-4 px-4 py-3 rounded-[10px] text-[13px]"
              style={{ background: "var(--danger-soft)", border: "1px solid var(--danger-line)", color: "var(--danger-fg)" }}
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </section>

        {/* ── Résultat ─────────────────────────────────────────────────────────── */}
        {result && (
          <section
            id="result-section"
            className="rounded-[18px] p-6"
            style={{ background: "var(--bg-card)", border: `2px solid ${accentLine}`, boxShadow: "var(--card-shadow)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" style={{ color: accentFg }} />
                <span className="text-[13px] font-bold" style={{ color: accentFg }}>Post généré</span>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded"
                  style={{ background: PLATFORM_SOFT[platform], color: PLATFORM_COLOR[platform], border: `1px solid ${PLATFORM_COLOR[platform]}` }}
                >
                  {PLATFORMS.find((p) => p.id === platform)?.label}
                </span>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded"
                  style={{ background: accentSoft, color: accentFg, border: `1px solid ${accentLine}` }}
                >
                  {TRIGGERS.find((t) => t.id === trigger)?.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-all hover:brightness-95"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
                >
                  <RefreshCw className="h-3 w-3" />
                  Régénérer
                </button>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-all hover:brightness-95"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copié !" : "Copier"}
                </button>
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-[8px] text-[12px] font-bold transition-all hover:brightness-110"
                  style={{ background: accentFg, color: "white" }}
                >
                  <BookmarkCheck className="h-3.5 w-3.5" />
                  {saved ? "Sauvegardé ✓" : "Enregistrer dans Studio"}
                </button>
              </div>
            </div>

            {/* Post content */}
            <div
              className="rounded-[12px] p-5 whitespace-pre-wrap text-[13.5px] leading-[1.75] select-text"
              style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
            >
              {result}
            </div>
          </section>
        )}

      </div>
    </>
  );
}

function StepLabel({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em]" style={{ color: "var(--fg-mute)" }}>
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
        style={{ background: "var(--emerald-fg)", color: "white" }}
      >
        {n}
      </span>
      {label}
    </div>
  );
}
