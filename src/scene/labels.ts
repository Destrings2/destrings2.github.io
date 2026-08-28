import * as THREE from 'three';
import type { Floorplan } from '@/data/floorplanTypes';
import { disposeGroup } from './materials';

export interface RoomLabel {
  slug: string;
  name: string;
  sub: string;
  accent: string;
}

const WIDTH = 560;
const HEIGHT = 170;

/**
 * The room name doubles as its status, so the model answers "what is left in
 * here" without opening a panel. Drawn to a canvas and hung as a sprite, which
 * keeps it readable at any camera angle.
 */
function drawLabel(label: RoomLabel, dpr: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * dpr;
  canvas.height = HEIGHT * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const plateHeight = 96;
  const radius = 8;
  const top = 34;

  ctx.fillStyle = 'rgba(20, 23, 26, 0.84)';
  ctx.beginPath();
  ctx.roundRect(0, top, WIDTH, plateHeight, radius);
  ctx.fill();

  ctx.fillStyle = label.accent;
  ctx.fillRect(0, top, 5, plateHeight);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#F0F1EE';
  ctx.font = '600 34px "Avenir Next Condensed", "Arial Narrow", Helvetica, sans-serif';
  ctx.fillText(label.name.toUpperCase(), WIDTH / 2, top + 34);

  ctx.fillStyle = '#A9B0B4';
  ctx.font = '400 22px ui-monospace, Menlo, monospace';
  ctx.fillText(label.sub, WIDTH / 2, top + 68);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }),
  );
  sprite.scale.set(2, 0.61, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export function buildLabels(group: THREE.Group, plan: Floorplan, labels: Map<string, RoomLabel>) {
  disposeGroup(group);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const room of plan.rooms) {
    const label = labels.get(room.slug);
    if (!label) continue;
    const sprite = drawLabel(label, dpr);
    sprite.position.set(room.labelAt[0], 1.55, -room.labelAt[1]);
    sprite.userData['room'] = room.slug;
    group.add(sprite);
  }
}
