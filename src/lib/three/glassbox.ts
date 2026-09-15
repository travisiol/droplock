import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/*
  A glass box with something inside. The box is one solid block of glass
  (MeshPhysicalMaterial transmission) — a paperweight, not a container:
  one transmissive mesh, front faces only, no depth write, so what it
  holds stays visible through it. The contents are ordinary lit metal,
  never transmissive themselves. Opening a box is the contents rising out
  of the block, not a lid.
*/

export type ContentKind = "coin" | "crystal" | "bar" | "orb" | "none";

export const AZURE = 0x2b86ea;
export const FROST = 0x5fd3ff;

export function glassMaterial(envMap: THREE.Texture): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.05,
    transmission: 1,
    // Thin enough that the contents read once, not three times; the edges still bend.
    thickness: 0.35,
    ior: 1.45,
    attenuationColor: new THREE.Color(0xb8dcff),
    attenuationDistance: 2.6,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    specularIntensity: 1,
    envMap,
    envMapIntensity: 1.15,
    side: THREE.FrontSide,
    depthWrite: false,
  });
  return m;
}

export function contentMesh(kind: ContentKind, envMap: THREE.Texture): THREE.Object3D {
  const group = new THREE.Group();
  if (kind === "none") return group;
  // Half-metal: enough shading from the lights to read as a solid, enough reflection to feel lacquered.
  const metal = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.32, envMap, envMapIntensity: 0.9, ...extra });
  if (kind === "coin") {
    const coin = new THREE.Group();
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.1, 64), metal(AZURE));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 16, 64), metal(0x8ec4ff, { roughness: 0.2, metalness: 0.7 }));
    rim.rotation.x = Math.PI / 2;
    const emboss = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.028, 12, 48), metal(0x8ec4ff, { roughness: 0.2, metalness: 0.7 }));
    emboss.rotation.x = Math.PI / 2;
    emboss.position.y = 0.05;
    coin.add(face, rim, emboss);
    // Standing on its edge, tilted a little, so the spin shows both the face and the rim.
    coin.rotation.x = Math.PI / 2 - 0.35;
    group.add(coin);
  } else if (kind === "crystal") {
    group.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.36), metal(0x3a95f5, { metalness: 0.6, roughness: 0.12, flatShading: true, envMapIntensity: 1.5 })));
  } else if (kind === "bar") {
    group.add(new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.16, 0.28, 4, 0.04), metal(AZURE)));
  } else if (kind === "orb") {
    group.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(0.27, 48, 32),
        new THREE.MeshStandardMaterial({ color: FROST, metalness: 0.15, roughness: 0.35, emissive: 0x1f7ae0, emissiveIntensity: 0.35, envMap, envMapIntensity: 1 }),
      ),
    );
  }
  return group;
}

export type GlassBoxOptions = {
  size: number;
  kind: ContentKind;
  envMap: THREE.Texture;
  /** Height/width and depth/width ratios; 1 = a cube. */
  aspect?: [number, number];
};

export class GlassBox {
  readonly group = new THREE.Group();
  readonly glass: THREE.Mesh;
  readonly content: THREE.Object3D;
  readonly size: number;
  private spin = Math.random() * Math.PI * 2;
  /** 0 = sealed, 1 = fully open (contents out and gone). */
  open = 0;

  constructor(opts: GlassBoxOptions) {
    this.size = opts.size;
    const [ay, az] = opts.aspect ?? [1, 1];
    const s = opts.size;
    const geometry = new RoundedBoxGeometry(s, s * ay, s * az, 6, s * 0.1);
    this.glass = new THREE.Mesh(geometry, glassMaterial(opts.envMap));
    this.glass.renderOrder = 2;
    this.content = contentMesh(opts.kind, opts.envMap);
    this.content.scale.setScalar(s * 0.95);
    this.content.renderOrder = 0;
    this.group.add(this.content, this.glass);
  }

  /** Spin the contents; when opening, lift them out of the glass and fade them away. */
  update(t: number, dt: number): void {
    this.spin += dt * 0.6;
    this.content.rotation.y = this.spin;
    this.content.rotation.x = Math.sin(t * 0.5) * 0.15;
    const o = this.open;
    const ease = o < 0.5 ? 2 * o * o : 1 - Math.pow(-2 * o + 2, 2) / 2;
    this.content.position.y = ease * this.size * 1.35;
    const vanish = Math.max(0, (o - 0.7) / 0.3);
    this.content.scale.setScalar(this.size * 0.95 * (1 - vanish));
    this.content.visible = vanish < 1;
    const glass = this.glass.material as THREE.MeshPhysicalMaterial;
    glass.attenuationDistance = 2.6 + o * 4;
  }

  dispose(): void {
    this.glass.geometry.dispose();
    (this.glass.material as THREE.Material).dispose();
    this.content.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.geometry.dispose();
        (c.material as THREE.Material).dispose();
      }
    });
  }
}
