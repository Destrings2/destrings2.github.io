import * as THREE from 'three';
import type { Floorplan } from '@/data/floorplanTypes';
import { disposeGroup, type Materials } from './materials';

/**
 * Walls are extruded as solid slabs with the openings cut out of them, then
 * sliced flat at `cut` metres so the model reads as a section drawing. A wall
 * whose top lands exactly on the cut gets the amber cap; one that stops short
 * of it (under a window head, say) does not.
 */
export function buildWalls(group: THREE.Group, plan: Floorplan, materials: Materials, cut: number) {
  disposeGroup(group);
  const ceiling = plan.ceiling;

  for (const wall of plan.walls) {
    const ax = wall.from[0];
    const az = -wall.from[1];
    const bx = wall.to[0];
    const bz = -wall.to[1];
    const dx = bx - ax;
    const dz = bz - az;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) continue;
    const ux = dx / length;
    const uz = dz / length;
    const rotation = Math.atan2(-dz, dx);

    const openings = [...(wall.openings ?? [])].sort((a, b) => a.from - b.from);

    // The solid parts left over once the holes are taken out.
    const parts: { from: number; to: number; y0: number; y1: number }[] = [];
    let cursor = 0;
    for (const opening of openings) {
      if (opening.from > cursor) parts.push({ from: cursor, to: opening.from, y0: 0, y1: ceiling });
      if (opening.sill > 0)
        parts.push({ from: opening.from, to: opening.to, y0: 0, y1: opening.sill });
      if (opening.head < ceiling) {
        parts.push({ from: opening.from, to: opening.to, y0: opening.head, y1: ceiling });
      }
      cursor = opening.to;
    }
    if (cursor < length) parts.push({ from: cursor, to: length, y0: 0, y1: ceiling });

    for (const part of parts) {
      const top = Math.min(part.y1, cut);
      const height = top - part.y0;
      const width = part.to - part.from;
      if (height < 0.004 || width < 0.004) continue;

      const capped =
        Math.abs(top - ceiling) < 1e-6 || (Math.abs(top - cut) < 1e-6 && cut < ceiling);
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, wall.thickness),
        capped ? materials.wallCapped : materials.wallPlain,
      );
      const middle = (part.from + part.to) / 2;
      mesh.position.set(ax + ux * middle, (part.y0 + top) / 2, az + uz * middle);
      mesh.rotation.y = rotation;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // Door leaves, drawn standing open.
    for (const opening of openings) {
      if (opening.kind !== 'door' || !opening.hinge) continue;
      const leafWidth = opening.to - opening.from;
      const leafHeight = Math.min(opening.head, cut);
      if (leafHeight < 0.05) continue;

      const at = opening.hinge === 'end' ? opening.to : opening.from;
      const direction = opening.swing === -1 ? -1 : 1;
      const px = ax + ux * at;
      const pz = az + uz * at;
      const nx = -uz * direction;
      const nz = ux * direction;

      const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafWidth - 0.03, leafHeight, 0.04), [
        materials.leafEdge,
        materials.leafEdge,
        materials.leafEdge,
        materials.leafEdge,
        materials.leaf,
        materials.leaf,
      ]);
      leaf.position.set(px + (nx * leafWidth) / 2, leafHeight / 2, pz + (nz * leafWidth) / 2);
      leaf.rotation.y = Math.atan2(-nz, nx);
      leaf.castShadow = true;
      group.add(leaf);

      for (const edge of [opening.from, opening.to]) {
        const jamb = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, leafHeight, wall.thickness + 0.03),
          materials.leaf,
        );
        jamb.position.set(ax + ux * edge, leafHeight / 2, az + uz * edge);
        jamb.rotation.y = rotation;
        group.add(jamb);
      }
    }

    // Glazing and its sill.
    for (const opening of openings) {
      if (opening.kind !== 'window' || opening.sill >= cut) continue;
      const top = Math.min(opening.head, cut);
      const middle = (opening.from + opening.to) / 2;

      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(opening.to - opening.from - 0.06, top - opening.sill - 0.06, 0.03),
        materials.glass,
      );
      glass.position.set(ax + ux * middle, (opening.sill + top) / 2, az + uz * middle);
      glass.rotation.y = rotation;
      group.add(glass);

      const sill = new THREE.Mesh(
        new THREE.BoxGeometry(opening.to - opening.from + 0.1, 0.05, wall.thickness + 0.06),
        materials.frame,
      );
      sill.position.set(ax + ux * middle, opening.sill - 0.02, az + uz * middle);
      sill.rotation.y = rotation;
      sill.castShadow = true;
      group.add(sill);
    }
  }
}
