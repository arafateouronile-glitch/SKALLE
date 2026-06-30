"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Shield, Activity, TrendingUp, AlertTriangle, CheckCircle2, XCircle, Trash2, Zap, Loader2, Check,
} from "lucide-react";
import {
  getDeliverabilityConfig, saveDeliverabilityConfig, verifyDNSRecords,
  getWarmupStatus, getMonitoringStatus, analyzeListHygiene, cleanList,
} from "@/actions/deliverability";
import { toast } from "sonner";

export function DeliverabilityTab({ workspaceId }: { workspaceId: string }) {
  const [config, setConfig] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [warmupStatus, setWarmupStatus] = useState<any | null>(null);
  const [dnsCheck, setDnsCheck] = useState<any | null>(null);
  const [monitoringStatus, setMonitoringStatus] = useState<{
    googlePostmaster: boolean; senderScore: boolean; microsoftSNDS: boolean;
  } | null>(null);
  const [hygieneData, setHygieneData] = useState<{
    invalidEmails: number; bouncedEmails: number; unsubscribedEmails: number;
    spamComplaints: number; lowEngagementEmails: number; totalRemoved: number;
    recommendations: string[];
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<{
    removed: number; skippedSteps: number; breakdown: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    loadConfig();
    loadWarmupStatus();
    getMonitoringStatus().then(setMonitoringStatus).catch(() => {});
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const result = await getDeliverabilityConfig(workspaceId);
      if (result.success && result.data) setConfig(result.data);
    } catch { toast.error("Erreur lors du chargement"); }
    finally { setIsLoading(false); }
  };

  const loadWarmupStatus = async () => {
    try {
      const result = await getWarmupStatus(workspaceId);
      if (result.success && result.data) setWarmupStatus(result.data);
    } catch { /* ignore */ }
  };

  const handleVerifyDNS = async () => {
    try {
      const result = await verifyDNSRecords(workspaceId);
      if (result.success && result.data) { setDnsCheck(result.data); toast.success("DNS records vérifiés !"); loadConfig(); }
      else toast.error(result.error || "Erreur de vérification");
    } catch { toast.error("Une erreur est survenue"); }
  };

  const handleAnalyzeHygiene = async () => {
    setIsAnalyzing(true); setCleanResult(null);
    try {
      const result = await analyzeListHygiene(workspaceId);
      if (result.success && result.data) setHygieneData(result.data);
      else toast.error(result.error || "Erreur d'analyse");
    } catch { toast.error("Une erreur est survenue"); }
    finally { setIsAnalyzing(false); }
  };

  const handleCleanList = async () => {
    setIsCleaning(true);
    try {
      const result = await cleanList(workspaceId);
      if (result.success && result.data) {
        setCleanResult(result.data); setHygieneData(null);
        toast.success(`Liste nettoyée : ${result.data.removed} contact(s) retiré(s)`);
        loadConfig();
      } else toast.error(result.error || "Erreur de nettoyage");
    } catch { toast.error("Une erreur est survenue"); }
    finally { setIsCleaning(false); }
  };

  const handleSave = async () => {
    if (!config) return;
    setIsSaving(true);
    try {
      const result = await saveDeliverabilityConfig(workspaceId, {
        sendingDomain: config.sendingDomain || "",
        fromEmail: config.fromEmail || "",
        fromName: config.fromName || "",
        replyToEmail: config.replyToEmail || "",
        warmupEnabled: config.warmupEnabled ?? true,
        dailySendingLimit: config.dailySendingLimit || 50,
      });
      if (result.success) { toast.success("Configuration sauvegardée !"); loadConfig(); loadWarmupStatus(); }
      else toast.error(result.error || "Erreur");
    } catch { toast.error("Une erreur est survenue"); }
    finally { setIsSaving(false); }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* DNS Configuration */}
      <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-400" /> Configuration DNS (SPF/DKIM/DMARC)
          </CardTitle>
          <CardDescription className="text-gray-500">Vérifiez la configuration de votre domaine d&apos;envoi</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Domaine d&apos;envoi</Label>
              <Input placeholder="example.com" value={config?.sendingDomain || ""}
                onChange={(e) => setConfig({ ...config, sendingDomain: e.target.value })}
                className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200" />
            </div>
            <div className="space-y-2">
              <Label>Email expéditeur</Label>
              <Input type="email" placeholder="hello@example.com" value={config?.fromEmail || ""}
                onChange={(e) => setConfig({ ...config, fromEmail: e.target.value })}
                className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200" />
            </div>
            <div className="space-y-2">
              <Label>Nom expéditeur</Label>
              <Input placeholder="Skalle Team" value={config?.fromName || ""}
                onChange={(e) => setConfig({ ...config, fromName: e.target.value })}
                className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200" />
            </div>
            <div className="space-y-2">
              <Label>Email de réponse (optionnel)</Label>
              <Input type="email" placeholder="reply@example.com" value={config?.replyToEmail || ""}
                onChange={(e) => setConfig({ ...config, replyToEmail: e.target.value })}
                className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200" />
            </div>
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <Button variant="outline" onClick={handleVerifyDNS}>
              <CheckCircle2 className="h-4 w-4 mr-2" /> Vérifier DNS
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-emerald-600 hover:bg-emerald-700">
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Sauvegarder
            </Button>
          </div>
          {config && (config.spfConfigured || config.dkimConfigured || config.dmarcConfigured) && (
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
              {[
                { key: "spfConfigured", label: "SPF" },
                { key: "dkimConfigured", label: "DKIM" },
                { key: "dmarcConfigured", label: "DMARC" },
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
                  {config[key] ? <CheckCircle2 className="h-5 w-5 text-green-400" /> : <XCircle className="h-5 w-5 text-red-400" />}
                  <div>
                    <div className="text-sm font-medium text-gray-900">{label}</div>
                    <div className="text-xs text-gray-500">{config[key] ? "Configuré" : "Non configuré"}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {dnsCheck?.recommendations && dnsCheck.recommendations.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                <h4 className="font-medium text-yellow-400">Recommandations</h4>
              </div>
              <ul className="space-y-1 text-sm text-yellow-300">
                {dnsCheck.recommendations.map((rec: string, i: number) => <li key={i}>• {rec}</li>)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Warm-up Status */}
      {warmupStatus?.warmupEnabled && (
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-green-400" /> Statut Warm-up
            </CardTitle>
            <CardDescription className="text-gray-500">Progression du warm-up de votre domaine</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Progression</span>
                  <span className="text-sm font-medium text-gray-900">{warmupStatus.warmupProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div className="bg-gradient-to-r from-green-500 to-emerald-500 h-3 rounded-full transition-all" style={{ width: `${warmupStatus.warmupProgress}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Jour actuel</div>
                  <div className="text-lg font-semibold text-gray-900">{warmupStatus.currentDay || 0}</div>
                </div>
                <div className="bg-white/50 rounded-lg p-3">
                  <div className="text-xs text-gray-500 mb-1">Emails aujourd&apos;hui</div>
                  <div className="text-lg font-semibold text-gray-900">{warmupStatus.emailsSentToday || 0} / {warmupStatus.targetEmails || 0}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Performance Metrics */}
      {config && (
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-gray-900 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-600" /> Métriques de Performance
              </CardTitle>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Données réelles — mises à jour à chaque envoi</span>
            </div>
            <CardDescription className="text-gray-500">Statistiques de délivrabilité email</CardDescription>
          </CardHeader>
          <CardContent>
            {!config.openRate && !config.replyRate && !config.bounceRate && !config.spamRate ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-gray-400">
                <TrendingUp className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium text-gray-500">Aucune donnée pour l&apos;instant</p>
                <p className="text-xs mt-1">Les métriques s&apos;afficheront automatiquement après l&apos;envoi de vos premières séquences email.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Taux d'ouverture", value: config.openRate, color: "text-gray-900" },
                  { label: "Taux de réponse", value: config.replyRate, color: "text-gray-900" },
                  { label: "Taux de rebond", value: config.bounceRate, color: "text-red-400" },
                  { label: "Taux de spam", value: config.spamRate, color: "text-yellow-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white/50 rounded-lg p-4">
                    <div className="text-xs text-gray-500 mb-1">{label}</div>
                    <div className={`text-2xl font-bold ${color}`}>{value?.toFixed(1) || 0}%</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* List Hygiene */}
      <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-orange-500" /> Hygiène de liste
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handleAnalyzeHygiene} disabled={isAnalyzing}>
              {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
              {isAnalyzing ? "Analyse..." : "Analyser"}
            </Button>
          </div>
          <CardDescription className="text-gray-500">
            Identifiez et supprimez les contacts invalides pour protéger votre réputation d&apos;expéditeur
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hygieneData && !cleanResult && (
            <div className="flex flex-col items-center justify-center py-8 text-center text-gray-400">
              <Trash2 className="h-10 w-10 mb-3 opacity-20" />
              <p className="text-sm font-medium text-gray-500">Aucune analyse en cours</p>
              <p className="text-xs mt-1">Cliquez sur « Analyser » pour détecter les contacts problématiques.</p>
            </div>
          )}
          {hygieneData && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { value: hygieneData.bouncedEmails, label: "Bounces", bg: "bg-red-50", text: "text-red-600", sub: "text-red-500" },
                  { value: hygieneData.spamComplaints, label: "Plaintes spam", bg: "bg-orange-50", text: "text-orange-600", sub: "text-orange-500" },
                  { value: hygieneData.unsubscribedEmails, label: "Désabonnés", bg: "bg-yellow-50", text: "text-yellow-600", sub: "text-yellow-500" },
                  { value: hygieneData.lowEngagementEmails, label: "Faible engagement", bg: "bg-gray-50", text: "text-gray-600", sub: "text-gray-500" },
                ].map(({ value, label, bg, text, sub }) => (
                  <div key={label} className={`${bg} rounded-lg p-3 text-center`}>
                    <div className={`text-xl font-bold ${text}`}>{value}</div>
                    <div className={`text-xs ${sub} mt-0.5`}>{label}</div>
                  </div>
                ))}
              </div>
              {hygieneData.recommendations.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium text-amber-700">Recommandations</span>
                  </div>
                  <ul className="space-y-1">
                    {hygieneData.recommendations.map((rec, i) => <li key={i} className="text-xs text-amber-600">{rec}</li>)}
                  </ul>
                </div>
              )}
              {hygieneData.totalRemoved > 0 ? (
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <span className="text-sm text-gray-600"><span className="font-semibold text-gray-900">{hygieneData.totalRemoved}</span> contact(s) à nettoyer</span>
                  <Button size="sm" onClick={handleCleanList} disabled={isCleaning} className="bg-red-600 hover:bg-red-700 text-white">
                    {isCleaning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                    {isCleaning ? "Nettoyage..." : "Nettoyer la liste"}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 pt-2 border-t border-gray-100 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Liste saine — aucun contact à supprimer</span>
                </div>
              )}
            </div>
          )}
          {cleanResult && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-semibold">Nettoyage effectué avec succès</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-green-700">{cleanResult.removed}</div>
                  <div className="text-xs text-green-600 mt-0.5">Contacts retirés</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-blue-700">{cleanResult.skippedSteps}</div>
                  <div className="text-xs text-blue-600 mt-0.5">Séquences annulées</div>
                </div>
              </div>
              <div className="text-xs text-gray-400 space-y-0.5">
                {Object.entries(cleanResult.breakdown).filter(([, v]) => v > 0).map(([k, v]) => <div key={k}>{k}: {v}</div>)}
              </div>
              <Button variant="outline" size="sm" onClick={handleAnalyzeHygiene} disabled={isAnalyzing}>
                <Zap className="h-4 w-4 mr-2" /> Relancer l&apos;analyse
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monitoring Externe */}
      <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
        <CardHeader>
          <CardTitle className="text-gray-900 flex items-center gap-2">
            <Activity className="h-5 w-5 text-purple-500" /> Monitoring Externe de Réputation
          </CardTitle>
          <CardDescription className="text-gray-500">
            Connectez des outils tiers pour surveiller votre réputation d&apos;expéditeur en temps réel
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            {
              key: "googlePostmaster" as const,
              label: "Google Postmaster Tools",
              desc: "Surveille la réputation de votre domaine pour les emails envoyés vers Gmail (40% des boîtes). Données en temps réel : taux de spam, réputation IP/domaine.",
              steps: [
                <>Créez un projet Google Cloud et activez l&apos;API <em>Gmail Postmaster Tools</em></>,
                <>Créez un compte de service (Service Account) et téléchargez le JSON</>,
                <>Ajoutez votre domaine dans <a href="https://postmaster.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">postmaster.google.com</a> et vérifiez-le</>,
                <>Copiez le JSON dans la variable d&apos;env : <code className="bg-gray-100 px-1 rounded">GOOGLE_POSTMASTER_SERVICE_ACCOUNT_JSON</code></>,
              ],
            },
            {
              key: "senderScore" as const,
              label: "SenderScore (Validity)",
              desc: "Score de réputation global 0-100 utilisé par de nombreux FAI. Score > 80 = excellente délivrabilité.",
              steps: [
                <>Créez un compte gratuit sur <a href="https://www.validity.com/products/senderscore/" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">validity.com/senderscore</a></>,
                <>Obtenez votre clé API dans les paramètres du compte</>,
                <>Ajoutez la variable d&apos;env : <code className="bg-gray-100 px-1 rounded">SENDERSCORE_API_KEY</code></>,
              ],
            },
            {
              key: "microsoftSNDS" as const,
              label: "Microsoft SNDS",
              desc: "Surveille la réputation pour Outlook/Hotmail (30% des boîtes pro). Pas d'API publique — nécessite une inscription manuelle par adresse IP.",
              steps: [
                <>Inscrivez votre IP sur <a href="https://sendersupport.olc.protection.outlook.com/snds/" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">SNDS Microsoft</a></>,
                <>Consultez votre score dans le portail SNDS (vert = OK, rouge = problème)</>,
                <>Pour l&apos;afficher dans SKALLE : définissez <code className="bg-gray-100 px-1 rounded">MICROSOFT_SNDS_SCORE=85</code> (valeur 0-100)</>,
              ],
              manualBadge: true,
            },
          ].map(({ key, label, desc, steps, manualBadge }) => (
            <div key={key} className="flex items-start gap-4 p-4 rounded-lg border border-gray-200 bg-white/50">
              <div className="mt-0.5">
                {monitoringStatus?.[key] ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <XCircle className="h-5 w-5 text-gray-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-gray-900">{label}</span>
                  {monitoringStatus?.[key] ? (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{manualBadge ? "Configuré (manuel)" : "Configuré"}</span>
                  ) : (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${manualBadge ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                      {manualBadge ? "Processus manuel" : "Non configuré"}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-2">{desc}</p>
                {(!monitoringStatus?.[key] || manualBadge) && (
                  <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside mb-2">
                    {steps.map((step, i) => <li key={i}>{step}</li>)}
                  </ol>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
