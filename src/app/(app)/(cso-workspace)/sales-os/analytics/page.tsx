"use client";

/**
 * Pipeline Analytics & Revenue Forecasting — Executive Dashboard
 * KPIs : Total Pipeline Value, Weighted Forecast, Average Deal Size, Win Rate
 * Funnel : Nouveau > Contacté > Discussion > Gagné (count + value)
 * Donut : Répartition par source (LinkedIn, Facebook, Instagram, SEO)
 * Conseil du CSO : insight IA (argent bloqué en Discussion, etc.)
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  TrendingUp,
  Wallet,
  Target,
  Percent,
  Loader2,
  RefreshCw,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import {
  getPipelineAnalytics,
  getPipelineAnalyticsInsight,
  type PipelineAnalyticsResult,
} from "@/actions/pipeline-analytics";
import { getUserWorkspace } from "@/actions/leads";

const FUNNEL_COLORS = ["#6366f1", "#4f46e5", "#4338ca", "#22c55e"];
const PIE_COLORS = ["#6366f1", "#4f46e5", "#4338ca", "#22c55e", "#f59e0b"];

function formatEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export default function PipelineAnalyticsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [data, setData] = useState<PipelineAnalyticsResult | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await getPipelineAnalytics(workspaceId);
      if (res.success && res.data) {
        setData(res.data);
        const ir = await getPipelineAnalyticsInsight(workspaceId, res.data);
        if (ir.success && ir.insight) setInsight(ir.insight);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      const res = await getUserWorkspace();
      if (res.success && res.workspaceId) setWorkspaceId(res.workspaceId);
    })();
  }, []);

  useEffect(() => {
    load();
  }, [workspaceId]);

  if (!workspaceId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-gray-900">
      <div className="border-b border-gray-200/60 bg-white/70 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                <TrendingUp className="h-7 w-7 text-violet-500" />
                Pipeline Analytics
              </h1>
              <p className="mt-1 text-gray-500 text-sm">
                Valeur du pipeline, prévisionnel pondéré et répartition par source.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-gray-200 text-gray-700 hover:bg-gray-50"
                onClick={() => load()}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Actualiser
              </Button>
              <Link href="/sales-os">
                <Button variant="outline" className="border-gray-200 text-gray-700 hover:bg-gray-50">
                  Retour Sales OS
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
          </div>
        ) : !data ? (
          <Card className="bg-white/80 border-gray-200/60">
            <CardContent className="py-12 text-center text-gray-500">
              Aucune donnée disponible. Ajoutez des prospects et des montants dans le CRM.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <Card className="bg-violet-50/80 border-violet-200/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-violet-700 flex items-center gap-2 text-micro">
                    <Wallet className="h-4 w-4 text-violet-500" />
                    Total Pipeline Value
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900 text-heading tabular-nums">{formatEur(data.totalPipelineValue)}</p>
                  <p className="text-xs text-gray-500 mt-1 text-body">Deals en cours (brut)</p>
                </CardContent>
              </Card>
              <Card className="bg-violet-50/80 border-violet-200/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-violet-700 flex items-center gap-2 text-micro">
                    <Target className="h-4 w-4 text-violet-500" />
                    Weighted Forecast
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl sm:text-3xl font-bold text-violet-600 text-heading tabular-nums">{formatEur(data.weightedForecast)}</p>
                  <p className="text-xs text-gray-500 mt-1 text-body">Valeur × Score / 100</p>
                </CardContent>
              </Card>
              <Card className="bg-white/80 border-gray-200/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-gray-500" />
                    Average Deal Size
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900">{formatEur(data.averageDealSize)}</p>
                  <p className="text-xs text-gray-500 mt-1">Moyenne des montants</p>
                </CardContent>
              </Card>
              <Card className="bg-white/80 border-gray-200/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2 text-micro">
                    <Percent className="h-4 w-4 text-gray-500" />
                    Win Rate
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-900 text-heading tabular-nums">
                    {data.winRate != null ? `${data.winRate.toFixed(0)}%` : "—"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 text-body">Gagnés / clôturés</p>
                </CardContent>
              </Card>
            </div>

            {/* Conseil du CSO (Insight IA) */}
            {insight && (
              <Card className="mb-8 border-violet-200/60 bg-violet-50/80">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 text-violet-700">
                    <Sparkles className="h-5 w-5" />
                    Conseil du CSO
                  </CardTitle>
                  <CardDescription className="text-gray-500">
                    Recommandation basée sur votre pipeline actuel
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 leading-relaxed">{insight}</p>
                  <Link href="/sales-os/crm" className="inline-flex items-center gap-1 mt-3 text-sm text-indigo-400 hover:underline">
                    Voir le pipeline <ArrowRight className="h-4 w-4" />
                  </Link>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Funnel */}
              <Card className="bg-white/80 border-gray-200/60">
                <CardHeader>
                  <CardTitle className="text-white">Tunnel de conversion</CardTitle>
                  <CardDescription className="text-gray-500">
                    Nombre de leads et valeur par étape
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart
                        data={data.funnel}
                        layout="vertical"
                        margin={{ top: 8, right: 24, left: 80, bottom: 8 }}
                      >
                        <XAxis type="number" tickFormatter={(v) => `${v} €`} stroke="#64748b" />
                        <YAxis type="category" dataKey="label" width={72} stroke="#64748b" />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155" }}
                          labelStyle={{ color: "#94a3b8" }}
                          formatter={(value, _name, props) => [
                            `${formatEur((props?.payload as { value?: number; count?: number })?.value ?? 0)} · ${(props?.payload as { count?: number })?.count ?? 0} lead(s)`,
                            "Valeur",
                          ]}
                        />
                        <Bar dataKey="value" name="Valeur" radius={[0, 4, 4, 0]}>
                          {data.funnel.map((_, i) => (
                            <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Donut par source */}
              <Card className="bg-white/80 border-gray-200/60">
                <CardHeader>
                  <CardTitle className="text-white">Répartition par source</CardTitle>
                  <CardDescription className="text-gray-500">
                    D&apos;où vient la valeur du pipeline
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.bySource.length === 0 ? (
                    <div className="h-80 flex items-center justify-center text-gray-500 text-sm">
                      Saisissez des montants et des sources dans le CRM pour voir la répartition.
                    </div>
                  ) : (
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height={320}>
                        <PieChart>
                          <Pie
                            data={data.bySource}
                            dataKey="value"
                            nameKey="label"
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`}
                          >
                            {data.bySource.map((_, i) => (
                              <Cell
                                key={i}
                                fill={PIE_COLORS[i % PIE_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155" }}
                            formatter={(value, name, props) => [
                              `${formatEur(typeof value === "number" ? value : 0)} (${(props?.payload as { count?: number })?.count ?? 0} lead(s))`,
                              name ?? "",
                            ]}
                          />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
