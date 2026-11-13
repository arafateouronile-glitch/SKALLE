"use client";

/**
 * Jauge de confiance — traduit visuellement `successRateByType` (boucle
 * d'apprentissage CSO, cso-learning.ts) sur chaque décision de la file
 * d'approbation. Transparence qu'aucun concurrent (GojiBerry, Valley)
 * n'affiche sur ses propres recommandations.
 */

import { RadialGauge } from "./radial-gauge";

const MIN_SAMPLE_SIZE = 3; // même seuil que buildCsoPerformanceSummary (cso-agent.ts)

interface ConfidenceGaugeProps {
  successRate: number | null;
  sampleSize: number;
  size?: number;
}

export function ConfidenceGauge({ successRate, sampleSize, size = 40 }: ConfidenceGaugeProps) {
  if (successRate == null || sampleSize < MIN_SAMPLE_SIZE) {
    return (
      <RadialGauge
        value={0}
        size={size}
        dashed
        title={`En apprentissage — ${sampleSize}/${MIN_SAMPLE_SIZE} décisions requises`}
      />
    );
  }

  const clamped = Math.max(0, Math.min(100, successRate));
  return (
    <RadialGauge
      value={clamped}
      size={size}
      title={`${clamped}% de succès historique (${sampleSize} décisions)`}
    />
  );
}
