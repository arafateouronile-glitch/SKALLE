"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Search,
  Globe,
  TrendingUp,
  ExternalLink,
  Loader2,
  Sparkles,
  Target,
  BarChart3,
  Flame,
  Bell,
} from "lucide-react";
import { analyzeCompetitor } from "@/actions/discovery";
import { getUserWorkspace } from "@/actions/leads";
import { toast } from "sonner";
import { AdIntelligenceTab } from "@/components/modules/ad-intelligence-tab";
import { useCreditsContext } from "@/components/providers/credits-provider";
import Link from "next/link";
import { getCompetitorAlertsCountAction, markAlertsReadAction } from "@/actions/integrations";

interface DiscoveryData {
  topPages: Array<{
    title: string;
    link: string;
    snippet: string;
    position: number;
  }>;
  relatedKeywords: string[];
  keywordsShort: string[];
  keywordsMedium: string[];
  keywordsLongTail: string[];
  opportunities: Array<{
    keyword: string;
    difficulty: "easy" | "medium" | "hard";
    potential: number;
  }>;
}

export default function DiscoveryPage() {
  const { isDepleted } = useCreditsContext();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [domain, setDomain] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState<DiscoveryData | null>(null);
  const [alertsCount, setAlertsCount] = useState(0);
  const [alerts, setAlerts] = useState<Array<{
    id: string;
    competitorDomain: string;
    contentTitle: string | null;
    matchedKeyword: string | null;
    newContentUrl: string;
    createdAt: Date;
  }>>([]);
  const [showAlerts, setShowAlerts] = useState(false);

  useEffect(() => {
    getUserWorkspace().then((result) => {
      if (result.success && result.workspaceId) {
        setWorkspaceId(result.workspaceId);
        // Charger les alertes concurrents
        getCompetitorAlertsCountAction(result.workspaceId).then((r) => {
          setAlertsCount(r.count);
          setAlerts(r.alerts);
        });
      }
    });
  }, []);

  const handleAnalyze = async () => {
    if (!workspaceId) {
      toast.error("Workspace non chargé");
      return;
    }
    if (!domain) {
      toast.error("Veuillez entrer un domaine");
      return;
    }

    setIsLoading(true);
    try {
      const result = await analyzeCompetitor(workspaceId, domain);

      if (result.success && result.data) {
        setData(result.data);
        toast.success("Analyse terminée !");
      } else {
        toast.error(result.error || "Erreur lors de l'analyse");
      }
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setIsLoading(false);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy":
        return "bg-green-500/20 text-green-400 border-green-500/30";
      case "medium":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      case "hard":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      default:
        return "bg-gray-500/20 text-gray-500";
    }
  };

  const getDifficultyBarColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy":
        return "bg-green-500";
      case "medium":
        return "bg-yellow-500";
      case "hard":
        return "bg-red-500";
      default:
        return "bg-gray-400";
    }
  };

  const getPositionStyle = (position: number) => {
    switch (position) {
      case 1:
        return "bg-gradient-to-br from-yellow-400 to-amber-500 text-white shadow-amber-200/50 shadow-md";
      case 2:
        return "bg-gradient-to-br from-gray-300 to-gray-400 text-white shadow-gray-200/50 shadow-md";
      case 3:
        return "bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-orange-200/50 shadow-md";
      default:
        return "bg-emerald-500/15 text-emerald-700 border border-emerald-500/30";
    }
  };

  const isValidDomain = domain.length > 0 && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain.trim());

  if (!workspaceId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 shadow-lg shadow-emerald-200/40 shrink-0">
            <Target className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                Concurrents
              </span>
            </h1>
            <p className="text-gray-500 mt-1.5 text-base max-w-xl leading-relaxed">
              Analysez vos concurrents, leurs mots-clés et leurs publicités pour trouver des opportunités inexploitées.
            </p>
          </div>
        </div>

        {/* Badge alertes concurrents */}
        {alertsCount > 0 && (
          <div className="shrink-0">
            <button
              onClick={() => {
                setShowAlerts((v) => !v);
                if (!showAlerts && workspaceId) {
                  markAlertsReadAction(workspaceId).then(() => setAlertsCount(0));
                }
              }}
              className="relative flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 text-sm font-medium hover:bg-orange-100 transition-colors"
            >
              <Bell className="h-4 w-4" />
              <span>{alertsCount} nouvelle{alertsCount > 1 ? "s" : ""} alerte{alertsCount > 1 ? "s" : ""}</span>
              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold">
                {alertsCount > 9 ? "9+" : alertsCount}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Panel alertes concurrents */}
      {showAlerts && alerts.length > 0 && (
        <Card className="border border-orange-200 bg-orange-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-orange-800 flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Nouveaux contenus concurrents détectés
            </CardTitle>
            <CardDescription className="text-orange-600">
              L&apos;Agent a détecté ces nouvelles publications. Réagissez avec un article SEO ou un post social.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((alert) => (
              <div key={alert.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/70 border border-orange-100">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {alert.contentTitle ?? alert.newContentUrl}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {alert.competitorDomain}
                    {alert.matchedKeyword && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
                        #{alert.matchedKeyword}
                      </span>
                    )}
                  </p>
                </div>
                <a
                  href={alert.newContentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-emerald-600 hover:underline flex items-center gap-1 shrink-0"
                >
                  <ExternalLink className="h-3 w-3" />
                  Voir
                </a>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Outer Tabs: Analyse / Publicités ── */}
      <Tabs defaultValue="analyse" className="space-y-6">
        <TabsList className="bg-white/60 backdrop-blur-sm border border-gray-200/60">
          <TabsTrigger value="analyse" className="flex items-center gap-1.5">
            <Target className="h-4 w-4" />
            Analyse SEO
          </TabsTrigger>
          <TabsTrigger value="publicites" className="flex items-center gap-1.5">
            <Flame className="h-4 w-4" />
            Ad-Intelligence
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Analyse concurrentielle ── */}
        <TabsContent value="analyse" className="space-y-8">
      {isDepleted && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-red-800">
            Vous n&apos;avez plus de crédits. L&apos;analyse concurrentielle est désactivée.
          </p>
          <Button asChild size="sm" className="bg-red-600 hover:bg-red-700 shrink-0">
            <Link href="/marketing-os/settings">Passer à un plan supérieur</Link>
          </Button>
        </div>
      )}
      {/* ── Search Card ── */}
      <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
        <CardHeader className="pb-4">
          <CardTitle className="text-gray-900 flex items-center gap-2.5 text-lg">
            <Globe className="h-5 w-5 text-emerald-600" />
            Analyser un concurrent
          </CardTitle>
          <CardDescription className="text-gray-500">
            Entrez l&apos;URL d&apos;un site concurrent pour découvrir ses pages
            les plus performantes, ses mots-clés et les opportunités de contenu.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Label htmlFor="domain" className="sr-only">
                Domaine
              </Label>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-400 pointer-events-none" />
                <Input
                  id="domain"
                  placeholder="exemple.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
                  className="bg-white/80 border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:ring-emerald-500/20 h-12 pl-11 text-base rounded-xl"
                />
              </div>
              {/* Domain validation feedback */}
              {domain.length > 0 && (
                <p
                  className={`text-xs mt-1.5 ml-1 transition-colors ${
                    isValidDomain ? "text-emerald-600" : "text-gray-400"
                  }`}
                >
                  {isValidDomain
                    ? "Domaine valide - prêt pour l'analyse"
                    : "Entrez un domaine valide (ex: exemple.com)"}
                </p>
              )}
            </div>
            <Button
              onClick={handleAnalyze}
              disabled={isLoading || isDepleted}
              title={isDepleted ? "Crédits épuisés. Passez à un plan supérieur dans Paramètres." : undefined}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 h-12 px-8 rounded-xl text-base font-semibold shadow-md shadow-emerald-200/30 hover:shadow-lg hover:shadow-emerald-200/40 transition-all duration-200 shrink-0"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Analyser
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Results ── */}
      {data && (
        <Tabs defaultValue="pages" className="space-y-6">
          <TabsList className="bg-white/70 backdrop-blur-sm shadow-sm border border-gray-200/60 p-1 rounded-xl h-auto">
            <TabsTrigger
              value="pages"
              className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-all"
            >
              <Globe className="h-4 w-4 mr-1.5" />
              Top Pages ({data.topPages.length})
            </TabsTrigger>
            <TabsTrigger
              value="opportunities"
              className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-all"
            >
              <TrendingUp className="h-4 w-4 mr-1.5" />
              Opportunités ({data.opportunities.length})
            </TabsTrigger>
            <TabsTrigger
              value="keywords"
              className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-all"
            >
              <BarChart3 className="h-4 w-4 mr-1.5" />
              Mots-clés (
              {(data.keywordsShort?.length ?? 0) +
                (data.keywordsMedium?.length ?? 0) +
                (data.keywordsLongTail?.length ?? 0) ||
                data.relatedKeywords?.length ||
                0}
              )
            </TabsTrigger>
          </TabsList>

          {/* ── Top Pages Tab ── */}
          <TabsContent value="pages" className="space-y-4">
            <div className="grid gap-4">
              {data.topPages.map((page, index) => (
                <Card
                  key={index}
                  className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md hover:border-emerald-300/60 transition-all duration-200 group"
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      {/* Position badge */}
                      <div
                        className={`flex items-center justify-center h-11 w-11 rounded-xl text-sm font-bold shrink-0 ${getPositionStyle(page.position)}`}
                      >
                        #{page.position}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate text-base group-hover:text-emerald-700 transition-colors">
                          {page.title}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                          {page.snippet}
                        </p>
                        <a
                          href={page.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-emerald-600 hover:text-emerald-500 mt-2.5 inline-flex items-center gap-1 font-medium transition-colors"
                        >
                          {page.link.slice(0, 50)}...
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>

                      {/* Action button */}
                      <Button
                        size="sm"
                        className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm opacity-80 group-hover:opacity-100 transition-all shrink-0 rounded-lg"
                      >
                        <Sparkles className="h-4 w-4 mr-1.5" />
                        Générer un article
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── Opportunities Tab ── */}
          <TabsContent value="opportunities" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.opportunities.map((opp, index) => (
                <Card
                  key={index}
                  className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md hover:border-emerald-300/60 transition-all duration-200 group"
                >
                  <CardContent className="p-5">
                    {/* Header row */}
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900 text-base truncate mr-3">
                        {opp.keyword}
                      </h3>
                      <Badge
                        variant="outline"
                        className={`${getDifficultyColor(opp.difficulty)} shrink-0 text-xs font-medium`}
                      >
                        {opp.difficulty === "easy"
                          ? "Facile"
                          : opp.difficulty === "medium"
                          ? "Moyen"
                          : "Difficile"}
                      </Badge>
                    </div>

                    {/* Difficulty bar */}
                    <div className="space-y-1.5 mb-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 font-medium">
                          Difficulté
                        </span>
                        <span className="text-gray-700 font-semibold">
                          {opp.difficulty === "easy"
                            ? "Faible"
                            : opp.difficulty === "medium"
                            ? "Moyenne"
                            : "Élevée"}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getDifficultyBarColor(opp.difficulty)}`}
                          style={{
                            width:
                              opp.difficulty === "easy"
                                ? "30%"
                                : opp.difficulty === "medium"
                                ? "60%"
                                : "90%",
                          }}
                        />
                      </div>
                    </div>

                    {/* Potential bar */}
                    <div className="space-y-1.5 mb-5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 font-medium">
                          Potentiel
                        </span>
                        <span className="text-emerald-700 font-bold text-sm">
                          {opp.potential}%
                        </span>
                      </div>
                      <Progress
                        value={opp.potential}
                        className="h-2 bg-emerald-50 rounded-full [&>[data-slot=progress-indicator]]:bg-gradient-to-r [&>[data-slot=progress-indicator]]:from-emerald-500 [&>[data-slot=progress-indicator]]:to-teal-500"
                      />
                    </div>

                    {/* Action button */}
                    <Button
                      size="sm"
                      className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm rounded-lg font-semibold"
                    >
                      <TrendingUp className="h-4 w-4 mr-2" />
                      Créer un article
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ── Keywords Tab ── */}
          <TabsContent value="keywords" className="space-y-4">
            <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="text-gray-900 flex items-center gap-2.5 text-lg">
                  <BarChart3 className="h-5 w-5 text-emerald-600" />
                  Mots-clés associés
                </CardTitle>
                <CardDescription className="text-gray-500">
                  Courts (1-2 mots), moyen (3-4 mots), longue traîne (5+ mots)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {(data.keywordsShort?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      Courts (1-2 mots)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(data.keywordsShort ?? []).map((keyword, index) => (
                        <Badge
                          key={`short-${index}`}
                          variant="outline"
                          className="bg-violet-50/80 text-violet-700 border-violet-200/80 cursor-pointer hover:bg-violet-100 hover:border-violet-300 px-3 py-1.5 text-sm font-medium"
                        >
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {(data.keywordsMedium?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      Moyen (3-4 mots)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(data.keywordsMedium ?? []).map((keyword, index) => (
                        <Badge
                          key={`medium-${index}`}
                          variant="outline"
                          className="bg-emerald-50/80 text-emerald-700 border-emerald-200/80 cursor-pointer hover:bg-emerald-100 hover:border-emerald-300 px-3 py-1.5 text-sm font-medium"
                        >
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {(data.keywordsLongTail?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      Longue traîne (5+ mots)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(data.keywordsLongTail ?? []).map((keyword, index) => (
                        <Badge
                          key={`long-${index}`}
                          variant="outline"
                          className="bg-teal-50/80 text-teal-700 border-teal-200/80 cursor-pointer hover:bg-teal-100 hover:border-teal-300 px-3 py-1.5 text-sm font-medium"
                        >
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {((data.keywordsShort?.length ?? 0) + (data.keywordsMedium?.length ?? 0) + (data.keywordsLongTail?.length ?? 0)) === 0 &&
                  (data.relatedKeywords?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      Mots-clés
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(data.relatedKeywords ?? []).map((keyword, index) => (
                        <Badge
                          key={index}
                          variant="outline"
                          className="bg-emerald-50/80 text-emerald-700 border-emerald-200/80 px-3 py-1.5 text-sm"
                        >
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* ── Empty State ── */}
      {!data && !isLoading && (
        <div className="space-y-10">
          {/* Illustration placeholder + CTA */}
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 mb-5 shadow-sm">
              <Search className="h-9 w-9 text-emerald-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              Commencez votre analyse concurrentielle
            </h3>
            <p className="text-gray-500 max-w-lg mx-auto leading-relaxed">
              Entrez le domaine d&apos;un concurrent pour découvrir ses
              meilleures pages, ses mots-clés stratégiques et des opportunités
              de contenu inexploitées.
            </p>
          </div>

          {/* Feature cards - 3 columns */}
          <div className="grid md:grid-cols-3 gap-5">
            <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow text-center">
              <CardContent className="pt-7 pb-6 px-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-50 mb-4">
                  <Globe className="h-6 w-6 text-emerald-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-1.5">
                  Pages performantes
                </h4>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Identifiez les pages qui génèrent le plus de trafic chez vos
                  concurrents et inspirez-vous de leur stratégie.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow text-center">
              <CardContent className="pt-7 pb-6 px-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-teal-50 mb-4">
                  <TrendingUp className="h-6 w-6 text-teal-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-1.5">
                  Opportunités SEO
                </h4>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Découvrez les mots-clés à faible concurrence avec un fort
                  potentiel de trafic pour votre site.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm hover:shadow-md transition-shadow text-center">
              <CardContent className="pt-7 pb-6 px-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-50 mb-4">
                  <Sparkles className="h-6 w-6 text-emerald-600" />
                </div>
                <h4 className="font-semibold text-gray-900 mb-1.5">
                  Génération de contenu
                </h4>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Générez automatiquement des articles optimisés SEO à partir
                  des opportunités identifiées.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Suggested domains */}
          <Card className="bg-white/70 backdrop-blur-sm border-gray-200/60 shadow-sm">
            <CardContent className="py-5 px-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <span className="text-sm font-medium text-gray-700 shrink-0">
                  Essayez avec :
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    "hubspot.com",
                    "semrush.com",
                    "ahrefs.com",
                    "moz.com",
                    "neilpatel.com",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setDomain(suggestion)}
                      className="text-sm px-3.5 py-1.5 rounded-lg bg-emerald-50/80 text-emerald-700 border border-emerald-200/60 hover:bg-emerald-100 hover:border-emerald-300 transition-all duration-150 font-medium cursor-pointer"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
        </TabsContent>

        {/* ── Tab: Ad-Intelligence ── */}
        <TabsContent value="publicites">
          {workspaceId && <AdIntelligenceTab workspaceId={workspaceId} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
