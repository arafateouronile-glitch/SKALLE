"use client";

/**
 * Sales OS Analytics — 2 onglets :
 *   - Pipeline : valeur pipeline, forecast pondéré, funnel, répartition source
 *   - LinkedIn  : warm-up, envois/réponses par jour, funnel prospects, KPIs
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
  AreaChart,
  Area,
  CartesianGrid,
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
  Linkedin,
  Send,
  MessageSquare,
  CheckCircle2,
  Clock,
  XCircle,
  Zap,
  Activity,
  AlertTriangle,
} from "lucide-react";
import {
  getPipelineAnalytics,
  getPipelineAnalyticsInsight,
  type PipelineAnalyticsResult,
} from "@/actions/pipeline-analytics";
import {
  getLinkedInAnalytics,
  type LinkedInAnalyticsData,
} from "@/actions/linkedin-analytics";
import { getUserWorkspace } from "@/actions/leads";
import { cn } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = "gray",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  accent?: "gray" | "blue" | "green" | "red" | "purple" | "amber";
}) {
  const colors: Record<string, string> = {
    gray: "bg-gray-50 border-gray-200 text-gray-500",
    blue: "bg-sky-50 border-sky-200 text-sky-600",
    green: "bg-emerald-50 border-emerald-200 text-emerald-600",
    red: "bg-red-50 border-red-200 text-red-500",
    purple: "bg-violet-50 border-violet-200 text-violet-600",
    amber: "bg-amber-50 border-amber-200 text-amber-600",
  };
  return (
    <Card className={cn("border", colors[accent])}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl sm:text-3xl font-bold text-gray-900 tabular-nums">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Warm-up Bar ──────────────────────────────────────────────────────────────

function WarmupBar({ day, limit }: { day: number; limit: number }) {
  const pct = Math.min(Math.round((day / limit) * 100), 100);
  const color =
    pct < 33 ? "from-blue-400 to-blue-500"
    : pct < 66 ? "from-amber-400 to-amber-500"
    : "from-emerald-400 to-emerald-500";

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-gray-500">
        <span>Warm-up — Jour {day} / {limit}</span>
        <span className="font-semibold text-gray-700">{pct}%</span>
      </div>
      <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-[11px] text-gray-400">
        {pct < 100
          ? `Encore ${limit - day} jour(s) avant les limites maximales`
          : "Warm-up terminé — limites complètes actives"}
      </p>
    </div>
  );
}

// ─── LinkedIn Tab ─────────────────────────────────────────────────────────────

function LinkedInAnalyticsTab({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<LinkedInAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getLinkedInAnalytics(workspaceId);
      if (res.success && res.data) setData(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [workspaceId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="bg-white/80 border-gray-200/60">
        <CardContent className="py-12 text-center text-gray-500">
          Erreur lors du chargement des données LinkedIn.
        </CardContent>
      </Card>
    );
  }

  const { config, totals, last30Days, prospectFunnel } = data;

  // Last run stats
  const lastStats = config?.lastRunStats as {
    sent?: number; failed?: number; skipped?: number; warmupPct?: number; abortReason?: string;
  } | null;

  // Funnel colors
  const FUNNEL_COLORS = ["#0ea5e9", "#6366f1", "#3b82f6", "#22c55e", "#ef4444"];

  // Tooltip formatter
  const dayTooltipFormatter = (value: number | undefined, name: string | undefined) => {
    const labels: Record<string, string> = { connect: "Connexions", message: "Messages", failed: "Échecs", replies: "Réponses" };
    return [value ?? 0, labels[name ?? ""] ?? name ?? ""];
  };

  return (
    <div className="space-y-6">
      {/* Alerte si automation inactive ou abort */}
      {config && !config.isActive && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-700">Automation LinkedIn inactive</p>
            {lastStats?.abortReason && (
              <p className="text-xs text-amber-600 mt-0.5">{lastStats.abortReason}</p>
            )}
            <Link href="/sales-os/prospection" className="inline-flex items-center gap-1 text-xs text-amber-700 hover:underline mt-1">
              Configurer <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard
          label="Connexions envoyées"
          value={totals.connectSent}
          sub="30 derniers jours"
          icon={Send}
          accent="blue"
        />
        <KpiCard
          label="Messages envoyés"
          value={totals.messageSent}
          sub="follow-ups"
          icon={MessageSquare}
          accent="purple"
        />
        <KpiCard
          label="Réponses reçues"
          value={totals.repliesReceived}
          sub="via Voyager API"
          icon={CheckCircle2}
          accent="green"
        />
        <KpiCard
          label="Taux de réponse"
          value={`${totals.replyRate}%`}
          sub="réponses / messages"
          icon={Percent}
          accent={totals.replyRate >= 20 ? "green" : totals.replyRate >= 10 ? "amber" : "gray"}
        />
        <KpiCard
          label="Échecs"
          value={totals.stepsFailed}
          sub="steps FAILED"
          icon={XCircle}
          accent={totals.stepsFailed > 5 ? "red" : "gray"}
        />
        <KpiCard
          label="En attente"
          value={totals.stepsPending}
          sub="steps PENDING"
          icon={Clock}
          accent="amber"
        />
      </div>

      {/* Warm-up + dernière exécution */}
      {config && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Warm-up */}
          <Card className="bg-white/80 border-gray-200/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                <Activity className="h-4 w-4 text-emerald-500" />
                Warm-up LinkedIn
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <WarmupBar day={config.warmupDay} limit={30} />
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100 text-xs text-gray-500">
                <div>
                  <p className="font-medium text-gray-700">Limite connexions/j</p>
                  <p className="tabular-nums">{config.dailyConnectLimit}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700">Limite messages/j</p>
                  <p className="tabular-nums">{config.dailyMessageLimit}</p>
                </div>
                {config.warmupStartedAt && (
                  <div className="col-span-2">
                    <p className="font-medium text-gray-700">Démarré le</p>
                    <p>{formatDate(config.warmupStartedAt).split(" à")[0]}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Dernière exécution */}
          <Card className="bg-white/80 border-gray-200/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-gray-700">
                <Zap className="h-4 w-4 text-sky-500" />
                Dernière exécution
              </CardTitle>
              <CardDescription className="text-xs text-gray-400">
                {config.lastRunAt ? formatDate(config.lastRunAt) : "Jamais exécutée"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lastStats ? (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Envoyés", value: lastStats.sent ?? 0, color: "text-emerald-600" },
                    { label: "Échecs", value: lastStats.failed ?? 0, color: "text-red-500" },
                    { label: "Ignorés", value: lastStats.skipped ?? 0, color: "text-gray-400" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="text-center rounded-lg bg-gray-50 py-3">
                      <p className={cn("text-xl font-bold tabular-nums", color)}>{value}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
                    </div>
                  ))}
                  {lastStats.warmupPct != null && (
                    <div className="col-span-3 text-xs text-gray-400 pt-1 border-t border-gray-100">
                      Warm-up actif à {lastStats.warmupPct}% lors du run
                    </div>
                  )}
                  {lastStats.abortReason && (
                    <div className="col-span-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
                      <AlertTriangle className="h-3 w-3 inline mr-1.5" />
                      {lastStats.abortReason}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Aucune stat disponible</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {!config && (
        <Card className="bg-sky-50/80 border-sky-200/60">
          <CardContent className="py-8 text-center text-sky-700 text-sm">
            <Linkedin className="h-8 w-8 mx-auto mb-2 text-sky-400" />
            Aucune configuration LinkedIn trouvée.{" "}
            <Link href="/sales-os/prospection" className="underline">
              Configurer l&apos;automation
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Graphique envois par jour */}
      <Card className="bg-white/80 border-gray-200/60">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-gray-700">Envois quotidiens — 30 derniers jours</CardTitle>
          <CardDescription className="text-xs text-gray-400">
            Connexions + messages envoyés et réponses reçues
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={last30Days}
                margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  interval={4}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
                  formatter={dayTooltipFormatter}
                />
                <Bar dataKey="connect" stackId="a" fill="#0ea5e9" name="connect" radius={[0, 0, 0, 0]} />
                <Bar dataKey="message" stackId="a" fill="#6366f1" name="message" radius={[3, 3, 0, 0]} />
                <Bar dataKey="failed" fill="#fca5a5" name="failed" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Réponses reçues */}
      <Card className="bg-white/80 border-gray-200/60">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-gray-700">Réponses LinkedIn reçues — 30 derniers jours</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={last30Days}
                margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
              >
                <defs>
                  <linearGradient id="repliesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} interval={4} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number | undefined) => [v ?? 0, "Réponses"]}
                />
                <Area
                  type="monotone"
                  dataKey="replies"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fill="url(#repliesGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Funnel prospects LinkedIn */}
      <Card className="bg-white/80 border-gray-200/60">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-gray-700">Funnel prospects LinkedIn</CardTitle>
          <CardDescription className="text-xs text-gray-400">
            Répartition des prospects par étape du pipeline
          </CardDescription>
        </CardHeader>
        <CardContent>
          {prospectFunnel.every((s) => s.count === 0) ? (
            <p className="text-sm text-gray-400 py-6 text-center">Aucun prospect dans le pipeline LinkedIn pour l&apos;instant.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={prospectFunnel}
                  layout="vertical"
                  margin={{ top: 4, right: 40, left: 80, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={76} tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [v, "Prospects"]}
                  />
                  <Bar dataKey="count" name="Prospects" radius={[0, 4, 4, 0]}>
                    {prospectFunnel.map((_, i) => (
                      <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Pipeline Tab (existant) ──────────────────────────────────────────────────

const FUNNEL_COLORS_PIPELINE = ["#6366f1", "#4f46e5", "#4338ca", "#22c55e"];
const PIE_COLORS = ["#6366f1", "#4f46e5", "#4338ca", "#22c55e", "#f59e0b"];

function PipelineAnalyticsTab({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<PipelineAnalyticsResult | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
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

  useEffect(() => { load(); }, [workspaceId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="bg-white/80 border-gray-200/60">
        <CardContent className="py-12 text-center text-gray-500">
          Aucune donnée. Ajoutez des prospects et des montants dans le CRM.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-violet-50/80 border-violet-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-violet-700 flex items-center gap-2">
              <Wallet className="h-4 w-4 text-violet-500" />
              Total Pipeline Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 tabular-nums">{formatEur(data.totalPipelineValue)}</p>
            <p className="text-xs text-gray-500 mt-1">Deals en cours (brut)</p>
          </CardContent>
        </Card>
        <Card className="bg-violet-50/80 border-violet-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-violet-700 flex items-center gap-2">
              <Target className="h-4 w-4 text-violet-500" />
              Weighted Forecast
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl sm:text-3xl font-bold text-violet-600 tabular-nums">{formatEur(data.weightedForecast)}</p>
            <p className="text-xs text-gray-500 mt-1">Valeur × Score / 100</p>
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
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 tabular-nums">{formatEur(data.averageDealSize)}</p>
            <p className="text-xs text-gray-500 mt-1">Moyenne des montants</p>
          </CardContent>
        </Card>
        <Card className="bg-white/80 border-gray-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Percent className="h-4 w-4 text-gray-500" />
              Win Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900 tabular-nums">
              {data.winRate != null ? `${data.winRate.toFixed(0)}%` : "—"}
            </p>
            <p className="text-xs text-gray-500 mt-1">Gagnés / clôturés</p>
          </CardContent>
        </Card>
      </div>

      {/* Conseil CSO */}
      {insight && (
        <Card className="border-violet-200/60 bg-violet-50/80">
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
            <CardTitle className="text-gray-800">Tunnel de conversion</CardTitle>
            <CardDescription className="text-gray-500">Nombre de leads et valeur par étape</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={data.funnel} layout="vertical" margin={{ top: 8, right: 24, left: 80, bottom: 8 }}>
                  <XAxis type="number" tickFormatter={(v) => `${v} €`} stroke="#64748b" />
                  <YAxis type="category" dataKey="label" width={72} stroke="#64748b" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb" }}
                    formatter={(value, _name, props) => [
                      `${formatEur((props?.payload as { value?: number })?.value ?? 0)} · ${(props?.payload as { count?: number })?.count ?? 0} lead(s)`,
                      "Valeur",
                    ]}
                  />
                  <Bar dataKey="value" name="Valeur" radius={[0, 4, 4, 0]}>
                    {data.funnel.map((_, i) => (
                      <Cell key={i} fill={FUNNEL_COLORS_PIPELINE[i % FUNNEL_COLORS_PIPELINE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Donut source */}
        <Card className="bg-white/80 border-gray-200/60">
          <CardHeader>
            <CardTitle className="text-gray-800">Répartition par source</CardTitle>
            <CardDescription className="text-gray-500">D&apos;où vient la valeur du pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            {data.bySource.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-gray-500 text-sm">
                Saisissez des montants et des sources dans le CRM.
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
                      label={({ name, percent }: { name?: string; percent?: number }) =>
                        `${name ?? ""} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                    >
                      {data.bySource.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: "#fff", border: "1px solid #e5e7eb" }}
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
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await getUserWorkspace();
      if (res.success && res.workspaceId) setWorkspaceId(res.workspaceId);
    })();
  }, []);

  if (!workspaceId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-gray-900">
      {/* Header */}
      <div className="border-b border-gray-200/60 bg-white/70 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                <TrendingUp className="h-7 w-7 text-violet-500" />
                Analytics Sales OS
              </h1>
              <p className="mt-1 text-gray-500 text-sm">
                Pipeline revenue · LinkedIn outreach · Performance globale
              </p>
            </div>
            <Link href="/sales-os">
              <Button variant="outline" size="sm" className="border-gray-200 text-gray-700 hover:bg-gray-50">
                Retour Sales OS
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="linkedin">
          <TabsList className="bg-white/60 border border-gray-200 mb-8">
            <TabsTrigger
              value="linkedin"
              className="data-[state=active]:bg-sky-600 data-[state=active]:text-white"
            >
              <Linkedin className="h-4 w-4 mr-2" />
              LinkedIn Outreach
            </TabsTrigger>
            <TabsTrigger
              value="pipeline"
              className="data-[state=active]:bg-violet-600 data-[state=active]:text-white"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Pipeline Revenue
            </TabsTrigger>
          </TabsList>

          <TabsContent value="linkedin">
            <LinkedInAnalyticsTab workspaceId={workspaceId} />
          </TabsContent>

          <TabsContent value="pipeline">
            <PipelineAnalyticsTab workspaceId={workspaceId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
