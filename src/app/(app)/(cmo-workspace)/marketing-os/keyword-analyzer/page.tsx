"use client";

/**
 * Keyword Analyzer - Interface type SEMrush
 * 
 * Analyse de mots-clés avec :
 * - Métriques (Volume, KD, CPC, Intent)
 * - Opportunités
 * - Analyse concurrentielle
 * - Comparaison de mots-clés
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  TrendingUp,
  Target,
  DollarSign,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Zap,
} from "lucide-react";
import {
  analyzeKeywordAction,
  findOpportunitiesAction,
  analyzeCompetitorAction,
  compareKeywordsAction,
  getKeywordHistory,
} from "@/actions/keyword-analyzer";
import type { KeywordMetrics, KeywordOpportunity, CompetitorAnalysis } from "@/lib/seo/keyword-analyzer";
import { getUserWorkspace } from "@/actions/leads";
import { toast } from "sonner";
import { useCreditsContext } from "@/components/providers/credits-provider";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

export default function KeywordAnalyzerPage() {
  const { isDepleted } = useCreditsContext();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState<KeywordMetrics | null>(null);
  const [opportunities, setOpportunities] = useState<KeywordOpportunity[]>([]);
  const [competitorDomain, setCompetitorDomain] = useState("");
  const [competitorAnalysis, setCompetitorAnalysis] = useState<CompetitorAnalysis | null>(null);
  const [compareKeywords, setCompareKeywords] = useState<string[]>([]);
  const [compareResults, setCompareResults] = useState<KeywordMetrics[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  // Charger le workspace au montage
  useEffect(() => {
    getUserWorkspace().then((result) => {
      if (result.success && result.workspaceId) {
        setWorkspaceId(result.workspaceId);
      }
    });
  }, []);

  // Charger l'historique quand workspaceId est disponible
  useEffect(() => {
    if (workspaceId) {
      loadHistory();
    }
  }, [workspaceId]);

  const loadHistory = async () => {
    if (!workspaceId) return;
    const result = await getKeywordHistory(workspaceId, 20);
    if (result.success && result.data) {
      setHistory(result.data);
    }
  };

  const handleAnalyzeKeyword = async () => {
    if (!keyword.trim() || !workspaceId) return;

    setLoading(true);
    try {
      const result = await analyzeKeywordAction(workspaceId, keyword.trim());
      console.log("[Frontend] Résultat de l'analyse:", result);
      
      if (result.success && result.data) {
        console.log("[Frontend] Données reçues:", {
          volume: result.data.volume,
          cpc: result.data.cpc,
          kd: result.data.kd,
          competition: result.data.competition,
          volumeType: typeof result.data.volume,
          cpcType: typeof result.data.cpc,
        });
        
        setMetrics(result.data);
        toast.success("Analyse terminée");
        loadHistory();
      } else {
        console.error("[Frontend] Erreur:", result.error);
        toast.error(result.error || "Erreur lors de l'analyse");
      }
    } catch (error) {
      console.error("[Frontend] Exception:", error);
      toast.error("Erreur lors de l'analyse");
    } finally {
      setLoading(false);
    }
  };

  const handleFindOpportunities = async () => {
    if (!keyword.trim() || !workspaceId) return;

    setLoading(true);
    try {
      const result = await findOpportunitiesAction(workspaceId, keyword.trim(), 20);
      if (result.success && result.data) {
        setOpportunities(result.data);
        toast.success(`${result.data.length} opportunités trouvées`);
      } else {
        toast.error(result.error || "Erreur lors de la recherche");
      }
    } catch (error) {
      toast.error("Erreur lors de la recherche");
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeCompetitor = async () => {
    if (!competitorDomain.trim() || !workspaceId) return;

    setLoading(true);
    try {
      const result = await analyzeCompetitorAction(workspaceId, competitorDomain.trim());
      if (result.success && result.data) {
        setCompetitorAnalysis(result.data);
        toast.success("Analyse concurrentielle terminée");
      } else {
        toast.error(result.error || "Erreur lors de l'analyse");
      }
    } catch (error) {
      toast.error("Erreur lors de l'analyse");
    } finally {
      setLoading(false);
    }
  };

  const handleCompareKeywords = async () => {
    if (compareKeywords.length < 2 || !workspaceId) return;

    setLoading(true);
    try {
      const result = await compareKeywordsAction(workspaceId, compareKeywords);
      if (result.success && result.data) {
        setCompareResults(result.data);
        toast.success("Comparaison terminée");
      } else {
        toast.error(result.error || "Erreur lors de la comparaison");
      }
    } catch (error) {
      toast.error("Erreur lors de la comparaison");
    } finally {
      setLoading(false);
    }
  };

  const getDifficultyColor = (kd: number) => {
    if (kd >= 70) return "destructive";
    if (kd >= 40) return "default";
    return "secondary";
  };

  const getDifficultyLabel = (kd: number) => {
    if (kd >= 70) return "Difficile";
    if (kd >= 40) return "Moyen";
    return "Facile";
  };

  const getIntentColor = (intent: string) => {
    switch (intent) {
      case "transactional":
        return "destructive";
      case "commercial":
        return "default";
      case "informational":
        return "secondary";
      default:
        return "outline";
    }
  };

  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {isDepleted && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-red-800">
            Vous n&apos;avez plus de crédits. Les analyses sont désactivées.
          </p>
          <Button asChild size="sm" className="bg-red-600 hover:bg-red-700 shrink-0">
            <Link href="/marketing-os/settings">Passer à un plan supérieur</Link>
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analyseur de Mots-clés</h1>
          <p className="text-muted-foreground mt-2">
            Analysez vos mots-clés, trouvez des opportunités et analysez vos concurrents
          </p>
        </div>
      </div>

      <Tabs defaultValue="analyze" className="space-y-6">
        <TabsList>
          <TabsTrigger value="analyze">Analyse</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunités</TabsTrigger>
          <TabsTrigger value="competitor">Concurrent</TabsTrigger>
          <TabsTrigger value="compare">Comparer</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
        </TabsList>

        {/* TAB: Analyse */}
        <TabsContent value="analyze" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Analyse de mot-clé</CardTitle>
              <CardDescription>
                Entrez un mot-clé pour obtenir ses métriques complètes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: formation en ligne"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAnalyzeKeyword()}
                />
                <Button
                  onClick={handleAnalyzeKeyword}
                  disabled={loading || !keyword.trim() || isDepleted}
                  title={isDepleted ? "Crédits épuisés. Passez à un plan supérieur dans Paramètres." : undefined}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Analyser
                </Button>
              </div>

              {metrics && (
                <div className="space-y-6 mt-6">
                  {/* Métriques principales */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Volume mensuel</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {metrics.volume.toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Recherches / mois
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Difficulté (KD)</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{metrics.kd}</div>
                        <Badge
                          variant={getDifficultyColor(metrics.kd) as any}
                          className="mt-1"
                        >
                          {getDifficultyLabel(metrics.kd)}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Score de difficulté / 100
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>CPC moyen</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {metrics.cpc != null && typeof metrics.cpc === 'number'
                            ? `€${metrics.cpc.toFixed(2)}`
                            : `Erreur: ${JSON.stringify(metrics.cpc)}`}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Coût par clic
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Concurrence</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Badge
                          variant={
                            metrics.competition === "high"
                              ? "destructive"
                              : metrics.competition === "medium"
                              ? "default"
                              : "secondary"
                          }
                          className="text-lg px-3 py-1"
                        >
                          {metrics.competition === "high"
                            ? "Élevée"
                            : metrics.competition === "medium"
                            ? "Moyenne"
                            : "Faible"}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          Niveau publicitaire
                        </p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Intention</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Badge variant={getIntentColor(metrics.searchIntent) as any}>
                          {metrics.searchIntent}
                        </Badge>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Features SERP */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Features SERP</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {Object.entries(metrics.serpFeatures).map(([key, value]) => (
                          <div key={key} className="flex items-center gap-2">
                            {value ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-gray-400" />
                            )}
                            <span className="text-sm capitalize">
                              {key.replace(/([A-Z])/g, " $1").trim()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Top concurrents */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Top 10 Concurrents</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Position</TableHead>
                            <TableHead>Domaine</TableHead>
                            <TableHead>Titre</TableHead>
                            <TableHead>Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metrics.topCompetitors.map((competitor) => (
                            <TableRow key={competitor.url}>
                              <TableCell>
                                <Badge variant="outline">#{competitor.position}</Badge>
                              </TableCell>
                              <TableCell className="font-medium">
                                {competitor.domain}
                              </TableCell>
                              <TableCell className="max-w-md truncate">
                                {competitor.title}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => window.open(competitor.url, "_blank")}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* Tendance du volume */}
                  {metrics.trend.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Tendance du volume de recherche</CardTitle>
                        <CardDescription>
                          Évolution sur les 12 derniers mois
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                          <LineChart data={metrics.trend.map((v, idx) => ({
                            month: `M${idx + 1}`,
                            volume: v,
                          }))}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip
                              formatter={(value: any) => [
                                `${value.toLocaleString()} recherches`,
                                "Volume",
                              ]}
                            />
                            <Line
                              type="monotone"
                              dataKey="volume"
                              stroke="#8884d8"
                              strokeWidth={2}
                              dot={{ r: 4 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}

                  {/* Questions PAA */}
                  {metrics.paaQuestions.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>People Also Ask</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {metrics.paaQuestions.map((question, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <AlertCircle className="h-4 w-4 mt-1 text-blue-500" />
                              <span className="text-sm">{question}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Mots-clés liés */}
                  {metrics.relatedKeywords.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle>Mots-clés liés</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2">
                          {metrics.relatedKeywords.slice(0, 20).map((kw, idx) => (
                            <Badge key={idx} variant="outline">
                              {kw.keyword}
                            </Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Opportunités */}
        <TabsContent value="opportunities" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Trouver des opportunités</CardTitle>
              <CardDescription>
                Trouvez des mots-clés avec un volume élevé et une faible difficulté
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Mot-clé seed (ex: formation)"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                />
                <Button
                  onClick={handleFindOpportunities}
                  disabled={loading || !keyword.trim() || isDepleted}
                  title={isDepleted ? "Crédits épuisés. Passez à un plan supérieur dans Paramètres." : undefined}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}
                  Trouver
                </Button>
              </div>

              {opportunities.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>
                      {opportunities.length} Opportunités trouvées
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mot-clé</TableHead>
                          <TableHead>Volume</TableHead>
                          <TableHead>KD</TableHead>
                          <TableHead>Opportunité</TableHead>
                          <TableHead>Intention</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {opportunities.map((opp, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{opp.keyword}</TableCell>
                            <TableCell>
                              {opp.volume.toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={getDifficultyColor(opp.kd) as any}
                              >
                                {opp.kd}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-24 bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-green-500 h-2 rounded-full"
                                    style={{ width: `${opp.opportunity}%` }}
                                  />
                                </div>
                                <span className="text-sm font-medium">
                                  {opp.opportunity}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={getIntentColor(opp.intent) as any}>
                                {opp.intent}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Concurrent */}
        <TabsContent value="competitor" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Analyse concurrentielle</CardTitle>
              <CardDescription>
                Analysez un domaine concurrent pour comprendre sa stratégie SEO
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: competitor.com"
                  value={competitorDomain}
                  onChange={(e) => setCompetitorDomain(e.target.value)}
                />
                <Button
                  onClick={handleAnalyzeCompetitor}
                  disabled={loading || !competitorDomain.trim() || isDepleted}
                  title={isDepleted ? "Crédits épuisés. Passez à un plan supérieur dans Paramètres." : undefined}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Target className="h-4 w-4" />
                  )}
                  Analyser
                </Button>
              </div>

              {competitorAnalysis && (
                <div className="space-y-6 mt-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Autorité du domaine</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {competitorAnalysis.domainAuthority}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Pages indexées</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {competitorAnalysis.totalKeywords}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Trafic estimé</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {competitorAnalysis.trafficEstimate
                            ? competitorAnalysis.trafficEstimate.toLocaleString()
                            : "N/A"}
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardDescription>Backlinks</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">
                          {competitorAnalysis.backlinksEstimate
                            ? competitorAnalysis.backlinksEstimate.toLocaleString()
                            : "N/A"}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle>Top mots-clés</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Position</TableHead>
                            <TableHead>Mot-clé</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {competitorAnalysis.topKeywords.map((kw) => (
                            <TableRow key={kw.keyword}>
                              <TableCell>
                                <Badge variant="outline">#{kw.position}</Badge>
                              </TableCell>
                              <TableCell className="font-medium">
                                {kw.keyword}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Comparer */}
        <TabsContent value="compare" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Comparer des mots-clés</CardTitle>
              <CardDescription>
                Comparez jusqu'à 10 mots-clés côte à côte
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Mots-clés séparés par des virgules"
                  value={compareKeywords.join(", ")}
                  onChange={(e) =>
                    setCompareKeywords(
                      e.target.value
                        .split(",")
                        .map((k) => k.trim())
                        .filter((k) => k.length > 0)
                    )
                  }
                />
                <Button
                  onClick={handleCompareKeywords}
                  disabled={loading || compareKeywords.length < 2 || isDepleted}
                  title={isDepleted ? "Crédits épuisés. Passez à un plan supérieur dans Paramètres." : undefined}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <BarChart3 className="h-4 w-4" />
                  )}
                  Comparer
                </Button>
              </div>

              {compareResults.length > 0 && (
                <div className="space-y-6 mt-6">
                  {/* Graphique comparatif */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Comparaison visuelle</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={400}>
                        <BarChart data={compareResults}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            dataKey="keyword"
                            angle={-45}
                            textAnchor="end"
                            height={100}
                          />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="volume" fill="#8884d8" name="Volume" />
                          <Bar dataKey="kd" fill="#82ca9d" name="KD" />
                          <Bar dataKey="cpc" fill="#ffc658" name="CPC" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Tableau comparatif */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Tableau comparatif</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Mot-clé</TableHead>
                            <TableHead>Volume</TableHead>
                            <TableHead>KD</TableHead>
                            <TableHead>CPC</TableHead>
                            <TableHead>Intention</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {compareResults.map((result) => (
                            <TableRow key={result.keyword}>
                              <TableCell className="font-medium">
                                {result.keyword}
                              </TableCell>
                              <TableCell>
                                {result.volume.toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={getDifficultyColor(result.kd) as any}
                                >
                                  {result.kd}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                €{result.cpc.toFixed(2)}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={getIntentColor(result.searchIntent) as any}
                                >
                                  {result.searchIntent}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Historique */}
        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Historique des recherches</CardTitle>
              <CardDescription>
                Vos dernières analyses de mots-clés
              </CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Aucun historique disponible
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mot-clé</TableHead>
                      <TableHead>Volume</TableHead>
                      <TableHead>KD</TableHead>
                      <TableHead>Difficulté</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.keyword}
                        </TableCell>
                        <TableCell>
                          {item.volume
                            ? item.volume.toLocaleString()
                            : "N/A"}
                        </TableCell>
                        <TableCell>{item.kd || "N/A"}</TableCell>
                        <TableCell>
                          <Badge variant={item.difficulty === "hard" ? "destructive" : item.difficulty === "medium" ? "default" : "secondary"}>
                            {item.difficulty}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(item.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
