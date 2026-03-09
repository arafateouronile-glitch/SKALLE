import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  FileText,
  Minus,
  Zap,
  Brain,
  Calendar,
  Hash,
  Users,
  MessageSquare,
  Target,
  ArrowRight,
  DollarSign,
} from "lucide-react";
import { getPipelineAnalytics } from "@/actions/pipeline-analytics";
import { getROIDashboard } from "@/lib/services/analytics/roi-tracking";

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `Il y a ${days}j`;
}

function trend(current: number, previous: number): { pct: string; dir: "up" | "down" | "stable" } {
  if (previous === 0) return { pct: current > 0 ? "+∞" : "—", dir: current > 0 ? "up" : "stable" };
  const diff = ((current - previous) / previous) * 100;
  if (Math.abs(diff) < 1) return { pct: "~0%", dir: "stable" };
  return { pct: `${diff > 0 ? "+" : ""}${Math.round(diff)}%`, dir: diff > 0 ? "up" : "down" };
}

const POST_TYPE_LABELS: Record<string, string> = {
  SEO_ARTICLE: "Article SEO",
  LINKEDIN: "LinkedIn",
  X: "Post X",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
};

const STATUS_COLORS: Record<string, string> = {
  PUBLISHED: "bg-emerald-500",
  SCHEDULED: "bg-blue-400",
  DRAFT: "bg-gray-300",
  FAILED: "bg-red-400",
};

const SOCIAL_TYPES = ["LINKEDIN", "X", "INSTAGRAM", "TIKTOK"];

// ═══════════════════════════════════════════════════════════════════════════
// DATA FETCHING
// ═══════════════════════════════════════════════════════════════════════════

async function getAnalyticsData(userId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { userId },
    select: {
      id: true,
      _count: {
        select: {
          posts: { where: { deletedAt: null } },
          audits: true,
          agentDecisions: true,
        },
      },
    },
  });
  if (!workspace) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { credits: true, plan: true },
  });

  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(now.getDate() - 14);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const [
    postsLast7,
    postsPrev7Count,
    recentPosts,
    topKeywords,
    keywordsCount,
    agentStats,
  ] = await Promise.all([
    // Posts des 7 derniers jours (pour le graphe hebdomadaire)
    prisma.post.findMany({
      where: {
        workspaceId: workspace.id,
        deletedAt: null,
        createdAt: { gte: sevenDaysAgo },
      },
      select: { createdAt: true, type: true, status: true, title: true },
      orderBy: { createdAt: "desc" },
    }),
    // Posts des 7 jours précédents (pour le calcul de tendance)
    prisma.post.count({
      where: {
        workspaceId: workspace.id,
        deletedAt: null,
        createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
      },
    }),
    // Activité récente (10 derniers posts)
    prisma.post.findMany({
      where: { workspaceId: workspace.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, title: true, type: true, status: true, createdAt: true },
    }),
    // Top mots-clés (par volume, ou par ordre de création si volume null)
    prisma.keywordResearch.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ volume: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: { keyword: true, volume: true, kd: true, difficulty: true },
    }),
    // Nombre total de mots-clés
    prisma.keywordResearch.count({ where: { workspaceId: workspace.id } }),
    // Stats des décisions agent (30 jours)
    prisma.agentDecision.groupBy({
      by: ["status"],
      where: {
        workspaceId: workspace.id,
        createdAt: { gte: thirtyDaysAgo },
      },
      _count: true,
    }),
  ]);

  // Grouper les posts par jour (derniers 7 jours)
  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(now.getDate() - (6 - i));
    const key = d.toISOString().split("T")[0];
    const dayPosts = postsLast7.filter(
      (p) => p.createdAt.toISOString().split("T")[0] === key
    );
    return {
      day: d.toLocaleDateString("fr-FR", { weekday: "short" }),
      articles: dayPosts.filter((p) => p.type === "SEO_ARTICLE").length,
      social: dayPosts.filter((p) => SOCIAL_TYPES.includes(p.type)).length,
    };
  });

  const maxDayVal = Math.max(...weeklyData.map((d) => d.articles + d.social), 1);

  // Calcul des tendances
  const seoPosts7 = postsLast7.filter((p) => p.type === "SEO_ARTICLE").length;
  const socialPosts7 = postsLast7.filter((p) => SOCIAL_TYPES.includes(p.type)).length;
  const totalPosts7 = postsLast7.length;
  const totalTrend = trend(totalPosts7, postsPrev7Count);

  const agentTotal = agentStats.reduce((s, d) => s + d._count, 0);
  const agentExecuted = agentStats.find((d) => d.status === "EXECUTED")?._count ?? 0;
  const agentApproved = agentStats.find((d) => d.status === "APPROVED")?._count ?? 0;
  const agentRejected = agentStats.find((d) => d.status === "REJECTED")?._count ?? 0;

  return {
    workspace,
    user,
    counts: {
      posts: workspace._count.posts,
      audits: workspace._count.audits,
      agentDecisions: workspace._count.agentDecisions,
      keywords: keywordsCount,
    },
    trends: {
      posts: totalTrend,
    },
    postsLast7: { seo: seoPosts7, social: socialPosts7, total: totalPosts7 },
    weeklyData,
    maxDayVal,
    recentPosts,
    topKeywords,
    agentStats: { total: agentTotal, executed: agentExecuted, approved: agentApproved, rejected: agentRejected },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const data = await getAnalyticsData(session.user.id);
  if (!data) redirect("/login");

  const pipelineResult = await getPipelineAnalytics(data.workspace.id);
  const pipeline = pipelineResult.success ? pipelineResult.data : null;
  const roiReport = await getROIDashboard(data.workspace.id);

  const { counts, trends, postsLast7, weeklyData, maxDayVal, recentPosts, topKeywords, agentStats } = data;

  const kpiCards = [
    {
      name: "Articles SEO publiés",
      value: postsLast7.seo,
      sub: "7 derniers jours",
      trend: trends.posts,
      icon: FileText,
    },
    {
      name: "Posts sociaux créés",
      value: postsLast7.social,
      sub: "7 derniers jours",
      trend: trends.posts,
      icon: Hash,
    },
    {
      name: "Mots-clés trackés",
      value: counts.keywords,
      sub: "Total workspace",
      trend: { pct: "—", dir: "stable" as const },
      icon: Zap,
    },
    {
      name: "Décisions agent (30j)",
      value: agentStats.total,
      sub: `${agentStats.executed} exécutées`,
      trend: { pct: "—", dir: "stable" as const },
      icon: Brain,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-emerald-600" />
          Analytics
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          Performances réelles de votre workspace — {counts.posts} contenus ·{" "}
          {counts.audits} audits · {counts.keywords} mots-clés
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((stat) => (
          <Card
            key={stat.name}
            className="bg-white/60 backdrop-blur-sm shadow-sm border border-gray-200/60"
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <stat.icon className="h-5 w-5 text-emerald-600" />
                </div>
                <Badge
                  variant="outline"
                  className={
                    stat.trend.dir === "up"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : stat.trend.dir === "down"
                      ? "bg-red-50 text-red-600 border-red-200"
                      : "bg-gray-50 text-gray-500 border-gray-200"
                  }
                >
                  {stat.trend.dir === "up" ? (
                    <TrendingUp className="h-3 w-3 mr-1" />
                  ) : stat.trend.dir === "down" ? (
                    <TrendingDown className="h-3 w-3 mr-1" />
                  ) : (
                    <Minus className="h-3 w-3 mr-1" />
                  )}
                  {stat.trend.pct}
                </Badge>
              </div>
              <p className="text-3xl font-bold text-gray-900 mt-4">{stat.value}</p>
              <p className="text-sm text-gray-700 mt-0.5 font-medium">{stat.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Weekly Chart */}
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border border-gray-200/60 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-gray-900">Activité 7 jours</CardTitle>
            <CardDescription>
              {postsLast7.total} contenus créés · {postsLast7.seo} articles SEO · {postsLast7.social} posts sociaux
            </CardDescription>
          </CardHeader>
          <CardContent>
            {postsLast7.total === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Aucun contenu créé cette semaine</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-end justify-between h-48 gap-2">
                  {weeklyData.map((day, i) => {
                    const total = day.articles + day.social;
                    const artH = Math.round((day.articles / maxDayVal) * 160);
                    const socH = Math.round((day.social / maxDayVal) * 160);
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full flex flex-col justify-end gap-0.5" style={{ height: "160px" }}>
                          {day.articles > 0 && (
                            <div
                              className="w-full bg-emerald-500 rounded-t-sm"
                              style={{ height: `${artH}px` }}
                              title={`${day.articles} article(s) SEO`}
                            />
                          )}
                          {day.social > 0 && (
                            <div
                              className="w-full bg-blue-400 rounded-b-sm"
                              style={{ height: `${socH}px` }}
                              title={`${day.social} post(s) social`}
                            />
                          )}
                          {total === 0 && (
                            <div className="w-full bg-gray-100 rounded" style={{ height: "4px" }} />
                          )}
                        </div>
                        <span className="text-xs text-gray-400 mt-1 capitalize">{day.day}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-center gap-6 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-emerald-500" />
                    <span className="text-xs text-gray-500">Articles SEO</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded bg-blue-400" />
                    <span className="text-xs text-gray-500">Posts sociaux</span>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border border-gray-200/60">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-emerald-600" />
              Activité récente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentPosts.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">
                Aucun contenu créé
              </p>
            ) : (
              <div className="space-y-3">
                {recentPosts.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-center gap-3 p-2 rounded-lg bg-white/50"
                  >
                    <div
                      className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[post.status] ?? "bg-gray-300"}`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-900 truncate font-medium">
                        {post.title ?? POST_TYPE_LABELS[post.type] ?? post.type}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-gray-400">
                          {POST_TYPE_LABELS[post.type] ?? post.type}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="text-xs text-gray-400">
                          {relativeTime(post.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Vue Sales / Pipeline (CMO + CSO unifié) */}
      {pipeline && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <Target className="h-5 w-5 text-violet-600" />
              Vue Sales & Pipeline
            </h2>
            <Link
              href="/sales-os/analytics"
              className="text-sm font-medium text-violet-600 hover:text-violet-700 flex items-center gap-1"
            >
              Voir le détail
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="bg-white/60 backdrop-blur-sm shadow-sm border border-violet-200/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <Users className="h-5 w-5 text-violet-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-3">
                  {pipeline.funnel.reduce((s, f) => s + f.count, 0)}
                </p>
                <p className="text-sm font-medium text-gray-700">Prospects pipeline</p>
                <p className="text-xs text-gray-400 mt-0.5">Toutes étapes</p>
              </CardContent>
            </Card>
            <Card className="bg-white/60 backdrop-blur-sm shadow-sm border border-violet-200/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <MessageSquare className="h-5 w-5 text-violet-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-3">
                  {pipeline.funnel.find((f) => f.stage === "REPLIED")?.count ?? 0}
                </p>
                <p className="text-sm font-medium text-gray-700">En discussion</p>
                <p className="text-xs text-gray-400 mt-0.5">Ont répondu</p>
              </CardContent>
            </Card>
            <Card className="bg-white/60 backdrop-blur-sm shadow-sm border border-violet-200/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <DollarSign className="h-5 w-5 text-violet-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-3">
                  {pipeline.totalPipelineValue >= 1000
                    ? `${(pipeline.totalPipelineValue / 1000).toFixed(1)}k`
                    : pipeline.totalPipelineValue.toLocaleString("fr-FR")} €
                </p>
                <p className="text-sm font-medium text-gray-700">Valeur pipeline</p>
                <p className="text-xs text-gray-400 mt-0.5">Deals en cours</p>
              </CardContent>
            </Card>
            <Card className="bg-white/60 backdrop-blur-sm shadow-sm border border-violet-200/60">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <Target className="h-5 w-5 text-violet-600" />
                </div>
                <p className="text-2xl font-bold text-gray-900 mt-3">
                  {pipeline.winRate != null ? `${Math.round(pipeline.winRate)}%` : "—"}
                </p>
                <p className="text-sm font-medium text-gray-700">Win rate</p>
                <p className="text-xs text-gray-400 mt-0.5">Convertis / clôturés</p>
              </CardContent>
            </Card>
          </div>
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border border-violet-200/60">
            <CardHeader>
              <CardTitle className="text-gray-900 text-base">Tunnel par étape</CardTitle>
              <CardDescription>Répartition des prospects</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {pipeline.funnel.map((stage) => (
                  <div key={stage.stage} className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-600 w-24">{stage.label}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-violet-500"
                          style={{
                            width: `${Math.min(100, (stage.count / Math.max(1, pipeline.funnel.reduce((s, f) => s + f.count, 0))) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-900 w-8">{stage.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* ROI Attribution CMO→CSO */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <DollarSign className="h-5 w-5 text-emerald-600" />
          Attribution ROI — Marketing → Pipeline
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          {[
            { label: "Pipeline généré (90j)", value: roiReport.totalPipelineValue >= 1000 ? `${(roiReport.totalPipelineValue / 1000).toFixed(1)}k€` : `${roiReport.totalPipelineValue}€`, sub: `${roiReport.totalConverted} deals closés` },
            { label: "Taux de conversion", value: `${roiReport.conversionRate}%`, sub: `${roiReport.totalProspects} prospects total` },
            { label: "Deal value moyen", value: roiReport.avgDealValue >= 1000 ? `${(roiReport.avgDealValue / 1000).toFixed(1)}k€` : `${roiReport.avgDealValue}€`, sub: "par prospect converti" },
            { label: "A/B Test gagnant", value: roiReport.abTestInsights?.dominantFramework ?? "—", sub: roiReport.abTestInsights ? `${roiReport.abTestInsights.totalTests} tests analysés` : "Pas encore de données" },
          ].map((card) => (
            <Card key={card.label} className="bg-white/60 backdrop-blur-sm shadow-sm border border-emerald-200/60">
              <CardContent className="p-5">
                <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="text-sm font-medium text-gray-700 mt-0.5">{card.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Attribution par source */}
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border border-gray-200/60">
            <CardHeader>
              <CardTitle className="text-gray-900 text-base">Pipeline par source</CardTitle>
              <CardDescription>Quel canal génère le plus de valeur ?</CardDescription>
            </CardHeader>
            <CardContent>
              {Object.entries(roiReport.attributionBySource).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Aucune donnée d&apos;attribution encore</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(roiReport.attributionBySource)
                    .sort(([, a], [, b]) => b.totalValue - a.totalValue)
                    .map(([source, data]) => (
                      <div key={source} className="flex items-center gap-3">
                        <span className="text-xs font-medium text-gray-600 w-32 truncate">{source.replace(/_/g, " ")}</span>
                        <div className="flex-1">
                          <Progress
                            value={roiReport.totalPipelineValue > 0 ? Math.round((data.totalValue / roiReport.totalPipelineValue) * 100) : 0}
                            className="h-2"
                          />
                        </div>
                        <div className="text-right w-24 shrink-0">
                          <p className="text-xs font-semibold text-gray-900">
                            {data.totalValue >= 1000 ? `${(data.totalValue / 1000).toFixed(1)}k€` : `${data.totalValue}€`}
                          </p>
                          <p className="text-xs text-gray-400">{data.count} leads · {data.conversionRate}%</p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top articles par ROI */}
          <Card className="bg-white/60 backdrop-blur-sm shadow-sm border border-gray-200/60">
            <CardHeader>
              <CardTitle className="text-gray-900 text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-600" />
                Top articles par pipeline généré
              </CardTitle>
              <CardDescription>Articles SEO qui convertissent le plus</CardDescription>
            </CardHeader>
            <CardContent>
              {roiReport.topArticlesByROI.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Attribution article non disponible</p>
              ) : (
                <div className="space-y-3">
                  {roiReport.topArticlesByROI.slice(0, 5).map((article, i) => (
                    <div key={article.postId} className="flex items-center gap-3 p-2 rounded-lg bg-white/50">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">{article.title}</p>
                        <p className="text-xs text-gray-400">{article.leads} leads{article.seoScore ? ` · SEO ${article.seoScore}` : ""}</p>
                      </div>
                      <span className="text-xs font-semibold text-emerald-700 shrink-0">
                        {article.pipeline >= 1000 ? `${(article.pipeline / 1000).toFixed(1)}k€` : `${article.pipeline}€`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom row: Top Keywords + Agent Stats */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Top Keywords */}
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border border-gray-200/60 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-gray-900">Top mots-clés</CardTitle>
            <CardDescription>
              {counts.keywords} mots-clés trackés — classés par volume de recherche
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topKeywords.length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <Hash className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Aucun mot-clé encore recherché</p>
                <p className="text-xs mt-1">
                  Utilisez le{" "}
                  <a
                    href="/marketing-os/keywords"
                    className="text-emerald-600 underline"
                  >
                    Keyword Analyzer
                  </a>{" "}
                  pour démarrer
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {topKeywords.map((kw, i) => {
                  const difficultyVal = kw.kd ?? 0;
                  const diffColor =
                    difficultyVal < 30
                      ? "text-emerald-600"
                      : difficultyVal < 60
                      ? "text-amber-600"
                      : "text-red-500";
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-4 p-3 rounded-lg bg-white/50"
                    >
                      <span className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-medium text-gray-900 text-sm truncate">
                            {kw.keyword}
                          </span>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {kw.volume != null && (
                              <Badge variant="outline" className="text-xs bg-gray-50 text-gray-600 border-gray-200">
                                {kw.volume.toLocaleString("fr-FR")} / mois
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Progress
                            value={difficultyVal}
                            className="h-1.5 flex-1 bg-gray-100"
                          />
                          <span className={`text-xs font-medium w-12 text-right ${diffColor}`}>
                            KD {difficultyVal}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agent Performance */}
        <Card className="bg-white/60 backdrop-blur-sm shadow-sm border border-gray-200/60">
          <CardHeader>
            <CardTitle className="text-gray-900 flex items-center gap-2">
              <Brain className="h-5 w-5 text-violet-600" />
              Agent (30 jours)
            </CardTitle>
            <CardDescription>Performances de l&apos;agent IA</CardDescription>
          </CardHeader>
          <CardContent>
            {agentStats.total === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <Brain className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Aucune décision ce mois-ci</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-center py-3 rounded-xl bg-violet-50 border border-violet-100">
                  <p className="text-3xl font-bold text-violet-700">{agentStats.total}</p>
                  <p className="text-xs text-violet-500 mt-0.5">décisions générées</p>
                </div>

                {[
                  { label: "Exécutées", value: agentStats.executed, color: "bg-emerald-400", textColor: "text-emerald-700" },
                  { label: "Approuvées", value: agentStats.approved, color: "bg-blue-400", textColor: "text-blue-700" },
                  { label: "Rejetées", value: agentStats.rejected, color: "bg-red-400", textColor: "text-red-600" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3">
                    <div className="w-20 shrink-0">
                      <p className="text-xs text-gray-500">{row.label}</p>
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${row.color}`}
                        style={{
                          width: agentStats.total > 0
                            ? `${Math.round((row.value / agentStats.total) * 100)}%`
                            : "0%",
                        }}
                      />
                    </div>
                    <span className={`text-sm font-semibold w-6 text-right ${row.textColor}`}>
                      {row.value}
                    </span>
                  </div>
                ))}

                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400 text-center">
                    {agentStats.total > 0
                      ? `${Math.round((agentStats.executed / agentStats.total) * 100)}% taux d'exécution`
                      : "Activez l'Autopilot pour démarrer"}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
