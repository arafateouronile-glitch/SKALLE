"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import { Zap, RotateCcw, Copy, Check } from "lucide-react";
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

const GENERATED_VARIANTS: Record<Framework, { headline: string; body: string; cta: string }[]> = {
  avantapres: [
    { headline: "Avant : 40h/mois de prospection manuelle.", body: "Après SKALLE : 3h. L'IA détecte les signaux d'achat, génère les messages et relance automatiquement. Vos commerciaux se concentrent sur les deals.", cta: "Voir la démo →" },
    { headline: "Avant : 2% de taux de réponse.", body: "Après SKALLE : 18.4%. Chaque message est personnalisé sur les actualités LinkedIn de votre prospect. La différence, c'est l'intention.", cta: "Démarrer gratuitement →" },
    { headline: "Avant : pipeline imprévisible.", body: "Après SKALLE : pipeline qualifié en temps réel. L'agent score chaque lead sur 100 points et vous alerte quand c'est le bon moment.", cta: "Calculer mon ROI →" },
  ],
  pas: [
    { headline: "Votre équipe passe 80% du temps sur des leads froids.", body: "Sans scoring en temps réel, impossible de prioriser. Chaque deal raté coûte en moyenne €4 200 de temps commercial. SKALLE détecte les signaux d'achat avant vos concurrents.", cta: "Résoudre ce problème →" },
    { headline: "Vos concurrents vous contactent vos prospects en premier.", body: "Parce qu'ils ont les signaux. Levée de fonds, recrutement, croissance — SKALLE les capture et vous alerte instantanément.", cta: "Voir comment →" },
    { headline: "Vos messages outreach sont ignorés.", body: "Parce qu'ils ressemblent à ceux de tout le monde. L'IA SKALLE analyse le profil de chaque prospect et génère un message personnalisé sur mesure.", cta: "Tester maintenant →" },
  ],
  socialproof: [
    { headline: "\"On a signé 5 deals en 30 jours.\"", body: "— Thomas D., Directeur Commercial @ Mistral AI. SKALLE a détecté les signaux, généré les messages et relancé automatiquement. Résultat : ×14 ROI outreach.", cta: "Rejoindre 800+ équipes →" },
    { headline: "18.4% de taux de réponse moyen.", body: "Nos clients passent de 2% à 18% en 3 semaines. Pas de magie — juste la bonne personnalisation, au bon moment, sur le bon signal.", cta: "Voir les résultats →" },
    { headline: "€538k de pipeline généré ce mois.", body: "Par une équipe de 3 commerciaux. SKALLE automatise la prospection, le scoring et les relances. Vos commerciaux closent, l'IA prospecte.", cta: "Calculer votre potentiel →" },
  ],
  urgence: [
    { headline: "Offre lancement : -40% jusqu'au 31 mai.", body: "Les équipes sales qui adoptent l'IA maintenant auront 6 mois d'avance sur leurs concurrents. Chaque semaine de retard = opportunités perdues.", cta: "Bloquer mon prix →" },
    { headline: "14 places restantes pour l'onboarding Mai.", body: "Nous accompagnons chaque équipe individuellement. Une fois complet, le prochain slot ouvre en juillet. Ne ratez pas votre fenêtre.", cta: "Réserver ma place →" },
    { headline: "Vos concurrents s'équipent. Maintenant.", body: "68% des équipes sales B2B en France adoptent des outils IA en 2026. La fenêtre pour prendre de l'avance se ferme. Démarrez aujourd'hui.", cta: "Commencer maintenant →" },
  ],
};

export default function AdsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState("");
  const [activeFramework, setActiveFramework] = useState<Framework>("avantapres");
  const [launching, setLaunching] = useState(false);
  const [hasResults, setHasResults] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  function handleLaunch() {
    if (!prompt.trim()) { inputRef.current?.focus(); return; }
    setLaunching(true);
    setTimeout(() => {
      setLaunching(false);
      setHasResults(true);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }, 1200);
  }

  function handleCopy(text: string, idx: number) {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
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

            <div className="flex items-center gap-3 mb-6">
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
                disabled={launching}
                className="px-5 py-3 rounded-[10px] font-semibold text-[13px] transition-all hover:brightness-110 whitespace-nowrap flex items-center gap-2 disabled:opacity-70"
                style={{ background: "var(--amber-fg)", color: "white" }}
              >
                {!launching && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/20">50 cr</span>}
                {launching ? "Génération…" : "Lancer →"}
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
                        ? { background: "var(--amber-soft)", border: "2px solid var(--amber-fg)" }
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

        {/* Generated variants */}
        {hasResults && (
          <section ref={resultsRef}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-[20px] font-semibold" style={{ color: "var(--fg)" }}>
                3 variantes générées — {FRAMEWORKS.find(f => f.id === activeFramework)?.title}
              </h2>
              <span
                className="text-[11px] font-mono px-2.5 py-1 rounded-[6px]"
                style={{ background: "var(--amber-soft)", color: "var(--amber-fg)", border: "1px solid var(--amber-line)" }}
              >
                ✓ Pour : {prompt.length > 40 ? prompt.slice(0, 40) + "…" : prompt}
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {GENERATED_VARIANTS[activeFramework].map((v, i) => (
                <div
                  key={i}
                  className="rounded-[14px] p-5 flex flex-col gap-3"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--amber-line)", boxShadow: "var(--card-shadow)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: "var(--amber-soft)", color: "var(--amber-fg)" }}>
                      Variante {i + 1}
                    </span>
                    <button
                      onClick={() => handleCopy(`${v.headline}\n\n${v.body}\n\n${v.cta}`, i)}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-[6px] transition-all hover:brightness-110"
                      style={{ background: copiedIdx === i ? "var(--emerald-soft)" : "var(--bg)", color: copiedIdx === i ? "var(--emerald-fg)" : "var(--fg-mute)", border: "1px solid var(--line)" }}
                    >
                      {copiedIdx === i ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copiedIdx === i ? "Copié" : "Copier"}
                    </button>
                  </div>
                  <p className="text-[14px] font-semibold leading-snug" style={{ color: "var(--fg)" }}>{v.headline}</p>
                  <p className="text-[12.5px] leading-relaxed flex-1" style={{ color: "var(--fg-dim)" }}>{v.body}</p>
                  <div
                    className="text-center py-2 rounded-[8px] text-[12px] font-semibold"
                    style={{ background: "var(--amber-soft)", color: "var(--amber-fg)", border: "1px solid var(--amber-line)" }}
                  >
                    {v.cta}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => { setHasResults(false); setPrompt(""); }}
                className="px-4 py-2 rounded-[8px] text-[12px] font-medium transition-all hover:brightness-[0.97]"
                style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
              >
                Recommencer
              </button>
              <Link
                href="/marketing-os/insights"
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110"
                style={{ background: "var(--amber-fg)", color: "white" }}
              >
                Publier la campagne →
              </Link>
            </div>
          </section>
        )}

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
                  onClick={() => {
                    setPrompt(`Remixer : ${ad.hook}`);
                    setHasResults(false);
                    inputRef.current?.focus();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
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
