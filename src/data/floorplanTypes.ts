/**
 * Plan coordinates, in metres: +x east, +y north.
 * The scene layer maps (x, y) -> (x, 0, -y). Nothing else should know that.
 */
export type Point = [x: number, y: number];

/** [x0, y0, x1, y1] with x0 < x1 and y0 < y1. */
export type Rect = [x0: number, y0: number, x1: number, y1: number];

export type OpeningKind = 'window' | 'door' | 'opening';

export interface Opening {
  kind: OpeningKind;
  /** Distance along the wall from its `from` end. */
  from: number;
  to: number;
  /** Height above floor of the bottom and top of the hole. */
  sill: number;
  head: number;
  /** Which end the door leaf is hinged on. Doors only. */
  hinge?: 'start' | 'end';
  /** Which side it swings to. Doors only. */
  swing?: 1 | -1;
}

export interface Wall {
  from: Point;
  to: Point;
  thickness: number;
  openings?: Opening[];
}

export interface CameraView {
  at: Point;
  distance: number;
}

export interface Room {
  slug: string;
  name: string;
  /** As printed on the floorplan: '3.27 × 2.94 m'. */
  dimsLabel: string;
  areaSqm: number;
  floorColour: number;
  /** A room's outline is any number of rectangles plus any number of polygons. */
  rects?: Rect[];
  polys?: Point[][];
  labelAt: Point;
  cameraView: CameraView;
}

export interface Stair {
  x0: number;
  x1: number;
  /** Stairs descend from yTop to yBot. */
  yTop: number;
  yBot: number;
  steps: number;
}

export type FurnitureKind =
  'bed' | 'box' | 'sofa' | 'wc' | 'bath' | 'oven' | 'fridge' | 'litterTray';

export interface Furniture {
  kind: FurnitureKind;
  box: Rect;
  /** Bottom and top height. A bed builds its own stack and ignores this. */
  z?: [number, number];
  colour?: number;
  roomSlug?: string;
}

export interface Floorplan {
  name: string;
  subtitle: string;
  floorAreaSqm: number;
  ceiling: number;
  thickness: { exterior: number; interior: number };
  walls: Wall[];
  /** The bay window's floor polygon, drawn as part of the reception room. */
  bay: Point[];
  stair: Stair;
  rooms: Room[];
  furniture: Furniture[];
}
