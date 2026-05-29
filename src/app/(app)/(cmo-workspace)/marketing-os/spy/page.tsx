"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import { Search, TrendingUp, Zap, Loader2, AlertTriangle } from "lucide-react";

const MODES = [
  { id: "competitor", icon: "🏢", title: "Un concurrent", desc: "Analyse SEO, score, mots-clés", credits: 4 },
  { id: "keyword", icon: "🔑", title: "Un mot-clé", desc: "Volume, difficulté, opportunités long-tail", credits: 2 },
  { id: "ads", icon: "📢", title: "Des pubs", desc: "Créatifs actifs, hooks dominants, durée", credits: 20 },
  { id: "trend", icon: "📈", title: "Une tendance", desc: "Sujets viraux, questions, gaps", credits: 3 },
] as const;

type Mode = typeof MODES[number]["id"];

const WATCHLIST = [
  { id: 1, title: "HubSpot lance campagne sur vos kw stratégiques", priority: "high", icon: "⚡", time: "2 min", reactHref: "/marketing-os/ads" },
  { id: 2, title: "Competitor-X publie article \"Lead Scoring 2026\"", priority: "medium", icon: "◎", time: "14 min", reactHref: "/marketing-os/studio" },
  { id: 3, title: "Nouveau concurrent positionné sur \"AI Marketing\"", priority: "high", icon: "↗", time: "1 h", reactHref: "/marketing-os/ads" },
  { id: 4, title: "Backlinks gagnés sur votre domaine principal (+47)", priority: "low", icon: "↬", time: "2 h", reactHref: "/marketing-os/insights" },
  { id: 5, title: "Drop trafic organique sur 3 pages — investigation", priority: "medium", icon: "▤", time: "3 h", reactHref: "/marketing-os/studio" },
];

// ─── Result types ─────────────────────────────────────────────────────────────

interface CompetitorResult {
  mode: "competitor";
  domain: string;
  score: number;
  keywords: number;
  backlinks: string;
  topKeywords: string[];
  issues: string[];
  recommendations: string[];
  wordCount: number;
}

interface KeywordResult {
  mode: "keyword";
  keyword: string;
  difficulty: number;
  difficultyLabel: string;
  topCompetitors: string[];
  longtails: string[];
  questions: string[];
  recommendation: string;
}

interface TrendResult {
  mode: "trend";
  query: string;
  topResults: { title: string; link: string; snippet: string }[];
  relatedSearches: string[];
  questions: string[];
}

interface AdsResult {
  mode: "ads";
  available: boolean;
  message: string;
}

type AnalysisResult = CompetitorResult | KeywordResult | TrendResult | AdsResult;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function priorityChip(p: string) {
  if (p === "high") return { bg: "var(--danger-soft)", color: "var(--danger-fg)", border: "1px solid var(--danger-line)" };
  if (p === "medium") return { bg: "var(--amber-soft)", color: "var(--amber-fg)", border: "1px solid var(--amber-line)" };
  return { bg: "var(--cold-soft)", color: "var(--cold-fg)", border: "1px solid var(--cold-line, var(--line))" };
}

function difficultyColor(d: number) {
  if (d >= 70) return "var(--danger-fg)";
  if (d >= 45) return "var(--amber-fg)";
  return "var(--emerald-fg)";
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SpyPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [selectedMode, setSelectedMode] = useState<Mode>("competitor");
  const [query, setQuery] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analyzedQuery, setAnalyzedQuery] = useState("");

  const mode = MODES.find((m) => m.id === selectedMode)!;

  async function handleAnalyze() {
    if (!query.trim()) { inputRef.current?.focus(); return; }
    setAnalyzing(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/spy/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: selectedMode, query: query.trim() }),
      });
      const data = await res.json() as AnalysisResult & { error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Erreur lors de l'analyse");
      } else {
        setResult(data);
        setAnalyzedQuery(query.trim());
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setAnalyzing(false);
    }
  }

  function handleModeChange(id: Mode) {
    setSelectedMode(id);
    setResult(null);
    setError(null);
    setQuery("");
    inputRef.current?.focus();
  }

  return (
    <>
      <AppTopBar
        title="Spy"
        breadcrumb="marketing-os / spy"
        subtitle="Veille concurrence & intelligence"
        accent="violet"
      />

      <div className="p-6 space-y-6 max-w-[1200px]">

        {/* Hero — mode picker */}
        <section
          className="rounded-[18px] p-8"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] mb-4" style={{ color: "var(--fg-mute)" }}>
            <Search className="h-3 w-3" style={{ color: "var(--violet-fg)" }} />
            Espionner quoi ?
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {MODES.map((m) => {
              const active = selectedMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => handleModeChange(m.id)}
                  className="text-left p-4 rounded-[12px] transition-all hover:brightness-[0.97]"
                  style={
                    active
                      ? { background: "var(--violet-soft)", border: "2px solid var(--violet-fg)" }
                      : { background: "var(--bg)", border: "1px solid var(--line)" }
                  }
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[18px]">{m.icon}</span>
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                      style={{
                        background: active ? "var(--violet-fg)" : "oklch(0.21 0.03 260 / 0.04)",
                        color: active ? "white" : "var(--fg-mute)",
                      }}
                    >
                      {m.credits} cr
                    </span>
                  </div>
                  <p className="text-[13px] font-semibold mb-0.5" style={{ color: active ? "var(--violet-fg)" : "var(--fg)" }}>
                    {m.title}
                  </p>
                  <p className="text-[11px] leading-snug" style={{ color: "var(--fg-mute)" }}>{m.desc}</p>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div
              className="flex-1 flex items-center gap-3 px-4 py-3 rounded-[10px]"
              style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
            >
              <Search className="h-4 w-4 shrink-0" style={{ color: "var(--fg-mute)" }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setResult(null); setError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                className="flex-1 bg-transparent text-[14px] outline-none placeholder:opacity-50"
                style={{ color: "var(--fg)" }}
                placeholder={
                  selectedMode === "competitor" ? "Ex : hubspot.com" :
                  selectedMode === "keyword" ? "Ex : lead scoring B2B" :
                  selectedMode === "ads" ? "Ex : niche SaaS marketing" :
                  "Ex : AI marketing 2026"
                }
              />
            </div>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="px-5 py-3 rounded-[10px] font-semibold text-[13px] transition-all hover:brightness-110 whitespace-nowrap flex items-center gap-2 disabled:opacity-70"
              style={{ background: "var(--violet-fg)", color: "white" }}
            >
              {analyzing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/20">{mode.credits} cr</span>
              )}
              {analyzing ? "Analyse…" : "Analyser →"}
            </button>
          </div>
        </section>

        {/* Error */}
        {error && (
          <div
            className="rounded-[14px] p-4 flex items-center gap-3"
            style={{ background: "var(--danger-soft)", border: "1px solid var(--danger-line)" }}
          >
            <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "var(--danger-fg)" }} />
            <p className="text-[13px]" style={{ color: "var(--danger-fg)" }}>{error}</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <section
            ref={resultsRef}
            className="rounded-[18px] p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--violet-line)", boxShadow: "var(--card-shadow)" }}
          >
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] mb-4" style={{ color: "var(--violet-fg)" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--violet-fg)" }} />
              Résultats — {analyzedQuery}
            </div>

            {result.mode === "competitor" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: "Score SEO", value: String(result.score), accent: "violet" },
                    { label: "Mots-clés est.", value: result.keywords.toLocaleString("fr-FR"), accent: "emerald" },
                    { label: "Liens ext.", value: result.backlinks, accent: "amber" },
                    { label: "Mots", value: result.wordCount.toLocaleString("fr-FR"), accent: "cold" },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-[12px] p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                      <p className="text-[11px] font-mono uppercase tracking-wider mb-1" style={{ color: "var(--fg-mute)" }}>{stat.label}</p>
                      <p className="font-display text-[24px] font-bold" style={{ color: `var(--${stat.accent}-fg)` }}>{stat.value}</p>
                    </div>
                  ))}
                </div>
                {result.topKeywords.length > 0 && (
                  <div className="rounded-[12px] p-4" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                    <p className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "var(--fg-mute)" }}>Mots du titre</p>
                    <div className="flex flex-wrap gap-2">
                      {result.topKeywords.map((kw) => (
                        <span key={kw} className="text-[12px] px-2.5 py-1 rounded-full" style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}>{kw}</span>
                      ))}
                    </div>
                  </div>
                )}
                {result.issues.length > 0 && (
                  <div className="rounded-[12px] p-4 space-y-1.5" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                    <p className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "var(--fg-mute)" }}>Points d&apos;amélioration</p>
                    {result.issues.slice(0, 5).map((issue, i) => (
                      <p key={i} className="text-[12px]" style={{ color: "var(--fg-dim)" }}>{issue}</p>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-end gap-2">
                  <Link href="/marketing-os/studio" className="px-4 py-2 rounded-[8px] text-[12px] font-medium transition-all hover:brightness-[0.97]" style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}>
                    Créer du contenu
                  </Link>
                  <Link href="/marketing-os/ads" className="px-4 py-2 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110" style={{ background: "var(--violet-fg)", color: "white" }}>
                    Réagir avec une pub →
                  </Link>
                </div>
              </div>
            )}

            {result.mode === "keyword" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-[12px] p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                    <p className="text-[11px] font-mono uppercase tracking-wider mb-1" style={{ color: "var(--fg-mute)" }}>Difficulté</p>
                    <p className="font-display text-[24px] font-bold" style={{ color: difficultyColor(result.difficulty) }}>
                      {result.difficulty}/100
                    </p>
                    <p className="text-[11px] mt-0.5 capitalize" style={{ color: "var(--fg-mute)" }}>{result.difficultyLabel}</p>
                  </div>
                  <div className="rounded-[12px] p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                    <p className="text-[11px] font-mono uppercase tracking-wider mb-1" style={{ color: "var(--fg-mute)" }}>Top concurrents</p>
                    <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>
                      {result.topCompetitors.length > 0 ? result.topCompetitors[0] : "—"}
                    </p>
                    {result.topCompetitors.length > 1 && (
                      <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>+{result.topCompetitors.length - 1} autres</p>
                    )}
                  </div>
                </div>
                {result.longtails.length > 0 && (
                  <div className="rounded-[12px] p-4" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                    <p className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "var(--fg-mute)" }}>Opportunités long-tail</p>
                    <div className="space-y-1.5">
                      {result.longtails.slice(0, 5).map((lt) => (
                        <div key={lt} className="flex items-center justify-between">
                          <span className="text-[13px]" style={{ color: "var(--fg)" }}>{lt}</span>
                          <Link href="/marketing-os/studio" className="text-[11px] font-medium px-2.5 py-1 rounded-md transition-all hover:brightness-110" style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}>
                            Créer article
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {result.questions.length > 0 && (
                  <div className="rounded-[12px] p-4" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                    <p className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "var(--fg-mute)" }}>Questions fréquentes</p>
                    <div className="space-y-1">
                      {result.questions.slice(0, 4).map((q) => (
                        <p key={q} className="text-[12px]" style={{ color: "var(--fg-dim)" }}>• {q}</p>
                      ))}
                    </div>
                  </div>
                )}
                {result.recommendation && (
                  <div className="rounded-[12px] p-3 flex items-center gap-2" style={{ background: "var(--violet-soft)", border: "1px solid var(--violet-line)" }}>
                    <Zap className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--violet-fg)" }} />
                    <p className="text-[12px] font-medium" style={{ color: "var(--violet-fg)" }}>{result.recommendation}</p>
                  </div>
                )}
              </div>
            )}

            {result.mode === "trend" && (
              <div className="space-y-4">
                {result.topResults.length > 0 ? (
                  <div className="space-y-2">
                    {result.topResults.map((r, i) => (
                      <a
                        key={i}
                        href={r.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block rounded-[12px] p-3 transition-all hover:brightness-[0.97]"
                        style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
                      >
                        <p className="text-[13px] font-medium mb-0.5" style={{ color: "var(--violet-fg)" }}>{r.title}</p>
                        <p className="text-[11px] line-clamp-2" style={{ color: "var(--fg-mute)" }}>{r.snippet}</p>
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[12px] p-5 text-center" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                    <TrendingUp className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--violet-fg)" }} />
                    <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--fg)" }}>
                      Tendance : <span style={{ color: "var(--violet-fg)" }}>{analyzedQuery}</span>
                    </p>
                  </div>
                )}
                {result.relatedSearches.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {result.relatedSearches.map((s) => (
                      <span key={s} className="text-[12px] px-2.5 py-1 rounded-full cursor-pointer hover:brightness-[0.97]"
                        style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}
                        onClick={() => setQuery(s)}
                      >{s}</span>
                    ))}
                  </div>
                )}
                <Link href="/marketing-os/studio" className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110" style={{ background: "var(--violet-fg)", color: "white" }}>
                  <Zap className="h-3.5 w-3.5" />
                  Capitaliser sur cette tendance →
                </Link>
              </div>
            )}

            {result.mode === "ads" && !result.available && (
              <div className="rounded-[12px] p-5 text-center" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                <p className="text-[13px]" style={{ color: "var(--fg-mute)" }}>{result.message}</p>
              </div>
            )}
          </section>
        )}

        {/* Watch list */}
        <section
          className="rounded-[18px] p-6"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] mb-1" style={{ color: "var(--fg-mute)" }}>
            <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--violet-fg)" }} />
            Watch list — détections live
          </div>
          <h2 className="font-display text-[20px] font-semibold mb-5" style={{ color: "var(--fg)" }}>Alertes concurrentielles</h2>

          <div className="space-y-2">
            {WATCHLIST.map((item) => {
              const chip = priorityChip(item.priority);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 px-4 py-3 rounded-[12px]"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
                >
                  <span className="font-mono text-[16px] shrink-0 w-6 text-center" style={{ color: "var(--fg-mute)" }}>
                    {item.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] truncate" style={{ color: "var(--fg)" }}>{item.title}</p>
                  </div>
                  <span
                    className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded"
                    style={{ background: chip.bg, color: chip.color, border: chip.border }}
                  >
                    {item.priority}
                  </span>
                  <span className="shrink-0 text-[11px] font-mono" style={{ color: "var(--fg-mute)" }}>{item.time}</span>
                  <Link
                    href={item.reactHref}
                    className="shrink-0 text-[11.5px] font-medium px-3 py-1.5 rounded-md transition-all hover:brightness-110"
                    style={{ background: "var(--violet-soft)", border: "1px solid var(--violet-line)", color: "var(--violet-fg)" }}
                  >
                    Réagir
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
