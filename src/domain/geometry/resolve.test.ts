import { describe, expect, it } from 'vitest';
import type { PropertyDocument } from './schema';
import { resolveProperty } from './resolve';

/** The smallest document anyone could reasonably hand-write. */
const bare = {
  version: 1,
  units: 'm',
  name: 'Bare',
  defaults: { exterior: 0.25, interior: 0.1 },
  levels: [
    {
      name: 'Only floor',
      ordinal: 0,
      ceiling: 2.4,
      nodes: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 4, y: 0 },
      ],
      walls: [{ id: 'w', from: 'a', to: 'b', thickness: 0.1 }],
      rooms: [
        {
          slug: 'room',
          name: 'Room',
          floorColour: 0xcccccc,
          labelAt: [2, 1],
          cameraView: { at: [2, 1], distance: 6 },
        },
      ],
    },
  ],
} as unknown as PropertyDocument;

describe('resolveProperty', () => {
  it('copes with a document that never went through the parser', () => {
    // The schema supplies defaults for openings, stairs, furniture, bay,
    // rects, polys and the rest — but a document read straight out of a table,
    // or written by hand, arrives without them.
    const plan = resolveProperty(bare);
    expect(plan.walls).toHaveLength(1);
    expect(plan.furniture).toEqual([]);
    expect(plan.bay).toEqual([]);
    expect(plan.rooms[0]!.dimsLabel).toBe('');
    expect(plan.floorAreaSqm).toBe(0);
  });

  it('drops a wall naming a corner that does not exist, rather than throwing', () => {
    const broken = structuredClone(bare);
    broken.levels[0]!.walls[0]!.from = 'nowhere';
    expect(resolveProperty(broken).walls).toEqual([]);
  });

  it('gives a level with no stair a harmless empty one', () => {
    expect(resolveProperty(bare).stair.steps).toBeGreaterThan(0);
  });
});
