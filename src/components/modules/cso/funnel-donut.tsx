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
  /** "legacy" (défaut) préserve la palette arc-en-ciel existante (Sales OS). "goskalle" applique un rendu restreint à l'accent ambre + couleurs sémantiques. */
  variant?: "legacy" | "goskalle";
  /** Diamètre du composant en px (défaut 110). */
  size?: number;
  /** Palette par clé de stage — remplace GOSKALLE_STAGE_COLORS (variant="goskalle" uniquement). */
  colorMap?: Record<string, string>;
}

const STAGE_COLORS = [
  "#94A3B8",
  "#8B5CF6",
  "#F59E0B",
  "#10B981",
  "#7C3AED",
  "#059669",
];

// Variante goskalle : ambre = nécessite une action, emerald = succès réel, neutre = plus d'action requise, rouge = échec.
export const GOSKALLE_STAGE_COLORS: Record<string, string> = {
  PENDING: "var(--amber-fg)",
  APPROVED: "var(--fg-mute)",
  EXECUTED: "var(--emerald-fg)",
  REJECTED: "var(--line-strong)",
  FAILED: "var(--danger-fg)",
};

// Rampe d'intensité ambre — pas de --danger-fg sur HOT (déjà réservé aux vrais
// échecs sur cette page) : HOT = signal le plus positif, pas un signal négatif.
export const GOSKALLE_TEMPERATURE_COLORS: Record<string, string> = {
  HOT: "var(--amber-fg)",
  WARM: "var(--amber-line)",
  COLD: "var(--fg-mute)",
};

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

export function FunnelDonut({ stages, total, variant = "legacy", size = 110, colorMap }: FunnelDonutProps) {
  const isGk = variant === "goskalle";
  const stageColors = colorMap ?? GOSKALLE_STAGE_COLORS;
  const data = stages
    .map((s, i) => ({
      name: s.label,
      value: s.count,
      fill: isGk ? (stageColors[s.key] ?? "var(--fg-mute)") : (STAGE_COLORS[i] ?? "#94A3B8"),
    }))
    .filter((d) => d.value > 0);

  if (total === 0 || data.length === 0) {
    return (
      <div
        className="rounded-full flex items-center justify-center shrink-0"
        style={{ width: size, height: size, background: "var(--line-strong)" }}
      >
        <span className="text-xs" style={{ color: "var(--fg-mute)" }}>—</span>
      </div>
    );
  }

  const innerRadius = size * 0.345;
  const outerRadius = size * 0.455;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
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
          className={isGk ? "font-display font-bold tabular-nums leading-none" : "text-[17px] font-bold tabular-nums leading-none"}
          style={{ color: "var(--fg)", fontSize: isGk ? size * 0.19 : undefined }}
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
