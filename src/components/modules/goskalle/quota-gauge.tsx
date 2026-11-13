"use client";

/**
 * Jauge de quota — "X sur Y" pour les objectifs réels du plan (crédits,
 * prospects). Contrairement à ConfidenceGauge, 0% est une vraie donnée : pas
 * d'état "pas assez de données", l'anneau plein est toujours affiché.
 */

import { RadialGauge } from "./radial-gauge";

interface QuotaGaugeProps {
  used: number;
  limit: number;
  label: string;
  size?: number;
}

export function QuotaGauge({ used, limit, label, size = 92 }: QuotaGaugeProps) {
  const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
  const clamped = Math.max(0, Math.min(100, pct));

  return (
    <div className="flex flex-col items-center gap-2">
      <RadialGauge
        value={clamped}
        size={size}
        centerValue={
          <div className="flex flex-col items-center leading-none">
            <span className="font-display font-bold tabular-nums" style={{ fontSize: size * 0.26, color: "var(--fg)" }}>
              {used}
            </span>
            <span className="text-[10px] mt-1" style={{ color: "var(--fg-mute)" }}>
              sur {limit}
            </span>
          </div>
        }
        title={`${clamped}% utilisé — ${used} sur ${limit}`}
      />
      <div className="text-center">
        <p className="font-display font-bold text-[15px] tabular-nums" style={{ color: "var(--fg)" }}>
          {clamped}%
        </p>
        <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>{label}</p>
      </div>
    </div>
  );
}
