import * as THREE from 'three';
import type { Floorplan, Rect } from '@/data/floorplanTypes';
import { disposeGroup } from './materials';

function box(rect: Rect, bottom: number, top: number, colour: number): THREE.Mesh {
  const [x0, y0, x1, y1] = rect;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(x1 - x0, top - bottom, y1 - y0),
    new THREE.MeshLambertMaterial({ color: colour }),
  );
  mesh.position.set((x0 + x1) / 2, (bottom + top) / 2, -(y0 + y1) / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A bed is a base, a mattress, two pillows and a folded throw. */
function bed(group: THREE.Group, [x0, y0, x1, y1]: Rect) {
  group.add(box([x0, y0, x1, y1], 0.08, 0.34, 0x8a7458));
  group.add(box([x0 + 0.03, y0 + 0.03, x1 - 0.03, y1 - 0.03], 0.34, 0.62, 0xe9e5dc));
  group.add(box([x1 - 0.62, y0 + 0.1, x1 - 0.12, y0 + 0.62], 0.62, 0.75, 0xf2efe8));
  group.add(box([x1 - 0.62, y1 - 0.62, x1 - 0.12, y1 - 0.1], 0.62, 0.75, 0xf2efe8));
  group.add(box([x0 + 0.05, y0 + 0.05, x1 - 0.7, y1 - 0.05], 0.6, 0.66, 0x7e8c86));
}

export function buildFurniture(group: THREE.Group, plan: Floorplan) {
  disposeGroup(group);
  for (const item of plan.furniture) {
    if (item.kind === 'bed') {
      bed(group, item.box);
      continue;
    }
    const [bottom, top] = item.z ?? [0, 0.5];
    group.add(box(item.box, bottom, top, item.colour ?? 0xbfb6a6));
  }
}
