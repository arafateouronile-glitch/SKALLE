"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface FunnelStage {
  label: string;
  key: string;
  count: number;
  rate: number;
}

interface FunnelDonutProps {
  stages: FunnelStage[];
  total: number;
}

const STAGE_COLORS = [
  "#94A3B8",
  "#8B5CF6",
  "#F59E0B",
  "#10B981",
  "#7C3AED",
  "#059669",
];

interface TooltipPayload {
  name: string;
  value: number;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-3 py-2 text-xs font-medium shadow-lg"
      style={{ background: "var(--bg-card)", border: "1px solid var(--line)", color: "var(--fg)" }}
    >
      {payload[0].name} : <strong>{payload[0].value}</strong>
    </div>
  );
}

export function FunnelDonut({ stages, total }: FunnelDonutProps) {
  const data = stages
    .map((s, i) => ({
      name: s.label,
      value: s.count,
      fill: STAGE_COLORS[i] ?? "#94A3B8",
    }))
    .filter((d) => d.value > 0);

  if (total === 0 || data.length === 0) {
    return (
      <div
        className="w-[110px] h-[110px] rounded-full flex items-center justify-center shrink-0"
        style={{ background: "var(--line-strong)" }}
      >
        <span className="text-xs" style={{ color: "var(--fg-mute)" }}>—</span>
      </div>
    );
  }

  return (
    <div className="relative w-[110px] h-[110px] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={38}
            outerRadius={50}
            paddingAngle={2}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            stroke="none"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span
          className="text-[17px] font-bold tabular-nums leading-none"
          style={{ color: "var(--fg)" }}
        >
          {total}
        </span>
        <span className="text-[9px] mt-0.5" style={{ color: "var(--fg-mute)" }}>
          total
        </span>
      </div>
    </div>
  );
}
