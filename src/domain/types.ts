/**
 * Domain types. Nothing here imports React, Supabase or three.js.
 *
 * Coordinate and unit contracts used across the domain:
 *   - clock times are minutes from local midnight (19:30 -> 1170)
 *   - days are 0..6 with Monday = 0, matching DAYS in ./time
 *   - durations are whole minutes
 */

export type Cadence =
  'daily' | 'twice' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'biannual' | 'annual';

export type PersonId = string;
export type ChoreId = string;

/**
 * A room's identity. Null means the chore belongs to the whole home rather
 * than one room — this replaces the prototype's magic 'flat' string.
 *
 * Before Phase 5 these are room slugs ('kitchen'); afterwards they are UUIDs.
 * Nothing in the domain layer cares which.
 */
export type RoomId = string | null;

/** `${choreId}#${n}` — stable across a rebuild, so ticks carry over. */
export type OccurrenceKey = string;

export interface Person {
  id: PersonId;
  name: string;
  colour: string;
}

export interface Chore {
  id: ChoreId;
  roomId: RoomId;
  name: string;
  mins: number;
  cadence: Cadence;
  /** Not scheduled early or late: vacuuming, laundry. */
  noisy: boolean;
  /** Rotated between people rather than always landing on one: the WC, the bins. */
  grim: boolean;
  enabled: boolean;
}

/** [day 0..6][hour slot 0..HN-1] — true where this person could do jobs. */
export type HourGrid = boolean[][];

export type Availability = Record<PersonId, HourGrid>;

/** A half-open span of clock minutes within one day. */
export interface Interval {
  from: number;
  to: number;
}

/** [day 0..6] -> real commitments read from a calendar. */
export type DayIntervals = Interval[][];

export type BusyMap = Record<PersonId, DayIntervals>;

/**
 * A manual placement. A human editing the plan — in the app or in Google
 * Calendar — always beats the scheduler, so these are applied before anything
 * is scheduled around them.
 */
export interface Override {
  personId: PersonId | null;
  day: number | null;
  at: number | null;
  skip: boolean;
}

export type Overrides = Record<OccurrenceKey, Override>;

export interface PlanEntry {
  key: OccurrenceKey;
  choreId: ChoreId;
  /** Null when nothing could be found for it — surfaced as "didn't fit". */
  personId: PersonId | null;
  day: number;
  at: number | null;
  mins: number;
  pinned: boolean;
  skipped: boolean;
}

export interface PlanMeta {
  /** Parallel to the people array, in every case. */
  free: number[];
  share: number[];
  target: number[];
  assigned: number[];
  totalMins: number;
}

export interface WeekPlan {
  plan: PlanEntry[];
  meta: PlanMeta;
}

/** Minutes actually ticked off, all time. Derived from completions, never counted up. */
export type Ledger = Record<PersonId, number>;

/** Who last did each chore, so grim jobs rotate. Also derived from completions. */
export type LastDoneBy = Record<ChoreId, PersonId>;

export interface SchedulerConfig {
  /** Most work placed into any one day, per person. */
  dailyCap: number;
  /** Nothing at all outside this. */
  window: Interval;
  /** Noisy jobs are held to this tighter window. */
  noisyWindow: Interval;
  /**
   * How far the running-total correction may pull a week, as a fraction of a
   * person's fair share. Stops one bad week from producing an unachievable one.
   */
  ledgerCorrection: number;
  /** Penalty applied to giving someone the grim job they did last time. */
  grimPenalty: number;
}

export const DEFAULT_CONFIG: SchedulerConfig = {
  dailyCap: 90,
  window: { from: 7 * 60, to: 22 * 60 + 30 },
  noisyWindow: { from: 8 * 60, to: 21 * 60 },
  ledgerCorrection: 0.4,
  grimPenalty: 0.35,
};
