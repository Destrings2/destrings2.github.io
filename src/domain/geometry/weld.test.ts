import { describe, expect, it } from 'vitest';
import { SLAB_FLAT } from '@/data/__fixtures__/slabFlat';
import { STARTER_FLAT } from '@/data/starterFlat';
import type { LevelDocument } from './schema';
import { applyWeld, planWeld } from './weld';

const slabs = () => structuredClone(SLAB_FLAT);
const starter = () => structuredClone(STARTER_FLAT.levels[0]!) as LevelDocument;

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
  it('changes nothing at zero tolerance', () => {
    const plan = planWeld(slabs(), 0);
    expect(plan.nodesBefore).toBe(plan.nodesAfter);
    expect(plan.merges).toEqual([]);
  });

  it('joins more as the tolerance grows, never fewer', () => {
    const counts = [0, 0.05, 0.1, 0.2, 0.5].map((t) => planWeld(slabs(), t).nodesAfter);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
    }
  });

  it('needs a real tolerance to join a flat drawn as overlapping slabs', () => {
    // The point of the preview: a drawing that renders perfectly can still be
    // a set of disconnected walls, and how many join depends entirely on how
    // far you are willing to move them.
    const before = planWeld(slabs(), 0).nodesAfter;
    expect(planWeld(slabs(), 0.05).nodesAfter).toBe(before);
    expect(planWeld(slabs(), 0.3).nodesAfter).toBeLessThan(before);
  });

  it('finds nothing to do on a flat already drawn as a graph', () => {
    // The starter flat shares every junction, so there is nothing to weld.
    expect(planWeld(starter(), 0.05).merges).toEqual([]);
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
    expect(planWeld(level, 0.05).collapsing).toEqual(['w3']);
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

  it('leaves a slab drawing untouched at zero tolerance', () => {
    const level = slabs();
    const welded = applyWeld(level, planWeld(level, 0));
    expect(welded.nodes).toEqual(level.nodes);
    expect(welded.walls).toEqual(level.walls);
  });
});
