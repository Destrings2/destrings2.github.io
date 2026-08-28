import * as THREE from 'three';

export function createMaterials() {
  const wallOut = new THREE.MeshLambertMaterial({ color: 0xd9d3c8 });
  const wallIn = new THREE.MeshLambertMaterial({ color: 0xede8de });
  const cut = new THREE.MeshBasicMaterial({ color: 0xe8b93e });
  const cutSoft = new THREE.MeshLambertMaterial({ color: 0xb49046 });

  return {
    wallOut,
    wallIn,
    cut,
    cutSoft,
    glass: new THREE.MeshLambertMaterial({ color: 0x9fc3d6, transparent: true, opacity: 0.28 }),
    leaf: new THREE.MeshLambertMaterial({ color: 0xfbfaf6 }),
    leafEdge: new THREE.MeshLambertMaterial({ color: 0xb9b2a4 }),
    frame: new THREE.MeshLambertMaterial({ color: 0xf3f1ec }),
    edge: new THREE.MeshLambertMaterial({ color: 0x9c9384 }),
    stair: new THREE.MeshLambertMaterial({ color: 0xb8aa95 }),
    voidBelow: new THREE.MeshBasicMaterial({ color: 0x0d0f11 }),
    ground: new THREE.MeshLambertMaterial({ color: 0x1d2226 }),

    /** Box face order is +x, -x, +y, -y, +z, -z: only the top face is the cut. */
    wallCapped: [wallOut, wallOut, cut, cutSoft, wallIn, wallIn] as THREE.Material[],
    wallPlain: [wallOut, wallOut, wallIn, cutSoft, wallIn, wallIn] as THREE.Material[],
  };
}

export type Materials = ReturnType<typeof createMaterials>;

export function disposeGroup(group: THREE.Object3D) {
  group.traverse((child) => {
    const mesh = child as THREE.Mesh & THREE.Sprite;
    mesh.geometry?.dispose();
    if (child instanceof THREE.Sprite) {
      const material = child.material as THREE.SpriteMaterial;
      material.map?.dispose();
      material.dispose();
    }
  });
  group.clear();
}
