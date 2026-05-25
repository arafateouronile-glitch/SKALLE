import { Sparkline } from "@/components/ui/sparkline";

type Accent = "emerald" | "violet" | "amber" | "danger" | "cold";

interface KpiCardProps {
  label: string;
  value: string;
  delta?: string;
  deltaPositive?: boolean;
  sub?: string;
  spark?: number[];
  accent?: Accent;
}

export function KpiCard({ label, value, delta, deltaPositive = true, sub, spark, accent = "emerald" }: KpiCardProps) {
  return (
    <div
      className="rounded-[18px] p-5 flex flex-col gap-3"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--line)",
        boxShadow: "var(--card-shadow)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium leading-tight" style={{ color: "var(--fg-mute)" }}>
          {label}
        </p>
        {delta && (
          <span
            className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: deltaPositive ? `var(--${accent}-soft)` : "var(--danger-soft)",
              color: deltaPositive ? `var(--${accent}-fg)` : "var(--danger-fg)",
              border: `1px solid ${deltaPositive ? `var(--${accent}-line)` : "var(--danger-line)"}`,
            }}
          >
            {delta}
          </span>
        )}
      </div>

      <p
        className="text-[28px] font-display font-bold leading-none tabular-nums"
        style={{ color: "var(--fg)", letterSpacing: "-0.02em" }}
      >
        {value}
      </p>

      {sub && (
        <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
          {sub}
        </p>
      )}

      {spark && spark.length > 1 && (
        <div className="mt-auto -mx-1">
          <Sparkline data={spark} color={accent} height={32} />
        </div>
      )}
    </div>
  );
}
