import { useId } from "react";

interface SparklineProps {
  data: number[];
  color?: "emerald" | "violet" | "amber" | "danger" | "cold";
  height?: number;
  width?: number;
}

const COLOR_MAP: Record<string, string> = {
  emerald: "var(--emerald-fg)",
  violet:  "var(--violet-fg)",
  amber:   "var(--amber-fg)",
  danger:  "var(--danger-fg)",
  cold:    "var(--cold-fg)",
};

export function Sparkline({ data, color = "emerald", height = 36, width = 120 }: SparklineProps) {
  if (!data || data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = Math.max(1, max - min);
  const w = width;
  const h = height;
  const pad = 2;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - pad * 2) + pad;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y] as [number, number];
  });

  const d = pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}}`)).join(" ").replace(/}/g, "");
  const fill = `${d} L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z`;

  const c = COLOR_MAP[color] ?? COLOR_MAP.emerald;
  const uid = useId();
  const gradId = `spark-${color}-${uid.replace(/:/g, "")}`;
  const [lastX, lastY] = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height }} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={c} stopOpacity="0.45" />
          <stop offset="100%" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#${gradId})`} />
      <path d={d} stroke={c} strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={c} />
    </svg>
  );
}
