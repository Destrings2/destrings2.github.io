import { describe, expect, it } from 'vitest';
import {
  dayIndexOf,
  formatMins,
  hash,
  hhmm,
  localISO,
  mondayOf,
  nearDays,
  weekIndex,
} from './time';

describe('mondayOf', () => {
  it('returns the same Monday for every day of a week', () => {
    // Wed 26 Aug 2026 .. Tue 1 Sep 2026
    const week = [24, 25, 26, 27, 28, 29, 30].map((d) => mondayOf(new Date(2026, 7, d, 13)));
    for (const m of week) expect(localISO(m)).toBe('2026-08-24');
  });

  it('is local midnight, not UTC', () => {
    const m = mondayOf(new Date(2026, 7, 28, 23, 45));
    expect(m.getHours()).toBe(0);
    expect(m.getMinutes()).toBe(0);
  });
});

describe('dayIndexOf', () => {
  it('puts Monday at 0 and Sunday at 6', () => {
    expect(dayIndexOf(new Date(2026, 7, 24))).toBe(0); // Monday
    expect(dayIndexOf(new Date(2026, 7, 30))).toBe(6); // Sunday
  });
});

describe('localISO', () => {
  it('does not shift the date near midnight, as toISOString would', () => {
    expect(localISO(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
    expect(localISO(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31');
  });
});

describe('weekIndex', () => {
  it('advances by exactly one a week for two years, across both DST changes', () => {
    // The bug this guards: a local Monday midnight drifts an hour when the
    // clocks change, so a floored division loses or gains a week.
    let previous = weekIndex(new Date(2025, 0, 6));
    for (let i = 1; i < 104; i++) {
      const d = new Date(2025, 0, 6 + i * 7);
      const current = weekIndex(d);
      expect(current - previous).toBe(1);
      previous = current;
    }
  });

  it('is identical for every day within one week', () => {
    const indices = [24, 25, 26, 27, 28, 29, 30].map((d) => weekIndex(new Date(2026, 7, d)));
    expect(new Set(indices).size).toBe(1);
  });
});

describe('hhmm and formatMins', () => {
  it('pads the clock', () => {
    expect(hhmm(7 * 60)).toBe('07:00');
    expect(hhmm(19 * 60 + 5)).toBe('19:05');
    expect(hhmm(22 * 60 + 30)).toBe('22:30');
  });

  it('reads durations the way a person would say them', () => {
    expect(formatMins(45)).toBe('45m');
    expect(formatMins(60)).toBe('1h');
    expect(formatMins(90)).toBe('1h 30m');
  });
});

describe('hash', () => {
  it('is stable and non-negative', () => {
    expect(hash('k4')).toBe(hash('k4'));
    expect(hash('k4')).toBeGreaterThanOrEqual(0);
  });

  it('separates the chore ids actually in use', () => {
    const ids = ['k1', 'k2', 'k3', 'b1', 'b2', 'm1', 'r1', 'f1', 'c1'];
    expect(new Set(ids.map(hash)).size).toBe(ids.length);
  });
});

describe('nearDays', () => {
  it('offers the preferred day first, then outward, wrapping the week', () => {
    expect(nearDays(3)).toEqual([3, 4, 2, 5, 1, 6, 0]);
    expect(nearDays(0)).toEqual([0, 1, 6, 2, 5, 3, 4]);
  });
});
