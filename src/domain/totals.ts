import { CADENCE } from './cadence';
import type { Chore, ChoreId, OccurrenceKey, PersonId, PlanEntry, RoomId, WeekPlan } from './types';

/** Which occurrences have been ticked off this week. */
export type DoneSet = ReadonlySet<OccurrenceKey>;

export interface WeekTotals {
  /** Minutes assigned, per person. */
  byPerson: Record<PersonId, number>;
  total: number;
  /** Occurrences counted, excluding skipped ones. */
  count: number;
  doneCount: number;
  doneMins: number;
  /** Jobs that couldn't be placed anywhere. */
  unplaced: number;
}

/**
 * The plan is the source of truth for what the week contains — not the chore
 * list, which says only what could fall due.
 */
export function weekTotals(week: WeekPlan, done: DoneSet): WeekTotals {
  const totals: WeekTotals = {
    byPerson: {},
    total: 0,
    count: 0,
    doneCount: 0,
    doneMins: 0,
    unplaced: 0,
  };

  for (const entry of week.plan) {
    if (entry.skipped) continue;
    totals.count++;
    totals.total += entry.mins;
    if (entry.personId) {
      totals.byPerson[entry.personId] = (totals.byPerson[entry.personId] ?? 0) + entry.mins;
    } else {
      totals.unplaced++;
    }
    if (done.has(entry.key)) {
      totals.doneCount++;
      totals.doneMins += entry.mins;
    }
  }
  return totals;
}

export interface RoomLoad {
  /** Minutes still outstanding — what the floor tint and the labels read from. */
  left: number;
  total: number;
  byPerson: Record<PersonId, number>;
}

/**
 * Outstanding work per room. Chores with a null room are collected under the
 * `wholeHome` key rather than being dropped.
 */
export function roomLoad(
  week: WeekPlan,
  chores: readonly Chore[],
  done: DoneSet,
  wholeHomeKey = '__home__',
): Record<string, RoomLoad> {
  const byId = new Map<ChoreId, Chore>(chores.map((c) => [c.id, c]));
  const out: Record<string, RoomLoad> = {};

  const bucket = (roomId: RoomId): RoomLoad => {
    const key = roomId ?? wholeHomeKey;
    return (out[key] ??= { left: 0, total: 0, byPerson: {} });
  };

  for (const entry of week.plan) {
    if (entry.skipped) continue;
    const chore = byId.get(entry.choreId);
    if (!chore) continue;
    const b = bucket(chore.roomId);
    b.total += entry.mins;
    if (!done.has(entry.key)) {
      b.left += entry.mins;
      if (entry.personId)
        b.byPerson[entry.personId] = (b.byPerson[entry.personId] ?? 0) + entry.mins;
    }
  }
  return out;
}

/**
 * Long-run minutes a week, whatever happens to fall due in any given one.
 * Pass a roomId to narrow it, or omit for the whole home.
 */
export function averageWeekly(chores: readonly Chore[], roomId?: RoomId): number {
  return chores
    .filter((c) => c.enabled && (roomId === undefined || c.roomId === roomId))
    .reduce((sum, c) => sum + c.mins * CADENCE[c.cadence].perWeek, 0);
}

/** Entries for one day, earliest first. Unplaced jobs sort to the front. */
export function entriesForDay(week: WeekPlan, day: number): PlanEntry[] {
  return week.plan
    .filter((e) => e.day === day && !e.skipped)
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
}
