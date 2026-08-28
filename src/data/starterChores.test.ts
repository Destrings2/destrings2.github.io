import { describe, expect, it } from 'vitest';
import { STARTER_CHORES } from './starterChores';
import { STARTER_FLAT } from './starterFlat';
import { seedToChores } from './chores';

const roomsInFlat = new Set(STARTER_FLAT.levels[0]!.rooms.map((r) => r.slug));

describe('the starter chore list', () => {
  it('only names rooms the starter flat actually has', () => {
    // Otherwise seeding quietly dumps a quarter of the list into "whole home".
    for (const chore of STARTER_CHORES) {
      if (chore.room === null) continue;
      expect(roomsInFlat.has(chore.room), `${chore.name} -> ${chore.room}`).toBe(true);
    }
  });

  it('covers every room in the flat', () => {
    const used = new Set(STARTER_CHORES.map((c) => c.room).filter(Boolean));
    for (const room of roomsInFlat) expect(used.has(room), room).toBe(true);
  });

  it('has unique keys, so re-seeding never duplicates', () => {
    expect(new Set(STARTER_CHORES.map((c) => c.key)).size).toBe(STARTER_CHORES.length);
  });

  it('describes nobody in particular', () => {
    const text = STARTER_CHORES.map((c) => c.name)
      .join(' | ')
      .toLowerCase();
    for (const tell of ['cat', 'litter', 'bay window', 'bedroom 2', 'oak', 'bannister']) {
      expect(text, tell).not.toContain(tell);
    }
  });

  it('resolves into usable chores', () => {
    const chores = seedToChores(STARTER_CHORES);
    expect(chores.length).toBe(STARTER_CHORES.length);
    expect(chores.every((c) => c.mins > 0 && c.enabled)).toBe(true);
  });
});
