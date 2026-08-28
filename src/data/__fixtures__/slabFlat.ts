import type { LevelDocument } from '@/domain/geometry/schema';

/**
 * A flat drawn the way a person actually draws one: as overlapping thick
 * slabs, with no two walls sharing a corner.
 *
 * This is the awkward case the weld tool and the face finder exist for.
 * Extruding solid geometry from overlapping slabs looks entirely correct, and
 * yet the walls form no connected graph at all, so there are no faces to find
 * until the corners are joined.
 *
 * Synthetic on purpose. The behaviour used to be tested against a real
 * imported home, which meant keeping somebody's floorplan in the repository to
 * assert facts about it.
 */
export const SLAB_FLAT: LevelDocument = {
  name: 'Slab test',
  ordinal: 0,
  ceiling: 2.4,
  nodes: [
    // Perimeter, each wall running past the next rather than meeting it.
    { id: 'a1', x: -0.1, y: -0.1 },
    { id: 'a2', x: 6.1, y: -0.1 },
    { id: 'b1', x: 6.0, y: -0.12 },
    { id: 'b2', x: 6.0, y: 4.12 },
    { id: 'c1', x: 6.1, y: 4.0 },
    { id: 'c2', x: -0.1, y: 4.0 },
    { id: 'd1', x: 0.0, y: 4.12 },
    { id: 'd2', x: 0.0, y: -0.12 },
    // An internal wall that stops short of both.
    { id: 'e1', x: 3.0, y: 0.06 },
    { id: 'e2', x: 3.0, y: 3.94 },
  ],
  walls: [
    { id: 'w1', from: 'a1', to: 'a2', thickness: 0.2, openings: [] },
    { id: 'w2', from: 'b1', to: 'b2', thickness: 0.2, openings: [] },
    { id: 'w3', from: 'c1', to: 'c2', thickness: 0.2, openings: [] },
    { id: 'w4', from: 'd1', to: 'd2', thickness: 0.2, openings: [] },
    {
      id: 'w5',
      from: 'e1',
      to: 'e2',
      thickness: 0.1,
      openings: [
        { id: 'w5o1', kind: 'door', from: 1.4, to: 2.2, sill: 0, head: 2.05, hinge: 'start' },
      ],
    },
  ],
  stairs: [],
  furniture: [],
  rooms: [],
  bay: [],
};
