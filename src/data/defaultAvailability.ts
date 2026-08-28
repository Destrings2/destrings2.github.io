import { H0, HN } from '@/domain/time';
import type { HourGrid } from '@/domain/types';

export function emptyGrid(): HourGrid {
  return Array.from({ length: 7 }, () => Array.from({ length: HN }, () => false));
}

/** `[day, fromHour, toHour)` spans, in 24h clock hours. */
export type GridSpec = readonly (readonly [number, number, number])[];

export function gridFrom(spec: GridSpec): HourGrid {
  const g = emptyGrid();
  for (const [day, from, to] of spec) {
    for (let h = from; h < to; h++) {
      const slot = h - H0;
      if (slot >= 0 && slot < HN) g[day]![slot] = true;
    }
  }
  return g;
}

/**
 * A plausible two-worker week, so a new household opens on a real plan rather
 * than an empty one. Weekday evenings plus weekends.
 */
export const DEFAULT_WEEKDAY_EVENINGS: GridSpec = [
  [0, 18, 22],
  [1, 18, 22],
  [2, 18, 22],
  [3, 18, 22],
  [4, 18, 23],
  [5, 10, 18],
  [6, 10, 20],
];

export const DEFAULT_SPLIT_WEEKEND: GridSpec = [
  [0, 19, 22],
  [1, 19, 22],
  [2, 19, 22],
  [3, 19, 22],
  [4, 19, 23],
  [5, 9, 13],
  [5, 16, 20],
  [6, 11, 19],
];

export const PRESETS = {
  weekdayEvenings: [
    [0, 18, 22],
    [1, 18, 22],
    [2, 18, 22],
    [3, 18, 22],
    [4, 18, 22],
  ] as GridSpec,
  weekends: [
    [5, 10, 19],
    [6, 10, 19],
  ] as GridSpec,
};
