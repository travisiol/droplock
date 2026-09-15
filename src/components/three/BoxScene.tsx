"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GlassBox, type ContentKind } from "@/lib/three/glassbox";
import { addStudioLights, backdropMesh, createIceEnvironment, createRenderer, disposeScene, observeSize, prefersReducedMotion, runLoop, supportsWebGL } from "@/lib/three/studio";

type Props = {
  kind: ContentKind;
  /** Contents out of the box (claimed). Flipping it from false to true plays the opening. */
  open?: boolean;
  /** Empty and quiet (reclaimed / expired). */
  dim?: boolean;
  className?: string;
};

/** One box, slowly turning, for the box page and the drop preview. */
export function BoxScene({ kind, open = false, dim = false, className = "" }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<GlassBox | null>(null);
  const targetRef = useRef(open ? 1 : 0);
  // Never server-rendered (loaded with ssr: false), so the WebGL check can run in the initial state.
  const [mode] = useState<"webgl" | "fallback">(() => (supportsWebGL() ? "webgl" : "fallback"));

  useEffect(() => {
    targetRef.current = open ? 1 : 0;
  }, [open]);

  useEffect(() => {
    if (mode !== "webgl") return;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const renderer = createRenderer(canvas);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
    camera.position.set(0, 0.55, 5.6);
    camera.lookAt(0, -0.05, 0);
    const envMap = createIceEnvironment(renderer);
    scene.environment = envMap;
    addStudioLights(scene);
    scene.add(backdropMesh(30, 18, -6));

    const box = new GlassBox({ size: 1.75, kind: dim ? "none" : kind, envMap });
    box.open = targetRef.current;
    box.group.rotation.set(0.3, -0.6, 0);
    scene.add(box.group);
    boxRef.current = box;
    if (dim) (box.glass.material as THREE.MeshPhysicalMaterial).attenuationDistance = 8;

    let loop: ReturnType<typeof runLoop> | null = null;
    const stopSize = observeSize(host, (w, h) => {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      loop?.kick();
    });

    loop = runLoop(
      canvas,
      (t, dt) => {
        const target = targetRef.current;
        if (Math.abs(box.open - target) > 0.001) box.open += (target - box.open) * Math.min(1, dt * 1.6);
        box.group.rotation.y = -0.6 + t * 0.18;
        box.group.rotation.x = 0.3 + Math.sin(t * 0.4) * 0.05;
        box.group.position.y = Math.sin(t * 0.7) * 0.08;
        box.update(t, dt);
        renderer.render(scene, camera);
      },
      !prefersReducedMotion(),
    );

    return () => {
      loop?.stop();
      stopSize();
      box.dispose();
      disposeScene(scene);
      envMap.dispose();
      renderer.dispose();
      boxRef.current = null;
    };
  }, [mode, kind, dim]);

  return (
    <div ref={hostRef} className={className} aria-hidden>
      {mode === "fallback" ? (
        <div className="absolute inset-0 grid place-items-center">
          <div className="glass float relative h-40 w-40 rounded-[32px]">
            {!open && !dim && <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-glacier/70" />}
          </div>
        </div>
      ) : (
        <canvas ref={canvasRef} className="block h-full w-full" />
      )}
    </div>
  );
}
