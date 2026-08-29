import type { Cadence } from './types';

export interface CadenceSpec {
  label: string;
  /**
   * Falls due every N weeks. Zero means it recurs within the week instead:
   * daily on all seven days, twice on two spread days.
   */
  every: number;
  /** Long-run average occurrences a week, for the steady-state figures. */
  perWeek: number;
}

export const CADENCE: Record<Cadence, CadenceSpec> = {
  // Happens once and then is finished. perWeek is 0 because a one-off is not
  // a standing load: counting it would make the long-run average claim the
  // household repeats a thing it does not.
  once: { label: 'one-off', every: 0, perWeek: 0 },
  daily: { label: 'daily', every: 0, perWeek: 7 },
  twice: { label: '2× a week', every: 0, perWeek: 2 },
  weekly: { label: 'weekly', every: 1, perWeek: 1 },
  fortnightly: { label: 'fortnightly', every: 2, perWeek: 0.5 },
  monthly: { label: 'monthly', every: 4, perWeek: 0.25 },
  quarterly: { label: 'quarterly', every: 13, perWeek: 1 / 13 },
  biannual: { label: 'twice a year', every: 26, perWeek: 1 / 26 },
  annual: { label: 'yearly', every: 52, perWeek: 1 / 52 },
};

export const CADENCE_ORDER: readonly Cadence[] = [
  'once',
  'daily',
  'twice',
  'weekly',
  'fortnightly',
  'monthly',
  'quarterly',
  'biannual',
  'annual',
];

export function isCadence(v: string): v is Cadence {
  return v in CADENCE;
}
