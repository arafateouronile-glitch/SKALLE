"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Database, Loader2, CheckCircle2, X, Sparkles, RefreshCw, Trash2,
} from "lucide-react";

interface Props {
  workspaceId: string;
  personas: Array<{ id: string; name: string }>;
}

export function ApolloSettingsCard({ workspaceId, personas }: Props) {
  const [connected, setConnected] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planInfo, setPlanInfo] = useState<{ planTier?: string; creditsUsed?: number; creditsLimit?: number } | null>(null);
  const [lastResult, setLastResult] = useState<{ created: number; skipped: number; total: number; personaName: string } | null>(null);
  const [selectedPersonaId, setSelectedPersonaId] = useState(personas[0]?.id ?? "");

  useEffect(() => {
    fetch("/api/integrations/apollo")
      .then((r) => r.json())
      .then((d) => { if (d.connected) setConnected(true); })
      .catch(() => {});
  }, []);

  async function connect() {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/apollo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setConnected(true);
      setPlanInfo({ planTier: json.planTier, creditsUsed: json.emailCreditsUsed, creditsLimit: json.emailCreditsLimit });
      setApiKey("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    await fetch("/api/integrations/apollo", { method: "DELETE" });
    setConnected(false);
    setPlanInfo(null);
    setLastResult(null);
  }

  async function discover() {
    if (!selectedPersonaId) return;
    setDiscovering(true);
    setError(null);
    setLastResult(null);
    try {
      const res = await fetch("/api/cso-agent/apollo-discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, personaId: selectedPersonaId, limit: 25 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setLastResult({ created: json.created, skipped: json.skipped, total: json.total, personaName: json.personaName });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de la découverte");
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <Card className="border border-gray-200/60 bg-white/60 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="h-4 w-4 text-violet-500" />
          Apollo.io — Découverte de prospects
          {connected && (
            <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs ml-auto">
              Connecté
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Importe des prospects qualifiés depuis la base Apollo (300M+ contacts) selon vos critères ICP.
          Chaque prospect importé inclut son email vérifié.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!connected ? (
          <>
            <div className="space-y-2">
              <p className="text-xs text-gray-600">
                Obtenez votre clé API dans{" "}
                <a href="https://app.apollo.io/#/settings/integrations/api" target="_blank" rel="noopener noreferrer"
                  className="text-violet-600 underline">
                  Apollo → Settings → API
                </a>
                .
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="votre clé API Apollo..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && connect()}
                  className="text-sm flex-1"
                />
                <Button
                  onClick={connect}
                  disabled={saving || !apiKey.trim()}
                  className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                  size="sm"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connecter"}
                </Button>
              </div>
            </div>
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
          </>
        ) : (
          <div className="space-y-4">
            {/* Status + plan */}
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-xs font-medium text-emerald-700">
                    Apollo connecté
                    {planInfo?.planTier && ` · ${planInfo.planTier}`}
                  </p>
                  {planInfo?.creditsLimit && (
                    <p className="text-[11px] text-emerald-600">
                      {planInfo.creditsUsed ?? "—"} / {planInfo.creditsLimit} crédits email utilisés
                    </p>
                  )}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={disconnect} className="h-7 px-2 text-gray-400 hover:text-red-500">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Découverte */}
            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-700">Découvrir des prospects</p>

              {personas.length > 0 && (
                <div className="flex gap-2">
                  <select
                    value={selectedPersonaId}
                    onChange={(e) => setSelectedPersonaId(e.target.value)}
                    className="flex-1 text-xs rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-700 focus:outline-none focus:ring-1 focus:ring-violet-400"
                  >
                    {personas.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <Button
                    onClick={discover}
                    disabled={discovering || !selectedPersonaId}
                    className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                    size="sm"
                  >
                    {discovering ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    <span className="ml-1.5">{discovering ? "Recherche…" : "Découvrir 25 prospects"}</span>
                  </Button>
                </div>
              )}

              <p className="text-[11px] text-gray-400">
                Apollo cherche des personnes correspondant aux jobTitles, géographies et keywords du persona sélectionné.
                Seuls les emails vérifiés ou probables sont importés.
              </p>
            </div>

            {/* Résultat */}
            {lastResult && (
              <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2.5 space-y-1">
                <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
                  <RefreshCw className="h-3 w-3" />
                  Résultat — {lastResult.personaName}
                </p>
                <div className="flex gap-4 text-xs text-gray-600">
                  <span><strong className="text-violet-700">{lastResult.created}</strong> prospects créés</span>
                  <span><strong className="text-gray-400">{lastResult.skipped}</strong> déjà en DB</span>
                  <span className="text-gray-400">{lastResult.total.toLocaleString("fr-FR")} résultats Apollo</span>
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
