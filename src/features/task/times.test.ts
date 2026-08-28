import { describe, expect, it } from 'vitest';
import { TIMES, timesFor } from './times';

describe('timesFor', () => {
  it('offers just the half hours when the job sits on one', () => {
    expect(timesFor(19 * 60 + 30)).toBe(TIMES);
  });

  it('offers the job its own time when the planner placed it off the half hour', () => {
    // The bug this guards: the picker showed 18:00 for a job at 18:12, so
    // changing only who did it also moved it twelve minutes earlier.
    const offered = timesFor(18 * 60 + 12);
    expect(offered).toContain(18 * 60 + 12);
    expect(offered).toHaveLength(TIMES.length + 1);
  });

  it('keeps the list in clock order', () => {
    const offered = timesFor(18 * 60 + 12);
    expect([...offered]).toEqual([...offered].sort((a, b) => a - b));
  });

  it('offers a time outside the usual range rather than dropping it', () => {
    const offered = timesFor(22 * 60 + 15);
    expect(offered).toContain(22 * 60 + 15);
  });

  it('falls back to the plain list for a job with no time yet', () => {
    expect(timesFor(null)).toBe(TIMES);
  });
});
