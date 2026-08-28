import * as THREE from 'three';
import type { Floorplan, Point, Rect } from '@/data/floorplanTypes';
import { disposeGroup, type Materials } from './materials';

function shapeFrom(points: Point[]): THREE.Shape {
  const shape = new THREE.Shape();
  const [first, ...rest] = points;
  if (!first) return shape;
  shape.moveTo(first[0], first[1]);
  for (const point of rest) shape.lineTo(point[0], point[1]);
  shape.closePath();
  return shape;
}

const rectToPoly = (r: Rect): Point[] => [
  [r[0], r[1]],
  [r[2], r[1]],
  [r[2], r[3]],
  [r[0], r[3]],
];

export interface FloorBuild {
  /** One material per room, so tinting is a colour set rather than a rebuild. */
  roomMaterials: Record<string, THREE.MeshLambertMaterial>;
  /** Everything the raycaster is allowed to hit. */
  pickable: THREE.Mesh[];
}

export function buildFloors(group: THREE.Group, plan: Floorplan, materials: Materials): FloorBuild {
  disposeGroup(group);
  const roomMaterials: Record<string, THREE.MeshLambertMaterial> = {};
  const pickable: THREE.Mesh[] = [];

  for (const room of plan.rooms) {
    const material = new THREE.MeshLambertMaterial({ color: room.floorColour });
    roomMaterials[room.slug] = material;

    const outlines = [...(room.rects ?? []).map(rectToPoly), ...(room.polys ?? [])];
    for (const outline of outlines) {
      const geometry = new THREE.ExtrudeGeometry(shapeFrom(outline), {
        depth: 0.14,
        bevelEnabled: false,
      });
      const mesh = new THREE.Mesh(geometry, [material, materials.edge]);
      mesh.rotation.x = -Math.PI / 2;
      mesh.receiveShadow = true;
      mesh.userData['room'] = room.slug;
      group.add(mesh);
      pickable.push(mesh);
    }
  }

  // The stair down to the floor below, and the dark void under it.
  const { stair } = plan;
  const run = (stair.yTop - stair.yBot) / stair.steps;
  const rise = plan.ceiling / stair.steps;
  for (let i = 0; i < stair.steps; i++) {
    const y1 = stair.yTop - i * run;
    const y0 = y1 - run;
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(stair.x1 - stair.x0, 0.16, run),
      materials.stair,
    );
    step.position.set((stair.x0 + stair.x1) / 2, -i * rise - 0.08, -(y0 + y1) / 2);
    step.castShadow = true;
    step.receiveShadow = true;
    group.add(step);
  }

  const dark = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3), materials.voidBelow);
  dark.rotation.x = -Math.PI / 2;
  dark.position.set(1.36, -plan.ceiling - 0.05, -(stair.yBot + stair.yTop) / 2);
  group.add(dark);

  return { roomMaterials, pickable };
}
