import { describe, expect, it } from 'vitest';
import { nearestOffered } from './times';

describe('nearestOffered', () => {
  it('keeps a time that is already on the half hour', () => {
    expect(nearestOffered(19 * 60 + 30)).toBe(19 * 60 + 30);
  });

  it('snaps a planner-placed time to the nearest option', () => {
    // The bug: 18:16 is not in the list, so the select fell back to its first
    // option and Apply moved the job to 07:00.
    expect(nearestOffered(18 * 60 + 16)).toBe(18 * 60 + 30);
    expect(nearestOffered(18 * 60 + 11)).toBe(18 * 60);
  });

  it('clamps to the ends of the range', () => {
    expect(nearestOffered(3 * 60)).toBe(7 * 60);
    expect(nearestOffered(23 * 60 + 50)).toBe(22 * 60);
  });
});
