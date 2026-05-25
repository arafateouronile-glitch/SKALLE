"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import { Search, TrendingUp, Zap } from "lucide-react";

const MODES = [
  { id: "competitor", icon: "🏢", title: "Un concurrent", desc: "Analyse SEO, pubs actives, mots-clés", credits: 4 },
  { id: "keyword", icon: "🔑", title: "Un mot-clé", desc: "Volume, difficulté, opportunités long-tail", credits: 2 },
  { id: "ads", icon: "📢", title: "Des pubs", desc: "Créatifs actifs, hooks dominants, durée", credits: 20 },
  { id: "trend", icon: "📈", title: "Une tendance", desc: "Sujets viraux, creators, gaps", credits: 3 },
] as const;

type Mode = typeof MODES[number]["id"];

const WATCHLIST = [
  { id: 1, title: "HubSpot lance campagne sur vos kw stratégiques", priority: "high", icon: "⚡", time: "2 min", reactHref: "/marketing-os/ads" },
  { id: 2, title: "Competitor-X publie article \"Lead Scoring 2026\"", priority: "medium", icon: "◎", time: "14 min", reactHref: "/marketing-os/studio" },
  { id: 3, title: "Nouveau concurrent positionné sur \"AI Marketing\"", priority: "high", icon: "↗", time: "1 h", reactHref: "/marketing-os/ads" },
  { id: 4, title: "Backlinks gagnés sur votre domaine principal (+47)", priority: "low", icon: "↬", time: "2 h", reactHref: "/marketing-os/insights" },
  { id: 5, title: "Drop trafic organique sur 3 pages — investigation", priority: "medium", icon: "▤", time: "3 h", reactHref: "/marketing-os/studio" },
];

const MOCK_COMPETITOR_RESULT = {
  domain: "",
  score: 91,
  keywords: 48200,
  backlinks: "2.1M",
  ads: 24,
  topKeywords: ["lead scoring", "CRM SaaS", "sales automation", "outbound marketing"],
  traffic: "1.2M / mois",
};

const MOCK_KEYWORD_RESULT = {
  keyword: "",
  volume: "8 400 / mois",
  difficulty: 62,
  cpc: "€3.20",
  longtails: ["lead scoring b2b excel", "lead scoring marketing automation", "outil lead scoring gratuit", "lead scoring hubspot"],
};

const MOCK_ADS_RESULT = [
  { hook: "\"Stop manually qualifying leads. Let AI do it.\"", platform: "Meta", freq: 4.2, days: 18 },
  { hook: "\"Your sales team is wasting 60% of their time. Here's the fix.\"", platform: "LinkedIn", freq: 3.1, days: 12 },
  { hook: "\"From 0 to 50 qualified meetings/month — in 3 weeks\"", platform: "Google", freq: 2.9, days: 7 },
];

function priorityChip(p: string) {
  if (p === "high") return { bg: "var(--danger-soft)", color: "var(--danger-fg)", border: "1px solid var(--danger-line)" };
  if (p === "medium") return { bg: "var(--amber-soft)", color: "var(--amber-fg)", border: "1px solid var(--amber-line)" };
  return { bg: "var(--cold-soft)", color: "var(--cold-fg)", border: "1px solid var(--cold-line, var(--line))" };
}

export default function SpyPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [selectedMode, setSelectedMode] = useState<Mode>("competitor");
  const [query, setQuery] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [analyzedQuery, setAnalyzedQuery] = useState("");

  const mode = MODES.find((m) => m.id === selectedMode)!;

  function handleAnalyze() {
    if (!query.trim()) { inputRef.current?.focus(); return; }
    setAnalyzing(true);
    setHasResults(false);
    const q = query;
    setTimeout(() => {
      setAnalyzedQuery(q);
      setAnalyzing(false);
      setHasResults(true);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }, 1000);
  }

  function handleModeChange(id: Mode) {
    setSelectedMode(id);
    setHasResults(false);
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
                onChange={(e) => { setQuery(e.target.value); setHasResults(false); }}
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
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/20">{mode.credits} cr</span>
              {analyzing ? "Analyse…" : "Analyser →"}
            </button>
          </div>
        </section>

        {/* Results */}
        {hasResults && (
          <section
            ref={resultsRef}
            className="rounded-[18px] p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--violet-line)", boxShadow: "var(--card-shadow)" }}
          >
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] mb-4" style={{ color: "var(--violet-fg)" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--violet-fg)" }} />
              Résultats — {analyzedQuery}
            </div>

            {selectedMode === "competitor" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: "Score SEO", value: String(MOCK_COMPETITOR_RESULT.score), accent: "violet" },
                    { label: "Mots-clés", value: MOCK_COMPETITOR_RESULT.keywords.toLocaleString("fr-FR"), accent: "emerald" },
                    { label: "Backlinks", value: MOCK_COMPETITOR_RESULT.backlinks, accent: "amber" },
                    { label: "Pubs actives", value: String(MOCK_COMPETITOR_RESULT.ads), accent: "danger" },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-[12px] p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                      <p className="text-[11px] font-mono uppercase tracking-wider mb-1" style={{ color: "var(--fg-mute)" }}>{stat.label}</p>
                      <p className="font-display text-[24px] font-bold" style={{ color: `var(--${stat.accent}-fg)` }}>{stat.value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-[12px] p-4" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                  <p className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "var(--fg-mute)" }}>Top mots-clés détectés</p>
                  <div className="flex flex-wrap gap-2">
                    {MOCK_COMPETITOR_RESULT.topKeywords.map((kw) => (
                      <span key={kw} className="text-[12px] px-2.5 py-1 rounded-full" style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}>{kw}</span>
                    ))}
                  </div>
                </div>
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

            {selectedMode === "keyword" && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Volume mensuel", value: MOCK_KEYWORD_RESULT.volume, accent: "violet" },
                    { label: "Difficulté", value: `${MOCK_KEYWORD_RESULT.difficulty}/100`, accent: "amber" },
                    { label: "CPC moyen", value: MOCK_KEYWORD_RESULT.cpc, accent: "emerald" },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-[12px] p-4 text-center" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                      <p className="text-[11px] font-mono uppercase tracking-wider mb-1" style={{ color: "var(--fg-mute)" }}>{stat.label}</p>
                      <p className="font-display text-[22px] font-bold" style={{ color: `var(--${stat.accent}-fg)` }}>{stat.value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-[12px] p-4" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                  <p className="text-[11px] font-mono uppercase tracking-wider mb-2" style={{ color: "var(--fg-mute)" }}>Opportunités long-tail</p>
                  <div className="space-y-1.5">
                    {MOCK_KEYWORD_RESULT.longtails.map((lt) => (
                      <div key={lt} className="flex items-center justify-between">
                        <span className="text-[13px]" style={{ color: "var(--fg)" }}>{lt}</span>
                        <Link href="/marketing-os/studio" className="text-[11px] font-medium px-2.5 py-1 rounded-md transition-all hover:brightness-110" style={{ background: "var(--violet-soft)", color: "var(--violet-fg)" }}>
                          Créer article
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {selectedMode === "ads" && (
              <div className="space-y-3">
                {MOCK_ADS_RESULT.map((ad, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 rounded-[12px]" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium italic mb-1" style={{ color: "var(--fg)" }}>{ad.hook}</p>
                      <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>{ad.platform} · Fréquence {ad.freq} · {ad.days}j actif</p>
                    </div>
                    <Link href="/marketing-os/ads" className="shrink-0 px-3 py-1.5 rounded-md text-[11.5px] font-semibold transition-all hover:brightness-110" style={{ background: "var(--violet-soft)", border: "1px solid var(--violet-line)", color: "var(--violet-fg)" }}>
                      ↻ Remixer
                    </Link>
                  </div>
                ))}
              </div>
            )}

            {selectedMode === "trend" && (
              <div className="rounded-[12px] p-5 text-center" style={{ background: "var(--bg)", border: "1px solid var(--line)" }}>
                <TrendingUp className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--violet-fg)" }} />
                <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--fg)" }}>Tendance détectée : <span style={{ color: "var(--violet-fg)" }}>{analyzedQuery}</span></p>
                <p className="text-[12px] mb-4" style={{ color: "var(--fg-mute)" }}>Volume en hausse de +340% sur 30j · 14 creators actifs · gap de contenu identifié</p>
                <Link href="/marketing-os/studio" className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110" style={{ background: "var(--violet-fg)", color: "white" }}>
                  <Zap className="h-3.5 w-3.5" />
                  Capitaliser sur cette tendance →
                </Link>
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
