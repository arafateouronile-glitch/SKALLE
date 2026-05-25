"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppTopBar } from "@/components/modules/app-topbar";
import { Zap, RotateCcw } from "lucide-react";
import { Sparkline } from "@/components/ui/sparkline";

const FRAMEWORKS = [
  { id: "avantapres", title: "Avant / Après", desc: "Transformation claire, résultat visible" },
  { id: "pas", title: "PAS", desc: "Problème → Agitation → Solution" },
  { id: "socialproof", title: "Social Proof", desc: "Témoignage client + stats + autorité" },
  { id: "urgence", title: "Urgence", desc: "Deadline, rareté, opportunité limitée" },
] as const;

type Framework = (typeof FRAMEWORKS)[number]["id"];

const MOCK_CAMPAIGNS = [
  { name: "B2B SaaS — Q2 2026", spend: "€4 200", roas: "6.2×", cpl: "€32", ctr: "3.4%", spark: [22,26,24,28,32,30,34,38,36,40,44,48] as number[], color: "emerald" as const },
  { name: "Retargeting Visiteurs 30j", spend: "€1 800", roas: "4.1×", cpl: "€48", ctr: "2.1%", spark: [18,20,19,22,24,21,25,27,24,28,30,29] as number[], color: "violet" as const },
  { name: "Prospection LinkedIn", spend: "€2 100", roas: "2.8×", cpl: "€78", ctr: "1.8%", spark: [10,12,11,14,13,15,14,16,15,17,16,18] as number[], color: "amber" as const },
];

const COMPETITOR_ADS = [
  { co: "HubSpot", hook: "\"Stop manually qualifying leads. Let AI do it.\"", freq: "Fréquence 4.2", duration: "18j actif" },
  { co: "Pipedrive", hook: "\"Your pipeline is leaking. Here's the fix.\"", freq: "Fréquence 3.8", duration: "12j actif" },
  { co: "Lemlist", hook: "\"From 0 to 50 meetings/month — in 3 weeks\"", freq: "Fréquence 2.9", duration: "7j actif" },
];

export default function AdsPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [activeFramework, setActiveFramework] = useState<Framework>("avantapres");

  function handleLaunch() {
    if (!prompt.trim()) { inputRef.current?.focus(); return; }
    router.push("/marketing-os/ads");
  }

  return (
    <>
      <AppTopBar
        title="Ads"
        breadcrumb="marketing-os / ads"
        cta="Nouvelle campagne"
        onCta={() => inputRef.current?.focus()}
        accent="amber"
      />

      <div className="p-6 space-y-6 max-w-[1200px]">

        {/* Superscale Hero */}
        <section
          className="rounded-[18px] p-8 relative overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <div
            className="absolute -top-32 -right-32 w-80 h-80 rounded-full pointer-events-none"
            style={{ background: "radial-gradient(circle, var(--amber-soft), transparent 60%)", filter: "blur(40px)" }}
          />
          <div className="relative">
            <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] mb-3" style={{ color: "var(--fg-mute)" }}>
              <Zap className="h-3 w-3" style={{ color: "var(--amber-fg)" }} />
              Superscale Agent
            </div>
            <h1 className="font-display text-[32px] font-semibold mb-2" style={{ color: "var(--fg)" }}>
              Campagne complète en 5 minutes.
            </h1>
            <p className="text-[14px] mb-6 max-w-xl" style={{ color: "var(--fg-dim)" }}>
              L'agent analyse les pubs concurrentes actives, génère 3 variantes avec angles différents et crée les visuels en 3 formats.
            </p>

            <div className="flex items-center gap-3 mb-8">
              <div
                className="flex-1 flex items-center gap-3 px-4 py-3 rounded-[10px]"
                style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
              >
                <Zap className="h-4 w-4 shrink-0" style={{ color: "var(--amber-fg)" }} />
                <input
                  ref={inputRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLaunch()}
                  className="flex-1 bg-transparent text-[14px] outline-none placeholder:opacity-50"
                  style={{ color: "var(--fg)" }}
                  placeholder="Ex : Outil SaaS B2B pour les directeurs commerciaux..."
                />
              </div>
              <button
                onClick={handleLaunch}
                className="px-5 py-3 rounded-[10px] font-semibold text-[13px] transition-all hover:brightness-110 whitespace-nowrap flex items-center gap-2"
                style={{ background: "var(--amber-fg)", color: "white" }}
              >
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/20">50 cr</span>
                Lancer →
              </button>
            </div>

            {/* Frameworks */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {FRAMEWORKS.map((f) => {
                const active = activeFramework === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setActiveFramework(f.id)}
                    className="text-left p-4 rounded-[12px] transition-all hover:brightness-[0.97]"
                    style={
                      active
                        ? { background: "var(--amber-soft)", border: "1px solid var(--amber-line)" }
                        : { background: "var(--bg)", border: "1px solid var(--line)" }
                    }
                  >
                    <p className="text-[13px] font-semibold mb-0.5" style={{ color: active ? "var(--amber-fg)" : "var(--fg)" }}>{f.title}</p>
                    <p className="text-[11.5px]" style={{ color: "var(--fg-mute)" }}>{f.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Campaigns table */}
        <section
          className="rounded-[18px] p-6"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <h2 className="font-display text-[20px] font-semibold mb-5" style={{ color: "var(--fg)" }}>Campagnes actives</h2>
          <div className="space-y-2">
            <div
              className="grid gap-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider"
              style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 100px", color: "var(--fg-mute)" }}
            >
              <span>Campagne</span><span>Dépense</span><span>ROAS</span><span>CPL</span><span>CTR</span><span>Perf. 7j</span>
            </div>
            {MOCK_CAMPAIGNS.map((c) => (
              <Link
                key={c.name}
                href="/marketing-os/insights"
                className="grid items-center gap-4 px-4 py-3 rounded-[12px] transition-all hover:brightness-[0.97]"
                style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 100px", background: "var(--bg)", border: "1px solid var(--line)" }}
              >
                <span className="text-[13px] font-medium truncate" style={{ color: "var(--fg)" }}>{c.name}</span>
                <span className="text-[13px] tabular-nums" style={{ color: "var(--fg-dim)" }}>{c.spend}</span>
                <span className="text-[13px] font-semibold tabular-nums" style={{ color: `var(--${c.color}-fg)` }}>{c.roas}</span>
                <span className="text-[13px] tabular-nums" style={{ color: "var(--fg-dim)" }}>{c.cpl}</span>
                <span className="text-[13px] tabular-nums" style={{ color: "var(--fg-dim)" }}>{c.ctr}</span>
                <div className="h-8 -my-1">
                  <Sparkline data={c.spark} color={c.color} height={32} />
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Competitor ads */}
        <section>
          <h2 className="font-display text-[20px] font-semibold mb-4" style={{ color: "var(--fg)" }}>
            Pubs concurrentes détectées
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {COMPETITOR_ADS.map((ad) => (
              <div
                key={ad.co}
                className="rounded-[14px] p-5"
                style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>{ad.co}</p>
                  <div className="flex items-center gap-2 text-[11px] font-mono" style={{ color: "var(--fg-mute)" }}>
                    <span>{ad.freq}</span>
                    <span>·</span>
                    <span>{ad.duration}</span>
                  </div>
                </div>
                <p className="text-[13px] italic mb-4" style={{ color: "var(--fg-dim)" }}>{ad.hook}</p>
                <button
                  onClick={() => { setPrompt(`Remixer : ${ad.hook}`); inputRef.current?.focus(); }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-md text-[12px] font-medium transition-all hover:brightness-110"
                  style={{ background: "var(--amber-soft)", border: "1px solid var(--amber-line)", color: "var(--amber-fg)" }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  ↻ Remixer
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
