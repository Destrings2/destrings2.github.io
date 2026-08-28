import type {
  Availability,
  Chore,
  LastDoneBy,
  Ledger,
  OccurrenceKey,
  Overrides,
  Person,
  PlanMeta,
  PlanEntry,
} from '@/domain/types';

/** How the floor colours read: outstanding load, who owns it, or plain. */
export type TintMode = 'load' | 'who' | 'plain';

/**
 * One week, frozen at first derivation.
 *
 * The plan is re-derived only on an explicit reshuffle or a settings change —
 * never on read — because the running total moves whenever a job is ticked,
 * and a plan that quietly reshuffles under you is unusable.
 */
export interface StoredWeek {
  plan: PlanEntry[];
  meta: PlanMeta;
  done: OccurrenceKey[];
  overrides: Overrides;
  generatedAt: number;
}

export interface HouseholdState {
  version: 1;
  people: Person[];
  chores: Chore[];
  availability: Availability;
  weeks: Record<string, StoredWeek>;
  /**
   * Minutes ticked off, all time. A counter here only because there is one
   * device; Phase 6 replaces it with an aggregate over completion rows.
   */
  ledger: Ledger;
  lastDoneBy: LastDoneBy;
  settings: {
    dailyCap: number;
    tint: TintMode;
  };
  /** Names still at their defaults — the app nudges once, then stops asking. */
  named: boolean;
}
