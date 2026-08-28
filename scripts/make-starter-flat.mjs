/**
 * Builds the starter flat that ships in the bundle.
 *
 * Generic on purpose: it stands in for a home nobody has yet, so it can be
 * public without telling anyone where a real bed is. Every junction is a
 * shared node, unlike the imported the example home, so it is a proper connected
 * graph and findFaces() can derive its rooms — which makes it a useful thing
 * for the Phase 8 editor to start from.
 */
import { writeFileSync } from 'node:fs';

const CEILING = 2.4;
const EXT = 0.25;
const INT = 0.1;

const N = {
  sw: [0, 0],
  sMid: [4.5, 0],
  se: [8, 0],
  eMid: [8, 3.5],
  ne: [8, 6],
  nMid: [5, 6],
  nw: [0, 6],
  wMid: [0, 3.5],
  cLeft: [4.5, 3.5],
  cRight: [5, 3.5],
};
const nodes = Object.entries(N).map(([id, [x, y]]) => ({ id, x, y }));

const door = (id, from, to, hinge = 'start', swing = 1) => ({
  id,
  kind: 'door',
  from,
  to,
  sill: 0,
  head: 2.05,
  hinge,
  swing,
});
const window_ = (id, from, to) => ({ id, kind: 'window', from, to, sill: 0.9, head: 2.1 });

const walls = [
  { id: 'w01', from: 'sw', to: 'sMid', thickness: EXT, openings: [door('o01', 3.3, 4.2)] },
  { id: 'w02', from: 'sMid', to: 'se', thickness: EXT, openings: [window_('o02', 1.2, 2.6)] },
  { id: 'w03', from: 'se', to: 'eMid', thickness: EXT, openings: [window_('o03', 1.0, 2.2)] },
  { id: 'w04', from: 'eMid', to: 'ne', thickness: EXT, openings: [] },
  { id: 'w05', from: 'ne', to: 'nMid', thickness: EXT, openings: [window_('o04', 0.8, 2.0)] },
  { id: 'w06', from: 'nMid', to: 'nw', thickness: EXT, openings: [window_('o05', 1.5, 3.2)] },
  { id: 'w07', from: 'nw', to: 'wMid', thickness: EXT, openings: [] },
  { id: 'w08', from: 'wMid', to: 'sw', thickness: EXT, openings: [] },
  {
    id: 'w09',
    from: 'wMid',
    to: 'cLeft',
    thickness: INT,
    openings: [door('o06', 1.2, 2.0, 'start', -1)],
  },
  { id: 'w10', from: 'cLeft', to: 'cRight', thickness: INT, openings: [] },
  {
    id: 'w11',
    from: 'cRight',
    to: 'eMid',
    thickness: INT,
    openings: [door('o07', 0.4, 1.2, 'end', -1)],
  },
  {
    id: 'w12',
    from: 'sMid',
    to: 'cLeft',
    thickness: INT,
    openings: [{ id: 'o08', kind: 'opening', from: 2.1, to: 3.1, sill: 0, head: 2.2 }],
  },
  { id: 'w13', from: 'cRight', to: 'nMid', thickness: INT, openings: [] },
];

const rooms = [
  {
    slug: 'living',
    name: 'Living room',
    dimsLabel: '4.50 × 3.50 m',
    areaSqm: 15.8,
    floorColour: 0xdcd0bb,
    rects: [[0, 0, 4.5, 3.5]],
    polys: [],
    labelAt: [2.2, 1.8],
    cameraView: { at: [2.2, 1.8], distance: 7 },
  },
  {
    slug: 'kitchen',
    name: 'Kitchen',
    dimsLabel: '3.50 × 3.50 m',
    areaSqm: 12.3,
    floorColour: 0xd2ccbe,
    rects: [[4.5, 0, 8, 3.5]],
    polys: [],
    labelAt: [6.2, 1.8],
    cameraView: { at: [6.2, 1.8], distance: 7 },
  },
  {
    slug: 'bedroom',
    name: 'Bedroom',
    dimsLabel: '5.00 × 2.50 m',
    areaSqm: 12.5,
    floorColour: 0xd8cdbc,
    rects: [[0, 3.5, 5, 6]],
    polys: [],
    labelAt: [2.5, 4.8],
    cameraView: { at: [2.5, 4.8], distance: 7 },
  },
  {
    slug: 'bath',
    name: 'Bathroom',
    dimsLabel: '3.00 × 2.50 m',
    areaSqm: 7.5,
    floorColour: 0xc3cbcc,
    rects: [[5, 3.5, 8, 6]],
    polys: [],
    labelAt: [6.5, 4.8],
    cameraView: { at: [6.5, 4.8], distance: 6 },
  },
];

const furniture = [
  { id: 'f01', kind: 'bed', roomSlug: 'bedroom', box: [0.3, 3.9, 2.3, 5.9] },
  {
    id: 'f02',
    kind: 'wardrobe',
    roomSlug: 'bedroom',
    box: [3.4, 4.6, 4.9, 5.9],
    z: [0, 2.0],
    colour: 0xcfc7ba,
  },
  {
    id: 'f03',
    kind: 'sofa',
    roomSlug: 'living',
    box: [0.4, 0.4, 2.8, 1.3],
    z: [0, 0.8],
    colour: 0x6e7a74,
  },
  {
    id: 'f04',
    kind: 'box',
    roomSlug: 'living',
    box: [1.1, 2.0, 2.3, 2.6],
    z: [0, 0.42],
    colour: 0x8e7a62,
  },
  {
    id: 'f05',
    kind: 'oven',
    roomSlug: 'kitchen',
    box: [7.2, 0.35, 7.9, 1.05],
    z: [0, 0.9],
    colour: 0xd4d7d8,
  },
  {
    id: 'f06',
    kind: 'hob',
    roomSlug: 'kitchen',
    box: [7.2, 0.35, 7.9, 1.05],
    z: [0.9, 0.94],
    colour: 0x2c3033,
  },
  {
    id: 'f07',
    kind: 'fridge',
    roomSlug: 'kitchen',
    box: [7.15, 2.4, 7.9, 3.2],
    z: [0, 1.8],
    colour: 0xd4d7d8,
  },
  {
    id: 'f08',
    kind: 'dishwasher',
    roomSlug: 'kitchen',
    box: [5.6, 0.35, 6.3, 1.05],
    z: [0, 0.88],
    colour: 0xbfb6a6,
  },
  {
    id: 'f09',
    kind: 'wc',
    roomSlug: 'bath',
    box: [5.3, 5.25, 5.85, 5.9],
    z: [0, 0.78],
    colour: 0xededea,
  },
  {
    id: 'f10',
    kind: 'bath',
    roomSlug: 'bath',
    box: [6.3, 4.95, 7.9, 5.85],
    z: [0, 0.55],
    colour: 0xededea,
  },
  {
    id: 'f11',
    kind: 'basin',
    roomSlug: 'bath',
    box: [5.3, 4.15, 5.95, 4.7],
    z: [0.7, 0.9],
    colour: 0xededea,
  },
  {
    id: 'f12',
    kind: 'washingMachine',
    roomSlug: 'kitchen',
    box: [4.75, 0.35, 5.45, 1.05],
    z: [0, 0.88],
    colour: 0xd8dbdc,
  },
];

const document = {
  version: 1,
  units: 'm',
  name: 'Your home',
  subtitle: 'Ground floor',
  floorAreaSqm: 48,
  defaults: { exterior: EXT, interior: INT },
  levels: [
    {
      name: 'Ground floor',
      ordinal: 0,
      ceiling: CEILING,
      nodes,
      walls,
      stairs: [],
      furniture,
      rooms,
      bay: [],
    },
  ],
};

const banner = `// Generated by scripts/make-starter-flat.mjs. Re-run rather than editing.
//
// The flat a new household starts with, and the one the app draws when it has
// no backend. Deliberately generic: it ships in a public bundle, so it must
// not describe anybody's real home. Real geometry lives in Postgres and is
// fetched once you are signed in.
//
// Every junction is a shared node, so this is a properly connected graph and its rooms can be derived from its walls.
import type { PropertyDocument } from '@/domain/geometry/schema';

export const STARTER_FLAT: PropertyDocument = ${JSON.stringify(document, null, 2)} as const;
`;

writeFileSync('src/data/starterFlat.ts', banner);
console.log(
  `nodes=${nodes.length} walls=${walls.length} rooms=${rooms.length} furniture=${furniture.length}`,
);
