"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link2, Link2Off, Loader2, RefreshCw, CheckCircle2, AlertCircle, Users } from "lucide-react";

interface HubSpotStatus {
  connected: boolean;
  connectedAt?: string;
  syncedProspects?: number;
}

interface SyncResult {
  push: { pushed: number; errors: number };
  pull: { created: number; updated: number; skipped: number };
}

export function HubSpotCard() {
  const [status, setStatus] = useState<HubSpotStatus | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/crm/hubspot")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }));
  }, []);

  async function connect() {
    if (!token.trim()) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/crm/hubspot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setStatus({ connected: true, connectedAt: new Date().toISOString(), syncedProspects: 0 });
      setToken("");
      setSuccess(`Connecté${json.portalId ? ` — Portal ${json.portalId}` : ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    if (!confirm("Déconnecter HubSpot ? Les données prospects ne seront pas supprimées.")) return;
    setLoading(true);
    try {
      await fetch("/api/crm/hubspot", { method: "DELETE" });
      setStatus({ connected: false });
      setLastSync(null);
      setSuccess(null);
    } finally {
      setLoading(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/crm/hubspot", { method: "PATCH" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setLastSync(json.result);
      // Refresh status
      const s = await fetch("/api/crm/hubspot").then((r) => r.json());
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de sync");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Card className="border border-gray-200/60 bg-white/60 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {/* HubSpot orange logo */}
          <span className="h-5 w-5 rounded bg-[#FF7A59] flex items-center justify-center shrink-0">
            <span className="text-white text-[10px] font-bold">HS</span>
          </span>
          HubSpot CRM — Sync bidirectionnelle
          {status?.connected ? (
            <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs ml-auto">
              Connecté
            </Badge>
          ) : status !== null ? (
            <Badge className="bg-gray-100 text-gray-500 border-0 text-xs ml-auto">
              Non connecté
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          Synchronise vos prospects SKALLE ↔ contacts HubSpot automatiquement (toutes les 30 min).
          Activités email (envoi / ouverture / réponse) loggées dans la timeline HubSpot.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!status?.connected ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Collez votre <strong>Private App Token</strong> HubSpot (
              <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded">pat-xxx</code>).
              Scopes requis : <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded">crm.objects.contacts</code> +{" "}
              <code className="text-[11px] bg-gray-100 px-1 py-0.5 rounded">crm.objects.engagements</code>.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="flex-1 text-xs rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#FF7A59] font-mono"
                onKeyDown={(e) => e.key === "Enter" && connect()}
              />
              <Button
                onClick={connect}
                disabled={loading || !token.trim()}
                className="bg-[#FF7A59] hover:bg-[#e8684a] text-white shrink-0"
                size="sm"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                <span className="ml-1.5">Connecter</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Status row */}
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-emerald-800">HubSpot actif</p>
                  {status.connectedAt && (
                    <p className="text-[10px] text-emerald-600">
                      Connecté le {new Date(status.connectedAt).toLocaleDateString("fr-FR")}
                    </p>
                  )}
                </div>
              </div>
              {status.syncedProspects !== undefined && (
                <div className="flex items-center gap-1 text-xs text-emerald-700">
                  <Users className="h-3.5 w-3.5" />
                  <span>{status.syncedProspects} synchro</span>
                </div>
              )}
            </div>

            {/* Last sync result */}
            {lastSync && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 space-y-1.5">
                <p className="text-[11px] font-semibold text-gray-600 flex items-center gap-1.5">
                  <RefreshCw className="h-3 w-3" />
                  Dernière sync
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px]">
                  <div className="text-gray-500">
                    Push → HubSpot :{" "}
                    <strong className="text-gray-800">{lastSync.push.pushed}</strong> envoyés
                    {lastSync.push.errors > 0 && (
                      <span className="text-red-500 ml-1">({lastSync.push.errors} erreurs)</span>
                    )}
                  </div>
                  <div className="text-gray-500">
                    Pull ← HubSpot :{" "}
                    <strong className="text-emerald-700">{lastSync.pull.created}</strong> créés,{" "}
                    <strong className="text-blue-700">{lastSync.pull.updated}</strong> mis à jour
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={syncNow}
                disabled={syncing}
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
              >
                {syncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span className="ml-1.5">{syncing ? "Sync en cours…" : "Synchroniser maintenant"}</span>
              </Button>
              <Button
                onClick={disconnect}
                disabled={loading}
                variant="ghost"
                size="sm"
                className="text-xs text-gray-400 hover:text-red-500 hover:bg-red-50"
              >
                <Link2Off className="h-3.5 w-3.5" />
                <span className="ml-1">Déconnecter</span>
              </Button>
            </div>

            <p className="text-[11px] text-gray-400">
              Sync automatique toutes les 30 min. Les activités email sont loggées en temps réel dans la timeline HubSpot.
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {success && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <p className="text-xs text-emerald-700">{success}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
