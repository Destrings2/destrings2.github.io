import { describe, expect, it } from 'vitest';
import { EXAMPLE_HOME_DOCUMENT } from '@/data/exampleHome';
import { findFaces, signedArea } from './faces';
import type { LevelDocument } from './schema';
import { applyWeld, planWeld } from './weld';

function level(
  nodes: { id: string; x: number; y: number }[],
  edges: [string, string][],
): LevelDocument {
  return {
    name: 'test',
    ordinal: 0,
    ceiling: 2.4,
    nodes,
    walls: edges.map(([from, to], i) => ({
      id: `w${i}`,
      from,
      to,
      thickness: 0.1,
      openings: [],
    })),
    stairs: [],
    furniture: [],
    rooms: [],
    bay: [],
  };
}

describe('signedArea', () => {
  it('is positive anticlockwise and negative clockwise', () => {
    const square: [number, number][] = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ];
    expect(signedArea(square)).toBe(4);
    expect(signedArea([...square].reverse())).toBe(-4);
  });
});

describe('findFaces', () => {
  it('finds a single closed room', () => {
    const faces = findFaces(
      level(
        [
          { id: 'a', x: 0, y: 0 },
          { id: 'b', x: 4, y: 0 },
          { id: 'c', x: 4, y: 3 },
          { id: 'd', x: 0, y: 3 },
        ],
        [
          ['a', 'b'],
          ['b', 'c'],
          ['c', 'd'],
          ['d', 'a'],
        ],
      ),
    );
    expect(faces).toHaveLength(1);
    expect(faces[0]!.areaSqm).toBeCloseTo(12, 5);
    expect(faces[0]!.nodes).toHaveLength(4);
  });

  it('finds both rooms either side of a dividing wall', () => {
    const faces = findFaces(
      level(
        [
          { id: 'a', x: 0, y: 0 },
          { id: 'b', x: 4, y: 0 },
          { id: 'c', x: 4, y: 3 },
          { id: 'd', x: 0, y: 3 },
          { id: 'e', x: 2, y: 0 },
          { id: 'f', x: 2, y: 3 },
        ],
        [
          ['a', 'e'],
          ['e', 'b'],
          ['b', 'c'],
          ['c', 'f'],
          ['f', 'd'],
          ['d', 'a'],
          ['e', 'f'],
        ],
      ),
    );
    expect(faces).toHaveLength(2);
    expect(faces.map((f) => Math.round(f.areaSqm))).toEqual([6, 6]);
  });

  it('finds nothing in a wall that encloses nothing', () => {
    expect(
      findFaces(
        level(
          [
            { id: 'a', x: 0, y: 0 },
            { id: 'b', x: 4, y: 0 },
          ],
          [['a', 'b']],
        ),
      ),
    ).toEqual([]);
  });

  it('finds nothing in the example home as imported', () => {
    // The honest result: only 4 of 52 endpoints coincide, so there is no
    // connected graph to walk. This is what the weld tool is for.
    const faces = findFaces(EXAMPLE_HOME_DOCUMENT.levels[0]! as LevelDocument);
    expect(faces).toEqual([]);
  });

  it('finds rooms in the example home once its corners are joined', () => {
    const source = structuredClone(EXAMPLE_HOME_DOCUMENT.levels[0]!) as LevelDocument;
    const welded = applyWeld(source, planWeld(source, 0.35));
    const faces = findFaces(welded);
    // Not the finished article — that is the Phase 8 editor's job with a human
    // watching — but welding turns "nothing at all" into real enclosed space.
    expect(faces.length).toBeGreaterThan(0);
    expect(faces[0]!.areaSqm).toBeGreaterThan(1);
  });
});
