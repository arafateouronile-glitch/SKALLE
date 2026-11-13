"use client";

/**
 * Primitive de jauge radiale partagée — extraite de ConfidenceGauge pour être
 * réutilisée par QuotaGauge (quota) sans mélanger deux sémantiques d'état vide
 * différentes : "pas assez de données" (confiance IA) vs "0% est une vraie
 * valeur" (quota). Chaque composant appelant garde sa propre logique d'état
 * vide ; cette primitive ne fait que dessiner l'arc et son overlay centré.
 */

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface RadialGaugeProps {
  /** 0-100, déjà borné par l'appelant. */
  value: number;
  size?: number;
  ringColor?: string;
  trackColor?: string;
  /** Anneau pointillé neutre au lieu de l'arc plein (état "pas encore de donnée"). */
  dashed?: boolean;
  /** Contenu centré personnalisé ; par défaut, la valeur numérique. */
  centerValue?: React.ReactNode;
  title?: string;
}

export function RadialGauge({
  value,
  size = 40,
  ringColor = "var(--amber-fg)",
  trackColor = "var(--line-strong)",
  dashed = false,
  centerValue,
  title,
}: RadialGaugeProps) {
  if (dashed) {
    const r = size * 0.41;
    const c = size / 2;
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }} title={title}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={trackColor}
            strokeWidth={size * 0.1}
            strokeDasharray={`${size * 0.09} ${size * 0.11}`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {centerValue ?? (
            <span className="rounded-full" style={{ width: size * 0.14, height: size * 0.14, background: "var(--fg-mute)" }} />
          )}
        </div>
      </div>
    );
  }

  const clamped = Math.max(0, Math.min(100, value));
  const data = [
    { name: "value", value: clamped, fill: ringColor },
    { name: "rest", value: 100 - clamped, fill: trackColor },
  ];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={title}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.32}
            outerRadius={size * 0.5}
            startAngle={90}
            endAngle={-270}
            dataKey="value"
            stroke="none"
            isAnimationActive
            animationDuration={600}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {centerValue ?? (
          <span className="font-display font-bold tabular-nums leading-none" style={{ fontSize: size * 0.26, color: "var(--fg)" }}>
            {clamped}
          </span>
        )}
      </div>
    </div>
  );
}
