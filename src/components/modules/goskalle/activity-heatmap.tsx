"use client";

/**
 * Heatmap d'activité façon GitHub — grille CSS pure (pas de recharts, un
 * simple quadrillage n'a pas besoin d'un moteur de graphique). Attend
 * exactement 84 points (12 semaines x 7 jours), déjà pré-remplis par
 * getDailyActivityHeatmap (cso-roi-tracking.ts) — ne se défend pas contre un
 * tableau de taille différente.
 */

import type { DailyActivityPoint } from "@/lib/services/analytics/cso-roi-tracking";

interface ActivityHeatmapProps {
  data: DailyActivityPoint[];
}

const DAYS = 7;
const WEEKS = 12;

const WEEKDAY_LABELS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const MONTH_LABELS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

// Rampe ambre à teinte unique — plus l'opacité est forte, plus l'activité est élevée.
const INTENSITY_OPACITY = [0, 0.18, 0.4, 0.65, 1];

function bucketOf(count: number, max: number): number {
  if (count === 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const allEmpty = data.every((d) => d.count === 0);

  // Colonne = bloc chronologique de 7 jours (pas nécessairement calé sur Lun-Dim calendaire).
  const columns = Array.from({ length: WEEKS }, (_, col) => data.slice(col * DAYS, col * DAYS + DAYS));

  // Libellé de mois affiché seulement quand il change d'une colonne à l'autre.
  let lastMonth = -1;
  const monthLabels = columns.map((col) => {
    const first = col[0];
    if (!first) return null;
    const month = new Date(first.date).getMonth();
    if (month === lastMonth) return null;
    lastMonth = month;
    return MONTH_LABELS_FR[month];
  });

  return (
    <div>
      <div className="flex gap-[3px] mb-1.5 pl-7">
        {monthLabels.map((label, i) => (
          <div key={i} className="w-[14px] text-[9px] shrink-0" style={{ color: "var(--fg-mute)" }}>
            {label ?? ""}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <div className="flex flex-col gap-[3px] shrink-0 w-6">
          {Array.from({ length: DAYS }, (_, row) => (
            <div key={row} className="h-[14px] text-[9px] leading-[14px]" style={{ color: "var(--fg-mute)" }}>
              {row % 2 === 1 ? WEEKDAY_LABELS_FR[row] : ""}
            </div>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {columns.map((col, colIdx) => (
            <div key={colIdx} className="flex flex-col gap-[3px]">
              {col.map((point, rowIdx) => {
                const bucket = bucketOf(point.count, max);
                return (
                  <div
                    key={rowIdx}
                    className="h-[14px] w-[14px] rounded-[3px]"
                    style={{
                      background: bucket === 0 ? "var(--line)" : "var(--amber-fg)",
                      opacity: bucket === 0 ? 1 : INTENSITY_OPACITY[bucket],
                    }}
                    title={`${new Date(point.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} — ${point.count} action${point.count > 1 ? "s" : ""}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between mt-3">
        <p className="text-[11px]" style={{ color: "var(--fg-mute)" }}>
          {allEmpty ? "Aucune activité enregistrée pour l'instant" : " "}
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]" style={{ color: "var(--fg-mute)" }}>Moins</span>
          {INTENSITY_OPACITY.map((op, i) => (
            <div
              key={i}
              className="h-[10px] w-[10px] rounded-[2px]"
              style={{ background: i === 0 ? "var(--line)" : "var(--amber-fg)", opacity: i === 0 ? 1 : op }}
            />
          ))}
          <span className="text-[10px]" style={{ color: "var(--fg-mute)" }}>Plus</span>
        </div>
      </div>
    </div>
  );
}
