"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  RefreshCw,
  ThumbsUp,
  MessageSquare,
  Users,
  TrendingUp,
  Linkedin,
  Loader2,
  BarChart2,
  FileText,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PostRow {
  id: string;
  title: string;
  publishedAt: string | null;
  isCarousel: boolean;
  likes: number;
  comments: number;
  engagementRate: number | null;
  hasMetrics: boolean;
}

interface WeeklyData {
  week: string;
  likes: number;
  comments: number;
  posts: number;
}

interface AnalyticsData {
  totalPosts: number;
  totalLikes: number;
  totalComments: number;
  followerCount: number | null;
  weekly: WeeklyData[];
  topPosts: PostRow[];
  synced: boolean;
}

function KpiCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  sub?: string;
}) {
  return (
    <Card className="bg-white/80 border-gray-200/60">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] text-gray-500">{label}</p>
          <Icon className="h-4 w-4 text-gray-400" />
        </div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function formatWeek(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export default function SocialAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/social/analytics");
      if (res.ok) setData(await res.json() as AnalyticsData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function sync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/social/analytics", { method: "POST" });
      const result = await res.json() as { synced: number; errors: number; followerCount: number | null };
      if (res.ok) {
        toast.success(`${result.synced} post${result.synced > 1 ? "s" : ""} synchronisé${result.synced > 1 ? "s" : ""} depuis LinkedIn.`);
        await load();
      } else {
        toast.error("Synchronisation impossible. Vérifie ta connexion LinkedIn.");
      }
    } catch {
      toast.error("Erreur réseau.");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  const noData = !data || data.totalPosts === 0;

  return (
    <div className="min-h-screen text-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200/60 bg-white/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                <BarChart2 className="h-7 w-7 text-violet-500" />
                Analytics Social
              </h1>
              <p className="mt-1 text-gray-500 text-sm">
                Performance de tes posts LinkedIn — 30 derniers jours
              </p>
            </div>
            <Button
              onClick={sync}
              disabled={syncing}
              className="gap-2 bg-[#0a66c2] hover:bg-[#004182] text-white"
            >
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Sync depuis LinkedIn
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Not synced banner */}
        {data && !data.synced && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-[13px] font-medium text-amber-800">
                Métriques non synchronisées
              </p>
              <p className="text-[12px] text-amber-600">
                Clique sur "Sync depuis LinkedIn" pour récupérer les likes, commentaires et abonnés de tes posts publiés.
              </p>
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Posts publiés"
            value={data?.totalPosts ?? 0}
            icon={FileText}
            sub="30 derniers jours"
          />
          <KpiCard
            label="Likes totaux"
            value={data?.totalLikes ?? 0}
            icon={ThumbsUp}
            sub="Posts LinkedIn"
          />
          <KpiCard
            label="Commentaires"
            value={data?.totalComments ?? 0}
            icon={MessageSquare}
            sub="Posts LinkedIn"
          />
          <KpiCard
            label="Abonnés LinkedIn"
            value={data?.followerCount != null ? data.followerCount.toLocaleString("fr-FR") : "—"}
            icon={Users}
            sub={data?.followerCount != null ? "Mis à jour aujourd'hui" : "Non synchronisé"}
          />
        </div>

        {/* Engagement chart */}
        <Card className="bg-white/80 border-gray-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-gray-900">
              <TrendingUp className="h-4 w-4 text-violet-500" />
              Engagement hebdomadaire
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!data?.weekly.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <BarChart2 className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">Aucune donnée hebdomadaire disponible.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.weekly} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="week"
                    tickFormatter={formatWeek}
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    labelFormatter={(l) => `Semaine du ${formatWeek(l as string)}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="likes" name="Likes" fill="#6d28d9" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="comments" name="Commentaires" fill="#a78bfa" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="posts" name="Posts" fill="#ddd6fe" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top posts */}
        <Card className="bg-white/80 border-gray-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-gray-900">
              <Linkedin className="h-4 w-4 text-[#0a66c2]" />
              Top posts (30j)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {noData || !data.topPosts.length ? (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">Aucun post publié ces 30 derniers jours.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.topPosts.map((post, i) => (
                  <div key={post.id} className="flex items-center gap-3 py-3">
                    <span className="text-[13px] font-bold text-gray-300 w-5 text-center">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-[13px] text-gray-800 truncate">{post.title}</p>
                        {post.isCarousel && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 border-violet-300 text-violet-600">
                            Carrousel
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-400">
                        {post.publishedAt
                          ? new Date(post.publishedAt).toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "short",
                            })
                          : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-[12px] text-gray-500">
                      <span className={cn("flex items-center gap-0.5", !post.hasMetrics && "opacity-30")}>
                        <ThumbsUp className="h-3 w-3 text-violet-400" />
                        {post.likes}
                      </span>
                      <span className={cn("flex items-center gap-0.5", !post.hasMetrics && "opacity-30")}>
                        <MessageSquare className="h-3 w-3 text-blue-400" />
                        {post.comments}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-[11px] text-center text-gray-400">
          Les impressions nécessitent le LinkedIn Marketing Developer Program.
          Likes et commentaires sont synchronisés via l&apos;API LinkedIn.
        </p>
      </div>
    </div>
  );
}
