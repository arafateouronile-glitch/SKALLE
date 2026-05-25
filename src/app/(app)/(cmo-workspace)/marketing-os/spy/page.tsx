"use client";

import { useState } from "react";
import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import { Search } from "lucide-react";

const MODES = [
  { id: "competitor", title: "Un concurrent", desc: "Analyse SEO, pubs actives, mots-clés", credits: 4 },
  { id: "keyword", title: "Un mot-clé", desc: "Volume, difficulté, opportunités long-tail", credits: 2 },
  { id: "ads", title: "Des pubs", desc: "Créatifs actifs, hooks dominants, durée", credits: 20 },
  { id: "trend", title: "Une tendance", desc: "Sujets viraux, creators, gaps", credits: 3 },
] as const;

type Mode = typeof MODES[number]["id"];

const WATCHLIST = [
  { id: 1, title: "HubSpot lance campagne sur vos kw stratégiques", priority: "high", icon: "⚡", time: "2 min" },
  { id: 2, title: "Competitor-X publie article \"Lead Scoring 2026\"", priority: "medium", icon: "◎", time: "14 min" },
  { id: 3, title: "Nouveau concurrent positionné sur \"AI Marketing\"", priority: "high", icon: "↗", time: "1 h" },
  { id: 4, title: "Backlinks gagnés sur votre domaine principal (+47)", priority: "low", icon: "↬", time: "2 h" },
  { id: 5, title: "Drop trafic organique sur 3 pages — investigation", priority: "medium", icon: "▤", time: "3 h" },
];

function priorityChip(p: string) {
  if (p === "high") return { bg: "var(--danger-soft)", color: "var(--danger-fg)" };
  if (p === "medium") return { bg: "var(--amber-soft)", color: "var(--amber-fg)" };
  return { bg: "var(--cold-soft)", color: "var(--cold-fg)" };
}

export default function SpyPage() {
  const [selectedMode, setSelectedMode] = useState<Mode>("competitor");
  const [query, setQuery] = useState("");

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
          <div className="mb-6">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] mb-2" style={{ color: "var(--fg-mute)" }}>
              <Search className="h-3 w-3" style={{ color: "var(--violet-fg)" }} />
              Espionner quoi ?
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {MODES.map((mode) => {
                const active = selectedMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setSelectedMode(mode.id)}
                    className="text-left p-4 rounded-[12px] transition-all"
                    style={
                      active
                        ? { background: "var(--violet-soft)", border: "1px solid var(--violet-line)" }
                        : { background: "var(--bg)", border: "1px solid var(--line)" }
                    }
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[13px] font-semibold" style={{ color: active ? "var(--violet-fg)" : "var(--fg)" }}>
                        {mode.title}
                      </p>
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                        style={{ background: active ? "var(--violet-fg)" : "oklch(0.21 0.03 260 / 0.04)", color: active ? "white" : "var(--fg-mute)" }}
                      >
                        {mode.credits} cr
                      </span>
                    </div>
                    <p className="text-[11.5px] leading-snug" style={{ color: "var(--fg-mute)" }}>{mode.desc}</p>
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
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
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
                className="px-5 py-3 rounded-[10px] font-semibold text-[13px] transition-all hover:brightness-110 whitespace-nowrap"
                style={{ background: "var(--violet-fg)", color: "white" }}
              >
                Analyser →
              </button>
            </div>
          </div>
        </section>

        {/* Watch list */}
        <section
          className="rounded-[18px] p-6"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] mb-1" style={{ color: "var(--fg-mute)" }}>
                <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "var(--violet-fg)" }} />
                Watch list — détections live
              </div>
              <h2 className="font-display text-[20px] font-semibold" style={{ color: "var(--fg)" }}>Alertes concurrentielles</h2>
            </div>
          </div>

          <div className="space-y-2">
            {WATCHLIST.map((item) => {
              const chip = priorityChip(item.priority);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 px-4 py-3 rounded-[12px] transition-all hover:brightness-[0.97]"
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
                    style={{ background: chip.bg, color: chip.color }}
                  >
                    {item.priority}
                  </span>
                  <span className="shrink-0 text-[11px] font-mono" style={{ color: "var(--fg-mute)" }}>{item.time}</span>
                  <Link
                    href="/marketing-os/ads"
                    className="shrink-0 text-[11.5px] font-medium px-3 py-1.5 rounded-md transition-all"
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
