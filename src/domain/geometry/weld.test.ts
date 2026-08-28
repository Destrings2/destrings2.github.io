import { describe, expect, it } from 'vitest';
import { EXAMPLE_HOME_DOCUMENT } from '@/data/exampleHome';
import type { LevelDocument } from './schema';
import { applyWeld, planWeld } from './weld';

const rota = () => structuredClone(EXAMPLE_HOME_DOCUMENT.levels[0]!) as LevelDocument;

function square(gap: number): LevelDocument {
  return {
    name: 'test',
    ordinal: 0,
    ceiling: 2.4,
    nodes: [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 4, y: 0 },
      { id: 'b2', x: 4 + gap, y: 0 },
      { id: 'c', x: 4, y: 3 },
    ],
    walls: [
      { id: 'w1', from: 'a', to: 'b', thickness: 0.1, openings: [] },
      { id: 'w2', from: 'b2', to: 'c', thickness: 0.1, openings: [] },
    ],
    stairs: [],
    furniture: [],
    rooms: [],
    bay: [],
  };
}

describe('planWeld', () => {
  it('changes nothing at zero tolerance beyond exact coincidences', () => {
    const plan = planWeld(rota(), 0);
    // 52 endpoints, 4 of which already coincide exactly -> 48 nodes stored.
    expect(plan.nodesBefore).toBe(48);
    expect(plan.nodesAfter).toBe(48);
    expect(plan.merges).toEqual([]);
  });

  it('joins only a handful of the example home even at a generous tolerance', () => {
    // The flat was drawn as overlapping slabs, not a connected graph. This is
    // the number that decided the importer welds nothing.
    expect(planWeld(rota(), 0.03).nodesAfter).toBe(46);
    expect(planWeld(rota(), 0.13).nodesAfter).toBe(39);
  });

  it('joins more as the tolerance grows, never fewer', () => {
    const counts = [0, 0.01, 0.03, 0.08, 0.13, 0.3].map((t) => planWeld(rota(), t).nodesAfter);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
    }
  });

  it('joins two corners within tolerance and puts the result between them', () => {
    const plan = planWeld(square(0.02), 0.05);
    expect(plan.nodesAfter).toBe(3);
    const merge = plan.merges.find((m) => m.absorb.includes('b2') || m.keep === 'b2')!;
    expect(merge.x).toBeCloseTo(4.01, 5);
  });

  it('leaves corners further apart than the tolerance alone', () => {
    expect(planWeld(square(0.2), 0.05).merges).toEqual([]);
  });

  it('reports walls that would collapse before anything is changed', () => {
    const level = square(0.02);
    level.walls.push({ id: 'w3', from: 'b', to: 'b2', thickness: 0.1, openings: [] });
    const plan = planWeld(level, 0.05);
    expect(plan.collapsing).toEqual(['w3']);
  });
});

describe('applyWeld', () => {
  it('repoints walls at the corner that survived', () => {
    const level = square(0.02);
    const welded = applyWeld(level, planWeld(level, 0.05));
    expect(welded.nodes).toHaveLength(3);
    const ids = new Set(welded.nodes.map((n) => n.id));
    for (const wall of welded.walls) {
      expect(ids.has(wall.from)).toBe(true);
      expect(ids.has(wall.to)).toBe(true);
    }
  });

  it('drops walls that lost their length', () => {
    const level = square(0.02);
    level.walls.push({ id: 'w3', from: 'b', to: 'b2', thickness: 0.1, openings: [] });
    const welded = applyWeld(level, planWeld(level, 0.05));
    expect(welded.walls.map((w) => w.id)).toEqual(['w1', 'w2']);
  });

  it('is a no-op when nothing is close enough', () => {
    const level = square(0.2);
    const welded = applyWeld(level, planWeld(level, 0.05));
    expect(welded.nodes).toEqual(level.nodes);
    expect(welded.walls).toEqual(level.walls);
  });

  it('leaves the example home untouched at zero tolerance', () => {
    const level = rota();
    const welded = applyWeld(level, planWeld(level, 0));
    expect(welded.nodes).toEqual(level.nodes);
    expect(welded.walls).toEqual(level.walls);
  });
});
