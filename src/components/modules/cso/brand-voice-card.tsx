"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Globe,
  Sparkles,
  Loader2,
  CheckCircle2,
  X,
  Plus,
  RefreshCw,
} from "lucide-react";

interface BrandVoiceData {
  websiteUrl?: string;
  offer?: string;
  uniqueValue?: string;
  targetAudience?: string;
  targetResult?: string;
  socialProof?: string;
  productFeatures?: string[];
  websiteEnrichedAt?: string;
}

interface Props {
  workspaceId: string;
  initial: BrandVoiceData;
}

export function BrandVoiceCard({ workspaceId, initial }: Props) {
  const [url, setUrl] = useState(initial.websiteUrl ?? "");
  const [data, setData] = useState<BrandVoiceData>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Local product features editing
  const [features, setFeatures] = useState<string[]>(initial.productFeatures ?? []);
  const [newFeature, setNewFeature] = useState("");
  const [savingFeatures, setSavingFeatures] = useState(false);

  async function analyze() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch("/api/brand-voice/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, websiteUrl: url.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur inconnue");

      setData((prev) => ({ ...prev, ...json.extracted, websiteUrl: url.trim(), websiteEnrichedAt: new Date().toISOString() }));
      if (json.extracted?.productFeatures?.length) {
        setFeatures(json.extracted.productFeatures);
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveFeatures() {
    setSavingFeatures(true);
    try {
      await fetch("/api/brand-voice/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, productFeatures: features }),
      });
    } finally {
      setSavingFeatures(false);
    }
  }

  function addFeature() {
    const trimmed = newFeature.trim();
    if (!trimmed || features.includes(trimmed)) return;
    const updated = [...features, trimmed];
    setFeatures(updated);
    setNewFeature("");
  }

  function removeFeature(f: string) {
    setFeatures(features.filter((x) => x !== f));
  }

  const enrichedAt = data.websiteEnrichedAt
    ? new Date(data.websiteEnrichedAt).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <Card className="border border-gray-200/60 bg-white/60 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4 text-violet-500" />
          Brand Voice — Contexte produit
        </CardTitle>
        <CardDescription>
          Entrez l'URL de votre site pour que Claude comprenne votre produit et
          génère des messages encore plus pertinents.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* URL + bouton analyser */}
        <div className="flex gap-2">
          <Input
            placeholder="https://votresite.fr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analyze()}
            className="flex-1 text-sm"
          />
          <Button
            onClick={analyze}
            disabled={loading || !url.trim()}
            className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
            size="sm"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : success ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span className="ml-1.5">
              {loading ? "Analyse…" : success ? "Mis à jour !" : "Analyser"}
            </span>
          </Button>
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {/* Résultats extraits */}
        {(data.offer || data.targetAudience || data.uniqueValue) && (
          <div className="space-y-3 rounded-xl bg-violet-50/60 border border-violet-100 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">
                Extrait du site
              </p>
              {enrichedAt && (
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <RefreshCw className="h-2.5 w-2.5" />
                  {enrichedAt}
                </span>
              )}
            </div>

            {data.offer && (
              <FieldRow label="Offre" value={data.offer} />
            )}
            {data.uniqueValue && (
              <FieldRow label="Valeur unique" value={data.uniqueValue} />
            )}
            {data.targetAudience && (
              <FieldRow label="Audience cible" value={data.targetAudience} />
            )}
            {data.targetResult && (
              <FieldRow label="Résultat client" value={data.targetResult} />
            )}
            {data.socialProof && (
              <FieldRow label="Preuves sociales" value={data.socialProof} />
            )}
          </div>
        )}

        {/* Fonctionnalités produit — éditables */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-700">
              Fonctionnalités clés
              <span className="text-gray-400 font-normal ml-1">
                (citées nommément dans les messages)
              </span>
            </p>
            {features.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={saveFeatures}
                disabled={savingFeatures}
                className="h-6 text-xs text-violet-600 hover:text-violet-700 px-2"
              >
                {savingFeatures ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Enregistrer"
                )}
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {features.map((f) => (
              <Badge
                key={f}
                className="bg-violet-100 text-violet-700 border-0 text-xs pr-1 flex items-center gap-1"
              >
                {f}
                <button
                  onClick={() => removeFeature(f)}
                  className="hover:text-red-500 transition-colors"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="ex: BPF en 1 clic, eIDAS, piste d'audit…"
              value={newFeature}
              onChange={(e) => setNewFeature(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addFeature()}
              className="text-xs h-8"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={addFeature}
              disabled={!newFeature.trim()}
              className="h-8 px-2 shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-[10px] text-gray-400">
            Entrée ou + pour ajouter · puis "Enregistrer" pour sauvegarder
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-violet-500 font-medium uppercase tracking-wide mb-0.5">
        {label}
      </p>
      <p className="text-xs text-gray-700 leading-relaxed">{value}</p>
    </div>
  );
}
