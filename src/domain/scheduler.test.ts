import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPLIT_WEEKEND,
  DEFAULT_WEEKDAY_EVENINGS,
  emptyGrid,
  gridFrom,
} from '@/data/defaultAvailability';
import { SEED_CHORES, seedToChores } from '@/data/seedChores';
import { buildPlan, dueInstances, freeMinutes, runsFor, subtractBusy } from './scheduler';
import type { BuildInput } from './scheduler';
import { DEFAULT_CONFIG } from './types';
import type { Chore, Overrides, Person, PlanEntry } from './types';

const PEOPLE: Person[] = [
  { id: 'a', name: 'Me', colour: '#E8B93E' },
  { id: 'b', name: 'Partner', colour: '#5FA394' },
];

const CHORES = seedToChores();

function input(over: Partial<BuildInput> = {}): BuildInput {
  return {
    people: PEOPLE,
    chores: CHORES,
    availability: {
      a: gridFrom(DEFAULT_WEEKDAY_EVENINGS),
      b: gridFrom(DEFAULT_SPLIT_WEEKEND),
    },
    ledger: { a: 0, b: 0 },
    lastDoneBy: {},
    overrides: {},
    weekIndex: 140,
    config: DEFAULT_CONFIG,
    ...over,
  };
}

const placed = (plan: PlanEntry[]) => plan.filter((e) => !e.skipped && e.at !== null);

describe('subtractBusy', () => {
  it('leaves a span alone when nothing overlaps', () => {
    expect(subtractBusy({ from: 600, to: 900 }, [{ from: 1000, to: 1100 }])).toEqual([
      { from: 600, to: 900 },
    ]);
  });

  it('splits a span around a commitment in the middle', () => {
    expect(subtractBusy({ from: 600, to: 900 }, [{ from: 700, to: 800 }])).toEqual([
      { from: 600, to: 700 },
      { from: 800, to: 900 },
    ]);
  });

  it('trims from either end', () => {
    expect(subtractBusy({ from: 600, to: 900 }, [{ from: 500, to: 700 }])).toEqual([
      { from: 700, to: 900 },
    ]);
    expect(subtractBusy({ from: 600, to: 900 }, [{ from: 800, to: 1000 }])).toEqual([
      { from: 600, to: 800 },
    ]);
  });

  it('removes a span swallowed whole', () => {
    expect(subtractBusy({ from: 600, to: 900 }, [{ from: 500, to: 1000 }])).toEqual([]);
  });

  it('applies several commitments in one pass', () => {
    expect(
      subtractBusy({ from: 600, to: 1200 }, [
        { from: 700, to: 800 },
        { from: 900, to: 1000 },
      ]),
    ).toEqual([
      { from: 600, to: 700 },
      { from: 800, to: 900 },
      { from: 1000, to: 1200 },
    ]);
  });
});

describe('runsFor', () => {
  it('collapses painted hours into contiguous runs', () => {
    const grid = gridFrom([[0, 18, 22]]);
    expect(runsFor(grid)[0]).toEqual([{ from: 18 * 60, to: 22 * 60, used: 0 }]);
  });

  it('keeps a gap in the painted hours as two runs', () => {
    const grid = gridFrom([
      [0, 9, 13],
      [0, 16, 20],
    ]);
    expect(runsFor(grid)[0]).toEqual([
      { from: 9 * 60, to: 13 * 60, used: 0 },
      { from: 16 * 60, to: 20 * 60, used: 0 },
    ]);
  });

  it('splits a free run around a real commitment', () => {
    const grid = gridFrom([[0, 18, 22]]);
    const busy = [[{ from: 19 * 60, to: 20 * 60 }]];
    expect(runsFor(grid, busy)[0]).toEqual([
      { from: 18 * 60, to: 19 * 60, used: 0 },
      { from: 20 * 60, to: 22 * 60, used: 0 },
    ]);
  });

  it('sorts commitments before subtracting them', () => {
    const grid = gridFrom([[0, 9, 18]]);
    const busy = [
      [
        { from: 14 * 60, to: 15 * 60 },
        { from: 10 * 60, to: 11 * 60 },
      ],
    ];
    expect(runsFor(grid, busy)[0]).toEqual([
      { from: 9 * 60, to: 10 * 60, used: 0 },
      { from: 11 * 60, to: 14 * 60, used: 0 },
      { from: 15 * 60, to: 18 * 60, used: 0 },
    ]);
  });
});

describe('dueInstances', () => {
  it('gives a daily chore one locked occurrence per day', () => {
    const daily = CHORES.filter((c) => c.cadence === 'daily');
    for (const chore of daily) {
      const occs = dueInstances([chore], 0);
      expect(occs).toHaveLength(7);
      expect(occs.map((o) => o.days[0])).toEqual([0, 1, 2, 3, 4, 5, 6]);
      for (const o of occs) expect(o.days).toHaveLength(1);
    }
  });

  it('gives a twice-weekly chore two sliding occurrences', () => {
    const chore = CHORES.find((c) => c.cadence === 'twice')!;
    const occs = dueInstances([chore], 0);
    expect(occs).toHaveLength(2);
    for (const o of occs) expect(o.days).toHaveLength(7); // free to slide
  });

  it('makes a weekly chore due every week', () => {
    const chore = CHORES.find((c) => c.cadence === 'weekly')!;
    for (let w = 0; w < 8; w++) expect(dueInstances([chore], w)).toHaveLength(1);
  });

  it('spreads longer cadences so they do not all land in the same week', () => {
    const monthly = CHORES.filter((c) => c.cadence === 'monthly');
    const perWeek = [0, 1, 2, 3].map((w) => dueInstances(monthly, w).length);
    expect(perWeek.reduce((s, n) => s + n, 0)).toBe(monthly.length);
    // No single week carries all of them.
    expect(Math.max(...perWeek)).toBeLessThan(monthly.length);
  });

  it('skips disabled chores entirely', () => {
    const off: Chore[] = CHORES.map((c) => ({ ...c, enabled: false }));
    expect(dueInstances(off, 3)).toHaveLength(0);
  });
});

describe('buildPlan — the quiet windows', () => {
  const week = buildPlan(input());

  it('places nothing before 07:00 or ending after 22:30', () => {
    for (const e of placed(week.plan)) {
      expect(e.at!).toBeGreaterThanOrEqual(DEFAULT_CONFIG.window.from);
      expect(e.at! + e.mins).toBeLessThanOrEqual(DEFAULT_CONFIG.window.to);
    }
  });

  it('holds noisy jobs to 08:00–21:00', () => {
    const noisy = new Set(CHORES.filter((c) => c.noisy).map((c) => c.id));
    const entries = placed(week.plan).filter((e) => noisy.has(e.choreId));
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(e.at!).toBeGreaterThanOrEqual(DEFAULT_CONFIG.noisyWindow.from);
      expect(e.at! + e.mins).toBeLessThanOrEqual(DEFAULT_CONFIG.noisyWindow.to);
    }
  });
});

describe('buildPlan — the daily cap', () => {
  it('never puts more than the cap into one person-day', () => {
    for (const cap of [60, 90, 150]) {
      const week = buildPlan(input({ config: { ...DEFAULT_CONFIG, dailyCap: cap } }));
      const used = new Map<string, number>();
      for (const e of placed(week.plan)) {
        const k = `${e.personId}:${e.day}`;
        used.set(k, (used.get(k) ?? 0) + e.mins);
      }
      for (const [, mins] of used) expect(mins).toBeLessThanOrEqual(cap);
    }
  });
});

describe('buildPlan — fairness', () => {
  it('splits by share of free time, not by equal hours', () => {
    // A has twice B's free time.
    const week = buildPlan(
      input({
        availability: {
          a: gridFrom([
            [5, 9, 19],
            [6, 9, 19],
          ]),
          b: gridFrom([[5, 9, 19]]),
        },
      }),
    );
    expect(week.meta.share[0]).toBeCloseTo(2 / 3, 5);
    expect(week.meta.share[1]).toBeCloseTo(1 / 3, 5);
  });

  it('has each person give up a similar fraction of their own free time', () => {
    const week = buildPlan(input());
    const [freeA, freeB] = week.meta.free as [number, number];
    const assignedA = week.plan
      .filter((e) => e.personId === 'a' && !e.skipped)
      .reduce((s, e) => s + e.mins, 0);
    const assignedB = week.plan
      .filter((e) => e.personId === 'b' && !e.skipped)
      .reduce((s, e) => s + e.mins, 0);
    expect(Math.abs(assignedA / freeA - assignedB / freeB)).toBeLessThan(0.05);
  });

  it('falls back to an even split when nobody has painted any time', () => {
    const week = buildPlan(input({ availability: { a: emptyGrid(), b: emptyGrid() } }));
    expect(week.meta.share).toEqual([0.5, 0.5]);
  });

  it('leans the week toward whoever is behind on the running total', () => {
    const behind = buildPlan(input({ ledger: { a: 0, b: 600 } }));
    const level = buildPlan(input({ ledger: { a: 0, b: 0 } }));
    // 'a' has done nothing, so 'a' is owed more work than in the level case.
    expect(behind.meta.target[0]!).toBeGreaterThan(level.meta.target[0]!);
  });

  it('bounds the correction so one lopsided week cannot produce an impossible one', () => {
    const week = buildPlan(input({ ledger: { a: 0, b: 100_000 } }));
    for (let i = 0; i < PEOPLE.length; i++) {
      const fair = week.meta.share[i]! * week.meta.totalMins;
      const drift = Math.abs(week.meta.target[i]! - fair);
      expect(drift).toBeLessThanOrEqual(DEFAULT_CONFIG.ledgerCorrection * fair + 1e-9);
    }
  });
});

describe('buildPlan — grim rotation', () => {
  it('prefers not to give someone the grim job they did last time', () => {
    const grim = CHORES.find((c) => c.grim && c.cadence === 'weekly')!;
    const only = [grim];
    const symmetric = {
      a: gridFrom([[5, 9, 19]]),
      b: gridFrom([[5, 9, 19]]),
    };
    const week = buildPlan(
      input({ chores: only, availability: symmetric, lastDoneBy: { [grim.id]: 'a' } }),
    );
    const entry = week.plan.find((e) => e.choreId === grim.id)!;
    expect(entry.personId).toBe('b');
  });
});

describe('buildPlan — manual placement wins', () => {
  const chore = CHORES.find((c) => c.cadence === 'weekly' && !c.noisy)!;
  const key = `${chore.id}#0`;

  it('puts a fully pinned job exactly where it was put', () => {
    const overrides: Overrides = {
      [key]: { personId: 'b', day: 2, at: 20 * 60 + 15, skip: false },
    };
    const week = buildPlan(input({ overrides }));
    const entry = week.plan.find((e) => e.key === key)!;
    expect(entry.personId).toBe('b');
    expect(entry.day).toBe(2);
    expect(entry.at).toBe(20 * 60 + 15);
    expect(entry.pinned).toBe(true);
  });

  it('blocks the stretch a pinned job occupies so nothing overlaps it', () => {
    const overrides: Overrides = {
      [key]: { personId: 'b', day: 2, at: 19 * 60, skip: false },
    };
    const week = buildPlan(input({ overrides }));
    const sameLane = placed(week.plan).filter(
      (e) => e.personId === 'b' && e.day === 2 && e.key !== key,
    );
    for (const e of sameLane) {
      const overlaps = e.at! < 19 * 60 + chore.mins && e.at! + e.mins > 19 * 60;
      expect(overlaps).toBe(false);
    }
  });

  it('honours a pinned person while leaving the time to the planner', () => {
    const overrides: Overrides = { [key]: { personId: 'a', day: null, at: null, skip: false } };
    const week = buildPlan(input({ overrides }));
    const entry = week.plan.find((e) => e.key === key)!;
    expect(entry.personId).toBe('a');
    expect(entry.at).not.toBeNull();
  });
});

describe('buildPlan — skipping', () => {
  const chore = CHORES.find((c) => c.cadence === 'weekly')!;
  const key = `${chore.id}#0`;

  it('keeps a skipped job listed so it can be put back', () => {
    const week = buildPlan(
      input({ overrides: { [key]: { personId: null, day: null, at: null, skip: true } } }),
    );
    const entry = week.plan.find((e) => e.key === key)!;
    expect(entry.skipped).toBe(true);
    expect(entry.personId).toBeNull();
    expect(entry.at).toBeNull();
  });

  it('excludes skipped minutes from the week total', () => {
    const before = buildPlan(input());
    const after = buildPlan(
      input({ overrides: { [key]: { personId: null, day: null, at: null, skip: true } } }),
    );
    expect(after.meta.totalMins).toBe(before.meta.totalMins - chore.mins);
  });

  it('round-trips: un-skipping restores the job to the plan', () => {
    const skipped = buildPlan(
      input({ overrides: { [key]: { personId: null, day: null, at: null, skip: true } } }),
    );
    const restored = buildPlan(input({ overrides: {} }));
    expect(skipped.plan.find((e) => e.key === key)!.skipped).toBe(true);
    expect(restored.plan.find((e) => e.key === key)!.skipped).toBe(false);
    expect(restored.plan.find((e) => e.key === key)!.personId).not.toBeNull();
  });
});

describe('buildPlan — jobs that do not fit', () => {
  it('surfaces them as unplaced rather than dropping them', () => {
    // One free hour for the whole week, against 72 chores.
    const week = buildPlan(input({ availability: { a: gridFrom([[0, 19, 20]]), b: emptyGrid() } }));
    const unplaced = week.plan.filter((e) => !e.skipped && e.personId === null);
    expect(unplaced.length).toBeGreaterThan(0);
    for (const e of unplaced) expect(e.at).toBeNull();
  });

  it('accounts for every due occurrence exactly once', () => {
    const week = buildPlan(input({ availability: { a: gridFrom([[0, 19, 20]]), b: emptyGrid() } }));
    const due = dueInstances(CHORES, 140);
    expect(week.plan).toHaveLength(due.length);
    expect(new Set(week.plan.map((e) => e.key)).size).toBe(due.length);
  });
});

describe('occurrence keys', () => {
  it('are stable across a rebuild, so ticks carry over', () => {
    const first = buildPlan(input());
    // Same week, different running total: assignments may move, keys must not.
    const second = buildPlan(input({ ledger: { a: 900, b: 120 } }));
    expect(new Set(second.plan.map((e) => e.key))).toEqual(new Set(first.plan.map((e) => e.key)));
  });

  it('are unique within a week', () => {
    const week = buildPlan(input());
    expect(new Set(week.plan.map((e) => e.key)).size).toBe(week.plan.length);
  });

  it('name the chore they belong to', () => {
    const week = buildPlan(input());
    for (const e of week.plan) expect(e.key.startsWith(`${e.choreId}#`)).toBe(true);
  });
});

describe('buildPlan — real commitments', () => {
  it('does not schedule over a calendar event', () => {
    const busy = { a: [[{ from: 19 * 60, to: 21 * 60 }]], b: [] };
    const week = buildPlan(
      input({
        availability: { a: gridFrom([[0, 18, 22]]), b: emptyGrid() },
        busy,
      }),
    );
    for (const e of placed(week.plan).filter((x) => x.personId === 'a' && x.day === 0)) {
      const overlaps = e.at! < 21 * 60 && e.at! + e.mins > 19 * 60;
      expect(overlaps).toBe(false);
    }
  });
});

describe('buildPlan — N people', () => {
  it('handles three people without any two-person assumption', () => {
    const three: Person[] = [...PEOPLE, { id: 'c', name: 'Lodger', colour: '#B47CC7' }];
    const week = buildPlan(
      input({
        people: three,
        availability: {
          a: gridFrom([[5, 9, 17]]),
          b: gridFrom([[6, 9, 17]]),
          c: gridFrom([[4, 18, 22]]),
        },
        ledger: { a: 0, b: 0, c: 0 },
      }),
    );
    expect(week.meta.share).toHaveLength(3);
    expect(week.meta.share.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 5);
    const owners = new Set(placed(week.plan).map((e) => e.personId));
    expect(owners.size).toBe(3);
  });

  it('handles one person', () => {
    const week = buildPlan(
      input({
        people: [PEOPLE[0]!],
        availability: { a: gridFrom(DEFAULT_WEEKDAY_EVENINGS) },
        ledger: { a: 0 },
      }),
    );
    expect(week.meta.share).toEqual([1]);
    for (const e of placed(week.plan)) expect(e.personId).toBe('a');
  });
});

describe('freeMinutes', () => {
  it('counts an hour per painted slot', () => {
    expect(freeMinutes(gridFrom([[0, 18, 22]]))).toBe(4 * 60);
    expect(freeMinutes(emptyGrid())).toBe(0);
  });

  it('matches the default grids', () => {
    expect(freeMinutes(gridFrom(DEFAULT_WEEKDAY_EVENINGS))).toBe(39 * 60);
    expect(freeMinutes(gridFrom(DEFAULT_SPLIT_WEEKEND))).toBe(32 * 60);
  });
});

describe('the seed list', () => {
  it('has 72 chores with unique keys', () => {
    expect(SEED_CHORES).toHaveLength(72);
    expect(new Set(SEED_CHORES.map((c) => c.key)).size).toBe(72);
  });

  it('puts whole-home chores on a null room rather than a magic string', () => {
    const wholeHome = SEED_CHORES.filter((c) => c.room === null);
    expect(wholeHome.length).toBeGreaterThan(0);
    expect(SEED_CHORES.some((c) => c.room === 'flat')).toBe(false);
  });
});

describe('characterisation', () => {
  it('produces a stable plan for a known week', () => {
    const week = buildPlan(input());
    const summary = week.plan
      .filter((e) => !e.skipped)
      .map((e) => `${e.key} ${e.personId ?? '--'} d${e.day} ${e.at ?? '----'} ${e.mins}m`)
      .sort();
    expect(summary).toMatchSnapshot();
  });
});
