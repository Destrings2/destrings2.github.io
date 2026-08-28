import * as THREE from 'three';
import type { Floorplan } from '@/data/floorplanTypes';

export interface Framing {
  target: THREE.Vector3;
  theta: number;
  phi: number;
  distance: number;
}

const V_FOV = (42 * Math.PI) / 180;

/**
 * The actual points the model occupies, rather than a box around them.
 *
 * An axis-aligned box is a poor stand-in for this flat: it is a long ribbon set
 * on a diagonal with a bay sticking out of one end, so the box is mostly empty
 * and framing to it leaves the model small in the middle of the screen.
 *
 * Deliberately excludes the dark void plane under the stair — it hangs a whole
 * storey below the floor and is never looked at.
 */
export function planPoints(plan: Floorplan): THREE.Vector3[] {
  const flat: [number, number][] = [];
  const add = (x: number, y: number) => flat.push([x, y]);

  for (const wall of plan.walls) {
    add(wall.from[0], wall.from[1]);
    add(wall.to[0], wall.to[1]);
  }
  for (const room of plan.rooms) {
    for (const r of room.rects ?? []) {
      add(r[0], r[1]);
      add(r[2], r[1]);
      add(r[2], r[3]);
      add(r[0], r[3]);
    }
    for (const poly of room.polys ?? []) for (const p of poly) add(p[0], p[1]);
  }
  for (const p of plan.bay) add(p[0], p[1]);

  const points: THREE.Vector3[] = [];
  for (const [x, y] of flat) {
    points.push(new THREE.Vector3(x, -0.2, -y));
    points.push(new THREE.Vector3(x, plan.ceiling, -y));
  }
  return points;
}

function basis(theta: number, phi: number) {
  const sinPhi = Math.sin(phi);
  const offset = new THREE.Vector3(
    sinPhi * Math.sin(theta),
    Math.cos(phi),
    sinPhi * Math.cos(theta),
  );
  const forward = offset.clone().negate().normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(forward);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  const up = forward.clone().cross(right).normalize();
  return { forward, right, up };
}

interface Fit {
  distance: number;
  /** How far to slide the look-at point so the model sits centred on screen. */
  shift: THREE.Vector3;
}

/**
 * Centre the projected model in the frame, then solve for the closest distance
 * at which all of it still fits.
 */
function fitFor(
  points: readonly THREE.Vector3[],
  centre: THREE.Vector3,
  theta: number,
  phi: number,
  aspect: number,
): Fit {
  const { forward, right, up } = basis(theta, phi);
  const tanH = Math.tan(Math.atan(Math.tan(V_FOV / 2) * aspect));
  const tanV = Math.tan(V_FOV / 2);

  let minH = Infinity;
  let maxH = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  const projected: { h: number; v: number; d: number }[] = [];

  for (const point of points) {
    const local = point.clone().sub(centre);
    const h = local.dot(right);
    const v = local.dot(up);
    const d = local.dot(forward);
    projected.push({ h, v, d });
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  const offsetH = (minH + maxH) / 2;
  const offsetV = (minV + maxV) / 2;

  let needed = 0;
  for (const p of projected) {
    // A point further from the camera sits deeper in the frustum, so it needs
    // less distance to fit, not more.
    needed = Math.max(
      needed,
      Math.abs(p.h - offsetH) / tanH - p.d,
      Math.abs(p.v - offsetV) / tanV - p.d,
    );
  }

  return {
    distance: needed,
    shift: right.multiplyScalar(offsetH).add(up.multiplyScalar(offsetV)),
  };
}

/**
 * Frame the whole model for the viewport it is actually in.
 *
 * The flat is 5m wide and 14m deep, so any one fixed camera either runs off
 * both edges of a phone held upright or wastes half a desktop window. Rather
 * than hard-coding a view per breakpoint, this searches a band of plausible
 * three-quarter angles and keeps whichever needs the camera closest — which is
 * the one that fills the frame. The band is narrow enough that the result is
 * always a recognisable three-quarter view rather than an arbitrary angle.
 */
export function frameFor(
  plan: Floorplan,
  points: readonly THREE.Vector3[],
  aspect: number,
  mode: '3d' | 'plan',
): Framing {
  const centre = new THREE.Vector3();
  for (const point of points) centre.add(point);
  centre.divideScalar(points.length || 1);
  centre.y = mode === 'plan' ? 0 : plan.ceiling * 0.3;

  const phi = mode === 'plan' ? 0.05 : aspect < 0.95 ? 0.66 : 0.86;

  const candidates: number[] = [];
  if (mode === 'plan') {
    // Square-on either way up; the search picks whichever fits the window.
    candidates.push(-0.001, -Math.PI / 2);
  } else {
    for (let t = -1.5; t <= -0.08; t += 0.05) candidates.push(t);
  }

  let best: (Fit & { theta: number }) | null = null;
  for (const theta of candidates) {
    const fit = fitFor(points, centre, theta, phi, aspect);
    if (!best || fit.distance < best.distance) best = { ...fit, theta };
  }
  const chosen = best!;

  // A little air for the caption and the toolbar that sit over the model, and
  // never so close that the near plane bites.
  return {
    target: centre.clone().add(chosen.shift),
    theta: chosen.theta,
    phi,
    distance: Math.min(46, Math.max(4, chosen.distance * 1.06)),
  };
}
