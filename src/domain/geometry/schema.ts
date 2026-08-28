import { z } from 'zod';

/**
 * The stored shape of a home.
 *
 * This is the format a person's own floorplan is written in, so it is treated
 * as untrusted input: one schema validates the editor, the write path and the
 * Postgres trigger, and nothing reaches the scene without passing it.
 *
 * Coordinates are metres in plan space: +x east, +y north. The scene layer
 * maps (x, y) -> (x, 0, -y); nothing outside src/scene knows that.
 *
 * Walls reference shared vertices by id rather than carrying their own
 * endpoints. That costs nothing to render and is the difference between a
 * model you can draw and one you can only look at — drag a corner and the
 * walls that meet there follow. Retrofitting vertex identity later would be a
 * migration over other people's homes, so it goes in from the start even
 * though a flat drawn as overlapping slabs imports with none of its corners shared.
 */

const finite = z.number().finite();
const id = z.string().min(1).max(64);

export const pointSchema = z.tuple([finite, finite]);

export const rectSchema = z
  .tuple([finite, finite, finite, finite])
  .refine((r) => r[0] < r[2] && r[1] < r[3], {
    message: 'a rectangle must run bottom-left to top-right',
  });

export const nodeSchema = z.object({
  id,
  x: finite,
  y: finite,
});

export const openingKindSchema = z.enum(['window', 'door', 'opening']);

export const openingSchema = z
  .object({
    id,
    kind: openingKindSchema,
    /** Distance along the wall from its `from` end. */
    from: finite.nonnegative(),
    to: finite.nonnegative(),
    /** Height above the floor of the bottom and the top of the hole. */
    sill: finite.nonnegative(),
    head: finite.positive(),
    hinge: z.enum(['start', 'end']).optional(),
    swing: z.union([z.literal(1), z.literal(-1)]).optional(),
  })
  .refine((o) => o.from < o.to, { message: 'an opening must have width' })
  .refine((o) => o.sill < o.head, { message: 'an opening must have height' });

export const wallSchema = z.object({
  id,
  from: id,
  to: id,
  thickness: finite.positive(),
  openings: z.array(openingSchema).default([]),
});

export const stairSchema = z.object({
  id,
  x0: finite,
  x1: finite,
  /** Stairs descend from yTop to yBot. */
  yTop: finite,
  yBot: finite,
  steps: z.int().min(1).max(60),
  goes: z.enum(['up', 'down']).default('down'),
});

export const furnitureKindSchema = z.enum([
  'bed',
  'box',
  'sofa',
  'wc',
  'bath',
  'basin',
  'oven',
  'hob',
  'fridge',
  'dishwasher',
  'washingMachine',
  'wardrobe',
  'litterTray',
]);

export const furnitureSchema = z.object({
  id,
  kind: furnitureKindSchema,
  /** Which room it stands in. Drives chore suggestions, not geometry. */
  roomSlug: id.optional(),
  box: rectSchema,
  /** Bottom and top height. A bed builds its own stack and ignores this. */
  z: z.tuple([finite.nonnegative(), finite.positive()]).optional(),
  /** 0xRRGGBB. */
  colour: z.int().min(0).max(0xffffff).optional(),
});

export const roomSchema = z.object({
  /** Stable and human-readable; what a chore points at until Phase 5. */
  slug: id,
  name: z.string().min(1).max(120),
  /** As printed on the floorplan: '3.27 × 2.94 m'. */
  dimsLabel: z.string().max(60).default(''),
  areaSqm: finite.nonnegative().default(0),
  floorColour: z.int().min(0).max(0xffffff),
  /** An outline is any number of rectangles plus any number of polygons. */
  rects: z.array(rectSchema).default([]),
  polys: z.array(z.array(pointSchema).min(3)).default([]),
  labelAt: pointSchema,
  cameraView: z.object({ at: pointSchema, distance: finite.positive() }),
});

export const levelSchema = z.object({
  name: z.string().min(1).max(120),
  /** The flat is 1; the stair goes down to 0. */
  ordinal: z.int().min(-10).max(200),
  ceiling: finite.positive().max(20),
  nodes: z.array(nodeSchema),
  walls: z.array(wallSchema),
  stairs: z.array(stairSchema).default([]),
  furniture: z.array(furnitureSchema).default([]),
  rooms: z.array(roomSchema),
  /** Extra floor polygons drawn with a room but not part of its rectangles. */
  bay: z.array(pointSchema).default([]),
});

export const propertySchema = z.object({
  version: z.literal(1),
  units: z.literal('m'),
  name: z.string().min(1).max(120),
  subtitle: z.string().max(120).default(''),
  floorAreaSqm: finite.nonnegative().default(0),
  defaults: z.object({ exterior: finite.positive(), interior: finite.positive() }),
  levels: z.array(levelSchema).min(1),
});

export type PropertyDocument = z.infer<typeof propertySchema>;
export type LevelDocument = z.infer<typeof levelSchema>;
export type WallRecord = z.infer<typeof wallSchema>;
export type OpeningRecord = z.infer<typeof openingSchema>;
export type NodeRecord = z.infer<typeof nodeSchema>;
export type RoomRecord = z.infer<typeof roomSchema>;
export type FurnitureRecord = z.infer<typeof furnitureSchema>;
export type StairRecord = z.infer<typeof stairSchema>;

/** Parse an unknown value, throwing on anything malformed. */
export function parseProperty(input: unknown): PropertyDocument {
  return propertySchema.parse(input);
}

export function safeParseProperty(input: unknown) {
  return propertySchema.safeParse(input);
}
