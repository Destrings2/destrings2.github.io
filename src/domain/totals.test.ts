import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPLIT_WEEKEND,
  DEFAULT_WEEKDAY_EVENINGS,
  gridFrom,
} from '@/data/defaultAvailability';
import { seedToChores } from '@/data/chores';
import { STARTER_CHORES } from '@/data/starterChores';
import { buildPlan } from './scheduler';
import { averageWeekly, entriesForDay, roomLoad, weekTotals } from './totals';
import { CADENCE } from './cadence';
import { DEFAULT_CONFIG } from './types';
import type { Chore, Person, WeekPlan } from './types';

const PEOPLE: Person[] = [
  { id: 'a', name: 'Me', colour: '#E8B93E' },
  { id: 'b', name: 'Partner', colour: '#5FA394' },
];
const CHORES = seedToChores(STARTER_CHORES);

const week: WeekPlan = buildPlan({
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
});

describe('weekTotals', () => {
  it('reads the plan, not the chore list', () => {
    const totals = weekTotals(week, new Set());
    const live = week.plan.filter((e) => !e.skipped);
    expect(totals.count).toBe(live.length);
    expect(totals.total).toBe(live.reduce((s, e) => s + e.mins, 0));
  });

  it('splits assigned minutes across people, summing to the total', () => {
    const totals = weekTotals(week, new Set());
    const assigned = Object.values(totals.byPerson).reduce((s, m) => s + m, 0);
    const unplacedMins = week.plan
      .filter((e) => !e.skipped && e.personId === null)
      .reduce((s, e) => s + e.mins, 0);
    expect(assigned + unplacedMins).toBe(totals.total);
  });

  it('counts ticked jobs and their minutes', () => {
    const first = week.plan.filter((e) => !e.skipped).slice(0, 3);
    const totals = weekTotals(week, new Set(first.map((e) => e.key)));
    expect(totals.doneCount).toBe(3);
    expect(totals.doneMins).toBe(first.reduce((s, e) => s + e.mins, 0));
  });

  it('leaves skipped jobs out of every figure', () => {
    const key = week.plan[0]!.key;
    const withSkip: WeekPlan = {
      ...week,
      plan: week.plan.map((e) => (e.key === key ? { ...e, skipped: true } : e)),
    };
    const before = weekTotals(week, new Set());
    const after = weekTotals(withSkip, new Set());
    expect(after.count).toBe(before.count - 1);
    expect(after.total).toBe(before.total - week.plan[0]!.mins);
  });
});

describe('roomLoad', () => {
  it('collects whole-home chores under their own key rather than dropping them', () => {
    const load = roomLoad(week, CHORES, new Set());
    expect(load['__home__']).toBeDefined();
    expect(load['__home__']!.total).toBeGreaterThan(0);
  });

  it('has room totals summing to the week total', () => {
    const load = roomLoad(week, CHORES, new Set());
    const summed = Object.values(load).reduce((s, r) => s + r.total, 0);
    expect(summed).toBe(weekTotals(week, new Set()).total);
  });

  it('moves minutes out of `left` as jobs are ticked, keeping `total` fixed', () => {
    const kitchen = week.plan.find((e) => {
      const c = CHORES.find((x) => x.id === e.choreId);
      return c?.roomId === 'kitchen' && !e.skipped;
    })!;
    const before = roomLoad(week, CHORES, new Set())['kitchen']!;
    const after = roomLoad(week, CHORES, new Set([kitchen.key]))['kitchen']!;
    expect(after.total).toBe(before.total);
    expect(after.left).toBe(before.left - kitchen.mins);
  });
});

describe('averageWeekly', () => {
  it('weights each chore by how often it actually falls due', () => {
    const daily: Chore = {
      id: 'x',
      roomId: null,
      name: 'x',
      mins: 10,
      cadence: 'daily',
      noisy: false,
      grim: false,
      enabled: true,
    };
    expect(averageWeekly([daily])).toBe(70);
    expect(averageWeekly([{ ...daily, cadence: 'weekly' }])).toBe(10);
    expect(averageWeekly([{ ...daily, cadence: 'fortnightly' }])).toBe(5);
    expect(averageWeekly([{ ...daily, cadence: 'annual' }])).toBeCloseTo(10 / 52, 6);
  });

  it('narrows to one room when asked', () => {
    const whole = averageWeekly(CHORES);
    const kitchen = averageWeekly(CHORES, 'kitchen');
    expect(kitchen).toBeGreaterThan(0);
    expect(kitchen).toBeLessThan(whole);
  });

  it('ignores disabled chores', () => {
    const off = CHORES.map((c) => ({ ...c, enabled: false }));
    expect(averageWeekly(off)).toBe(0);
  });
});

describe('cadence table', () => {
  it('agrees with itself: a cadence recurring within the week has no week stride', () => {
    for (const spec of Object.values(CADENCE)) {
      if (spec.every === 0) expect(spec.perWeek).toBeGreaterThanOrEqual(1);
      else expect(spec.perWeek).toBeCloseTo(1 / spec.every, 6);
    }
  });
});

describe('entriesForDay', () => {
  it('returns one day, earliest first', () => {
    const entries = entriesForDay(week, 5);
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) expect(e.day).toBe(5);
    const times = entries.map((e) => e.at ?? 0);
    expect([...times].sort((x, y) => x - y)).toEqual(times);
  });
});
