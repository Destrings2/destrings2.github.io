import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { Floorplan } from '@/data/floorplanTypes';
import { buildFloors } from './buildFloors';
import { buildFurniture } from './buildFurniture';
import { buildLabels, type RoomLabel } from './labels';
import { buildWalls } from './buildWalls';
import { frameFor, planPoints } from './framing';
import { createMaterials, disposeGroup } from './materials';

export interface SceneInputs {
  plan: Floorplan;
  /** Section cut height, in metres. */
  cut: number;
  showFurniture: boolean;
  mode: '3d' | 'plan';
  /** Floor colour per room slug. Absent slugs keep the plan's own colour. */
  tints: Map<string, number>;
  labels: Map<string, RoomLabel>;
  openRoom: string | null;
  reducedMotion: boolean;
  onPickRoom(slug: string): void;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * Owns the renderer, the scene graph and the camera rig.
 *
 * Renders on demand rather than looping unconditionally: the model is static
 * most of the time and this runs on a phone. Any interaction calls invalidate().
 */
export function useFlatScene(inputs: SceneInputs) {
  const hostRef = useRef<HTMLDivElement>(null);
  const latest = useRef(inputs);
  latest.current = inputs;

  // Everything the effects need to reach without rebuilding the scene.
  const api = useRef<{
    invalidate(): void;
    rebuildWalls(cut: number): void;
    /** The home itself changed: everything built from it has to be remade. */
    rebuildPlan(): void;
    applyTints(): void;
    applyLabels(): void;
    setFurniture(visible: boolean): void;
    focusRoom(slug: string): void;
    frame(): void;
  } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    host.appendChild(canvas);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      host.dataset['webglFailed'] = 'true';
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // r128 used outputEncoding/sRGBEncoding; both were removed.
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x15181b);
    scene.fog = new THREE.Fog(0x15181b, 34, 74);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 300);

    scene.add(new THREE.HemisphereLight(0xdce4ec, 0x3a3833, 0.85));
    const sun = new THREE.DirectionalLight(0xfff3df, 1.12);
    sun.position.set(-9, 16, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -14,
      right: 14,
      top: 16,
      bottom: -16,
      near: 1,
      far: 48,
    });
    sun.shadow.bias = -0.0007;
    sun.target.position.set(2.4, 0, -6.5);
    scene.add(sun, sun.target);

    const fill = new THREE.DirectionalLight(0xbfd4e8, 0.3);
    fill.position.set(12, 7, -16);
    scene.add(fill);

    const materials = createMaterials();
    const gWalls = new THREE.Group();
    const gFloors = new THREE.Group();
    const gFurniture = new THREE.Group();
    const gLabels = new THREE.Group();
    scene.add(gWalls, gFloors, gFurniture, gLabels);

    // The plan is whatever has arrived so far. A household's own home is read
    // from Postgres a moment after mount, so this is the starter flat first
    // and the real one shortly after — everything built from it must be able
    // to be built again.
    let plan = latest.current.plan;
    let { roomMaterials, pickable } = buildFloors(gFloors, plan, materials);
    // What the scene currently stands for. The plan effect fires on mount as
    // well as on a change, and rebuilding here would throw away the opening
    // move the mount sets up.
    buildFurniture(gFurniture, plan);
    buildWalls(gWalls, plan, materials, latest.current.cut);
    gFurniture.visible = latest.current.showFurniture;

    // Ground plane with a hole where the stair drops through, plus a grid.
    // The hole follows the plan's own stair rather than one flat's numbers.
    function groundGeometry(): THREE.ShapeGeometry {
      const groundShape = new THREE.Shape();
      groundShape.moveTo(-42, -32);
      groundShape.lineTo(48, -32);
      groundShape.lineTo(48, 52);
      groundShape.lineTo(-42, 52);
      groundShape.closePath();
      const { x0, x1, yTop, yBot } = plan.stair;
      if (x1 > x0 && yBot > yTop) {
        const hole = new THREE.Path();
        hole.moveTo(x0, yTop);
        hole.lineTo(x1, yTop);
        hole.lineTo(x1, yBot);
        hole.lineTo(x0, yBot);
        hole.closePath();
        groundShape.holes.push(hole);
      }
      return new THREE.ShapeGeometry(groundShape);
    }
    const ground = new THREE.Mesh(groundGeometry(), materials.ground);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.16;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(90, 90, 0x2e353a, 0x232a2e);
    grid.position.y = -0.15;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.45;
    scene.add(grid);

    const northGroup = new THREE.Group();
    northGroup.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.02, 0.05),
        new THREE.MeshBasicMaterial({ color: 0x6e767b }),
      ),
    );
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.4, 4),
      new THREE.MeshBasicMaterial({ color: 0xe8b93e }),
    );
    head.rotation.z = -Math.PI / 2;
    head.position.x = 0.85;
    northGroup.add(head);
    // Beside the far end of whatever home is loaded, not beside one of them.
    function placeNorth() {
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const point of points) {
        if (point.x > maxX) maxX = point.x;
        if (-point.z > maxY) maxY = -point.z;
      }
      if (!Number.isFinite(maxX) || !Number.isFinite(maxY)) return;
      northGroup.position.set(maxX + 1.35, -0.13, -(maxY - 1.2));
    }
    scene.add(northGroup);

    // ---- camera rig ----------------------------------------------------
    let points = planPoints(plan);
    placeNorth();
    const initial = frameFor(plan, points, 1, latest.current.mode);
    const rig = {
      target: initial.target.clone(),
      theta: initial.theta,
      phi: initial.phi,
      distance: initial.distance,
    };
    const goal = {
      target: rig.target.clone(),
      theta: rig.theta,
      phi: rig.phi,
      distance: rig.distance,
    };
    let animating = false;
    let frame = 0;
    /** Portrait and landscape want different framings; re-frame when it flips. */
    let framedPortrait: boolean | null = null;

    function applyCamera() {
      const sinPhi = Math.sin(rig.phi);
      camera.position.set(
        rig.target.x + rig.distance * sinPhi * Math.sin(rig.theta),
        rig.target.y + rig.distance * Math.cos(rig.phi),
        rig.target.z + rig.distance * sinPhi * Math.cos(rig.theta),
      );
      camera.lookAt(rig.target);
    }

    function applyFraming(animate: boolean) {
      const w = host!.clientWidth || 1;
      const h = host!.clientHeight || 1;
      const view = frameFor(plan, points, w / h, latest.current.mode);
      goal.target.copy(view.target);
      goal.theta = view.theta;
      goal.phi = view.phi;
      goal.distance = view.distance;
      framedPortrait = w / h < 0.95;
      if (animate) {
        animating = true;
      } else {
        rig.target.copy(goal.target);
        rig.theta = goal.theta;
        rig.phi = goal.phi;
        rig.distance = goal.distance;
      }
    }

    function resize() {
      const w = host!.clientWidth;
      const h = host!.clientHeight;
      if (!w || !h) return false;
      const ratio = renderer.getPixelRatio();
      if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        // Turning the phone changes which way the flat should run.
        if (framedPortrait !== null && framedPortrait !== w / h < 0.95) applyFraming(true);
        return true;
      }
      return false;
    }

    function invalidate() {
      if (!frame) frame = requestAnimationFrame(tick);
    }

    function tick() {
      frame = 0;
      resize();
      if (animating) {
        const k = latest.current.reducedMotion ? 1 : 0.12;
        rig.theta += (goal.theta - rig.theta) * k;
        rig.phi += (goal.phi - rig.phi) * k;
        rig.distance += (goal.distance - rig.distance) * k;
        rig.target.lerp(goal.target, k);
        const settled =
          Math.abs(goal.distance - rig.distance) < 0.01 &&
          rig.target.distanceTo(goal.target) < 0.01 &&
          Math.abs(goal.theta - rig.theta) < 0.002 &&
          Math.abs(goal.phi - rig.phi) < 0.002;
        if (settled) animating = false;
      }
      applyCamera();
      renderer.render(scene, camera);
      if (animating) invalidate();
    }

    function syncGoal() {
      goal.theta = rig.theta;
      goal.phi = rig.phi;
      goal.distance = rig.distance;
      goal.target.copy(rig.target);
    }

    function pan(dx: number, dy: number) {
      const scale = rig.distance * 0.0016;
      const right = new THREE.Vector3(Math.cos(rig.theta), 0, -Math.sin(rig.theta));
      const forward = new THREE.Vector3(Math.sin(rig.theta), 0, Math.cos(rig.theta));
      rig.target.addScaledVector(right, -dx * scale).addScaledVector(forward, -dy * scale);
      rig.target.x = clamp(rig.target.x, -8, 14);
      rig.target.z = clamp(rig.target.z, -20, 6);
    }

    // ---- pointer -------------------------------------------------------
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { distance: number; x: number; y: number } | null = null;
    let travelled = 0;

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();

    function pick(event: PointerEvent) {
      const bounds = canvas.getBoundingClientRect();
      ndc.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      ndc.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(pickable, false)[0];
      const slug = hit?.object.userData['room'];
      if (typeof slug === 'string') latest.current.onPickRoom(slug);
    }

    const onPointerDown = (event: PointerEvent) => {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        /* orbiting still works, it just stops at the canvas edge */
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      animating = false;
      travelled = 0;
    };

    const onPointerMove = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      previous.x = event.clientX;
      previous.y = event.clientY;
      travelled += Math.hypot(dx, dy);

      if (pointers.size === 1) {
        if (event.shiftKey || event.buttons === 2) pan(dx, dy);
        else {
          rig.theta -= dx * 0.006;
          rig.phi = clamp(rig.phi - dy * 0.005, 0.04, 1.5);
        }
        syncGoal();
      } else if (pointers.size === 2) {
        const [p, q] = [...pointers.values()];
        if (!p || !q) return;
        const distance = Math.hypot(p.x - q.x, p.y - q.y);
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        if (pinch) {
          rig.distance = clamp(rig.distance * (pinch.distance / distance), 3, 46);
          pan(mx - pinch.x, my - pinch.y);
        }
        pinch = { distance, x: mx, y: my };
        syncGoal();
      }
      invalidate();
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.type === 'pointerup' && travelled < 7) pick(event);
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      animating = false;
      rig.distance = clamp(rig.distance * (1 + Math.sign(event.deltaY) * 0.09), 3, 46);
      syncGoal();
      invalidate();
    };

    const onContextMenu = (event: Event) => event.preventDefault();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);

    const observer = new ResizeObserver(() => invalidate());
    observer.observe(host);

    // ---- exposed operations --------------------------------------------
    api.current = {
      invalidate,
      rebuildWalls(cut) {
        buildWalls(gWalls, latest.current.plan, materials, cut);
        invalidate();
      },
      rebuildPlan() {
        if (latest.current.plan === plan) return;
        plan = latest.current.plan;
        ({ roomMaterials, pickable } = buildFloors(gFloors, plan, materials));
        buildFurniture(gFurniture, plan);
        buildWalls(gWalls, plan, materials, latest.current.cut);
        gFurniture.visible = latest.current.showFurniture;
        ground.geometry.dispose();
        ground.geometry = groundGeometry();
        points = planPoints(plan);
        placeNorth();
        // The new home is a different size and shape, so the old framing is
        // not a view of it. Re-framed without animating: this runs when the
        // household's own home first arrives, and sliding across from a flat
        // the person never asked to see would be the wrong thing to show.
        applyFraming(false);
        applyCamera();
        this.applyTints();
        this.applyLabels();
        invalidate();
      },
      applyTints() {
        for (const room of latest.current.plan.rooms) {
          const material = roomMaterials[room.slug];
          if (!material) continue;
          const tint = latest.current.tints.get(room.slug);
          material.color.setHex(tint ?? room.floorColour);
        }
        invalidate();
      },
      applyLabels() {
        buildLabels(gLabels, latest.current.plan, latest.current.labels);
        invalidate();
      },
      setFurniture(visible) {
        gFurniture.visible = visible;
        invalidate();
      },
      focusRoom(slug) {
        const room = latest.current.plan.rooms.find((r) => r.slug === slug);
        if (!room) return;
        goal.target.set(room.cameraView.at[0], 0.9, -room.cameraView.at[1]);
        goal.distance = room.cameraView.distance;
        goal.phi = 0.95;
        goal.theta = -0.72;
        animating = true;
        invalidate();
      },
      frame() {
        applyFraming(true);
        invalidate();
      },
    };

    resize();
    applyFraming(false);
    // Open with a short settling move, unless motion is turned down.
    if (!latest.current.reducedMotion) {
      rig.phi = 0.12;
      rig.distance = goal.distance * 1.45;
      animating = true;
    }
    api.current!.applyTints();
    api.current!.applyLabels();
    resize();
    applyCamera();
    invalidate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      for (const group of [gWalls, gFloors, gFurniture, gLabels]) disposeGroup(group);
      ground.geometry.dispose();
      grid.geometry.dispose();
      renderer.dispose();
      canvas.remove();
      api.current = null;
    };
    // The scene is built once; everything after is applied through `api`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The home itself arriving is not the same as a detail of it changing: the
  // scene was built from whatever plan existed at mount, which for a signed-in
  // household is the starter flat, replaced moments later by their own.
  useEffect(() => {
    api.current?.rebuildPlan();
  }, [inputs.plan]);

  useEffect(() => {
    api.current?.rebuildWalls(inputs.cut);
  }, [inputs.cut]);

  useEffect(() => {
    api.current?.applyTints();
  }, [inputs.tints, inputs.openRoom]);

  useEffect(() => {
    api.current?.applyLabels();
  }, [inputs.labels]);

  useEffect(() => {
    api.current?.setFurniture(inputs.showFurniture);
  }, [inputs.showFurniture]);

  useEffect(() => {
    api.current?.frame();
  }, [inputs.mode]);

  useEffect(() => {
    if (inputs.openRoom) api.current?.focusRoom(inputs.openRoom);
  }, [inputs.openRoom]);

  return hostRef;
}
