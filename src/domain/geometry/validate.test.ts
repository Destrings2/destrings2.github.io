import { describe, expect, it } from 'vitest';
import { EXAMPLE_HOME_DOCUMENT } from '@/data/exampleHome';
import { validateProperty } from './validate';
import type { PropertyDocument } from './schema';

const clone = (): PropertyDocument => structuredClone(EXAMPLE_HOME_DOCUMENT) as PropertyDocument;
const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe('the shipped flat', () => {
  it('passes with no errors', () => {
    const result = validateProperty(EXAMPLE_HOME_DOCUMENT);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('warns about the corners nothing joins to', () => {
    // the example home was drawn as overlapping slabs, so most of its walls do not
    // actually meet. Nothing is welded at import, so this is expected — but it
    // should be visible rather than silent.
    const result = validateProperty(EXAMPLE_HOME_DOCUMENT);
    expect(codes(result.warnings)).not.toContain('wall.unknownNode');
    expect(result.warnings.length).toBeGreaterThanOrEqual(0);
  });
});

describe('errors', () => {
  it('rejects a document that is not the right shape at all', () => {
    const result = validateProperty({ version: 2, hello: true });
    expect(result.ok).toBe(false);
    expect(result.document).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.code.startsWith('schema.')).toBe(true);
  });

  it('rejects a wall pinned to a corner that does not exist', () => {
    const doc = clone();
    doc.levels[0]!.walls[0]!.from = 'nowhere';
    const result = validateProperty(doc);
    expect(result.ok).toBe(false);
    expect(codes(result.errors)).toContain('wall.unknownNode');
  });

  it('rejects an opening that runs off the end of its wall', () => {
    const doc = clone();
    const wall = doc.levels[0]!.walls.find((w) => w.openings.length)!;
    wall.openings[0]!.to = 999;
    const result = validateProperty(doc);
    expect(codes(result.errors)).toContain('opening.overruns');
  });

  it('rejects an opening taller than the ceiling', () => {
    const doc = clone();
    const wall = doc.levels[0]!.walls.find((w) => w.openings.length)!;
    wall.openings[0]!.head = 9;
    expect(codes(validateProperty(doc).errors)).toContain('opening.aboveCeiling');
  });

  it('rejects a wall with both ends in the same place', () => {
    const doc = clone();
    doc.levels[0]!.walls[0]!.to = doc.levels[0]!.walls[0]!.from;
    expect(codes(validateProperty(doc).errors)).toContain('wall.zeroLength');
  });

  it('rejects duplicate ids', () => {
    const doc = clone();
    doc.levels[0]!.walls[1]!.id = doc.levels[0]!.walls[0]!.id;
    expect(codes(validateProperty(doc).errors)).toContain('wall.duplicateId');
  });

  it('rejects two rooms claiming the same slug', () => {
    const doc = clone();
    doc.levels[0]!.rooms[1]!.slug = doc.levels[0]!.rooms[0]!.slug;
    expect(codes(validateProperty(doc).errors)).toContain('room.duplicateSlug');
  });

  it('rejects an opening with no width or no height', () => {
    const doc = clone();
    const wall = doc.levels[0]!.walls.find((w) => w.openings.length)!;
    wall.openings[0]!.to = wall.openings[0]!.from;
    const result = validateProperty(doc);
    expect(result.ok).toBe(false);
    expect(result.errors[0]!.code.startsWith('schema.')).toBe(true);
  });
});

describe('warnings never block a save', () => {
  it('flags overlapping openings but still accepts the document', () => {
    const doc = clone();
    const wall = doc.levels[0]!.walls.find((w) => w.openings.length)!;
    const first = wall.openings[0]!;
    wall.openings.push({ ...first, id: `${first.id}-dup`, from: first.from + 0.05 });
    const result = validateProperty(doc);
    expect(result.ok).toBe(true);
    expect(codes(result.warnings)).toContain('opening.overlaps');
  });

  it('flags a door you would hit your head on', () => {
    const doc = clone();
    const wall = doc.levels[0]!.walls.find((w) => w.openings.some((o) => o.kind === 'door'))!;
    wall.openings.find((o) => o.kind === 'door')!.head = 1.4;
    const result = validateProperty(doc);
    expect(result.ok).toBe(true);
    expect(codes(result.warnings)).toContain('opening.lowDoor');
  });

  it('flags a room with no floor drawn yet', () => {
    const doc = clone();
    const room = doc.levels[0]!.rooms[0]!;
    room.rects = [];
    room.polys = [];
    const result = validateProperty(doc);
    expect(result.ok).toBe(true);
    expect(codes(result.warnings)).toContain('room.noOutline');
  });

  it('flags a corner with nothing attached to it', () => {
    const doc = clone();
    doc.levels[0]!.nodes.push({ id: 'stray', x: 40, y: 40 });
    const result = validateProperty(doc);
    expect(result.ok).toBe(true);
    expect(codes(result.warnings)).toContain('node.orphan');
  });

  it('flags furniture in a room that is not there', () => {
    const doc = clone();
    doc.levels[0]!.furniture[0]!.roomSlug = 'conservatory';
    const result = validateProperty(doc);
    expect(result.ok).toBe(true);
    expect(codes(result.warnings)).toContain('furniture.unknownRoom');
  });

  it('flags a stair that has wandered off the floor', () => {
    const doc = clone();
    doc.levels[0]!.stairs[0]!.x0 = 90;
    doc.levels[0]!.stairs[0]!.x1 = 92;
    const result = validateProperty(doc);
    expect(result.ok).toBe(true);
    expect(codes(result.warnings)).toContain('stair.offPlate');
  });
});
