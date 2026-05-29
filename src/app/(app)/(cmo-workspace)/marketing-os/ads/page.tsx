"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { AppTopBar } from "@/components/modules/app-topbar";
import { Zap, RotateCcw, Copy, Check, Loader2, AlertTriangle } from "lucide-react";
import { Sparkline } from "@/components/ui/sparkline";
import { getUserWorkspace } from "@/actions/leads";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdVariant {
  id: string;
  angle: string;
  framework: string;
  primaryText: string;
  headline: string;
  subheadline: string;
}

interface CampaignListItem {
  id: string;
  niche: string;
  status: "GENERATING" | "READY" | "FAILED" | "EXPORTED";
  createdAt: string;
  variants: { id: string; framework: string; angle: string }[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

const FRAMEWORKS = [
  { id: "avantapres", title: "Avant / Après", desc: "Transformation claire, résultat visible" },
  { id: "pas", title: "PAS", desc: "Problème → Agitation → Solution" },
  { id: "socialproof", title: "Social Proof", desc: "Témoignage client + stats + autorité" },
  { id: "urgence", title: "Urgence", desc: "Deadline, rareté, opportunité limitée" },
] as const;

type Framework = (typeof FRAMEWORKS)[number]["id"];

const STATUS_LABELS: Record<CampaignListItem["status"], string> = {
  GENERATING: "En cours",
  READY: "Prête",
  FAILED: "Échouée",
  EXPORTED: "Exportée",
};

const STATUS_STYLES: Record<CampaignListItem["status"], { bg: string; color: string }> = {
  GENERATING: { bg: "var(--amber-soft)", color: "var(--amber-fg)" },
  READY: { bg: "var(--emerald-soft)", color: "var(--emerald-fg)" },
  FAILED: { bg: "var(--danger-soft)", color: "var(--danger-fg)" },
  EXPORTED: { bg: "var(--violet-soft)", color: "var(--violet-fg)" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [activeFramework, setActiveFramework] = useState<Framework>("avantapres");
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variants, setVariants] = useState<AdVariant[]>([]);
  const [generatedFor, setGeneratedFor] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  useEffect(() => {
    getUserWorkspace().then((r) => {
      if (r.success && r.workspaceId) setWorkspaceId(r.workspaceId);
    });
  }, []);

  const fetchCampaigns = useCallback(async () => {
    const res = await fetch("/api/superscale-ads/generate").catch(() => null);
    if (res?.ok) {
      const data = await res.json() as { campaigns: CampaignListItem[] };
      setCampaigns(data.campaigns ?? []);
    }
    setLoadingCampaigns(false);
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  async function handleLaunch() {
    if (!prompt.trim()) { inputRef.current?.focus(); return; }
    if (!workspaceId) return;
    setLaunching(true);
    setError(null);
    setVariants([]);

    try {
      const res = await fetch("/api/superscale-ads/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: prompt.trim(), workspaceId }),
      });
      const data = await res.json() as { campaignId?: string; error?: string };
      if (!res.ok || !data.campaignId) {
        setError(data.error ?? "Erreur lors du lancement");
        setLaunching(false);
        return;
      }

      const { campaignId } = data;
      setGeneratedFor(prompt.trim());

      // Poll until READY or FAILED
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const pollRes = await fetch(`/api/superscale-ads/${campaignId}`).catch(() => null);
        if (!pollRes?.ok) return;
        const campaign = await pollRes.json() as { status: string; variants: AdVariant[]; errorMessage?: string };
        if (campaign.status === "READY") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setVariants(campaign.variants);
          setLaunching(false);
          await fetchCampaigns();
          setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
        } else if (campaign.status === "FAILED") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setError(campaign.errorMessage ?? "La génération a échoué");
          setLaunching(false);
        }
      }, 3_000);
    } catch {
      setError("Erreur réseau");
      setLaunching(false);
    }
  }

  function handleCopy(text: string, idx: number) {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  // Filter displayed variants by selected framework (best-effort match)
  const filteredVariants = variants.filter(
    (v) => !v.framework || v.framework.toLowerCase().includes(activeFramework.toLowerCase().slice(0, 3))
  ).slice(0, 3).length > 0
    ? variants.filter((v) => v.framework.toLowerCase().includes(activeFramework.toLowerCase().slice(0, 3))).slice(0, 3)
    : variants.slice(0, 3);

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
              L&apos;agent analyse les pubs concurrentes actives, génère 3 variantes avec angles différents et crée les visuels en 3 formats.
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
                  disabled={launching}
                  className="flex-1 bg-transparent text-[14px] outline-none placeholder:opacity-50 disabled:opacity-60"
                  style={{ color: "var(--fg)" }}
                  placeholder="Ex : Outil SaaS B2B pour les directeurs commerciaux..."
                />
              </div>
              <button
                onClick={handleLaunch}
                disabled={launching || !workspaceId}
                className="px-5 py-3 rounded-[10px] font-semibold text-[13px] transition-all hover:brightness-110 whitespace-nowrap flex items-center gap-2 disabled:opacity-70"
                style={{ background: "var(--amber-fg)", color: "white" }}
              >
                {launching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/20">50 cr</span>
                )}
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

        {/* Generating progress */}
        {launching && (
          <section
            className="rounded-[18px] p-6 flex flex-col items-center gap-4"
            style={{ background: "var(--bg-card)", border: "1px solid var(--amber-line)" }}
          >
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--amber-fg)" }} />
            <p className="text-[14px] font-medium" style={{ color: "var(--fg)" }}>Génération en cours…</p>
            <p className="text-[12px]" style={{ color: "var(--fg-mute)" }}>Analyse des pubs concurrentes + copywriting IA (~1–2 min)</p>
          </section>
        )}

        {/* Generated variants */}
        {filteredVariants.length > 0 && (
          <section ref={resultsRef}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-[20px] font-semibold" style={{ color: "var(--fg)" }}>
                {filteredVariants.length} variante{filteredVariants.length !== 1 ? "s" : ""} générée{filteredVariants.length !== 1 ? "s" : ""}
              </h2>
              <span
                className="text-[11px] font-mono px-2.5 py-1 rounded-[6px]"
                style={{ background: "var(--amber-soft)", color: "var(--amber-fg)", border: "1px solid var(--amber-line)" }}
              >
                ✓ Pour : {generatedFor.length > 40 ? generatedFor.slice(0, 40) + "…" : generatedFor}
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {filteredVariants.map((v, i) => (
                <div
                  key={v.id}
                  className="rounded-[14px] p-5 flex flex-col gap-3"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--amber-line)", boxShadow: "var(--card-shadow)" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded w-fit" style={{ background: "var(--amber-soft)", color: "var(--amber-fg)" }}>
                        Variante {i + 1}
                      </span>
                      {v.angle && (
                        <span className="text-[10px]" style={{ color: "var(--fg-mute)" }}>{v.angle}</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleCopy(`${v.headline}\n\n${v.primaryText}`, i)}
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-[6px] transition-all hover:brightness-110 shrink-0"
                      style={{ background: copiedIdx === i ? "var(--emerald-soft)" : "var(--bg)", color: copiedIdx === i ? "var(--emerald-fg)" : "var(--fg-mute)", border: "1px solid var(--line)" }}
                    >
                      {copiedIdx === i ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copiedIdx === i ? "Copié" : "Copier"}
                    </button>
                  </div>
                  <p className="text-[14px] font-semibold leading-snug" style={{ color: "var(--fg)" }}>{v.headline}</p>
                  {v.subheadline && (
                    <p className="text-[12px] font-medium" style={{ color: "var(--fg-dim)" }}>{v.subheadline}</p>
                  )}
                  <p className="text-[12.5px] leading-relaxed flex-1" style={{ color: "var(--fg-dim)" }}>{v.primaryText}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <Link
                href="/marketing-os/superscale-ads"
                className="px-4 py-2 rounded-[8px] text-[12px] font-medium transition-all hover:brightness-[0.97]"
                style={{ background: "var(--bg)", border: "1px solid var(--line)", color: "var(--fg-dim)" }}
              >
                Voir les visuels →
              </Link>
              <button
                onClick={() => { setVariants([]); setPrompt(""); setError(null); }}
                className="px-4 py-2 rounded-[8px] text-[12px] font-semibold transition-all hover:brightness-110"
                style={{ background: "var(--amber-fg)", color: "white" }}
              >
                Nouvelle campagne
              </button>
            </div>
          </section>
        )}

        {/* Campaigns table */}
        <section
          className="rounded-[18px] p-6"
          style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
        >
          <h2 className="font-display text-[20px] font-semibold mb-5" style={{ color: "var(--fg)" }}>Campagnes générées</h2>

          {loadingCampaigns ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--amber-fg)" }} />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-[13px]" style={{ color: "var(--fg-mute)" }}>Aucune campagne — lancez votre première ci-dessus.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div
                className="grid gap-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider"
                style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr", color: "var(--fg-mute)" }}
              >
                <span>Niche / Campagne</span><span>Statut</span><span>Variantes</span><span>Date</span>
              </div>
              {campaigns.map((c) => {
                const ss = STATUS_STYLES[c.status];
                return (
                  <Link
                    key={c.id}
                    href={`/marketing-os/superscale-ads?campaignId=${c.id}`}
                    className="grid items-center gap-4 px-4 py-3 rounded-[12px] transition-all hover:brightness-[0.97]"
                    style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr", background: "var(--bg)", border: "1px solid var(--line)" }}
                  >
                    <span className="text-[13px] font-medium truncate" style={{ color: "var(--fg)" }}>{c.niche}</span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded w-fit"
                      style={{ background: ss.bg, color: ss.color }}
                    >
                      {STATUS_LABELS[c.status]}
                    </span>
                    <span className="text-[13px] tabular-nums" style={{ color: "var(--fg-dim)" }}>
                      {c.variants.length} variante{c.variants.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-[12px]" style={{ color: "var(--fg-mute)" }}>
                      {new Date(c.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* Competitor ads — decorative prompt inspiration */}
        <section>
          <h2 className="font-display text-[20px] font-semibold mb-4" style={{ color: "var(--fg)" }}>
            Inspiration concurrents
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {[
              { co: "HubSpot", hook: "\"Stop manually qualifying leads. Let AI do it.\"" },
              { co: "Pipedrive", hook: "\"Your pipeline is leaking. Here's the fix.\"" },
              { co: "Lemlist", hook: "\"From 0 to 50 meetings/month — in 3 weeks\"" },
            ].map((ad) => (
              <div
                key={ad.co}
                className="rounded-[14px] p-5"
                style={{ background: "var(--bg-card)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
              >
                <p className="text-[13px] font-semibold mb-3" style={{ color: "var(--fg)" }}>{ad.co}</p>
                <p className="text-[13px] italic mb-4" style={{ color: "var(--fg-dim)" }}>{ad.hook}</p>
                <button
                  onClick={() => {
                    setPrompt(`Remixer : ${ad.hook}`);
                    setVariants([]);
                    setError(null);
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
