/** Half-hour options offered when placing a job by hand. */
export const TIMES: readonly number[] = Array.from({ length: 31 }, (_, i) => 7 * 60 + i * 30);

/**
 * The planner places jobs to the minute, but the picker offers half hours.
 * Snap to the nearest one it actually has, or the select silently falls back
 * to its first option and Apply moves the job to seven in the morning.
 */
export function nearestOffered(minutes: number): number {
  return TIMES.reduce((best, option) =>
    Math.abs(option - minutes) < Math.abs(best - minutes) ? option : best,
  );
}
