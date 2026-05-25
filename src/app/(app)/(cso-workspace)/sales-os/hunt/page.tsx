"use client";

import { useState } from "react";
import { AppTopBar } from "@/components/modules/app-topbar";
import { Search, Download } from "lucide-react";

const HUNT_MODES = [
  { id: "jobs", icon: "📡", title: "Offres d'emploi", desc: "Entreprises qui recrutent dans votre cible", credits: 15 },
  { id: "maps", icon: "📍", title: "Locaux Maps", desc: "Entreprises avec locaux dans une zone", credits: 10 },
  { id: "new", icon: "✦", title: "Nouvelles entreprises", desc: "Créations récentes dans votre secteur", credits: 5 },
  { id: "social", icon: "♡", title: "Engagement social", desc: "Prospects actifs sur votre contenu", credits: 8 },
  { id: "partners", icon: "🤝", title: "Partenaires", desc: "Entreprises complémentaires à cibler", credits: 8 },
] as const;

type HuntMode = (typeof HUNT_MODES)[number]["id"];

interface HuntResult {
  id: number;
  name: string;
  co: string;
  city: string;
  size: string;
  signal: string;
  reason: string;
  score: number;
  temp: "HOT" | "WARM";
  initials: string;
}

const MOCK_RESULTS: HuntResult[] = [
  { id: 1, name: "Clara Fontaine", co: "Mistral AI", city: "Paris", size: "50-200", signal: "Recrute Head of Sales", reason: "Croissance rapide, budget commercial ouvert", score: 94, temp: "HOT", initials: "CF" },
  { id: 2, name: "Victor Dupont", co: "Pennylane", city: "Paris", size: "200-500", signal: "Levée de fonds Série B", reason: "Post-fundraise = acquisition accélérée", score: 91, temp: "HOT", initials: "VD" },
  { id: 3, name: "Aline Mercier", co: "Spendesk", city: "Lyon", size: "200-500", signal: "Recrute 3 BDR", reason: "Scaling équipe commerciale", score: 87, temp: "HOT", initials: "AM" },
  { id: 4, name: "Paul Renard", co: "Swile", city: "Bordeaux", size: "500+", signal: "Nouveau bureau régional", reason: "Expansion géographique en cours", score: 74, temp: "WARM", initials: "PR" },
  { id: 5, name: "Sophie Laurent", co: "Luko", city: "Paris", size: "50-200", signal: "Recrute Sales Manager", reason: "Structuration équipe vente", score: 71, temp: "WARM", initials: "SL" },
  { id: 6, name: "Hugo Martin", co: "Alan", city: "Paris", size: "200-500", signal: "Engage sur vos posts LinkedIn", reason: "Signal d'intérêt fort, warm lead", score: 68, temp: "WARM", initials: "HM" },
];

function tempStyle(temp: "HOT" | "WARM") {
  if (temp === "HOT") return { background: "var(--danger-soft)", color: "var(--danger-fg)" };
  return { background: "var(--amber-soft)", color: "var(--amber-fg)" };
}

export default function HuntPage() {
  const [selectedMode, setSelectedMode] = useState<HuntMode>("jobs");
  const [query, setQuery] = useState("");
  const [hasResults] = useState(true);

  const mode = HUNT_MODES.find((m) => m.id === selectedMode)!;

  return (
    <>
      <AppTopBar
        title="Hunt"
        breadcrumb="sales-os / hunt"
        accent="amber"
      />

      <div className="p-6 space-y-6 max-w-[1200px]">

        {/* Mode picker + input */}
        <section
          className="rounded-[18px] p-8"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] mb-4" style={{ color: "var(--fg-mute)" }}>
            <Search className="h-3 w-3" style={{ color: "var(--amber-fg)" }} />
            Où chercher ?
          </div>

          <div className="grid grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
            {HUNT_MODES.map((m) => {
              const active = selectedMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedMode(m.id)}
                  className="text-left p-4 rounded-[12px] transition-all"
                  style={
                    active
                      ? { background: "var(--amber-soft)", border: "1px solid var(--amber-line)" }
                      : { background: "var(--bg)", border: "1px solid var(--line)" }
                  }
                >
                  <div className="text-[20px] mb-2">{m.icon}</div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <p className="text-[12px] font-semibold leading-tight" style={{ color: active ? "var(--amber-fg)" : "var(--fg)" }}>
                      {m.title}
                    </p>
                    <span
                      className="text-[9px] font-mono px-1 py-0.5 rounded shrink-0"
                      style={{
                        background: active ? "var(--amber-fg)" : "oklch(0.21 0.03 260 / 0.04)",
                        color: active ? "white" : "var(--fg-mute)",
                      }}
                    >
                      {m.credits}cr
                    </span>
                  </div>
                  <p className="text-[10.5px] leading-snug" style={{ color: "var(--fg-mute)" }}>{m.desc}</p>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <div
              className="flex-1 flex items-center gap-3 px-4 py-3 rounded-[10px]"
              style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
            >
              <span className="text-[16px]">{mode.icon}</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 bg-transparent text-[14px] outline-none placeholder:opacity-50"
                style={{ color: "var(--fg)" }}
                placeholder={
                  selectedMode === "jobs" ? "Ex : SaaS B2B, startup tech Paris..." :
                  selectedMode === "maps" ? "Ex : Paris 75008, Lyon..." :
                  selectedMode === "new" ? "Ex : FinTech, PropTech, SaaS RH..." :
                  selectedMode === "social" ? "Ex : linkedin.com/in/votre-profil" :
                  "Ex : intégrateurs, revendeurs, agences..."
                }
              />
            </div>
            <button
              className="px-5 py-3 rounded-[10px] font-semibold text-[13px] transition-all hover:brightness-110 whitespace-nowrap flex items-center gap-2"
              style={{ background: "var(--amber-fg)", color: "white" }}
            >
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/20">{mode.credits} cr</span>
              Lancer le scan →
            </button>
          </div>
        </section>

        {/* Results */}
        {hasResults && (
          <section
            className="rounded-[18px] p-6"
            style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.16em] mb-1" style={{ color: "var(--fg-mute)" }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--amber-fg)" }} />
                  Résultats du scan
                </div>
                <h2 className="font-display text-[20px] font-semibold" style={{ color: "var(--fg)" }}>
                  {MOCK_RESULTS.length} leads détectés
                </h2>
              </div>
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110"
                style={{ background: "var(--amber-fg)", color: "white" }}
              >
                <Download className="h-3.5 w-3.5" />
                Importer tout ({MOCK_RESULTS.length})
              </button>
            </div>

            <div className="space-y-2">
              {MOCK_RESULTS.map((lead) => (
                <div
                  key={lead.id}
                  className="flex items-center gap-4 px-4 py-4 rounded-[12px] transition-all hover:brightness-[0.97]"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
                >
                  {/* Avatar */}
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                    style={{ background: "var(--amber-soft)", color: "var(--amber-fg)" }}
                  >
                    {lead.initials}
                  </div>

                  {/* Name + location + size */}
                  <div className="w-44 shrink-0">
                    <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>{lead.name}</p>
                    <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>{lead.co} · {lead.city} · {lead.size}</p>
                  </div>

                  {/* Signal */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium truncate" style={{ color: "var(--amber-fg)" }}>⚡ {lead.signal}</p>
                    <p className="text-[11px] truncate" style={{ color: "var(--fg-mute)" }}>{lead.reason}</p>
                  </div>

                  {/* Score + temp */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded"
                      style={tempStyle(lead.temp)}
                    >
                      {lead.temp}
                    </span>
                    <span
                      className="text-[13px] font-mono font-bold"
                      style={{ color: lead.score >= 85 ? "var(--danger-fg)" : "var(--amber-fg)" }}
                    >
                      {lead.score}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      className="px-3 py-1.5 rounded-md text-[11.5px] font-medium transition-all"
                      style={{ background: "oklch(0.21 0.03 260 / 0.04)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
                    >
                      Voir
                    </button>
                    <button
                      className="px-3 py-1.5 rounded-md text-[11.5px] font-semibold transition-all hover:brightness-110"
                      style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-line)", color: "var(--amber-fg)" }}
                    >
                      Importer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
