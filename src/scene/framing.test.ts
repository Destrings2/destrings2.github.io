import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EXAMPLE_HOME } from '@/data/floorplan';
import { frameFor, planPoints } from './framing';

const V_FOV = (42 * Math.PI) / 180;

/** What fraction of the frame the model actually covers, per axis. */
function fill(aspect: number, mode: '3d' | 'plan') {
  const points = planPoints(EXAMPLE_HOME);
  const view = frameFor(EXAMPLE_HOME, points, aspect, mode);
  const hFov = 2 * Math.atan(Math.tan(V_FOV / 2) * aspect);

  const sinPhi = Math.sin(view.phi);
  const offset = new THREE.Vector3(
    sinPhi * Math.sin(view.theta),
    Math.cos(view.phi),
    sinPhi * Math.cos(view.theta),
  );
  const forward = offset.clone().negate().normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(forward).normalize();
  const up = forward.clone().cross(right).normalize();

  let h = 0;
  let v = 0;
  for (const point of points) {
    const local = point.clone().sub(view.target);
    const depth = view.distance + local.dot(forward);
    h = Math.max(h, Math.abs(local.dot(right)) / (depth * Math.tan(hFov / 2)));
    v = Math.max(v, Math.abs(local.dot(up)) / (depth * Math.tan(V_FOV / 2)));
  }
  return { h, v, view };
}

describe('planPoints', () => {
  it('covers the whole footprint', () => {
    const points = planPoints(EXAMPLE_HOME);
    expect(points.length).toBeGreaterThan(100);
    const xs = points.map((p) => p.x);
    const zs = points.map((p) => p.z);
    expect(Math.min(...xs)).toBeCloseTo(-0.25, 2);
    expect(Math.max(...xs)).toBeCloseTo(5.04, 2);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(14.33, 2);
  });

  it('leaves out the void plane under the stair', () => {
    // It hangs a storey below the floor and would add 2.5m of empty height.
    const lowest = Math.min(...planPoints(EXAMPLE_HOME).map((p) => p.y));
    expect(lowest).toBeGreaterThan(-1);
  });
});

describe('frameFor', () => {
  const shapes: [string, number][] = [
    ['phone portrait', 375 / 757],
    ['phone landscape', 757 / 375],
    ['tablet portrait', 768 / 1024],
    ['desktop stage', 752 / 900],
    ['wide desktop', 1200 / 800],
  ];

  it.each(shapes)('fills %s without clipping', (_name, aspect) => {
    const { h, v } = fill(aspect, '3d');
    // Nothing runs off the edge …
    expect(h).toBeLessThanOrEqual(1);
    expect(v).toBeLessThanOrEqual(1);
    // … and the model is not stranded small in the middle.
    expect(Math.max(h, v)).toBeGreaterThan(0.85);
  });

  it('turns the long axis down the screen on a tall viewport', () => {
    const portrait = frameFor(EXAMPLE_HOME, planPoints(EXAMPLE_HOME), 0.5, '3d');
    const landscape = frameFor(EXAMPLE_HOME, planPoints(EXAMPLE_HOME), 1.9, '3d');
    // theta near 0 looks along the flat's length; near -pi/2 looks across it.
    expect(Math.abs(portrait.theta)).toBeLessThan(Math.abs(landscape.theta));
  });

  it('gets closer when there is more room to fill', () => {
    const points = planPoints(EXAMPLE_HOME);
    const tight = frameFor(EXAMPLE_HOME, points, 0.5, '3d');
    const wide = frameFor(EXAMPLE_HOME, points, 1.9, '3d');
    expect(wide.distance).toBeLessThan(tight.distance);
  });

  it('stays square-on in plan mode', () => {
    const view = frameFor(EXAMPLE_HOME, planPoints(EXAMPLE_HOME), 0.5, 'plan');
    expect(view.phi).toBeLessThan(0.1);
    const square = Math.min(Math.abs(view.theta), Math.abs(Math.abs(view.theta) - Math.PI / 2));
    expect(square).toBeLessThan(0.01);
  });
});
