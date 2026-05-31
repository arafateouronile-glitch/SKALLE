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
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Layers,
  Download,
  Linkedin,
} from "lucide-react";
import type {
  CarouselAngle,
  CarouselSlide,
  CarouselResponse,
} from "@/app/api/social/linkedin/carousel/route";

// ─── Config ───────────────────────────────────────────────────────────────────

const ANGLES: { id: CarouselAngle; label: string; icon: string; desc: string }[] = [
  { id: "listicle",   label: "Listicle",        icon: "📋", desc: "X points numérotés, chacun autonome" },
  { id: "how_to",     label: "How-to",          icon: "🛠", desc: "Étapes actionnables avec résultat" },
  { id: "mistakes",   label: "Erreurs à éviter", icon: "⚠️", desc: "Erreurs + corrections concrètes" },
  { id: "framework",  label: "Framework",        icon: "🔷", desc: "Méthode ou modèle en composants" },
  { id: "case_study", label: "Étude de cas",    icon: "📊", desc: "Avant/après + résultats mesurables" },
];

const SLIDE_COUNTS = [6, 8, 10, 12];

// ─── Palette styles ───────────────────────────────────────────────────────────

const PALETTES: Record<string, { bg: string; text: string; accent: string }> = {
  dark:             { bg: "#0f172a", text: "#f1f5f9", accent: "#6366f1" },
  light:            { bg: "#f8fafc", text: "#0f172a", accent: "#6366f1" },
  gradient_blue:    { bg: "linear-gradient(135deg,#1e3a5f,#2563eb)", text: "#fff", accent: "#93c5fd" },
  gradient_purple:  { bg: "linear-gradient(135deg,#2d1b69,#7c3aed)", text: "#fff", accent: "#c4b5fd" },
};

// ─── Slide Preview Card ───────────────────────────────────────────────────────

function SlideCard({ slide, active }: { slide: CarouselSlide; active: boolean }) {
  const palette =
    slide.type === "cover"
      ? PALETTES[(slide as { palette?: string }).palette ?? "dark"]
      : PALETTES.light;

  if (slide.type === "cover") {
    const coverSlide = slide as Extract<CarouselSlide, { type: "cover" }>;
    return (
      <div
        className="aspect-square rounded-[16px] flex flex-col items-center justify-center text-center p-8 transition-all duration-300"
        style={{
          background: palette.bg,
          boxShadow: active ? "0 0 0 3px var(--violet-fg)" : "0 2px 12px rgba(0,0,0,0.15)",
          opacity: active ? 1 : 0.6,
          transform: active ? "scale(1)" : "scale(0.97)",
        }}
      >
        <span
          className="text-[11px] font-bold px-3 py-1 rounded-full mb-5 uppercase tracking-widest"
          style={{ background: palette.accent + "33", color: palette.accent }}
        >
          Slide 1 — Couverture
        </span>
        <h2
          className="font-bold leading-tight mb-3"
          style={{ color: palette.text, fontSize: "clamp(16px, 3vw, 26px)" }}
        >
          {coverSlide.title}
        </h2>
        {coverSlide.subtitle && (
          <p style={{ color: palette.text, opacity: 0.7, fontSize: 13 }}>
            {coverSlide.subtitle}
          </p>
        )}
        <p
          className="mt-6 font-semibold text-[12px]"
          style={{ color: palette.accent }}
        >
          {coverSlide.hook}
        </p>
        <div
          className="mt-auto pt-6 text-[10px] uppercase tracking-wider opacity-40"
          style={{ color: palette.text }}
        >
          {coverSlide.visualSuggestion.slice(0, 60)}…
        </div>
      </div>
    );
  }

  if (slide.type === "content") {
    const contentSlide = slide as Extract<CarouselSlide, { type: "content" }>;
    return (
      <div
        className="aspect-square rounded-[16px] flex flex-col p-7 transition-all duration-300"
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          boxShadow: active ? "0 0 0 3px var(--violet-fg)" : "0 2px 12px rgba(0,0,0,0.08)",
          opacity: active ? 1 : 0.6,
          transform: active ? "scale(1)" : "scale(0.97)",
        }}
      >
        {contentSlide.headline && (
          <span
            className="text-[11px] font-bold uppercase tracking-wider mb-3 inline-block px-2.5 py-1 rounded"
            style={{ background: "#ede9fe", color: "#7c3aed" }}
          >
            {contentSlide.headline}
          </span>
        )}
        <h3
          className="font-bold leading-snug mb-4"
          style={{ color: "#0f172a", fontSize: "clamp(14px, 2.5vw, 20px)" }}
        >
          {contentSlide.title}
        </h3>
        <p className="text-[13px] leading-relaxed" style={{ color: "#475569" }}>
          {contentSlide.body}
        </p>
        {contentSlide.keyInsight && (
          <div
            className="mt-auto pt-4 border-t"
            style={{ borderColor: "#e2e8f0" }}
          >
            <p className="text-[12px] font-semibold italic" style={{ color: "#7c3aed" }}>
              ✦ {contentSlide.keyInsight}
            </p>
          </div>
        )}
        <div className="mt-auto pt-3 text-right">
          <span className="text-[10px]" style={{ color: "#cbd5e1" }}>
            {slide.number}
          </span>
        </div>
      </div>
    );
  }

  if (slide.type === "summary") {
    const summarySlide = slide as Extract<CarouselSlide, { type: "summary" }>;
    return (
      <div
        className="aspect-square rounded-[16px] flex flex-col p-7 transition-all duration-300"
        style={{
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
          boxShadow: active ? "0 0 0 3px var(--violet-fg)" : "0 2px 12px rgba(0,0,0,0.08)",
          opacity: active ? 1 : 0.6,
          transform: active ? "scale(1)" : "scale(0.97)",
        }}
      >
        <h3 className="font-bold text-[18px] mb-5" style={{ color: "#14532d" }}>
          {summarySlide.title}
        </h3>
        <div className="space-y-2.5 flex-1">
          {summarySlide.points.map((point, i) => (
            <div key={i} className="flex items-start gap-2">
              <span
                className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5"
                style={{ background: "#16a34a", color: "white" }}
              >
                {i + 1}
              </span>
              <p className="text-[12.5px] font-medium" style={{ color: "#166534" }}>
                {point}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-auto pt-3 text-right">
          <span className="text-[10px]" style={{ color: "#86efac" }}>
            {slide.number}
          </span>
        </div>
      </div>
    );
  }

  if (slide.type === "cta") {
    const ctaSlide = slide as Extract<CarouselSlide, { type: "cta" }>;
    return (
      <div
        className="aspect-square rounded-[16px] flex flex-col items-center justify-center text-center p-8 transition-all duration-300"
        style={{
          background: "linear-gradient(135deg,#2d1b69,#7c3aed)",
          boxShadow: active ? "0 0 0 3px var(--violet-fg)" : "0 2px 12px rgba(0,0,0,0.15)",
          opacity: active ? 1 : 0.6,
          transform: active ? "scale(1)" : "scale(0.97)",
        }}
      >
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
          style={{ background: "rgba(255,255,255,0.15)" }}
        >
          <Linkedin className="h-6 w-6 text-white" />
        </div>
        <h3 className="text-white font-bold text-[18px] mb-3">{ctaSlide.title}</h3>
        <p className="text-[13px] font-semibold mb-2" style={{ color: "#c4b5fd" }}>
          {ctaSlide.cta}
        </p>
        {ctaSlide.authorNote && (
          <p className="text-[11px] mt-3" style={{ color: "rgba(255,255,255,0.6)" }}>
            {ctaSlide.authorNote}
          </p>
        )}
      </div>
    );
  }

  return null;
}

// ─── Slide text export ────────────────────────────────────────────────────────

function slideToText(slide: CarouselSlide): string {
  if (slide.type === "cover") {
    const s = slide as Extract<CarouselSlide, { type: "cover" }>;
    return `=== SLIDE 1 — COUVERTURE ===\nTitre : ${s.title}${s.subtitle ? `\nSous-titre : ${s.subtitle}` : ""}\nHook : ${s.hook}\n🎨 Visuel : ${s.visualSuggestion}`;
  }
  if (slide.type === "content") {
    const s = slide as Extract<CarouselSlide, { type: "content" }>;
    return `=== SLIDE ${s.number}${s.headline ? ` — ${s.headline}` : ""} ===\n${s.title}\n\n${s.body}${s.keyInsight ? `\n\n✦ ${s.keyInsight}` : ""}\n🎨 Visuel : ${s.visualSuggestion}`;
  }
  if (slide.type === "summary") {
    const s = slide as Extract<CarouselSlide, { type: "summary" }>;
    return `=== SLIDE ${s.number} — RÉCAPITULATIF ===\n${s.title}\n\n${s.points.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n🎨 Visuel : ${s.visualSuggestion}`;
  }
  if (slide.type === "cta") {
    const s = slide as Extract<CarouselSlide, { type: "cta" }>;
    return `=== SLIDE ${s.number} — CTA ===\n${s.title}\n${s.cta}${s.authorNote ? `\n${s.authorNote}` : ""}\n🎨 Visuel : ${s.visualSuggestion}`;
  }
  return "";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CarouselPage() {
  const [topic, setTopic] = useState("");
  const [angle, setAngle] = useState<CarouselAngle>("listicle");
  const [nSlides, setNSlides] = useState(8);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [carousel, setCarousel] = useState<CarouselResponse | null>(null);

  const [activeSlide, setActiveSlide] = useState(0);
  const [copiedSlide, setCopiedSlide] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);

  const canGenerate = topic.trim().length > 10 && !generating;

  async function handleGenerate() {
    if (!canGenerate) return;
    setGenerating(true);
    setError(null);
    setCarousel(null);
    setActiveSlide(0);

    try {
      const res = await fetch("/api/social/linkedin/carousel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, angle, nSlides }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Erreur de génération");
      }
      const data = (await res.json()) as CarouselResponse;
      setCarousel(data);
      setActiveSlide(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setGenerating(false);
    }
  }

  function handleCopySlide(idx: number) {
    if (!carousel) return;
    navigator.clipboard.writeText(slideToText(carousel.slides[idx]));
    setCopiedSlide(idx);
    setTimeout(() => setCopiedSlide(null), 2000);
  }

  function handleCopyAll() {
    if (!carousel) return;
    const text = carousel.slides.map(slideToText).join("\n\n");
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  }

  function handleCopyCaption() {
    if (!carousel) return;
    navigator.clipboard.writeText(carousel.captionPost);
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2000);
  }

  const slide = carousel?.slides[activeSlide];

  return (
    <>
      <AppTopBar
        title="Carousel Builder"
        breadcrumb="marketing-os / studio / linkedin / carousel"
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

        <div className="grid gap-6" style={{ gridTemplateColumns: "360px 1fr" }}>

          {/* ── LEFT : Config ─────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* Topic */}
            <section className="rounded-[18px] p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
              <label className="text-[11px] font-mono uppercase tracking-[0.15em] mb-2.5 block" style={{ color: "var(--fg-mute)" }}>
                Sujet du carousel
              </label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Ex : 5 erreurs qui tuent votre pipeline B2B · Comment scaler son SaaS sans équipe commerciale · Le framework de cold email qui convertit à 40%..."
                rows={4}
                className="w-full rounded-[10px] px-3.5 py-3 text-[13px] leading-relaxed resize-none outline-none transition-all"
                style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg)" }}
                onFocus={(e) => (e.target.style.borderColor = "var(--violet-fg)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--line)")}
              />
            </section>

            {/* Angle */}
            <section className="rounded-[18px] p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
              <label className="text-[11px] font-mono uppercase tracking-[0.15em] mb-3 block" style={{ color: "var(--fg-mute)" }}>
                Structure des slides
              </label>
              <div className="space-y-2">
                {ANGLES.map((a) => {
                  const active = angle === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => setAngle(a.id)}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-[10px] transition-all text-left"
                      style={active
                        ? { background: "var(--violet-soft)", border: "2px solid var(--violet-fg)" }
                        : { background: "var(--bg)", border: "1px solid var(--line)" }}
                    >
                      <span className="text-[16px] shrink-0">{a.icon}</span>
                      <div>
                        <p className="text-[12.5px] font-semibold" style={{ color: active ? "var(--violet-fg)" : "var(--fg)" }}>
                          {a.label}
                        </p>
                        <p className="text-[10.5px]" style={{ color: active ? "var(--violet-fg)" : "var(--fg-mute)", opacity: 0.8 }}>
                          {a.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Slide count */}
            <section className="rounded-[18px] p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
              <label className="text-[11px] font-mono uppercase tracking-[0.15em] mb-3 block" style={{ color: "var(--fg-mute)" }}>
                Nombre de slides
              </label>
              <div className="flex gap-2">
                {SLIDE_COUNTS.map((n) => {
                  const active = nSlides === n;
                  return (
                    <button
                      key={n}
                      onClick={() => setNSlides(n)}
                      className="flex-1 py-2 rounded-[10px] text-[13px] font-bold transition-all"
                      style={active
                        ? { background: "var(--violet-fg)", color: "white" }
                        : { background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10.5px] mt-2" style={{ color: "var(--fg-mute)" }}>
                Cover + {nSlides - 2} slides contenu + CTA · Recommandé : 8 slides
              </p>
            </section>

            {/* Generate */}
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-[12px] text-[14px] font-bold transition-all hover:brightness-110 disabled:opacity-40"
              style={{ background: "var(--violet-fg)", color: "white" }}
            >
              {generating ? (
                <><RefreshCw className="h-4 w-4 animate-spin" />Génération des {nSlides} slides…</>
              ) : (
                <><Layers className="h-4 w-4" />Générer le carousel</>
              )}
            </button>

            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-[10px] text-[12.5px]"
                style={{ background: "var(--danger-soft)", border: "1px solid var(--danger-line)", color: "var(--danger-fg)" }}>
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* ── RIGHT : Preview ───────────────────────────────────────────── */}
          <div className="space-y-4">
            {!carousel && !generating && (
              <div className="rounded-[18px] p-14 flex flex-col items-center justify-center text-center"
                style={{ border: "1px dashed var(--line)" }}>
                <Layers className="h-10 w-10 mb-4 opacity-20" style={{ color: "var(--violet-fg)" }} />
                <p className="text-[14px] font-semibold mb-2" style={{ color: "var(--fg)" }}>
                  Votre carousel apparaîtra ici
                </p>
                <p className="text-[12px] max-w-[320px]" style={{ color: "var(--fg-mute)" }}>
                  Définissez votre sujet et la structure, puis générez. Chaque slide est prévisualisée et copiable.
                </p>
              </div>
            )}

            {generating && (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-[16px] animate-pulse" style={{ background: "var(--bg-card)", border: "1px solid var(--line)", height: 120 }} />
                ))}
              </div>
            )}

            {carousel && !generating && (
              <>
                {/* Header: title + actions */}
                <div className="flex items-center justify-between px-5 py-4 rounded-[16px]"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
                  <div>
                    <p className="text-[14px] font-semibold" style={{ color: "var(--fg)" }}>
                      {carousel.carouselTitle}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
                      {carousel.slides.length} slides · Listicle LinkedIn
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleGenerate}
                      disabled={!canGenerate}
                      className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-2 rounded-[8px] transition-all hover:brightness-95 disabled:opacity-40"
                      style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Régénérer
                    </button>
                    <button
                      onClick={handleCopyAll}
                      className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-[8px] transition-all hover:brightness-110"
                      style={{ background: copiedAll ? "var(--emerald-soft)" : "var(--violet-fg)", color: copiedAll ? "var(--emerald-fg)" : "white", border: copiedAll ? "1px solid var(--emerald-line)" : "none" }}
                    >
                      {copiedAll ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                      {copiedAll ? "Copié !" : "Exporter tout"}
                    </button>
                  </div>
                </div>

                {/* Main slide preview */}
                <div className="grid gap-4" style={{ gridTemplateColumns: "1fr auto" }}>
                  <div className="max-w-[480px]">
                    {slide && <SlideCard slide={slide} active />}
                  </div>

                  {/* Slide info panel */}
                  <div className="w-64 space-y-3">
                    {/* Navigation */}
                    <div className="flex items-center justify-between px-4 py-3 rounded-[12px]"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}>
                      <button
                        onClick={() => setActiveSlide((v) => Math.max(0, v - 1))}
                        disabled={activeSlide === 0}
                        className="p-1.5 rounded-[7px] transition-all hover:brightness-95 disabled:opacity-30"
                        style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
                      >
                        <ChevronLeft className="h-4 w-4" style={{ color: "var(--fg-dim)" }} />
                      </button>
                      <span className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>
                        {activeSlide + 1} / {carousel.slides.length}
                      </span>
                      <button
                        onClick={() => setActiveSlide((v) => Math.min(carousel.slides.length - 1, v + 1))}
                        disabled={activeSlide === carousel.slides.length - 1}
                        className="p-1.5 rounded-[7px] transition-all hover:brightness-95 disabled:opacity-30"
                        style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
                      >
                        <ChevronRight className="h-4 w-4" style={{ color: "var(--fg-dim)" }} />
                      </button>
                    </div>

                    {/* Copy current slide */}
                    <button
                      onClick={() => handleCopySlide(activeSlide)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] text-[12.5px] font-semibold transition-all hover:brightness-95"
                      style={{
                        background: copiedSlide === activeSlide ? "var(--emerald-soft)" : "var(--bg-card)",
                        border: copiedSlide === activeSlide ? "1px solid var(--emerald-line)" : "1px solid var(--line)",
                        color: copiedSlide === activeSlide ? "var(--emerald-fg)" : "var(--fg-dim)",
                      }}
                    >
                      {copiedSlide === activeSlide ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedSlide === activeSlide ? "Slide copiée" : "Copier cette slide"}
                    </button>

                    {/* Visual suggestion */}
                    {slide && (
                      <div className="rounded-[10px] p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}>
                        <p className="text-[9.5px] font-mono uppercase tracking-[0.1em] mb-1.5" style={{ color: "var(--fg-mute)" }}>
                          Suggestion visuelle
                        </p>
                        <p className="text-[11.5px] leading-snug" style={{ color: "var(--fg-dim)" }}>
                          {(slide as { visualSuggestion: string }).visualSuggestion}
                        </p>
                      </div>
                    )}

                    {/* Slide strip */}
                    <div className="rounded-[12px] p-3 space-y-1.5" style={{ background: "var(--bg-card)", border: "1px solid var(--line)" }}>
                      <p className="text-[9.5px] font-mono uppercase tracking-[0.1em] mb-2" style={{ color: "var(--fg-mute)" }}>
                        Toutes les slides
                      </p>
                      {carousel.slides.map((s, i) => {
                        const isActive = i === activeSlide;
                        const typeColors: Record<string, string> = {
                          cover: "var(--violet-fg)",
                          content: "var(--fg-dim)",
                          summary: "var(--emerald-fg)",
                          cta: "var(--amber-fg)",
                        };
                        const title = s.type === "cover"
                          ? (s as Extract<CarouselSlide, { type: "cover" }>).title
                          : s.type === "content"
                          ? (s as Extract<CarouselSlide, { type: "content" }>).title
                          : s.type === "summary"
                          ? (s as Extract<CarouselSlide, { type: "summary" }>).title
                          : (s as Extract<CarouselSlide, { type: "cta" }>).title;
                        return (
                          <button
                            key={i}
                            onClick={() => setActiveSlide(i)}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-[7px] text-left transition-all"
                            style={isActive
                              ? { background: "var(--violet-soft)", border: "1px solid var(--violet-line)" }
                              : { border: "1px solid transparent" }}
                          >
                            <span className="text-[9.5px] font-mono w-4 shrink-0" style={{ color: "var(--fg-mute)" }}>
                              {i + 1}
                            </span>
                            <span className="text-[10px] w-10 shrink-0 font-semibold" style={{ color: typeColors[s.type] }}>
                              {s.type.slice(0, 4).toUpperCase()}
                            </span>
                            <span className="text-[11px] truncate" style={{ color: isActive ? "var(--violet-fg)" : "var(--fg-dim)" }}>
                              {title}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Caption post */}
                <section className="rounded-[18px] p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Linkedin className="h-3.5 w-3.5" style={{ color: "var(--violet-fg)" }} />
                      <span className="text-[12px] font-semibold" style={{ color: "var(--fg)" }}>
                        Post d'accompagnement
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}>
                        À poster avec le PDF
                      </span>
                    </div>
                    <button
                      onClick={handleCopyCaption}
                      className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-[6px] transition-all hover:brightness-95"
                      style={{ background: "var(--bg)", border: "1px solid var(--line)", color: copiedCaption ? "var(--emerald-fg)" : "var(--fg-dim)" }}
                    >
                      {copiedCaption ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copiedCaption ? "Copié" : "Copier"}
                    </button>
                  </div>
                  <div className="rounded-[10px] p-3.5 text-[12.5px] leading-relaxed whitespace-pre-wrap"
                    style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                    {carousel.captionPost}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
