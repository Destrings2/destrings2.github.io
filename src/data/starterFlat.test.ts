import { describe, expect, it } from 'vitest';
import { findFaces } from '@/domain/geometry/faces';
import { resolveProperty } from '@/domain/geometry/resolve';
import { validateProperty } from '@/domain/geometry/validate';
import { STARTER_FLAT } from './starterFlat';

describe('the starter flat', () => {
  it('passes validation with no errors', () => {
    const result = validateProperty(STARTER_FLAT);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('has no warnings either — it is the example everything else is judged against', () => {
    expect(validateProperty(STARTER_FLAT).warnings).toEqual([]);
  });

  it('is a properly connected graph, unlike the imported flat', () => {
    // Every junction is a shared node, so the rooms can be derived from the
    // walls. That is what makes it a sane thing for an editor to start from.
    const faces = findFaces(STARTER_FLAT.levels[0]!);
    expect(faces.length).toBeGreaterThanOrEqual(4);
  });

  it('resolves into something the scene can draw', () => {
    const plan = resolveProperty(STARTER_FLAT);
    expect(plan.walls).toHaveLength(13);
    expect(plan.rooms.map((r) => r.slug)).toEqual(['living', 'kitchen', 'bedroom', 'bath']);
    // Every wall resolved: a dangling node reference would silently drop one.
    for (const wall of plan.walls) {
      expect(Number.isFinite(wall.from[0])).toBe(true);
      expect(Number.isFinite(wall.to[1])).toBe(true);
    }
  });

  it('names the fittings that suggest chores', () => {
    const kinds = new Set(STARTER_FLAT.levels[0]!.furniture.map((f) => f.kind));
    for (const expected of ['wc', 'bath', 'oven', 'fridge', 'bed']) {
      expect(kinds.has(expected as never), expected).toBe(true);
    }
  });

  it('describes nobody in particular', () => {
    const text = JSON.stringify(STARTER_FLAT).toLowerCase();
    expect(text).not.toContain('rota');
    expect(STARTER_FLAT.name).toBe('Your home');
  });
});
