"use client";

/**
 * Keyword Analyzer - Analyse de mots-clés style Semrush / Ubersuggest
 *
 * Fonctionnalités :
 * 1. Recherche de mot-clé avec métriques (volume, KD, CPC, concurrence)
 * 2. Graphique de tendance sur 12 mois
 * 3. Jauge de difficulté visuelle
 * 4. Features SERP détectées
 * 5. Intention de recherche
 * 6. Mots-clés associés avec métriques
 * 7. Questions "People Also Ask"
 * 8. Analyse SERP (top concurrents)
 * 9. Historique des recherches
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
import { Progress } from "@/components/ui/progress";
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
  Loader2,
  ArrowRight,
  ExternalLink,
  MessageCircleQuestion,
  Globe,
  ShoppingCart,
  Navigation,
  Shuffle,
  Star,
  Zap,
  Eye,
  Image as ImageIcon,
  MapPin,
  Play,
  FileText,
  Sparkles,
  History,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Crown,
  Shield,
  Award,
  Download,
  FileText as FileTextIcon,
  CheckSquare,
} from "lucide-react";
import { toast } from "sonner";
import { getUserWorkspace } from "@/actions/leads";
import {
  getKeywordIntelligence,
  researchKeyword,
  generateContentBrief,
} from "@/actions/seo";
import type { KeywordMetrics } from "@/types/intelligence";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/checkbox";
import { useCreditsContext } from "@/components/providers/credits-provider";
import Link from "next/link";

// Noms des mois FR
const MONTH_NAMES = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Jun",
  "Jul",
  "Aoû",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];

// Couleur de la jauge KD
function getKDColor(kd: number): string {
  if (kd <= 29) return "#10b981"; // green - easy
  if (kd <= 49) return "#f59e0b"; // yellow - medium
  if (kd <= 69) return "#f97316"; // orange - hard
  return "#ef4444"; // red - very hard
}

function getKDLabel(kd: number): string {
  if (kd <= 29) return "Facile";
  if (kd <= 49) return "Possible";
  if (kd <= 69) return "Difficile";
  return "Très difficile";
}

function getIntentIcon(intent: string) {
  switch (intent) {
    case "informational":
      return <Eye className="h-4 w-4" />;
    case "transactional":
      return <ShoppingCart className="h-4 w-4" />;
    case "navigational":
      return <Navigation className="h-4 w-4" />;
    default:
      return <Shuffle className="h-4 w-4" />;
  }
}

function getIntentLabel(intent: string): string {
  switch (intent) {
    case "informational":
      return "Informationnel";
    case "transactional":
      return "Transactionnel";
    case "navigational":
      return "Navigationnel";
    default:
      return "Mixte";
  }
}

function getIntentColor(intent: string): string {
  switch (intent) {
    case "informational":
      return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    case "transactional":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "navigational":
      return "bg-purple-500/10 text-purple-600 border-purple-500/20";
    default:
      return "bg-gray-500/10 text-gray-600 border-gray-500/20";
  }
}

function formatVolume(vol: number | null): string {
  if (vol === null || vol === undefined) return "N/A";
  if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
  return vol.toString();
}

function formatCompetition(comp: number | string | null | undefined): string {
  if (comp === null || comp === undefined) return "N/A";
  if (typeof comp === 'number') {
    return `${Math.round(comp * 100)}%`;
  }
  if (typeof comp === 'string') {
    return comp === "high" ? "Élevée" : comp === "medium" ? "Moyenne" : "Faible";
  }
  return "N/A";
}

interface SearchHistoryItem {
  keyword: string;
  volume: number | null;
  kd: number | null;
  timestamp: Date;
}

export default function KeywordAnalyzerPage() {
  const router = useRouter();
  const { isDepleted } = useCreditsContext();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [metrics, setMetrics] = useState<KeywordMetrics | null>(null);
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set());
  const [serpData, setSerpData] = useState<any | null>(null);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);

  useEffect(() => {
    getUserWorkspace().then((result) => {
      if (result.success && result.workspaceId) {
        setWorkspaceId(result.workspaceId);
      }
    });
  }, []);

  const handleSearch = async () => {
    if (!keyword.trim() || !workspaceId) {
      toast.error("Veuillez entrer un mot-clé");
      return;
    }

    setIsLoading(true);
    setMetrics(null);
    setSerpData(null);

    try {
      // Fetch keyword intelligence and SERP data in parallel
      const [intelligenceResult, serpResult] = await Promise.all([
        getKeywordIntelligence(workspaceId, keyword.trim()),
        researchKeyword(workspaceId, keyword.trim()),
      ]);

      if (intelligenceResult.success && intelligenceResult.data) {
        setMetrics(intelligenceResult.data);
      }

      if (serpResult.success && serpResult.data) {
        setSerpData(serpResult.data);
      }

      if (!intelligenceResult.success && !serpResult.success) {
        toast.error("Erreur lors de l'analyse du mot-clé");
      } else {
        // Add to history
        setSearchHistory((prev) => {
          const newItem: SearchHistoryItem = {
            keyword: keyword.trim(),
            volume: intelligenceResult.data?.volume ?? null,
            kd: intelligenceResult.data?.kd ?? null,
            timestamp: new Date(),
          };
          const filtered = prev.filter(
            (h) => h.keyword.toLowerCase() !== keyword.trim().toLowerCase()
          );
          return [newItem, ...filtered].slice(0, 10);
        });
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateBrief = async () => {
    if (!workspaceId || !keyword.trim()) return;

    setIsGeneratingBrief(true);
    try {
      const result = await generateContentBrief(workspaceId, keyword.trim());
      if (result.success && result.data) {
        toast.success("Brief de contenu généré !");
        // Navigate to SEO factory with keyword pre-filled
        router.push(
          `/marketing-os/seo-factory?keyword=${encodeURIComponent(keyword.trim())}`
        );
      } else {
        toast.error(result.error || "Erreur lors de la génération du brief");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsGeneratingBrief(false);
    }
  };

  const handleHistoryClick = (kw: string) => {
    setKeyword(kw);
    // Auto-search
    setTimeout(() => {
      const btn = document.getElementById("search-btn");
      btn?.click();
    }, 100);
  };

  // Build trend chart data
  const trendData =
    metrics?.trend && metrics.trend.length > 0
      ? metrics.trend.map((vol, i) => {
          const now = new Date();
          const monthIndex = (now.getMonth() - (metrics.trend.length - 1 - i) + 12) % 12;
          return {
            month: MONTH_NAMES[monthIndex],
            volume: vol,
          };
        })
      : null;

  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {isDepleted && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-red-800">
            Vous n&apos;avez plus de crédits. Les analyses et la génération de brief sont désactivées.
          </p>
          <Button asChild size="sm" className="bg-red-600 hover:bg-red-700 shrink-0">
            <Link href="/marketing-os/settings">Passer à un plan supérieur</Link>
          </Button>
        </div>
      )}
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Search className="h-8 w-8 text-emerald-600" />
          Keyword Analyzer
        </h1>
        <p className="text-gray-500 mt-2">
          Analysez n&apos;importe quel mot-clé : volume, difficulté, tendances,
          concurrence et opportunités
        </p>
      </div>

      {/* Search Bar */}
      <Card className="bg-white/70 backdrop-blur-xl shadow-lg border-gray-200/60 overflow-hidden">
        <CardContent className="p-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                placeholder="Entrez un mot-clé... ex: marketing digital, SEO local, content marketing"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-12 h-14 text-lg bg-white/80 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:ring-emerald-500/20 rounded-xl"
              />
            </div>
            <Button
              id="search-btn"
              onClick={handleSearch}
              disabled={isLoading || !keyword.trim() || isDepleted}
              title={isDepleted ? "Crédits épuisés. Passez à un plan supérieur dans Paramètres." : undefined}
              className="h-14 px-8 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/20"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Search className="h-5 w-5 mr-2" />
                  Analyser
                </>
              )}
            </Button>
          </div>

          {/* Search History */}
          {searchHistory.length > 0 && !metrics && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <History className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-400">Récent :</span>
              {searchHistory.slice(0, 5).map((h, i) => (
                <button
                  key={i}
                  onClick={() => handleHistoryClick(h.keyword)}
                  className="text-sm px-3 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                >
                  {h.keyword}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full border-4 border-emerald-100 border-t-emerald-500 animate-spin" />
            <Search className="absolute inset-0 m-auto h-8 w-8 text-emerald-600" />
          </div>
          <p className="text-gray-500 font-medium">
            Analyse de &quot;{keyword}&quot; en cours...
          </p>
          <p className="text-gray-400 text-sm">
            Récupération des données de volume, difficulté et concurrence
          </p>
        </div>
      )}

      {/* Results */}
      {!isLoading && (metrics || serpData) && (
        <div className="space-y-6">
          {/* Keyword Title + Actions */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                &quot;{metrics?.keyword || keyword}&quot;
              </h2>
              <div className="flex items-center gap-3 mt-2">
                {metrics?.searchIntent && (
                  <Badge
                    variant="outline"
                    className={getIntentColor(metrics.searchIntent)}
                  >
                    {getIntentIcon(metrics.searchIntent)}
                    <span className="ml-1">
                      {getIntentLabel(metrics.searchIntent)}
                    </span>
                  </Badge>
                )}
                {metrics?.dataSource && (
                  <Badge
                    variant="outline"
                    className="bg-gray-100 text-gray-500 border-gray-200"
                  >
                    Source: {metrics.dataSource}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleGenerateBrief}
                disabled={isGeneratingBrief || isDepleted}
                title={isDepleted ? "Crédits épuisés. Passez à un plan supérieur dans Paramètres." : undefined}
                className="border-gray-200 text-gray-700 hover:bg-gray-100"
              >
                {isGeneratingBrief ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                Content Brief
              </Button>
              <Button
                onClick={() =>
                  router.push(
                    `/marketing-os/seo-factory?keyword=${encodeURIComponent(
                      keyword.trim()
                    )}`
                  )
                }
                disabled={isDepleted}
                title={isDepleted ? "Crédits épuisés. Passez à un plan supérieur dans Paramètres." : undefined}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Générer un article
              </Button>
            </div>
          </div>

          {/* Metric Cards Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Volume */}
            <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-500">
                    Volume mensuel
                  </span>
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <BarChart3 className="h-4 w-4 text-blue-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {formatVolume(metrics?.volume ?? null)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Recherches / mois
                </p>
              </CardContent>
            </Card>

            {/* Keyword Difficulty */}
            <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-500">
                    Difficulté (KD)
                  </span>
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <Target className="h-4 w-4 text-orange-600" />
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <p
                    className="text-3xl font-bold"
                    style={{
                      color: getKDColor(metrics?.kd ?? 0),
                    }}
                  >
                    {metrics?.kd ?? "N/A"}
                  </p>
                  {metrics?.kd !== null && metrics?.kd !== undefined && (
                    <span className="text-sm font-medium text-gray-500 mb-1">
                      / 100
                    </span>
                  )}
                </div>
                {metrics?.kd !== null && metrics?.kd !== undefined && (
                  <>
                    <Progress
                      value={metrics.kd}
                      className="h-2 mt-2"
                    />
                    <p
                      className="text-xs font-medium mt-1"
                      style={{ color: getKDColor(metrics.kd) }}
                    >
                      {getKDLabel(metrics.kd)}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* CPC */}
            <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-500">
                    CPC moyen
                  </span>
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <DollarSign className="h-4 w-4 text-emerald-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {metrics?.cpc !== null && metrics?.cpc !== undefined
                    ? `${metrics.cpc.toFixed(2)} €`
                    : "N/A"}
                </p>
                <p className="text-xs text-gray-400 mt-1">Coût par clic</p>
              </CardContent>
            </Card>

            {/* Competition */}
            <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-500">
                    Concurrence
                  </span>
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <TrendingUp className="h-4 w-4 text-purple-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">
                  {metrics?.competition !== null &&
                  metrics?.competition !== undefined
                    ? `${Math.round(metrics.competition * 100)}%`
                    : "N/A"}
                </p>
                <p className="text-xs text-gray-400 mt-1">Niveau publicitaire</p>
              </CardContent>
            </Card>
          </div>

          {/* Trend Chart + KD Gauge Row */}
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Volume Trend Chart */}
            <Card className="lg:col-span-2 bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm">
              <CardHeader>
                <CardTitle className="text-gray-900 flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                  Tendance du volume de recherche
                </CardTitle>
                <CardDescription className="text-gray-500">
                  Évolution sur les 12 derniers mois
                </CardDescription>
              </CardHeader>
              <CardContent>
                {trendData ? (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trendData}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e5e7eb"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="month"
                          stroke="#9ca3af"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="#9ca3af"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => formatVolume(v)}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#ffffff",
                            border: "1px solid #e5e7eb",
                            borderRadius: "12px",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                          }}
                          formatter={(value?: number) => [
                            formatVolume(value ?? 0),
                            "Volume",
                          ]}
                        />
                        <Bar dataKey="volume" radius={[6, 6, 0, 0]}>
                          {trendData.map((_, index) => (
                            <Cell
                              key={index}
                              fill={
                                index === trendData.length - 1
                                  ? "#10b981"
                                  : "#d1fae5"
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-gray-400">
                    <p>Données de tendance non disponibles</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* KD Gauge + SERP Features */}
            <div className="space-y-6">
              {/* KD Visual Gauge */}
              <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-gray-900 text-sm font-medium">
                    Score de difficulté
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center">
                    <div className="relative w-36 h-36">
                      {/* Background circle */}
                      <svg className="w-full h-full" viewBox="0 0 120 120">
                        <circle
                          cx="60"
                          cy="60"
                          r="50"
                          fill="none"
                          stroke="#e5e7eb"
                          strokeWidth="10"
                          strokeLinecap="round"
                          strokeDasharray="236 78"
                          transform="rotate(135 60 60)"
                        />
                        <circle
                          cx="60"
                          cy="60"
                          r="50"
                          fill="none"
                          stroke={getKDColor(metrics?.kd ?? 0)}
                          strokeWidth="10"
                          strokeLinecap="round"
                          strokeDasharray={`${
                            ((metrics?.kd ?? 0) / 100) * 236
                          } 314`}
                          transform="rotate(135 60 60)"
                          className="transition-all duration-1000"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span
                          className="text-3xl font-bold"
                          style={{
                            color: getKDColor(metrics?.kd ?? 0),
                          }}
                        >
                          {metrics?.kd ?? "?"}
                        </span>
                        <span className="text-xs text-gray-400">/ 100</span>
                      </div>
                    </div>
                    <p
                      className="font-semibold mt-2"
                      style={{
                        color: getKDColor(metrics?.kd ?? 0),
                      }}
                    >
                      {getKDLabel(metrics?.kd ?? 0)}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* SERP Features */}
              <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-gray-900 text-sm font-medium">
                    SERP Features
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[
                      {
                        key: "featuredSnippet",
                        label: "Featured Snippet",
                        icon: <Star className="h-4 w-4" />,
                      },
                      {
                        key: "knowledgePanel",
                        label: "Knowledge Panel",
                        icon: <Shield className="h-4 w-4" />,
                      },
                      {
                        key: "localPack",
                        label: "Local Pack",
                        icon: <MapPin className="h-4 w-4" />,
                      },
                      {
                        key: "videoResults",
                        label: "Vidéos",
                        icon: <Play className="h-4 w-4" />,
                      },
                      {
                        key: "imageResults",
                        label: "Images",
                        icon: <ImageIcon className="h-4 w-4" />,
                      },
                    ].map((feature) => {
                      const active =
                        metrics?.serpFeatures?.[
                          feature.key as keyof typeof metrics.serpFeatures
                        ] ?? false;
                      return (
                        <div
                          key={feature.key}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                            active
                              ? "bg-emerald-50 border border-emerald-200/60"
                              : "bg-gray-50 border border-gray-100"
                          }`}
                        >
                          <span
                            className={
                              active ? "text-emerald-600" : "text-gray-300"
                            }
                          >
                            {feature.icon}
                          </span>
                          <span
                            className={`text-sm font-medium ${
                              active ? "text-emerald-700" : "text-gray-400"
                            }`}
                          >
                            {feature.label}
                          </span>
                          {active && (
                            <Badge className="ml-auto bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">
                              Actif
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Tabs: Related Keywords / PAA / SERP Analysis */}
          <Tabs defaultValue="related" className="space-y-6">
            <TabsList className="bg-white/60 backdrop-blur-sm shadow-sm border border-gray-200/60 p-1">
              <TabsTrigger
                value="related"
                className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-lg"
              >
                <Globe className="h-4 w-4 mr-2" />
                Mots-clés associés
                {metrics?.relatedKeywords && (
                  <Badge
                    variant="outline"
                    className="ml-2 bg-white/20 border-white/30 text-xs"
                  >
                    {metrics.relatedKeywords.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="paa"
                className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-lg"
              >
                <MessageCircleQuestion className="h-4 w-4 mr-2" />
                Questions (PAA)
                {metrics?.paaQuestions && (
                  <Badge
                    variant="outline"
                    className="ml-2 bg-white/20 border-white/30 text-xs"
                  >
                    {metrics.paaQuestions.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="serp"
                className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-lg"
              >
                <Award className="h-4 w-4 mr-2" />
                Analyse SERP
              </TabsTrigger>
            </TabsList>

            {/* Related Keywords Tab */}
            <TabsContent value="related">
              <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-gray-900 flex items-center gap-2">
                    <Globe className="h-5 w-5 text-emerald-600" />
                    Mots-clés associés
                  </CardTitle>
                  <CardDescription className="text-gray-500">
                    {metrics?.relatedKeywords && metrics.relatedKeywords.length > 0
                      ? `${metrics.relatedKeywords.length} mots-clés sémantiquement liés avec leurs métriques complètes (Volume, KD, CPC, Concurrence)`
                      : "Mots-clés sémantiquement liés avec leurs métriques"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {metrics?.relatedKeywords &&
                  metrics.relatedKeywords.length > 0 ? (
                    <div className="space-y-4">
                      {/* Info bar */}
                      <div className="flex items-center justify-between text-sm text-gray-500 bg-gray-50/50 p-3 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Zap className="h-4 w-4 text-emerald-600" />
                          <span>
                            Triés par opportunité (volume élevé + KD faible)
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          {selectedKeywords.size > 0 && (
                            <Badge variant="default" className="text-xs bg-emerald-600">
                              {selectedKeywords.size} sélectionné{selectedKeywords.size > 1 ? 's' : ''}
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {metrics.relatedKeywords.length} résultats
                          </Badge>
                        </div>
                      </div>
                      
                      {/* Actions d'export */}
                      {selectedKeywords.size > 0 && (
                        <div className="flex items-center gap-2 p-3 bg-emerald-50/50 rounded-lg border border-emerald-200/50">
                          <CheckSquare className="h-4 w-4 text-emerald-600" />
                          <span className="text-sm text-emerald-700 font-medium">
                            {selectedKeywords.size} mot-clé{selectedKeywords.size > 1 ? 's' : ''} sélectionné{selectedKeywords.size > 1 ? 's' : ''}
                          </span>
                          <div className="flex-1" />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const keywordsToExport = Array.from(selectedKeywords).join('\n');
                              localStorage.setItem('skalle_exported_keywords', keywordsToExport);
                              localStorage.setItem('skalle_exported_keywords_timestamp', Date.now().toString());
                              toast.success(`${selectedKeywords.size} mot-clé${selectedKeywords.size > 1 ? 's' : ''} exporté${selectedKeywords.size > 1 ? 's' : ''} !`);
                              toast.info('Vous pouvez maintenant les importer dans SEO Factory ou Strategy');
                            }}
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Exporter vers SEO Factory
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedKeywords(new Set())}
                            className="text-gray-500 hover:text-gray-700"
                          >
                            Tout désélectionner
                          </Button>
                        </div>
                      )}
                      
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-gray-200 hover:bg-transparent bg-gray-50/30">
                              <TableHead className="text-gray-600 font-semibold w-12">
                                <Checkbox
                                  checked={selectedKeywords.size === metrics.relatedKeywords.length && metrics.relatedKeywords.length > 0}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedKeywords(new Set(metrics.relatedKeywords.map(rk => rk.keyword)));
                                    } else {
                                      setSelectedKeywords(new Set());
                                    }
                                  }}
                                />
                              </TableHead>
                              <TableHead className="text-gray-600 font-semibold">
                                Mot-clé
                              </TableHead>
                              <TableHead className="text-gray-600 font-semibold text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <BarChart3 className="h-3 w-3" />
                                  Volume
                                </div>
                              </TableHead>
                              <TableHead className="text-gray-600 font-semibold text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Target className="h-3 w-3" />
                                  KD
                                </div>
                              </TableHead>
                              <TableHead className="text-gray-600 font-semibold text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <DollarSign className="h-3 w-3" />
                                  CPC
                                </div>
                              </TableHead>
                              <TableHead className="text-gray-600 font-semibold text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <TrendingUp className="h-3 w-3" />
                                  Concurrence
                                </div>
                              </TableHead>
                              <TableHead className="text-gray-600 font-semibold text-center">
                                Action
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                        <TableBody>
                          {metrics.relatedKeywords
                            .map((rk, i) => {
                              // Récupérer les métriques depuis le type intelligence (qui peut avoir null)
                              // ou depuis le nouveau format keyword-analyzer
                              const rkVolume = (rk as any).volume ?? rk.volume;
                              const rkKD = (rk as any).kd ?? null;
                              const rkCPC = (rk as any).cpc ?? rk.cpc;
                              const rkCompetition = (rk as any).competition ?? null;
                              
                              // Calculer le score d'opportunité pour le tri
                              const opportunityScore = rkVolume && rkKD !== null 
                                ? (rkVolume / 10000) * (100 - rkKD) 
                                : 0;
                              
                              return { rk, i, rkVolume, rkKD, rkCPC, rkCompetition, opportunityScore };
                            })
                            .sort((a, b) => b.opportunityScore - a.opportunityScore) // Trier par opportunité
                            .map(({ rk, i, rkVolume, rkKD, rkCPC, rkCompetition, opportunityScore }) => {
                              // Déterminer si c'est une bonne opportunité (volume élevé + KD faible)
                              const isGoodOpportunity = rkVolume && rkKD !== null && rkKD < 40 && rkVolume > 1000;
                              
                            return (
                              <TableRow
                                key={i}
                                className={`border-gray-100 hover:bg-emerald-50/30 ${
                                  isGoodOpportunity ? "bg-emerald-50/20" : ""
                                } ${selectedKeywords.has(rk.keyword) ? "bg-emerald-100/40" : ""}`}
                              >
                                <TableCell>
                                  <Checkbox
                                    checked={selectedKeywords.has(rk.keyword)}
                                    onCheckedChange={(checked) => {
                                      const newSelected = new Set(selectedKeywords);
                                      if (checked) {
                                        newSelected.add(rk.keyword);
                                      } else {
                                        newSelected.delete(rk.keyword);
                                      }
                                      setSelectedKeywords(newSelected);
                                    }}
                                  />
                                </TableCell>
                                <TableCell className="text-gray-900 font-medium">
                                  <div className="flex items-center gap-2">
                                    {isGoodOpportunity && (
                                      <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                                    )}
                                    <ChevronRight className="h-3 w-3 text-emerald-500" />
                                    <span className="font-medium">{rk.keyword}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right text-gray-700">
                                  {formatVolume(rkVolume)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {rkKD !== null && rkKD !== undefined ? (
                                    <div className="flex items-center justify-end gap-1">
                                      <span
                                        className="font-semibold"
                                        style={{ color: getKDColor(rkKD) }}
                                      >
                                        {rkKD}
                                      </span>
                                      <span className="text-xs text-gray-400">/ 100</span>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {rkCPC
                                    ? (
                                      <div className="flex flex-col items-end">
                                        <span className="text-gray-900 font-semibold">
                                          {typeof rkCPC === 'number' ? rkCPC.toFixed(2) : rkCPC} €
                                        </span>
                                        <span className="text-xs text-gray-400">
                                          par clic
                                        </span>
                                      </div>
                                    )
                                    : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {rkCompetition !== null && rkCompetition !== undefined ? (
                                    typeof rkCompetition === 'number' ? (
                                      <span className="text-gray-700">
                                        {Math.round(rkCompetition * 100)}%
                                      </span>
                                    ) : (
                                      <Badge
                                        variant={
                                          rkCompetition === "high"
                                            ? "destructive"
                                            : rkCompetition === "medium"
                                            ? "default"
                                            : "secondary"
                                        }
                                        className="text-xs"
                                      >
                                        {rkCompetition === "high"
                                          ? "Élevée"
                                          : rkCompetition === "medium"
                                          ? "Moyenne"
                                          : "Faible"}
                                      </Badge>
                                    )
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setKeyword(rk.keyword);
                                      handleSearch();
                                    }}
                                    className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                  >
                                    <Search className="h-3 w-3 mr-1" />
                                    Analyser
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Aucun mot-clé associé trouvé</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* PAA (People Also Ask) Tab */}
            <TabsContent value="paa">
              <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-gray-900 flex items-center gap-2">
                    <MessageCircleQuestion className="h-5 w-5 text-emerald-600" />
                    Questions &quot;People Also Ask&quot;
                  </CardTitle>
                  <CardDescription className="text-gray-500">
                    Questions fréquemment posées par les internautes — idéales
                    pour structurer votre contenu ou cibler un Featured Snippet
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {metrics?.paaQuestions &&
                  metrics.paaQuestions.length > 0 ? (
                    <div className="space-y-3">
                      {metrics.paaQuestions.map((question, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-4 p-4 rounded-xl bg-gradient-to-r from-blue-50/50 to-emerald-50/30 border border-gray-100 hover:border-emerald-200/60 transition-colors group"
                        >
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 font-bold text-sm shrink-0">
                            {i + 1}
                          </div>
                          <div className="flex-1">
                            <p className="text-gray-900 font-medium">
                              {question}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              router.push(
                                `/marketing-os/seo-factory?keyword=${encodeURIComponent(
                                  question
                                )}`
                              )
                            }
                            className="text-gray-400 group-hover:text-emerald-600 shrink-0"
                          >
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : serpData?.paaQuestions &&
                    serpData.paaQuestions.length > 0 ? (
                    <div className="space-y-3">
                      {serpData.paaQuestions.map(
                        (question: string, i: number) => (
                          <div
                            key={i}
                            className="flex items-start gap-4 p-4 rounded-xl bg-gradient-to-r from-blue-50/50 to-emerald-50/30 border border-gray-100 hover:border-emerald-200/60 transition-colors group"
                          >
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-600 font-bold text-sm shrink-0">
                              {i + 1}
                            </div>
                            <div className="flex-1">
                              <p className="text-gray-900 font-medium">
                                {question}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                router.push(
                                  `/marketing-os/seo-factory?keyword=${encodeURIComponent(
                                    question
                                  )}`
                                )
                              }
                              className="text-gray-400 group-hover:text-emerald-600 shrink-0"
                            >
                              <ArrowRight className="h-4 w-4" />
                            </Button>
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <MessageCircleQuestion className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Aucune question PAA trouvée</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* SERP Analysis Tab */}
            <TabsContent value="serp">
              <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-gray-900 flex items-center gap-2">
                    <Award className="h-5 w-5 text-emerald-600" />
                    Analyse SERP — Top Résultats
                  </CardTitle>
                  <CardDescription className="text-gray-500">
                    Les pages actuellement classées pour &quot;
                    {metrics?.keyword || keyword}&quot;
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {serpData?.topCompetitors &&
                  serpData.topCompetitors.length > 0 ? (
                    <div className="space-y-3">
                      {serpData.topCompetitors.map(
                        (
                          comp: {
                            domain: string;
                            title: string;
                            position: number;
                          },
                          i: number
                        ) => (
                          <div
                            key={i}
                            className="flex items-center gap-4 p-4 rounded-xl bg-white/60 border border-gray-100 hover:border-emerald-200/60 hover:shadow-sm transition-all"
                          >
                            {/* Position badge */}
                            <div
                              className={`flex items-center justify-center w-10 h-10 rounded-xl font-bold text-sm shrink-0 ${
                                comp.position === 1
                                  ? "bg-yellow-500/10 text-yellow-600 border border-yellow-200"
                                  : comp.position === 2
                                  ? "bg-gray-200/50 text-gray-600 border border-gray-200"
                                  : comp.position === 3
                                  ? "bg-orange-500/10 text-orange-600 border border-orange-200"
                                  : "bg-gray-100 text-gray-500 border border-gray-100"
                              }`}
                            >
                              {comp.position <= 3 ? (
                                <Crown className="h-4 w-4" />
                              ) : (
                                `#${comp.position}`
                              )}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <p className="text-gray-900 font-medium truncate">
                                {comp.title}
                              </p>
                              <p className="text-sm text-emerald-600 truncate">
                                {comp.domain}
                              </p>
                            </div>

                            {/* Position number for top 3 */}
                            {comp.position <= 3 && (
                              <Badge
                                className={`${
                                  comp.position === 1
                                    ? "bg-yellow-500/10 text-yellow-600 border-yellow-200"
                                    : comp.position === 2
                                    ? "bg-gray-200/50 text-gray-600 border-gray-300"
                                    : "bg-orange-500/10 text-orange-600 border-orange-200"
                                }`}
                              >
                                #{comp.position}
                              </Badge>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <Award className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Aucune donnée SERP disponible</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Empty State - No search yet */}
      {!isLoading && !metrics && !serpData && (
        <div className="space-y-8">
          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="bg-white/60 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow group">
              <CardContent className="p-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <BarChart3 className="h-7 w-7 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  Volume & Tendances
                </h3>
                <p className="text-sm text-gray-500">
                  Découvrez le volume de recherche mensuel et son évolution sur 12 mois
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/60 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow group">
              <CardContent className="p-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Target className="h-7 w-7 text-orange-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  Difficulté SEO
                </h3>
                <p className="text-sm text-gray-500">
                  Évaluez la compétitivité du mot-clé avec un score de difficulté précis
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/60 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow group">
              <CardContent className="p-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                  <Sparkles className="h-7 w-7 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  Opportunités
                </h3>
                <p className="text-sm text-gray-500">
                  Identifiez les mots-clés associés et les questions PAA pour dominer les SERPs
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Suggestions */}
          <Card className="bg-gradient-to-r from-emerald-50/50 via-white to-teal-50/50 border-emerald-200/40 shadow-sm">
            <CardContent className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Zap className="h-5 w-5 text-emerald-600" />
                Suggestions de recherche
              </h3>
              <div className="flex flex-wrap gap-2">
                {[
                  "marketing digital",
                  "SEO local",
                  "content marketing",
                  "intelligence artificielle",
                  "e-commerce",
                  "growth hacking",
                  "stratégie réseaux sociaux",
                  "lead generation",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setKeyword(suggestion);
                      setTimeout(() => {
                        document.getElementById("search-btn")?.click();
                      }, 100);
                    }}
                    className="px-4 py-2 rounded-full bg-white border border-gray-200 text-gray-700 text-sm hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 transition-all"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
