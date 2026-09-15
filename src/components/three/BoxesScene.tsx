"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GlassBox, type ContentKind } from "@/lib/three/glassbox";
import { addStudioLights, backdropMesh, createIceEnvironment, createRenderer, disposeScene, observeSize, prefersReducedMotion, runLoop, supportsWebGL } from "@/lib/three/studio";

type Slot = { x: number; y: number; z: number; size: number; kind: ContentKind; aspect?: [number, number]; tilt: [number, number]; phase: number };

/** Five boxes, the largest front-right, the rest orbiting it — the hero's right half on a wide screen, centred on a phone. */
const SLOTS: Slot[] = [
  { x: 3.05, y: 0.1, z: 0.2, size: 1.6, kind: "coin", tilt: [0.32, -0.55], phase: 0 },
  { x: 1.75, y: 1.6, z: -1.0, size: 0.78, kind: "crystal", tilt: [0.2, 0.6], phase: 1.7 },
  { x: 4.2, y: 1.65, z: -1.4, size: 0.62, kind: "orb", tilt: [-0.25, 0.35], phase: 3.1 },
  { x: 1.85, y: -1.45, z: -0.4, size: 0.95, kind: "bar", aspect: [0.78, 1], tilt: [0.45, 0.25], phase: 4.4 },
  { x: 4.15, y: -1.35, z: 0.3, size: 0.58, kind: "coin", tilt: [0.1, 0.95], phase: 5.6 },
];

export function BoxesScene({ className = "" }: { className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Never server-rendered (loaded with ssr: false), so the WebGL check can run in the initial state.
  const [mode] = useState<"webgl" | "fallback">(() => (supportsWebGL() ? "webgl" : "fallback"));

  useEffect(() => {
    if (mode !== "webgl") return;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const renderer = createRenderer(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
    // Looking a little to the right: the text owns the left of the hero, the boxes the right.
    camera.position.set(0.5, 0.15, 9);
    camera.lookAt(0.5, 0, 0);
    const envMap = createIceEnvironment(renderer);
    scene.environment = envMap;
    addStudioLights(scene);
    scene.add(backdropMesh(44, 26, -7));

    const cluster = new THREE.Group();
    scene.add(cluster);
    const boxes = SLOTS.map((s) => {
      const box = new GlassBox({ size: s.size, kind: s.kind, envMap, aspect: s.aspect });
      box.group.position.set(s.x, s.y, s.z);
      box.group.rotation.set(s.tilt[0], s.tilt[1], 0);
      cluster.add(box.group);
      return box;
    });

    let aspect = 1;
    let loop: ReturnType<typeof runLoop> | null = null;
    const stopSize = observeSize(host, (w, h) => {
      renderer.setSize(w, h, false);
      aspect = w / h;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      // Wide (the hero on a desktop): the cluster fills the right half. Narrow (the band above the
      // text on a phone): it is re-centred on the camera and shrunk to fit the band's height.
      const wide = w >= 768;
      const scale = wide ? Math.min(1, aspect / 1.6) : 1;
      cluster.scale.setScalar(scale);
      // The slots are laid out around x ≈ 3; the camera looks at x = 0.5.
      cluster.position.x = wide ? 0 : 0.5 - 3 * scale;
      cluster.position.y = wide ? 0 : -0.1;
      loop?.kick();
    });

    const pointer = new THREE.Vector2();
    const target = new THREE.Vector2();
    const onMove = (e: PointerEvent) => {
      target.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const animate = !prefersReducedMotion();
    loop = runLoop(
      canvas,
      (t, dt) => {
        pointer.lerp(target, 0.04);
        cluster.rotation.y = pointer.x * 0.14;
        cluster.rotation.x = -pointer.y * 0.08;
        boxes.forEach((box, i) => {
          const s = SLOTS[i];
          box.group.position.y = s.y + Math.sin(t * 0.55 + s.phase) * 0.14;
          box.group.position.x = s.x + Math.cos(t * 0.35 + s.phase) * 0.06;
          box.group.rotation.y = s.tilt[1] + t * 0.08 * (i % 2 ? -1 : 1);
          box.group.rotation.x = s.tilt[0] + Math.sin(t * 0.3 + s.phase) * 0.06;
          box.update(t, dt);
        });
        renderer.render(scene, camera);
      },
      animate,
    );

    return () => {
      loop?.stop();
      stopSize();
      window.removeEventListener("pointermove", onMove);
      boxes.forEach((b) => b.dispose());
      disposeScene(scene);
      envMap.dispose();
      renderer.dispose();
    };
  }, [mode]);

  return (
    <div ref={hostRef} className={className} aria-hidden>
      {mode === "fallback" ? <FallbackBoxes /> : <canvas ref={canvasRef} className="block h-full w-full" />}
    </div>
  );
}

/** Without WebGL: the same cluster as frosted squares. */
function FallbackBoxes() {
  const squares = [
    { left: "62%", top: "38%", size: 180 },
    { left: "48%", top: "14%", size: 92 },
    { left: "84%", top: "12%", size: 76 },
    { left: "50%", top: "70%", size: 116 },
    { left: "86%", top: "68%", size: 70 },
  ];
  return (
    <div className="absolute inset-0">
      {squares.map((s, i) => (
        <div
          key={i}
          className="glass float absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: s.left, top: s.top, width: s.size, height: s.size, borderRadius: s.size * 0.18, animationDelay: `${i * -1.3}s` }}
        >
          <div className="absolute left-1/2 top-1/2 h-1/3 w-1/3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-glacier/70" />
        </div>
      ))}
    </div>
  );
}
