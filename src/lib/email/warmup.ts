/**
 * Email Warm-Up utilities — pure functions, no DB calls.
 *
 * Strategy: 30-day S-curve ramp-up from 5% to 100% of target daily volume.
 * Days 1-7:  slow start (reputation building)
 * Days 8-21: acceleration
 * Days 22-30: plateau at 100%
 */

export const WARMUP_DURATION = 30;

// Percentage of target volume for each of the 30 days (S-curve)
export const WARMUP_PCT: readonly number[] = [
   5,  7, 10, 13, 17, 21, 26, 31, 37, 43, // Days 1-10
  49, 55, 61, 67, 73, 78, 82, 86, 89, 92, // Days 11-20
  94, 96, 97, 98, 99, 99,100,100,100,100, // Days 21-30
] as const;

/** Daily sending limit for a given warmup day and target volume. */
export function dailyLimitForDay(day: number, targetVolume: number): number {
  if (day <= 0) return 0;
  const idx = Math.min(day - 1, WARMUP_DURATION - 1);
  return Math.max(5, Math.round((targetVolume * WARMUP_PCT[idx]) / 100));
}

/** Overall warmup progress as a percentage (0-100). */
export function warmupProgressPct(day: number): number {
  return Math.min(100, Math.round((Math.max(0, day) / WARMUP_DURATION) * 100));
}

/** Full 30-day schedule for display. */
export function fullWarmupSchedule(targetVolume: number) {
  return WARMUP_PCT.map((pct, i) => ({
    day: i + 1,
    limit: Math.max(5, Math.round((targetVolume * pct) / 100)),
    pct,
  }));
}

export type WarmupStatus = "inactive" | "running" | "paused" | "completed";

export function getWarmupStatus(config: {
  warmupEnabled: boolean;
  warmupCompleted: boolean;
  warmupDay: number;
}): WarmupStatus {
  if (config.warmupCompleted) return "completed";
  if (config.warmupEnabled && config.warmupDay > 0) return "running";
  if (!config.warmupEnabled && config.warmupDay > 0) return "paused";
  return "inactive";
}
