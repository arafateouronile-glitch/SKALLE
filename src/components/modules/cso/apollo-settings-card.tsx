"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Database, Loader2, Sparkles, RefreshCw } from "lucide-react";

interface Props {
  workspaceId: string;
  personas: Array<{ id: string; name: string }>;
}

export function ApolloSettingsCard({ workspaceId, personas }: Props) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [selectedPersonaId, setSelectedPersonaId] = useState(personas[0]?.id ?? "");
  const [lastResult, setLastResult] = useState<{ created: number; skipped: number; total: number; personaName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/integrations/apollo")
      .then((r) => r.json())
      .then((d) => setAvailable(d.available ?? false))
      .catch(() => setAvailable(false));
  }, []);

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
          {available === true && (
            <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs ml-auto">
              Disponible
            </Badge>
          )}
          {available === false && (
            <Badge className="bg-gray-100 text-gray-500 border-0 text-xs ml-auto">
              Non disponible
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Importe des prospects qualifiés depuis la base Apollo (300M+ contacts)
          selon vos critères ICP — emails vérifiés inclus.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {available === false ? (
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            Apollo n'est pas encore activé sur votre compte. Contactez le support SKALLE.
          </p>
        ) : (
          <div className="space-y-3">
            {personas.length > 0 ? (
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
                  disabled={discovering || !selectedPersonaId || available !== true}
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
            ) : (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Créez d'abord un persona pour définir les critères ICP de la recherche Apollo.
              </p>
            )}

            <p className="text-[11px] text-gray-400">
              Apollo cherche des personnes correspondant aux titres de poste, géographies et mots-clés
              du persona sélectionné. Seuls les emails vérifiés ou probables sont importés.
            </p>

            {lastResult && (
              <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2.5 space-y-1">
                <p className="text-xs font-semibold text-violet-700 flex items-center gap-1.5">
                  <RefreshCw className="h-3 w-3" />
                  {lastResult.personaName}
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
