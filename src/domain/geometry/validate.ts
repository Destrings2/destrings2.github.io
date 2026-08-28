import { safeParseProperty, type LevelDocument, type PropertyDocument } from './schema';

export type IssueLevel = 'error' | 'warning';

export interface Issue {
  level: IssueLevel;
  /** Machine-readable, so an editor can highlight the right thing. */
  code: string;
  message: string;
  /** Where it is, when that can be pinned down. */
  at?: { level?: number; wall?: string; opening?: string; room?: string; node?: string };
}

export interface ValidationResult {
  ok: boolean;
  errors: Issue[];
  warnings: Issue[];
  document: PropertyDocument | null;
}

/**
 * Geometry a person authored is untrusted input, but an editor that refuses to
 * save anything imperfect is unusable — half the states you pass through while
 * drawing a room are briefly wrong.
 *
 * So there are two tiers. Errors are things that would break the renderer or
 * mean nothing at all: a wall naming a node that doesn't exist, an opening
 * running off the end of its wall, a duplicate id. Warnings are things that
 * are probably a mistake but perfectly drawable: two openings overlapping, a
 * room with no outline yet, a door you would hit your head on. Warnings surface
 * as a list; they never block a save.
 */
export function validateProperty(input: unknown): ValidationResult {
  const parsed = safeParseProperty(input);
  if (!parsed.success) {
    return {
      ok: false,
      document: null,
      warnings: [],
      errors: parsed.error.issues.map((issue) => ({
        level: 'error' as const,
        code: `schema.${issue.code}`,
        message: `${issue.path.join('.') || 'document'}: ${issue.message}`,
      })),
    };
  }

  const document = parsed.data;
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  const ordinals = new Set<number>();
  for (const level of document.levels) {
    if (ordinals.has(level.ordinal)) {
      errors.push({
        level: 'error',
        code: 'level.duplicateOrdinal',
        message: `two levels both claim to be number ${level.ordinal}`,
      });
    }
    ordinals.add(level.ordinal);
    checkLevel(level, errors, warnings);
  }

  return { ok: errors.length === 0, errors, warnings, document };
}

const DOOR_HEAD_CLEARANCE = 1.8;

function checkLevel(level: LevelDocument, errors: Issue[], warnings: Issue[]) {
  const at = (extra: Issue['at']) => ({ level: level.ordinal, ...extra });

  // ---- ids -----------------------------------------------------------
  const seen = <T>(items: T[], key: (item: T) => string, code: string, what: string) => {
    const found = new Set<string>();
    for (const item of items) {
      const id = key(item);
      if (found.has(id)) {
        errors.push({ level: 'error', code, message: `two ${what} share the id "${id}"` });
      }
      found.add(id);
    }
  };
  seen(level.nodes, (n) => n.id, 'node.duplicateId', 'corners');
  seen(level.walls, (w) => w.id, 'wall.duplicateId', 'walls');
  seen(level.rooms, (r) => r.slug, 'room.duplicateSlug', 'rooms');
  seen(level.furniture, (f) => f.id, 'furniture.duplicateId', 'pieces of furniture');
  seen(
    level.walls.flatMap((w) => w.openings),
    (o) => o.id,
    'opening.duplicateId',
    'openings',
  );

  // ---- walls ---------------------------------------------------------
  const nodes = new Map(level.nodes.map((n) => [n.id, n]));
  const referenced = new Set<string>();

  for (const wall of level.walls) {
    const from = nodes.get(wall.from);
    const to = nodes.get(wall.to);
    referenced.add(wall.from);
    referenced.add(wall.to);

    if (!from || !to) {
      errors.push({
        level: 'error',
        code: 'wall.unknownNode',
        message: `wall ${wall.id} is pinned to a corner that doesn't exist`,
        at: at({ wall: wall.id, node: from ? wall.to : wall.from }),
      });
      continue;
    }

    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < 1e-6) {
      errors.push({
        level: 'error',
        code: 'wall.zeroLength',
        message: `wall ${wall.id} starts and ends in the same place`,
        at: at({ wall: wall.id }),
      });
      continue;
    }
    if (length < wall.thickness * 2) {
      warnings.push({
        level: 'warning',
        code: 'wall.stubby',
        message: `wall ${wall.id} is ${length.toFixed(2)} m long but ${wall.thickness.toFixed(2)} m thick`,
        at: at({ wall: wall.id }),
      });
    }

    const ordered = [...wall.openings].sort((a, b) => a.from - b.from);
    for (const [index, opening] of ordered.entries()) {
      if (opening.to > length + 1e-6) {
        errors.push({
          level: 'error',
          code: 'opening.overruns',
          message: `${opening.kind} ${opening.id} runs ${(opening.to - length).toFixed(2)} m past the end of its wall`,
          at: at({ wall: wall.id, opening: opening.id }),
        });
      }
      if (opening.head > level.ceiling + 1e-6) {
        errors.push({
          level: 'error',
          code: 'opening.aboveCeiling',
          message: `${opening.kind} ${opening.id} is taller than the ${level.ceiling} m ceiling`,
          at: at({ wall: wall.id, opening: opening.id }),
        });
      }

      const previous = ordered[index - 1];
      if (previous && opening.from < previous.to - 1e-6) {
        warnings.push({
          level: 'warning',
          code: 'opening.overlaps',
          message: `${opening.id} overlaps ${previous.id} on wall ${wall.id}`,
          at: at({ wall: wall.id, opening: opening.id }),
        });
      }
      if (opening.kind === 'door' && opening.head < DOOR_HEAD_CLEARANCE) {
        warnings.push({
          level: 'warning',
          code: 'opening.lowDoor',
          message: `door ${opening.id} is only ${opening.head.toFixed(2)} m high`,
          at: at({ wall: wall.id, opening: opening.id }),
        });
      }
      if (opening.to - opening.from > length - 1e-6) {
        warnings.push({
          level: 'warning',
          code: 'opening.fillsWall',
          message: `${opening.id} takes up the whole of wall ${wall.id}`,
          at: at({ wall: wall.id, opening: opening.id }),
        });
      }
    }
  }

  for (const node of level.nodes) {
    if (!referenced.has(node.id)) {
      warnings.push({
        level: 'warning',
        code: 'node.orphan',
        message: `corner ${node.id} has no wall attached`,
        at: at({ node: node.id }),
      });
    }
  }

  // ---- rooms ---------------------------------------------------------
  for (const room of level.rooms) {
    const outlines = room.rects.length + room.polys.length;
    if (outlines === 0) {
      warnings.push({
        level: 'warning',
        code: 'room.noOutline',
        message: `${room.name} has no floor drawn yet`,
        at: at({ room: room.slug }),
      });
      continue;
    }
    const drawn = drawnArea(room.rects, room.polys);
    if (drawn < 0.05) {
      warnings.push({
        level: 'warning',
        code: 'room.zeroArea',
        message: `${room.name} encloses no space`,
        at: at({ room: room.slug }),
      });
    }
  }

  for (const item of level.furniture) {
    if (item.roomSlug && !level.rooms.some((r) => r.slug === item.roomSlug)) {
      warnings.push({
        level: 'warning',
        code: 'furniture.unknownRoom',
        message: `${item.id} says it is in "${item.roomSlug}", which is not a room here`,
        at: at({ room: item.roomSlug }),
      });
    }
  }

  // ---- stairs --------------------------------------------------------
  const plate = floorBounds(level);
  for (const stair of level.stairs) {
    const inside =
      Math.min(stair.x0, stair.x1) >= plate.minX - 0.5 &&
      Math.max(stair.x0, stair.x1) <= plate.maxX + 0.5 &&
      Math.min(stair.yBot, stair.yTop) >= plate.minY - 0.5 &&
      Math.max(stair.yBot, stair.yTop) <= plate.maxY + 0.5;
    if (!inside) {
      warnings.push({
        level: 'warning',
        code: 'stair.offPlate',
        message: `the stair sits outside the floor`,
      });
    }
    if (Math.abs(stair.yTop - stair.yBot) < 1e-6) {
      warnings.push({ level: 'warning', code: 'stair.noRun', message: `the stair has no going` });
    }
  }
}

/** Shoelace area, summed over every piece of a room's outline. */
function drawnArea(rects: number[][], polys: number[][][]): number {
  let total = 0;
  for (const r of rects) total += Math.abs((r[2]! - r[0]!) * (r[3]! - r[1]!));
  for (const poly of polys) {
    let sum = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      sum += a[0]! * b[1]! - b[0]! * a[1]!;
    }
    total += Math.abs(sum) / 2;
  }
  return total;
}

function floorBounds(level: LevelDocument) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const node of level.nodes) add(node.x, node.y);
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return { minX, maxX, minY, maxY };
}
