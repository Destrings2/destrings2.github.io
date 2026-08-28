import type { Floorplan, Opening, Point, Rect, Wall } from '@/data/floorplanTypes';
import type { LevelDocument, PropertyDocument } from './schema';

/**
 * Dereference a stored document into the flat shape the scene draws.
 *
 * The document stores walls as a pair of node ids so that an editor can move a
 * corner and have everything meeting there follow. The renderer only ever
 * wants the coordinates, so they are resolved once here rather than looked up
 * inside a draw loop.
 *
 * Walls naming a node that does not exist are dropped rather than crashing the
 * scene — `validateProperty` reports them as errors, and a half-edited home
 * should still render whatever part of it is coherent.
 */
export function resolveLevel(document: PropertyDocument, level: LevelDocument): Floorplan {
  const nodes = new Map(level.nodes.map((n) => [n.id, n]));

  const walls: Wall[] = [];
  for (const wall of level.walls) {
    const from = nodes.get(wall.from);
    const to = nodes.get(wall.to);
    if (!from || !to) continue;

    const openings: Opening[] = wall.openings.map((o) => ({
      kind: o.kind,
      from: o.from,
      to: o.to,
      sill: o.sill,
      head: o.head,
      ...(o.hinge ? { hinge: o.hinge } : {}),
      ...(o.swing ? { swing: o.swing } : {}),
    }));

    walls.push({
      from: [from.x, from.y],
      to: [to.x, to.y],
      thickness: wall.thickness,
      ...(openings.length ? { openings } : {}),
    });
  }

  const stair = level.stairs[0] ?? { x0: 0, x1: 0, yTop: 0, yBot: 0, steps: 1 };

  return {
    name: document.name,
    subtitle: level.name,
    floorAreaSqm: document.floorAreaSqm,
    ceiling: level.ceiling,
    thickness: document.defaults,
    walls,
    bay: level.bay.map((p): Point => [p[0], p[1]]),
    stair: { x0: stair.x0, x1: stair.x1, yTop: stair.yTop, yBot: stair.yBot, steps: stair.steps },
    rooms: level.rooms.map((room) => ({
      slug: room.slug,
      name: room.name,
      dimsLabel: room.dimsLabel,
      areaSqm: room.areaSqm,
      floorColour: room.floorColour,
      ...(room.rects.length
        ? { rects: room.rects.map((r): Rect => [r[0], r[1], r[2], r[3]]) }
        : {}),
      ...(room.polys.length
        ? { polys: room.polys.map((poly) => poly.map((q): Point => [q[0], q[1]])) }
        : {}),
      labelAt: [room.labelAt[0], room.labelAt[1]] as Point,
      cameraView: {
        at: [room.cameraView.at[0], room.cameraView.at[1]] as Point,
        distance: room.cameraView.distance,
      },
    })),
    furniture: level.furniture.map((item) => ({
      kind: item.kind,
      box: [item.box[0], item.box[1], item.box[2], item.box[3]] as Rect,
      ...(item.z ? { z: [item.z[0], item.z[1]] as [number, number] } : {}),
      ...(item.colour != null ? { colour: item.colour } : {}),
      ...(item.roomSlug ? { roomSlug: item.roomSlug } : {}),
    })),
  };
}

/** The level a household opens on. */
export function resolveProperty(document: PropertyDocument, ordinal?: number): Floorplan {
  const level =
    (ordinal != null ? document.levels.find((l) => l.ordinal === ordinal) : undefined) ??
    document.levels[0]!;
  return resolveLevel(document, level);
}
