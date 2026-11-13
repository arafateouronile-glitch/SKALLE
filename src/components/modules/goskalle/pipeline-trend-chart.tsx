"use client";

/**
 * Évolution du pipeline converti — 6 derniers mois. "Converti" et non
 * "revenus" : c'est de la valeur de deals marqués CONVERTED dans le CRM, pas
 * du revenu facturé/encaissé réel (pas d'entité facture pour Goskalle).
 */

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { MonthlyPipelinePoint } from "@/lib/services/analytics/cso-roi-tracking";

interface PipelineTrendChartProps {
  data: MonthlyPipelinePoint[];
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: MonthlyPipelinePoint }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div
      className="rounded-xl px-3 py-2 text-xs font-medium shadow-lg"
      style={{ background: "var(--bg-card)", border: "1px solid var(--line)", color: "var(--fg)" }}
    >
      {point.label} : <strong>{formatEur(point.convertedValue)}</strong>
    </div>
  );
}

export function PipelineTrendChart({ data }: PipelineTrendChartProps) {
  const allEmpty = data.every((d) => d.convertedValue === 0);

  if (allEmpty) {
    return (
      <div className="h-[200px] flex items-center justify-center text-[13px]" style={{ color: "var(--fg-mute)" }}>
        Aucun deal converti sur les 6 derniers mois
      </div>
    );
  }

  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pipelineTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--amber-fg)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--amber-fg)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--fg-mute)" }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "var(--fg-mute)" }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="convertedValue"
            stroke="var(--amber-fg)"
            strokeWidth={2}
            fill="url(#pipelineTrendFill)"
            isAnimationActive
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
