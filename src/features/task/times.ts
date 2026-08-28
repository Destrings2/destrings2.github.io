/** Half-hour options offered when placing a job by hand. */
export const TIMES: readonly number[] = Array.from({ length: 31 }, (_, i) => 7 * 60 + i * 30);

/**
 * The times to offer for one job.
 *
 * The planner places to the minute, so a job can sit at 18:12 while the picker
 * only knows half hours. Offering the job's own time keeps the two honest: the
 * picker shows where the job actually is, and changing only who does it leaves
 * the clock alone instead of quietly dragging it to 18:00.
 */
export function timesFor(current: number | null): readonly number[] {
  if (current == null || TIMES.includes(current)) return TIMES;
  return [...TIMES, current].sort((a, b) => a - b);
}
