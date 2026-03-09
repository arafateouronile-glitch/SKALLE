"use client";

/**
 * 🤖 Autopilot Control Center
 *
 * Interface de configuration et monitoring de l'autopilot.
 * L'agent travaille 24/7 automatiquement.
 */

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  Settings,
  Activity,
  FileText,
  Share2,
  Search,
  Users,
  Mail,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Sparkles,
  TrendingUp,
  Zap,
  Lock,
  BarChart3,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getAutopilotConfig,
  saveAutopilotConfig,
  toggleAutopilot,
  getAutopilotLogs,
  getAutopilotStats,
  type AutopilotSettings,
  type AutopilotLogEntry,
  type AutopilotStats,
} from "@/actions/autopilot";
import {
  generateWeeklyReview,
  getLastWeeklyReview,
  getAgentScore,
  type WeeklyReview,
} from "@/actions/weekly-review";
import { recordDecisionOutcome, getAgentHistory } from "@/actions/agent-brain";
import { AgentsTab } from "@/components/modules/agents-tab";

export default function AutopilotPage() {
  const { workspaceId, isLoading: isWorkspaceLoading } = useWorkspace();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [canEnable, setCanEnable] = useState(false);
  const [config, setConfig] = useState<AutopilotSettings | null>(null);
  const [logs, setLogs] = useState<AutopilotLogEntry[]>([]);
  const [stats, setStats] = useState<AutopilotStats | null>(null);

  // Weekly Review state
  const [weeklyReview, setWeeklyReview] = useState<WeeklyReview | null>(null);
  const [isGeneratingReview, setIsGeneratingReview] = useState(false);
  const [agentScore, setAgentScore] = useState<{
    executionRate: number;
    approvalRate: number;
    totalThisWeek: number;
    executedThisWeek: number;
    positiveOutcomes: number;
  } | null>(null);
  const [agentHistory, setAgentHistory] = useState<
    Array<{
      id: string;
      actionType: string;
      status: string;
      reasoning: string;
      impact: string | null;
      result: unknown;
      createdAt: Date;
      linkedPost: { id: string; type: string; title: string | null; status: string } | null;
    }>
  >([]);

  // Keywords input states
  const [newKeyword, setNewKeyword] = useState("");
  const [newCompetitor, setNewCompetitor] = useState("");

  const loadData = useCallback(async () => {
    if (!workspaceId) return;
    setIsLoading(true);
    try {
      const [configResult, logsResult, statsResult, reviewResult, scoreResult, historyResult] =
        await Promise.all([
          getAutopilotConfig(workspaceId),
          getAutopilotLogs(workspaceId),
          getAutopilotStats(workspaceId),
          getLastWeeklyReview(workspaceId),
          getAgentScore(workspaceId),
          getAgentHistory(workspaceId, 7),
        ]);

      if (configResult.success && configResult.data) {
        setConfig(configResult.data);
        setCanEnable(configResult.canEnable ?? false);
      }
      if (logsResult.success && logsResult.data) {
        setLogs(logsResult.data);
      }
      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data);
      }
      if (reviewResult.success && reviewResult.data) {
        setWeeklyReview(reviewResult.data);
      }
      if (scoreResult.success && scoreResult.data) {
        setAgentScore(scoreResult.data);
      }
      if (historyResult.success && historyResult.data) {
        setAgentHistory(historyResult.data as typeof agentHistory);
      }
    } catch (error) {
      toast.error("Erreur lors du chargement");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) loadData();
  }, [workspaceId, loadData]);

  const handleToggle = async () => {
    if (!config || !workspaceId) return;
    if (!canEnable && !config.isActive) {
      toast.error("Passez au plan Business pour activer l'autopilot");
      return;
    }

    setIsSaving(true);
    const result = await toggleAutopilot(workspaceId, !config.isActive);
    if (result.success) {
      setConfig({ ...config, isActive: !config.isActive });
      toast.success(config.isActive ? "Autopilot désactivé" : "Autopilot activé ! 🚀");
    } else {
      toast.error(result.error || "Erreur");
    }
    setIsSaving(false);
  };

  const handleSave = async () => {
    if (!config || !workspaceId) return;
    setIsSaving(true);
    const result = await saveAutopilotConfig(workspaceId, config);
    if (result.success) {
      toast.success("Configuration sauvegardée !");
    } else {
      toast.error(result.error || "Erreur");
    }
    setIsSaving(false);
  };

  const addKeyword = () => {
    if (!newKeyword.trim() || !config) return;
    setConfig({
      ...config,
      seoKeywords: [...config.seoKeywords, newKeyword.trim()],
    });
    setNewKeyword("");
  };

  const removeKeyword = (kw: string) => {
    if (!config) return;
    setConfig({
      ...config,
      seoKeywords: config.seoKeywords.filter((k) => k !== kw),
    });
  };

  const addCompetitor = () => {
    if (!newCompetitor.trim() || !config) return;
    setConfig({
      ...config,
      competitorUrls: [...config.competitorUrls, newCompetitor.trim()],
    });
    setNewCompetitor("");
  };

  const removeCompetitor = (url: string) => {
    if (!config) return;
    setConfig({
      ...config,
      competitorUrls: config.competitorUrls.filter((u) => u !== url),
    });
  };

  const handleGenerateReview = async () => {
    if (!workspaceId) return;
    setIsGeneratingReview(true);
    const result = await generateWeeklyReview(workspaceId);
    if (result.success && result.data) {
      setWeeklyReview(result.data);
      toast.success("Weekly Review générée !");
    } else {
      toast.error(result.error || "Erreur lors de la génération");
    }
    setIsGeneratingReview(false);
  };

  const handleOutcome = async (decisionId: string, rating: "good" | "bad") => {
    const result = await recordDecisionOutcome(decisionId, { rating });
    if (result.success) {
      setAgentHistory((prev) =>
        prev.map((d) => (d.id === decisionId ? { ...d, result: { rating } } : d))
      );
      toast.success(rating === "good" ? "Feedback positif enregistré" : "Feedback négatif enregistré");
    }
  };

  if (isWorkspaceLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-500 bg-clip-text text-transparent flex items-center gap-3">
            <Zap className="h-8 w-8 text-yellow-500" />
            Autopilot Control Center
          </h1>
          <p className="text-gray-500 mt-1">
            Votre équipe marketing IA qui travaille 24/7
          </p>
        </div>

        {/* Master Toggle */}
        <div className="flex items-center gap-4">
          {!canEnable && (
            <Badge variant="outline" className="border-yellow-500/50 text-yellow-500">
              <Lock className="h-3 w-3 mr-1" />
              Plan Business requis
            </Badge>
          )}
          <div className="flex items-center gap-3 bg-white/50 backdrop-blur-sm rounded-xl px-6 py-3 border border-gray-200">
            <span className="text-sm text-gray-500">Autopilot</span>
            <button
              onClick={handleToggle}
              disabled={isSaving}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                config?.isActive
                  ? "bg-gradient-to-r from-green-500 to-emerald-500"
                  : "bg-gray-400"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform ${
                  config?.isActive ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
            <span
              className={`text-sm font-medium ${
                config?.isActive ? "text-green-400" : "text-gray-400"
              }`}
            >
              {config?.isActive ? "ON" : "OFF"}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Actions (30j)</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalActions}</p>
                </div>
                <Activity className="h-8 w-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Succès</p>
                  <p className="text-2xl font-bold text-green-400">{stats.successfulActions}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Échecs</p>
                  <p className="text-2xl font-bold text-red-400">{stats.failedActions}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Crédits utilisés</p>
                  <p className="text-2xl font-bold text-yellow-400">{stats.creditsUsed}</p>
                </div>
                <Sparkles className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="config" className="space-y-6">
        <TabsList className="bg-white/50 backdrop-blur-sm border border-gray-200">
          <TabsTrigger value="config" className="data-[state=active]:bg-emerald-600">
            <Settings className="h-4 w-4 mr-2" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="logs" className="data-[state=active]:bg-emerald-600">
            <Activity className="h-4 w-4 mr-2" />
            Activité
          </TabsTrigger>
          <TabsTrigger value="review" className="data-[state=active]:bg-emerald-600">
            <BarChart3 className="h-4 w-4 mr-2" />
            Weekly Review
          </TabsTrigger>
          <TabsTrigger value="agents" className="data-[state=active]:bg-emerald-600">
            <Sparkles className="h-4 w-4 mr-2" />
            Agents IA
          </TabsTrigger>
        </TabsList>

        {/* Configuration Tab */}
        <TabsContent value="config" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* SEO Autopilot */}
            <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/20">
                      <FileText className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-gray-900">SEO Autopilot</CardTitle>
                      <CardDescription>Génération automatique d'articles</CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={config?.seoEnabled ?? false}
                    onCheckedChange={(checked) =>
                      setConfig(config ? { ...config, seoEnabled: checked } : null)
                    }
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Fréquence</Label>
                  <Select
                    value={config?.seoFrequency}
                    onValueChange={(v) =>
                      setConfig(config ? { ...config, seoFrequency: v } : null)
                    }
                  >
                    <SelectTrigger className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Quotidien</SelectItem>
                      <SelectItem value="weekly">Hebdomadaire</SelectItem>
                      <SelectItem value="biweekly">Bi-mensuel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Articles par période</Label>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={config?.seoMinArticles ?? 3}
                    onChange={(e) =>
                      setConfig(
                        config
                          ? { ...config, seoMinArticles: parseInt(e.target.value) || 3 }
                          : null
                      )
                    }
                    className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mots-clés à cibler</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ajouter un mot-clé..."
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                      className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200"
                    />
                    <Button onClick={addKeyword} variant="outline">
                      +
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {config?.seoKeywords.map((kw) => (
                      <Badge
                        key={kw}
                        variant="secondary"
                        className="cursor-pointer hover:bg-red-500/20"
                        onClick={() => removeKeyword(kw)}
                      >
                        {kw} ×
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Social Autopilot */}
            <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-teal-500/20">
                      <Share2 className="h-5 w-5 text-teal-500" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-gray-900">Social Autopilot</CardTitle>
                      <CardDescription>Publication automatique sur les réseaux</CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={config?.socialEnabled ?? false}
                    onCheckedChange={(checked) =>
                      setConfig(config ? { ...config, socialEnabled: checked } : null)
                    }
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Fréquence</Label>
                  <Select
                    value={config?.socialFrequency}
                    onValueChange={(v) =>
                      setConfig(config ? { ...config, socialFrequency: v } : null)
                    }
                  >
                    <SelectTrigger className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Quotidien</SelectItem>
                      <SelectItem value="bidaily">2x par jour</SelectItem>
                      <SelectItem value="weekly">Hebdomadaire</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Plateformes</Label>
                  <div className="flex flex-wrap gap-2">
                    {["X", "LINKEDIN", "TIKTOK", "INSTAGRAM"].map((platform) => (
                      <Button
                        key={platform}
                        variant={
                          config?.socialPlatforms.includes(platform) ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => {
                          if (!config) return;
                          const platforms = config.socialPlatforms.includes(platform)
                            ? config.socialPlatforms.filter((p) => p !== platform)
                            : [...config.socialPlatforms, platform];
                          setConfig({ ...config, socialPlatforms: platforms });
                        }}
                      >
                        {platform}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Discovery Autopilot */}
            <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/20">
                      <Search className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-gray-900">Discovery Autopilot</CardTitle>
                      <CardDescription>Veille concurrentielle automatique</CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={config?.discoveryEnabled ?? false}
                    onCheckedChange={(checked) =>
                      setConfig(config ? { ...config, discoveryEnabled: checked } : null)
                    }
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Concurrents à surveiller</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://concurrent.com"
                      value={newCompetitor}
                      onChange={(e) => setNewCompetitor(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addCompetitor()}
                      className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200"
                    />
                    <Button onClick={addCompetitor} variant="outline">
                      +
                    </Button>
                  </div>
                  <div className="space-y-1 mt-2">
                    {config?.competitorUrls.map((url) => (
                      <div
                        key={url}
                        className="flex items-center justify-between bg-white/50 backdrop-blur-sm rounded px-3 py-2 text-sm"
                      >
                        <span className="text-gray-700 truncate">{url}</span>
                        <button
                          onClick={() => removeCompetitor(url)}
                          className="text-red-400 hover:text-red-300"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Alerter si opportunité détectée</Label>
                  <Switch
                    checked={config?.alertOnOpportunity ?? true}
                    onCheckedChange={(checked) =>
                      setConfig(config ? { ...config, alertOnOpportunity: checked } : null)
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* Prospection Autopilot */}
            <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/20">
                      <Users className="h-5 w-5 text-amber-400" />
                    </div>
                    <div>
                      <CardTitle className="text-lg text-gray-900">Prospection Autopilot</CardTitle>
                      <CardDescription>Génération de messages automatique</CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={config?.prospectionEnabled ?? false}
                    onCheckedChange={(checked) =>
                      setConfig(config ? { ...config, prospectionEnabled: checked } : null)
                    }
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Prospects par jour</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={config?.prospectionDaily ?? 5}
                    onChange={(e) =>
                      setConfig(
                        config
                          ? { ...config, prospectionDaily: parseInt(e.target.value) || 5 }
                          : null
                      )
                    }
                    className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200"
                  />
                  <p className="text-xs text-gray-400">
                    Génère automatiquement les messages pour les nouveaux prospects
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Notifications */}
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <Mail className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-lg text-gray-900">Notifications</CardTitle>
                  <CardDescription>Rapports et alertes par email</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={config?.emailReports ?? true}
                      onCheckedChange={(checked) =>
                        setConfig(config ? { ...config, emailReports: checked } : null)
                      }
                    />
                    <Label>Recevoir les rapports</Label>
                  </div>
                  <Select
                    value={config?.emailFrequency}
                    onValueChange={(v) =>
                      setConfig(config ? { ...config, emailFrequency: v } : null)
                    }
                    disabled={!config?.emailReports}
                  >
                    <SelectTrigger className="w-40 bg-white/60 backdrop-blur-sm shadow-sm border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Quotidien</SelectItem>
                      <SelectItem value="weekly">Hebdomadaire</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Sauvegarder la configuration
            </Button>
          </div>
        </TabsContent>

        {/* Activity Log Tab */}
        <TabsContent value="logs">
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <CardHeader>
              <CardTitle className="text-gray-900">Historique d'activité</CardTitle>
              <CardDescription>Dernières actions de l'autopilot</CardDescription>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Aucune activité pour le moment</p>
                  <p className="text-sm text-gray-400">
                    Activez l'autopilot pour commencer
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between bg-white/50 backdrop-blur-sm rounded-lg px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        {log.status === "success" ? (
                          <CheckCircle2 className="h-5 w-5 text-green-400" />
                        ) : log.status === "failed" ? (
                          <XCircle className="h-5 w-5 text-red-400" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-yellow-400" />
                        )}
                        <div>
                          <p className="text-sm text-gray-900">{log.action}</p>
                          <p className="text-xs text-gray-400">
                            {log.agentType} • {new Date(log.createdAt).toLocaleString("fr-FR")}
                          </p>
                        </div>
                      </div>
                      {log.creditsUsed > 0 && (
                        <Badge variant="outline" className="text-yellow-400 border-yellow-400/30">
                          -{log.creditsUsed} crédits
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Agent decisions with feedback */}
          {agentHistory.length > 0 && (
            <Card className="mt-4 bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
              <CardHeader>
                <CardTitle className="text-gray-900">Décisions de l'agent (7 jours)</CardTitle>
                <CardDescription>Donnez votre feedback pour améliorer l'agent</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {agentHistory.map((decision) => {
                    const outcome = decision.result as { rating?: string } | null;
                    return (
                      <div
                        key={decision.id}
                        className="flex items-center justify-between bg-white/50 backdrop-blur-sm rounded-lg px-4 py-3"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Badge
                            variant={
                              decision.status === "EXECUTED"
                                ? "default"
                                : decision.status === "REJECTED"
                                ? "destructive"
                                : "secondary"
                            }
                            className="shrink-0 text-xs"
                          >
                            {decision.status}
                          </Badge>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {decision.actionType}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                              {decision.reasoning.slice(0, 80)}...
                            </p>
                          </div>
                        </div>
                        {decision.status === "EXECUTED" && (
                          <div className="flex items-center gap-1 shrink-0 ml-2">
                            {outcome?.rating ? (
                              <Badge
                                variant="outline"
                                className={
                                  outcome.rating === "good"
                                    ? "border-green-400/50 text-green-500"
                                    : "border-red-400/50 text-red-500"
                                }
                              >
                                {outcome.rating === "good" ? "👍 Bon" : "👎 Mauvais"}
                              </Badge>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleOutcome(decision.id, "good")}
                                  className="p-1.5 rounded hover:bg-green-50 text-gray-400 hover:text-green-500 transition-colors"
                                  title="Bon résultat"
                                >
                                  <ThumbsUp className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleOutcome(decision.id, "bad")}
                                  className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                                  title="Mauvais résultat"
                                >
                                  <ThumbsDown className="h-4 w-4" />
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Weekly Review Tab */}
        <TabsContent value="review" className="space-y-6">
          {/* Agent Score Cards */}
          {agentScore && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-emerald-500">
                      {agentScore.approvalRate}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Taux d'approbation</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-teal-500">
                      {agentScore.executionRate}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Taux d'exécution</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-gray-800">
                      {agentScore.executedThisWeek}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Exécutées cette semaine</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-yellow-500">
                      {agentScore.positiveOutcomes}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Feedbacks positifs</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Generate Review Button */}
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border-gray-200/60">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/20">
                    <BarChart3 className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <CardTitle className="text-gray-900">Analyse hebdomadaire</CardTitle>
                    <CardDescription>
                      {weeklyReview
                        ? `Générée le ${new Date(weeklyReview.generatedAt).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}`
                        : "L'agent analyse ce qui a fonctionné et ajuste sa stratégie"}
                    </CardDescription>
                  </div>
                </div>
                <Button
                  onClick={handleGenerateReview}
                  disabled={isGeneratingReview}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                >
                  {isGeneratingReview ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {weeklyReview ? "Regénérer" : "Générer la review"}
                </Button>
              </div>
            </CardHeader>

            {weeklyReview && (
              <CardContent className="space-y-6">
                {/* Score + Headline */}
                <div className="flex items-center gap-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-100">
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-white shadow-sm border border-emerald-200 shrink-0">
                    <div className="text-center">
                      <p className="text-xl font-bold text-emerald-600">{weeklyReview.score}</p>
                      <p className="text-[9px] text-gray-400 -mt-0.5">/100</p>
                    </div>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{weeklyReview.headline}</p>
                    {weeklyReview.highlights.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {weeklyReview.highlights.map((h, i) => (
                          <li key={i} className="text-sm text-gray-600 flex items-center gap-1.5">
                            <Star className="h-3 w-3 text-yellow-400 shrink-0" />
                            {h}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* What worked / What failed */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-green-50/60 rounded-xl p-4 border border-green-100">
                    <div className="flex items-center gap-2 mb-2">
                      <ThumbsUp className="h-4 w-4 text-green-500" />
                      <p className="text-sm font-semibold text-green-700">Ce qui a fonctionné</p>
                    </div>
                    <p className="text-sm text-gray-700">{weeklyReview.what_worked}</p>
                  </div>
                  <div className="bg-red-50/60 rounded-xl p-4 border border-red-100">
                    <div className="flex items-center gap-2 mb-2">
                      <ThumbsDown className="h-4 w-4 text-red-500" />
                      <p className="text-sm font-semibold text-red-700">Ce qui a échoué</p>
                    </div>
                    <p className="text-sm text-gray-700">{weeklyReview.what_failed}</p>
                  </div>
                </div>

                {/* Insights */}
                {weeklyReview.insights.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-yellow-500" />
                      Insights
                    </p>
                    <ul className="space-y-1.5">
                      {weeklyReview.insights.map((insight, i) => (
                        <li
                          key={i}
                          className="text-sm text-gray-700 bg-white/60 rounded-lg px-3 py-2 border border-gray-100"
                        >
                          {insight}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Next week strategy */}
                <div className="bg-emerald-50/60 rounded-xl p-4 border border-emerald-100">
                  <p className="text-sm font-semibold text-emerald-700 mb-1 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Stratégie semaine prochaine
                  </p>
                  <p className="text-sm text-gray-700">{weeklyReview.next_week_strategy}</p>
                </div>

                {/* Recommended actions */}
                {weeklyReview.recommended_actions.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-2">
                      Actions recommandées
                    </p>
                    <ul className="space-y-1.5">
                      {weeklyReview.recommended_actions.map((action, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                          {action}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Agent adjustments */}
                <div className="bg-gray-50/60 rounded-xl p-4 border border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Ajustements agent
                  </p>
                  <p className="text-sm text-gray-600 italic">{weeklyReview.agent_adjustments}</p>
                </div>
              </CardContent>
            )}
          </Card>

          {!weeklyReview && !isGeneratingReview && (
            <div className="text-center py-12 text-gray-400">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Aucune review disponible</p>
              <p className="text-xs mt-1">
                Générez votre première analyse pour voir les recommandations de l'agent
              </p>
            </div>
          )}
        </TabsContent>

        {/* Agents IA Tab */}
        <TabsContent value="agents">
          {workspaceId && <AgentsTab workspaceId={workspaceId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
