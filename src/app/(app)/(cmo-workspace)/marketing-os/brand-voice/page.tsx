"use client";

import { useState, useEffect, useRef } from "react";
import { AppTopBar } from "@/components/modules/app-topbar";
import {
  Globe,
  Sparkles,
  Loader2,
  CheckCircle,
  AlertCircle,
  Plus,
  X,
  RefreshCw,
  Save,
  Mic,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BrandVoice {
  websiteUrl?: string;
  offer?: string;
  uniqueValue?: string;
  targetAudience?: string;
  targetResult?: string;
  socialProof?: string;
  productFeatures?: string[];
  tone?: "formal" | "professional" | "friendly";
  websiteEnrichedAt?: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BrandVoicePage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [bv, setBv] = useState<BrandVoice>({});
  const [loading, setLoading] = useState(true);

  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeSuccess, setAnalyzeSuccess] = useState(false);

  // Features editor
  const [features, setFeatures] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState("");
  const [savingFeatures, setSavingFeatures] = useState(false);
  const [savedFeatures, setSavedFeatures] = useState(false);

  // Tone editor
  const [tone, setTone] = useState<"formal" | "professional" | "friendly">("professional");
  const [savingTone, setSavingTone] = useState(false);

  // Inline field editing
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingField, setSavingField] = useState(false);

  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/brand-voice")
      .then((r) => r.json())
      .then((data: { workspaceId?: string; brandVoice?: BrandVoice }) => {
        if (data.workspaceId) setWorkspaceId(data.workspaceId);
        if (data.brandVoice) {
          setBv(data.brandVoice);
          setUrl(data.brandVoice.websiteUrl ?? "");
          setFeatures(data.brandVoice.productFeatures ?? []);
          setTone(data.brandVoice.tone ?? "professional");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleAnalyze() {
    if (!url.trim() || !workspaceId || isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    setAnalyzeSuccess(false);

    try {
      const res = await fetch("/api/brand-voice/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, websiteUrl: url.trim() }),
      });
      const data = await res.json() as { extracted?: BrandVoice; error?: string };
      if (!res.ok) {
        setAnalyzeError(data.error ?? "Erreur lors de l'analyse.");
        return;
      }
      const extracted = data.extracted ?? {};
      setBv((prev) => ({
        ...prev,
        ...extracted,
        websiteUrl: url.trim(),
        websiteEnrichedAt: new Date().toISOString(),
      }));
      if (extracted.productFeatures?.length) setFeatures(extracted.productFeatures);
      if (extracted.tone) setTone(extracted.tone);
      setAnalyzeSuccess(true);
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setAnalyzeSuccess(false), 4000);
    } catch {
      setAnalyzeError("Erreur réseau. Vérifiez votre connexion.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleSaveTone(newTone: "formal" | "professional" | "friendly") {
    if (!workspaceId) return;
    setTone(newTone);
    setSavingTone(true);
    await fetch("/api/brand-voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, patch: { tone: newTone } }),
    }).catch(() => {});
    setSavingTone(false);
  }

  async function handleSaveFeatures() {
    if (!workspaceId) return;
    setSavingFeatures(true);
    await fetch("/api/brand-voice/features", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, productFeatures: features }),
    }).catch(() => {});
    setSavingFeatures(false);
    setSavedFeatures(true);
    setTimeout(() => setSavedFeatures(false), 2000);
  }

  function addFeature() {
    const trimmed = newFeature.trim();
    if (!trimmed || features.includes(trimmed)) return;
    setFeatures((prev) => [...prev, trimmed]);
    setNewFeature("");
  }

  function startEditField(field: string, currentValue: string) {
    setEditingField(field);
    setEditValue(currentValue);
  }

  async function saveField(field: string) {
    if (!workspaceId) return;
    setSavingField(true);
    const patch = { [field]: editValue.trim() };
    await fetch("/api/brand-voice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, patch }),
    }).catch(() => {});
    setBv((prev) => ({ ...prev, [field]: editValue.trim() }));
    setEditingField(null);
    setSavingField(false);
  }

  const enrichedAt = bv.websiteEnrichedAt
    ? new Date(bv.websiteEnrichedAt).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const hasData = !!(bv.offer || bv.uniqueValue || bv.targetAudience);

  return (
    <>
      <AppTopBar
        title="Brand Voice"
        subtitle="Ton de marque extrait de votre site · utilisé par tous les agents IA"
        breadcrumb="marketing-os/brand-voice"
        accent="emerald"
      />

      <div className="p-6 max-w-[960px] space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: "var(--fg-muted)" }} />
          </div>
        ) : (
          <>
            {/* ─── URL Analyser ──────────────────────────────────────────────── */}
            <div
              className="rounded-[20px] p-6 space-y-4"
              style={{ background: "var(--bg)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center gap-2.5">
                <Globe size={18} style={{ color: "var(--emerald-fg)" }} />
                <div>
                  <p className="font-semibold text-sm" style={{ color: "var(--fg)" }}>
                    Analyse de site web
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--fg-muted)" }}>
                    Claude scrape votre site et extrait automatiquement l&apos;offre, l&apos;audience, la valeur unique et le ton de marque.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                  placeholder="https://votresite.fr"
                  className="flex-1 rounded-[10px] px-4 py-2.5 text-sm"
                  style={{
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--line)",
                    color: "var(--fg)",
                  }}
                />
                <button
                  onClick={handleAnalyze}
                  disabled={!url.trim() || isAnalyzing}
                  className="inline-flex items-center gap-2 rounded-[10px] px-5 py-2.5 text-sm font-semibold transition-all"
                  style={{
                    background: url.trim() && !isAnalyzing ? "var(--emerald-fg)" : "var(--line)",
                    color: url.trim() && !isAnalyzing ? "#fff" : "var(--fg-muted)",
                    cursor: url.trim() && !isAnalyzing ? "pointer" : "not-allowed",
                  }}
                >
                  {isAnalyzing ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : analyzeSuccess ? (
                    <CheckCircle size={15} />
                  ) : (
                    <Sparkles size={15} />
                  )}
                  {isAnalyzing ? "Analyse..." : analyzeSuccess ? "Mis à jour !" : enrichedAt ? "Ré-analyser" : "Analyser"}
                </button>
              </div>

              {analyzeError && (
                <div
                  className="flex items-center gap-2 rounded-[10px] px-4 py-3"
                  style={{ background: "var(--danger-soft)", border: "1px solid var(--danger-line)" }}
                >
                  <AlertCircle size={14} style={{ color: "var(--danger-fg)" }} />
                  <p className="text-xs" style={{ color: "var(--danger-fg)" }}>{analyzeError}</p>
                </div>
              )}

              {enrichedAt && (
                <div className="flex items-center gap-1.5">
                  <RefreshCw size={11} style={{ color: "var(--fg-muted)" }} />
                  <span className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                    Dernière analyse : {enrichedAt}
                  </span>
                </div>
              )}
            </div>

            {/* ─── Results ───────────────────────────────────────────────────── */}
            {hasData && (
              <div className="grid grid-cols-[1.3fr_1fr] gap-5 items-start">
                {/* Left — extracted fields */}
                <div
                  className="rounded-[20px] p-6 space-y-4"
                  style={{ background: "var(--bg)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles size={15} style={{ color: "var(--emerald-fg)" }} />
                    <span className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
                      Extraction IA
                    </span>
                    <span className="text-[10px] ml-auto" style={{ color: "var(--fg-muted)" }}>
                      Cliquez sur un champ pour modifier
                    </span>
                  </div>

                  <div className="space-y-3">
                    {(
                      [
                        { key: "offer", label: "Offre produit" },
                        { key: "uniqueValue", label: "Valeur unique" },
                        { key: "targetAudience", label: "Audience cible" },
                        { key: "targetResult", label: "Résultat client" },
                        { key: "socialProof", label: "Preuves sociales" },
                      ] as const
                    ).map(({ key, label }) => {
                      const value = bv[key] as string | undefined;
                      if (!value) return null;
                      const isEditing = editingField === key;
                      return (
                        <div key={key}>
                          <p
                            className="text-[9px] font-semibold uppercase tracking-wider mb-1"
                            style={{ color: "var(--emerald-fg)" }}
                          >
                            {label}
                          </p>
                          {isEditing ? (
                            <div className="space-y-1.5">
                              <textarea
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                rows={3}
                                autoFocus
                                className="w-full rounded-[8px] px-3 py-2 text-xs resize-none"
                                style={{
                                  background: "var(--bg-secondary)",
                                  border: "1px solid var(--emerald-line)",
                                  color: "var(--fg)",
                                }}
                              />
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => saveField(key)}
                                  disabled={savingField}
                                  className="inline-flex items-center gap-1 rounded-[6px] px-2.5 py-1 text-[10px] font-semibold"
                                  style={{ background: "var(--emerald-fg)", color: "#fff" }}
                                >
                                  {savingField ? <Loader2 size={9} className="animate-spin" /> : <Save size={9} />}
                                  Enregistrer
                                </button>
                                <button
                                  onClick={() => setEditingField(null)}
                                  className="inline-flex items-center gap-1 rounded-[6px] px-2.5 py-1 text-[10px]"
                                  style={{ border: "1px solid var(--line)", color: "var(--fg-muted)" }}
                                >
                                  Annuler
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => startEditField(key, value)}
                              className="w-full text-left rounded-[8px] px-3 py-2 text-xs leading-relaxed transition-colors"
                              style={{
                                background: "var(--bg-secondary)",
                                border: "1px solid var(--line)",
                                color: "var(--fg)",
                              }}
                            >
                              {value}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right — tone + features */}
                <div className="space-y-4">
                  {/* Tone selector */}
                  <div
                    className="rounded-[20px] p-5 space-y-3"
                    style={{ background: "var(--bg)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
                  >
                    <div className="flex items-center gap-2">
                      <Mic size={15} style={{ color: "var(--emerald-fg)" }} />
                      <span className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
                        Ton de marque
                      </span>
                      {savingTone && (
                        <Loader2 size={11} className="animate-spin ml-auto" style={{ color: "var(--fg-muted)" }} />
                      )}
                    </div>
                    <div className="space-y-2">
                      {(
                        [
                          { id: "formal", label: "Formel", desc: "Sérieux, institutionnel, B2B traditionnel" },
                          { id: "professional", label: "Professionnel", desc: "Expert, direct, confiant — défaut" },
                          { id: "friendly", label: "Friendly", desc: "Chaleureux, accessible, startup" },
                        ] as const
                      ).map((t) => (
                        <button
                          key={t.id}
                          onClick={() => handleSaveTone(t.id)}
                          className="w-full rounded-[10px] p-3 text-left transition-all"
                          style={{
                            background: tone === t.id ? "var(--emerald-soft)" : "var(--bg-secondary)",
                            border: `1px solid ${tone === t.id ? "var(--emerald-line)" : "var(--line)"}`,
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className="text-xs font-semibold"
                              style={{ color: tone === t.id ? "var(--emerald-fg)" : "var(--fg)" }}
                            >
                              {t.label}
                            </span>
                            {tone === t.id && <CheckCircle size={13} style={{ color: "var(--emerald-fg)" }} />}
                          </div>
                          <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
                            {t.desc}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Features editor */}
                  <div
                    className="rounded-[20px] p-5 space-y-3"
                    style={{ background: "var(--bg)", border: "1px solid var(--line)", boxShadow: "var(--card-shadow)" }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
                        Fonctionnalités clés
                      </span>
                      {features.length > 0 && (
                        <button
                          onClick={handleSaveFeatures}
                          disabled={savingFeatures}
                          className="inline-flex items-center gap-1 rounded-[6px] px-2.5 py-1 text-[10px] font-semibold transition-all"
                          style={{
                            background: savedFeatures ? "var(--emerald-fg)" : "var(--bg-secondary)",
                            border: "1px solid var(--line)",
                            color: savedFeatures ? "#fff" : "var(--fg-muted)",
                          }}
                        >
                          {savingFeatures ? (
                            <Loader2 size={9} className="animate-spin" />
                          ) : savedFeatures ? (
                            <CheckCircle size={9} />
                          ) : (
                            <Save size={9} />
                          )}
                          {savedFeatures ? "Enregistré !" : "Enregistrer"}
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {features.map((f) => (
                        <span
                          key={f}
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                          style={{
                            background: "var(--emerald-soft)",
                            border: "1px solid var(--emerald-line)",
                            color: "var(--emerald-fg)",
                          }}
                        >
                          {f}
                          <button
                            onClick={() => setFeatures((prev) => prev.filter((x) => x !== f))}
                            className="opacity-60 hover:opacity-100 transition-opacity"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                      {features.length === 0 && (
                        <p className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                          Aucune fonctionnalité encore — analysez votre site ou ajoutez manuellement.
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newFeature}
                        onChange={(e) => setNewFeature(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addFeature()}
                        placeholder="ex: Onboarding en 5 min, API REST, Multi-workspace…"
                        className="flex-1 rounded-[8px] px-3 py-2 text-xs"
                        style={{
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--line)",
                          color: "var(--fg)",
                        }}
                      />
                      <button
                        onClick={addFeature}
                        disabled={!newFeature.trim()}
                        className="w-8 h-8 rounded-[8px] flex items-center justify-center transition-colors"
                        style={{
                          background: newFeature.trim() ? "var(--emerald-fg)" : "var(--line)",
                          color: newFeature.trim() ? "#fff" : "var(--fg-muted)",
                        }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <p className="text-[10px]" style={{ color: "var(--fg-muted)" }}>
                      Entrée pour ajouter · Puis &quot;Enregistrer&quot; · Citées nommément dans les messages IA
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Empty state — no data yet */}
            {!hasData && !loading && (
              <div
                className="rounded-[20px] p-12 text-center space-y-3"
                style={{ background: "var(--bg-secondary)", border: "1px dashed var(--line)" }}
              >
                <Globe size={32} style={{ color: "var(--fg-muted)", margin: "0 auto" }} />
                <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                  Aucune brand voice configurée
                </p>
                <p className="text-xs max-w-sm mx-auto" style={{ color: "var(--fg-muted)" }}>
                  Entrez l&apos;URL de votre site ci-dessus et cliquez sur Analyser. Claude extraira automatiquement votre offre, audience cible, valeur unique et fonctionnalités.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
