"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

interface DayData {
  total: number;
  published: number;
}

interface PerformanceChartProps {
  postsByDay: Record<string, DayData>;
  agentCreatedPosts: number;
  totalDecisions: number;
  executedDecisions: number;
  approvedDecisions: number;
  rejectedDecisions: number;
}

function buildChartData(postsByDay: Record<string, DayData>) {
  const today = new Date();
  const data = [];
  for (let i = 29; i >= 0; i--) {
    const date = subDays(today, i);
    const key = date.toISOString().split("T")[0];
    const day = postsByDay[key] ?? { total: 0, published: 0 };
    data.push({
      date: key,
      label: format(date, "d MMM", { locale: fr }),
      total: day.total,
      published: day.published,
    });
  }
  return data;
}

function getTrend(data: { total: number }[]) {
  const recent = data.slice(-7).reduce((s, d) => s + d.total, 0);
  const previous = data.slice(-14, -7).reduce((s, d) => s + d.total, 0);
  if (recent > previous) return "up";
  if (recent < previous) return "down";
  return "stable";
}

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
        <p className="font-medium text-gray-700 mb-1">{label}</p>
        {payload.map((p) => (
          <div key={p.name} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-gray-500 capitalize">{p.name} :</span>
            <span className="font-semibold text-gray-900">{p.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export function PerformanceChart({
  postsByDay,
  agentCreatedPosts,
  totalDecisions,
  executedDecisions,
  approvedDecisions,
  rejectedDecisions,
}: PerformanceChartProps) {
  const chartData = buildChartData(postsByDay);
  const trend = getTrend(chartData);
  const totalPosts = chartData.reduce((s, d) => s + d.total, 0);

  const approvalRate =
    totalDecisions > 0 ? Math.round((approvedDecisions / totalDecisions) * 100) : 0;

  const executionRate =
    approvedDecisions > 0 ? Math.round((executedDecisions / approvedDecisions) * 100) : 0;

  return (
    <Card className="border border-gray-200/60 bg-white/60 backdrop-blur-sm shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base text-gray-900">Performance 30 jours</CardTitle>
            <CardDescription>Contenus générés et publiés</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            {trend === "up" && (
              <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                <TrendingUp className="h-3 w-3" />
                Croissance
              </Badge>
            )}
            {trend === "down" && (
              <Badge className="text-xs bg-red-100 text-red-700 border-red-200 gap-1">
                <TrendingDown className="h-3 w-3" />
                Déclin
              </Badge>
            )}
            {trend === "stable" && (
              <Badge className="text-xs bg-gray-100 text-gray-600 border-gray-200 gap-1">
                <Minus className="h-3 w-3" />
                Stable
              </Badge>
            )}
          </div>
        </div>

        {/* KPI mini-row */}
        <div className="grid grid-cols-4 gap-3 pt-2">
          <div className="text-center p-2 rounded-lg bg-gray-50 border border-gray-100">
            <p className="text-lg font-bold text-gray-900">{totalPosts}</p>
            <p className="text-xs text-gray-500">Contenus</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-indigo-50 border border-indigo-100">
            <p className="text-lg font-bold text-indigo-700">{agentCreatedPosts}</p>
            <p className="text-xs text-indigo-500">Par l&apos;IA</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-emerald-50 border border-emerald-100">
            <p className="text-lg font-bold text-emerald-700">{approvalRate}%</p>
            <p className="text-xs text-emerald-600">Taux d&apos;accord</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-violet-50 border border-violet-100">
            <p className="text-lg font-bold text-violet-700">{executionRate}%</p>
            <p className="text-xs text-violet-600">Exécution</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
            <defs>
              <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradPublished" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              interval={6}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="total"
              name="créés"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#gradTotal)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
            <Area
              type="monotone"
              dataKey="published"
              name="publiés"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#gradPublished)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 pt-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-3 h-0.5 bg-indigo-500 rounded" />
            Créés
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className="w-3 h-0.5 bg-emerald-500 rounded" />
            Publiés
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
