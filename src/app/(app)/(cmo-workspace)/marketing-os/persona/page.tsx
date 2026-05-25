"use client";

import { useState, useEffect } from "react";
import { AppTopBar } from "@/components/modules/app-topbar";
import { Users, ChevronDown, ChevronRight, Check, Plus, X, Save, RefreshCw, Sparkles } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type FunnelFocus = "awareness" | "consideration" | "decision";

interface ICP {
  jobTitles: string[];
  painPoints: string[];
  objections: string[];
  industries: string[];
  funnelFocus: FunnelFocus;
}

// ─── Tag input ────────────────────────────────────────────────────────────────

function TagInput({
  label, hint, tags, onChange, placeholder, examples,
}: {
  label: string; hint?: string; tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string; examples?: string[];
}) {
  const [val, setVal] = useState("");

  function add(raw: string) {
    const trimmed = raw.trim();
    if (trimmed && !tags.includes(trimmed)) onChange([...tags, trimmed]);
    setVal("");
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>{label}</p>
        {hint && <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>{hint}</p>}
      </div>
      <div
        className="flex flex-wrap gap-1.5 p-3 rounded-[10px] min-h-[52px] cursor-text"
        style={{ background: "var(--bg)", border: "1px solid var(--line)" }}
        onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus()}
      >
        {tags.map((t) => (
          <span key={t}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[12px] font-medium"
            style={{ background: "var(--emerald-soft)", color: "var(--emerald-fg)", border: "1px solid var(--emerald-line)" }}>
            {t}
            <button onClick={(e) => { e.stopPropagation(); onChange(tags.filter((x) => x !== t)); }} className="opacity-60 hover:opacity-100">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(val); }
            if (e.key === "Backspace" && !val && tags.length > 0) onChange(tags.slice(0, -1));
          }}
          onBlur={() => { if (val.trim()) add(val); }}
          placeholder={tags.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[160px] bg-transparent text-[12.5px] outline-none placeholder:opacity-40"
          style={{ color: "var(--fg)" }}
        />
      </div>
      {examples && examples.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {examples.filter((e) => !tags.includes(e)).map((ex) => (
            <button key={ex} onClick={() => onChange([...tags, ex])}
              className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-[5px] transition-all hover:brightness-110"
              style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-mute)" }}>
              <Plus className="h-2.5 w-2.5" /> {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const FUNNEL_OPTIONS: { id: FunnelFocus; title: string; desc: string; color: string; bg: string; border: string }[] = [
  { id: "awareness",     title: "Notoriété",  desc: "Faire découvrir le problème et la marque",   color: "var(--violet-fg)",  bg: "var(--violet-soft)",  border: "var(--violet-line)"  },
  { id: "consideration", title: "Évaluation", desc: "Aider à comparer et à se projeter",          color: "var(--amber-fg)",   bg: "var(--amber-soft)",   border: "var(--amber-line)"   },
  { id: "decision",      title: "Décision",   desc: "Convaincre de passer à l'action maintenant", color: "var(--emerald-fg)", bg: "var(--emerald-soft)", border: "var(--emerald-line)" },
];

const EXAMPLES = {
  jobTitles: ["Directeur Commercial", "CMO", "Head of Growth", "VP Sales", "DG PME", "Fondateur", "Responsable Marketing"],
  painPoints: ["Prospection manuelle chronophage", "Pipeline imprévisible", "Faible taux de conversion", "Coût d'acquisition trop élevé", "Manque de temps", "Équipe pas assez senior", "ROI marketing flou"],
  objections: ["Trop cher", "Pas le temps de le mettre en place", "Déjà un outil concurrent", "On le fait en interne", "Budget bloqué jusqu'à Q3", "On attend le prochain semestre"],
  industries: ["SaaS B2B", "Fintech", "Agence", "E-commerce", "Conseil / Coaching", "Industrie", "RH & Recrutement", "Santé"],
};

const DEFAULT_ICP: ICP = {
  jobTitles: [], painPoints: [], objections: [], industries: [],
  funnelFocus: "consideration",
};

export default function PersonaPage() {
  const [icp, setICP]           = useState<ICP>(DEFAULT_ICP);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Load saved ICP from brandVoice
  useEffect(() => {
    fetch("/api/social/batch-posts")
      .then((r) => r.json() as Promise<{ icp?: ICP }>)
      .then((d) => { if (d.icp) setICP(d.icp); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function update(patch: Partial<ICP>) {
    setICP((prev) => ({ ...prev, ...patch }));
    setHasChanges(true);
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/social/batch-posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icp }),
      });
      if (!res.ok) throw new Error("Erreur de sauvegarde");
      setSaved(true);
      setHasChanges(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  const completionScore = [
    icp.jobTitles.length > 0,
    icp.painPoints.length > 0,
    icp.objections.length > 0,
    icp.industries.length > 0,
  ].filter(Boolean).length;

  return (
    <>
      <AppTopBar
        title="Persona client (ICP)"
        breadcrumb="marketing-os / persona"
        accent="emerald"
      />

      <div className="p-6 space-y-6 max-w-[860px]">

        {/* Intro card */}
        <section
          className="rounded-[18px] p-6 flex items-start gap-4"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <div
            className="w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0"
            style={{ background: "var(--emerald-soft)" }}
          >
            <Users className="h-5 w-5" style={{ color: "var(--emerald-fg)" }} />
          </div>
          <div className="flex-1">
            <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--fg)" }}>
              Définissez votre client idéal (ICP)
            </p>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
              Ces données enrichissent automatiquement la génération de posts sociaux, les emails outreach et les scripts de vente. Plus votre ICP est précis, plus le contenu généré parle directement à vos prospects.
            </p>
          </div>
          {/* Completion meter */}
          <div className="shrink-0 text-right">
            <p className="text-[11px] font-mono mb-1" style={{ color: "var(--fg-mute)" }}>Complétude</p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i}
                  className="w-8 h-1.5 rounded-full"
                  style={{ background: i <= completionScore ? "var(--emerald-fg)" : "var(--line-strong)" }}
                />
              ))}
              <span className="ml-1.5 text-[11px] font-semibold" style={{ color: "var(--emerald-fg)" }}>
                {completionScore}/4
              </span>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-[13px]" style={{ color: "var(--fg-mute)" }}>
            <RefreshCw className="h-4 w-4 animate-spin" />
            Chargement du profil…
          </div>
        ) : (
          <>
            {/* Section 1 : Qui */}
            <section
              className="rounded-[18px] p-6 space-y-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.15em]" style={{ color: "var(--fg-mute)" }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--violet-fg)", color: "white" }}>1</span>
                Qui est votre client idéal ?
              </div>

              <TagInput
                label="Titres de poste ciblés"
                hint="Appuyez sur Entrée ou virgule pour ajouter"
                tags={icp.jobTitles}
                onChange={(v) => update({ jobTitles: v })}
                placeholder="Ex : Directeur Commercial, CMO…"
                examples={EXAMPLES.jobTitles}
              />

              <TagInput
                label="Industries cibles"
                tags={icp.industries}
                onChange={(v) => update({ industries: v })}
                placeholder="Ex : SaaS B2B, Fintech, E-commerce…"
                examples={EXAMPLES.industries}
              />
            </section>

            {/* Section 2 : Problèmes */}
            <section
              className="rounded-[18px] p-6 space-y-5"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.15em]" style={{ color: "var(--fg-mute)" }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--amber-fg)", color: "white" }}>2</span>
                Ses problèmes & objections
              </div>

              <TagInput
                label="Pain points principaux"
                hint="Ce qui le frustre / lui coûte de l'argent"
                tags={icp.painPoints}
                onChange={(v) => update({ painPoints: v })}
                placeholder="Ex : Prospection manuelle trop longue…"
                examples={EXAMPLES.painPoints}
              />

              <TagInput
                label="Objections fréquentes"
                hint="Ce qu'il dit quand il ne convertit pas"
                tags={icp.objections}
                onChange={(v) => update({ objections: v })}
                placeholder="Ex : Trop cher, pas le temps…"
                examples={EXAMPLES.objections}
              />
            </section>

            {/* Section 3 : Funnel */}
            <section
              className="rounded-[18px] p-6 space-y-4"
              style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.15em]" style={{ color: "var(--fg-mute)" }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--emerald-fg)", color: "white" }}>3</span>
                Priorité dans le funnel
              </div>
              <p className="text-[12.5px]" style={{ color: "var(--fg-dim)" }}>
                À quelle étape du parcours d'achat se trouve principalement votre audience cible ?
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {FUNNEL_OPTIONS.map((f) => {
                  const active = icp.funnelFocus === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => update({ funnelFocus: f.id })}
                      className="text-left p-4 rounded-[12px] transition-all hover:brightness-[0.97]"
                      style={active
                        ? { background: f.bg, border: `2px solid ${f.color}` }
                        : { background: "var(--bg)", border: "1px solid var(--line)" }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[13px] font-semibold" style={{ color: active ? f.color : "var(--fg)" }}>{f.title}</p>
                        {active && <Check className="h-4 w-4" style={{ color: f.color }} />}
                      </div>
                      <p className="text-[11.5px] leading-snug" style={{ color: "var(--fg-mute)" }}>{f.desc}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Impact card */}
            {completionScore >= 2 && (
              <section
                className="rounded-[18px] p-5 flex items-start gap-3"
                style={{ background: "var(--violet-soft)", border: "1px solid var(--violet-line)" }}
              >
                <Sparkles className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--violet-fg)" }} />
                <div>
                  <p className="text-[13px] font-semibold mb-1" style={{ color: "var(--violet-fg)" }}>
                    Ce persona est actif sur toute la plateforme
                  </p>
                  <p className="text-[12px] leading-relaxed" style={{ color: "var(--fg-dim)" }}>
                    Il sera injecté automatiquement dans la génération de 30 posts sociaux, les emails outreach, les scripts de vente CSO et les analyses concurrentielles Spy.
                  </p>
                </div>
              </section>
            )}

            {/* Save bar */}
            {error && (
              <div className="px-4 py-3 rounded-[10px] text-[13px]"
                style={{ background: "var(--danger-soft)", border: "1px solid var(--danger-line)", color: "var(--danger-fg)" }}>
                {error}
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-[12px]" style={{ color: "var(--fg-mute)" }}>
                {hasChanges ? "Modifications non sauvegardées" : saved ? "✓ Sauvegardé" : ""}
              </p>
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges}
                className="flex items-center gap-2 px-6 py-2.5 rounded-[10px] text-[13px] font-semibold transition-all hover:brightness-110 disabled:opacity-50"
                style={{ background: "var(--emerald-fg)", color: "white" }}
              >
                {saving
                  ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Sauvegarde…</>
                  : saved
                  ? <><Check className="h-3.5 w-3.5" /> Sauvegardé</>
                  : <><Save className="h-3.5 w-3.5" /> Sauvegarder le persona</>
                }
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
