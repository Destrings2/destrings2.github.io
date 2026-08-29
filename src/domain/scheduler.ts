import { CADENCE } from './cadence';
import { H0, hash, localISO, nearDays } from './time';
import type {
  Availability,
  BusyMap,
  Carried,
  Chore,
  DayIntervals,
  HourGrid,
  Interval,
  LastDoneBy,
  Ledger,
  Overrides,
  Person,
  PersonId,
  PlanEntry,
  SchedulerConfig,
  WeekPlan,
} from './types';

/** A contiguous stretch of free time, with a cursor for what's been used. */
export interface Run {
  from: number;
  to: number;
  used: number;
}

/** One thing that falls due this week, before anyone is assigned to it. */
export interface Occurrence {
  key: string;
  chore: Chore;
  /** Candidate days in preference order. One entry means the day is fixed. */
  days: number[];
  mins: number;
  /** Set when this is here because it was missed in an earlier week. */
  carriedFrom?: string;
}

export interface BuildInput {
  /** The Monday this week starts on, YYYY-MM-DD. Only one-offs need it. */
  weekStart?: string;
  /** Jobs missed in an earlier week that are still wanted. */
  carried?: Carried[];
  people: Person[];
  chores: Chore[];
  availability: Availability;
  ledger: Ledger;
  lastDoneBy: LastDoneBy;
  overrides: Overrides;
  weekIndex: number;
  config: SchedulerConfig;
  /** Real commitments read from each person's calendar. Absent until Phase 7. */
  busy?: BusyMap | undefined;
}

export function freeMinutes(grid: HourGrid): number {
  let total = 0;
  for (const day of grid) for (const on of day) if (on) total += 60;
  return total;
}

/** Remove `busy` from `span`, returning whatever is left of it. */
export function subtractBusy(span: Interval, busy: readonly Interval[]): Interval[] {
  let parts: Interval[] = [span];
  for (const b of busy) {
    const next: Interval[] = [];
    for (const p of parts) {
      if (b.to <= p.from || b.from >= p.to) {
        next.push(p);
        continue;
      }
      if (b.from > p.from) next.push({ from: p.from, to: b.from });
      if (b.to < p.to) next.push({ from: b.to, to: p.to });
    }
    parts = next;
  }
  return parts;
}

/**
 * Painted availability, collapsed into contiguous runs of clock minutes and
 * split around real commitments. A painted hour is a statement about a typical
 * week; a calendar event is a statement about this one, so the calendar wins.
 */
export function runsFor(grid: HourGrid, busy: DayIntervals = []): Run[][] {
  return grid.map((day, dayIndex) => {
    const spans: Interval[] = [];
    let start: number | null = null;
    day.forEach((on, i) => {
      if (on && start === null) start = i;
      if (!on && start !== null) {
        spans.push({ from: (H0 + start) * 60, to: (H0 + i) * 60 });
        start = null;
      }
    });
    if (start !== null) {
      spans.push({ from: (H0 + start) * 60, to: (H0 + day.length) * 60 });
    }

    const commitments = [...(busy[dayIndex] ?? [])].sort((a, b) => a.from - b.from);
    return spans
      .flatMap((span) => subtractBusy(span, commitments))
      .map((span) => ({ from: span.from, to: span.to, used: 0 }));
  });
}

/**
 * What falls due in week `wIdx`. Cadences longer than a week are spread by a
 * hash of the chore id, so the monthly jobs don't all land in the same week.
 */
/**
 * What is due in a week.
 *
 * `weekStart` is the Monday, as YYYY-MM-DD. It is only needed by one-offs,
 * which are the one kind of job that cares which week it is rather than
 * merely how often. Left out, a one-off is treated as due now.
 */
export function dueInstances(chores: Chore[], wIdx: number, weekStart?: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const chore of chores) {
    if (!chore.enabled) continue;
    const spec = CADENCE[chore.cadence];

    if (chore.cadence === 'once') {
      // Due in the week it was asked for, and in every week after that until
      // it is actually done — a one-off nobody got to should not quietly
      // disappear at midnight on Sunday. Ticking it takes it off the list,
      // which is what ends this.
      const wanted = chore.dueOn ?? null;
      if (wanted && weekStart) {
        const sunday = new Date(`${weekStart}T12:00:00`);
        sunday.setDate(sunday.getDate() + 6);
        if (wanted > localISO(sunday)) continue;
      }
      out.push({
        key: `${chore.id}#once`,
        chore,
        days: [0, 1, 2, 3, 4, 5, 6],
        mins: chore.mins,
      });
      continue;
    }

    if (spec.every === 0) {
      if (chore.cadence === 'daily') {
        for (let d = 0; d < 7; d++) {
          out.push({ key: `${chore.id}#${d}`, chore, days: [d], mins: chore.mins });
        }
      } else {
        // Twice a week: two anchor days roughly midweek apart, each free to slide.
        const offset = hash(chore.id) % 2;
        [(1 + offset) % 7, (4 + offset) % 7].forEach((day, k) => {
          out.push({ key: `${chore.id}#${k}`, chore, days: nearDays(day), mins: chore.mins });
        });
      }
    } else if ((wIdx + hash(chore.id)) % spec.every === 0) {
      out.push({ key: `${chore.id}#0`, chore, days: [0, 1, 2, 3, 4, 5, 6], mins: chore.mins });
    }
  }
  return out;
}

/** The earliest slot that fits, honouring the daily cap and the quiet windows. */
export function findSlot(
  runs: Run[][],
  dayUsed: number[],
  occurrence: Occurrence,
  config: SchedulerConfig,
): { day: number; run: Run; start: number } | null {
  const window = occurrence.chore.noisy ? config.noisyWindow : config.window;

  for (const day of occurrence.days) {
    if ((dayUsed[day] ?? 0) + occurrence.mins > config.dailyCap) continue;
    for (const run of runs[day] ?? []) {
      const from = Math.max(run.from + run.used, window.from);
      const to = Math.min(run.to, window.to);
      if (to - from >= occurrence.mins) return { day, run, start: from };
    }
  }
  return null;
}

/**
 * Split the week.
 *
 * Fair here means each person gives up the same *share of their own free time*,
 * not the same number of hours. The running total then nudges the next week to
 * correct for whoever actually did the work, bounded so one lopsided week can't
 * produce an impossible one.
 */
export function buildPlan(input: BuildInput): WeekPlan {
  const { people, chores, availability, ledger, lastDoneBy, overrides, config } = input;
  const n = people.length;
  const indexOf = new Map<PersonId, number>(people.map((p, i) => [p.id, i]));

  const free = people.map((p) => freeMinutes(availability[p.id] ?? []));
  const totalFree = free.reduce((s, f) => s + f, 0);
  const share = totalFree > 0 ? free.map((f) => f / totalFree) : people.map(() => 1 / n);

  const instances = dueInstances(chores, input.weekIndex, input.weekStart);

  // A job missed earlier is wanted again — unless it is already due here in
  // its own right, in which case the natural occurrence *is* the second
  // chance and adding another would have the week ask for it twice. That is
  // what makes anything weekly or oftener quietly look after itself.
  const dueAnyway = new Set(instances.map((occurrence) => occurrence.chore.id));
  for (const missed of input.carried ?? []) {
    if (dueAnyway.has(missed.choreId)) continue;
    const chore = chores.find((c) => c.id === missed.choreId);
    if (!chore || !chore.enabled) continue;
    instances.push({
      key: `${chore.id}#carried`,
      chore,
      days: [0, 1, 2, 3, 4, 5, 6],
      mins: chore.mins,
      carriedFrom: missed.since,
    });
  }
  const live = instances.filter((i) => !overrides[i.key]?.skip);
  const totalMins = live.reduce((s, i) => s + i.mins, 0);

  const doneTotal = people.reduce((s, p) => s + (ledger[p.id] ?? 0), 0);
  const target = people.map((p, i) => {
    const fairShare = (share[i] ?? 0) * totalMins;
    const owed = (share[i] ?? 0) * doneTotal - (ledger[p.id] ?? 0);
    const cap = config.ledgerCorrection * fairShare;
    return fairShare + Math.max(-cap, Math.min(cap, owed));
  });

  const runs = people.map((p) => runsFor(availability[p.id] ?? [], input.busy?.[p.id] ?? []));
  const dayUsed = people.map(() => [0, 0, 0, 0, 0, 0, 0]);
  const assigned = people.map(() => 0);
  const plan: PlanEntry[] = [];

  // 1 — skipped occurrences stay listed, so they can be put back.
  for (const i of instances) {
    if (!overrides[i.key]?.skip) continue;
    plan.push({
      key: i.key,
      choreId: i.chore.id,
      personId: null,
      day: i.days[0] ?? 0,
      at: null,
      mins: i.mins,
      pinned: false,
      skipped: true,
    });
  }

  // 2 — anything placed by hand goes exactly where it was put, and blocks that stretch.
  const pinned = live.filter((i) => {
    const o = overrides[i.key];
    return o != null && o.day != null && o.at != null;
  });
  for (const i of pinned) {
    const o = overrides[i.key]!;
    const personId = o.personId ?? people[0]?.id ?? '';
    const k = indexOf.get(personId) ?? 0;
    const day = o.day!;
    const at = o.at!;
    plan.push({
      key: i.key,
      choreId: i.chore.id,
      personId,
      day,
      at,
      mins: i.mins,
      pinned: true,
      skipped: false,
    });
    dayUsed[k]![day] = (dayUsed[k]![day] ?? 0) + i.mins;
    assigned[k] = (assigned[k] ?? 0) + i.mins;
    for (const run of runs[k]![day] ?? []) {
      if (at >= run.from && at < run.to) run.used = Math.max(run.used, at + i.mins - run.from);
    }
  }

  // 3 — everything else is scheduled around them. Day-locked jobs first, then
  //     longest first, because a long job is the hardest thing to place late.
  const rest = live.filter((i) => {
    const o = overrides[i.key];
    return !(o != null && o.day != null && o.at != null);
  });
  const isLocked = (i: Occurrence) => i.days.length === 1;
  const order = [...rest].sort((x, y) => {
    if (isLocked(x) !== isLocked(y)) return isLocked(x) ? -1 : 1;
    if (isLocked(x)) return (x.days[0] ?? 0) - (y.days[0] ?? 0);
    return y.mins - x.mins;
  });

  for (const occurrence of order) {
    const chore = occurrence.chore;
    const o = overrides[occurrence.key];

    // A person may be pinned while the time is left to the planner.
    const candidateIndices =
      o?.personId != null ? [indexOf.get(o.personId) ?? 0] : people.map((_, i) => i);

    const candidates = candidateIndices
      .map((i) => {
        const slot = findSlot(runs[i]!, dayUsed[i]!, occurrence, config);
        // Furthest behind their target goes first.
        let score = ((target[i] ?? 0) - (assigned[i] ?? 0)) / Math.max(60, target[i] || 60);
        if (chore.grim && lastDoneBy[chore.id] === people[i]!.id) score -= config.grimPenalty;
        if (chore.preferredBy && chore.preferredBy === people[i]!.id) score += config.preferBonus;
        return { i, slot, score };
      })
      .filter((c): c is { i: number; slot: NonNullable<typeof c.slot>; score: number } => !!c.slot);

    if (candidates.length === 0) {
      // Nothing fits anywhere. Surfaced as "didn't fit" rather than dropped.
      plan.push({
        key: occurrence.key,
        choreId: chore.id,
        personId: o?.personId ?? null,
        day: occurrence.days[0] ?? 0,
        at: null,
        mins: occurrence.mins,
        pinned: false,
        skipped: false,
        ...(occurrence.carriedFrom ? { carriedFrom: occurrence.carriedFrom } : {}),
      });
      continue;
    }

    candidates.sort((a, b) => b.score - a.score);
    const pick = candidates[0]!;
    const { day, run, start } = pick.slot;

    run.used = start + occurrence.mins - run.from;
    dayUsed[pick.i]![day] = (dayUsed[pick.i]![day] ?? 0) + occurrence.mins;
    assigned[pick.i] = (assigned[pick.i] ?? 0) + occurrence.mins;

    plan.push({
      key: occurrence.key,
      choreId: chore.id,
      personId: people[pick.i]!.id,
      day,
      at: start,
      mins: occurrence.mins,
      pinned: o?.personId != null,
      skipped: false,
      ...(occurrence.carriedFrom ? { carriedFrom: occurrence.carriedFrom } : {}),
    });
  }

  return { plan, meta: { free, share, target, assigned, totalMins } };
}
