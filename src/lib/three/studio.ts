import * as THREE from "three";

/*
  three.js plumbing shared by the hero and the box page. Nothing is loaded
  from disk: the environment is an ice studio painted at runtime and baked
  to a PMREM once per renderer.
*/

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
    // Lets a dev hook read pixels back after a synchronous render.
    preserveDrawingBuffer: process.env.NODE_ENV !== "production",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  // No tone mapping: the glass shows the page behind it at the page's own brightness, and the
  // white rims are allowed to clip to white. ACES would grey the interior of every box.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

/**
 * An ice studio: a pale blue room, one big white softbox high on the
 * left (the key the glass edges catch), a thin white strip overhead for
 * the specular line, a soft fill on the right, a deep azure panel low
 * behind so the glass carries a cold reflection, and a cyan kicker.
 * Contrast is what makes glass read: a uniform white room would render
 * the boxes as nothing at all.
 */
export function createIceEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0x9fbfe4, side: THREE.BackSide })));
  const panel = (w: number, h: number, color: number, intensity: number, x: number, y: number, z: number) => {
    const material = new THREE.MeshBasicMaterial();
    material.color.set(color).multiplyScalar(intensity);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    scene.add(mesh);
  };
  panel(8, 5, 0xffffff, 5.5, -6, 7, 5); // key softbox, top-left-front
  panel(16, 0.6, 0xffffff, 6, 0, 9, -1); // overhead strip → the specular line
  panel(4, 8, 0xeaf3ff, 1.6, 8, 1, 3); // pale fill, right
  panel(12, 8, 0xffffff, 0.9, 0, 0, 12); // broad soft panel behind the camera
  panel(14, 3, 0x1f5fd0, 2.2, -2, -7, -5); // deep azure, low-back → cold reflection
  panel(5, 5, 0x5fd3ff, 2.4, 7, 4, -7); // cyan kicker, far right-back
  panel(10, 3, 0xffffff, 0.6, 0, -8, 4); // floor bounce
  panel(3, 3, 0x2a4f80, 0.8, 4, -5, 6); // one darker card so rims have an edge to show
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.04);
  pmrem.dispose();
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
  return target.texture;
}

export function addStudioLights(scene: THREE.Scene, strength = 1): void {
  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0xc8dcf2, 0.9 * strength));
  const key = new THREE.DirectionalLight(0xffffff, 2.4 * strength);
  key.position.set(-4, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5fd3ff, 1.2 * strength);
  rim.position.set(4, -2, -5);
  scene.add(rim);
}

/**
 * The page behind the boxes, painted as a texture: the same ice gradient
 * and soft cold blobs as globals.css. Glass refracts what is in the scene,
 * not the DOM, so the scene carries a copy of the page — drawn only into
 * the transmission pass (see backdropMesh) and invisible otherwise.
 */
export function backdropTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 640;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#f7fbff");
    g.addColorStop(0.45, "#e6f0fb");
    g.addColorStop(1, "#d3e5f6");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const blob = (x: number, y: number, r: number, rgba: string) => {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, rgba);
      rg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    };
    blob(w * 0.15, h * 0.1, w * 0.45, "rgba(95,211,255,0.32)");
    blob(w * 0.85, h * 0.2, w * 0.4, "rgba(31,122,224,0.2)");
    blob(w * 0.6, h * 0.95, w * 0.5, "rgba(255,255,255,0.8)");
    // A soft dark horizon band: refraction needs an edge to bend.
    const band = ctx.createLinearGradient(0, h * 0.55, 0, h * 0.8);
    band.addColorStop(0, "rgba(13,43,74,0)");
    band.addColorStop(0.5, "rgba(13,43,74,0.09)");
    band.addColorStop(1, "rgba(13,43,74,0)");
    ctx.fillStyle = band;
    ctx.fillRect(0, 0, w, h);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A backdrop plane that only draws into the transmission buffer, so the canvas stays transparent over the page. */
export function backdropMesh(width: number, height: number, z: number): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ map: backdropTexture(), toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.z = z;
  mesh.onBeforeRender = (renderer) => {
    // Inside the transmission pass the renderer draws to an offscreen target; on the canvas it draws nothing.
    material.colorWrite = renderer.getRenderTarget() !== null;
  };
  return mesh;
}

/** Calls `cb` now (synchronously, so a hidden pane still measures) and on every size change of `el`. */
export function observeSize(el: HTMLElement, cb: (width: number, height: number) => void): () => void {
  const emit = () => {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) cb(rect.width, rect.height);
  };
  const observer = new ResizeObserver(emit);
  observer.observe(el);
  window.addEventListener("resize", emit);
  emit();
  return () => {
    observer.disconnect();
    window.removeEventListener("resize", emit);
  };
}

/**
 * requestAnimationFrame loop that only runs while the canvas is on screen
 * and the tab is visible. With `animate = false` it renders once and then
 * only when `kick()` is called.
 */
export function runLoop(canvas: HTMLCanvasElement, render: (time: number, dt: number) => void, animate: boolean): { stop: () => void; kick: () => void } {
  let raf = 0;
  let running = false;
  let visible = true;
  let last = performance.now();
  let start = last;

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    render((now - start) / 1000, dt);
    raf = requestAnimationFrame(frame);
  };
  const sync = () => {
    const should = animate && visible && !document.hidden;
    if (should && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!should && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  };
  const observer = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      sync();
    },
    { threshold: 0 },
  );
  observer.observe(canvas);
  document.addEventListener("visibilitychange", sync);
  start = performance.now();
  render(0, 0);
  sync();
  return {
    stop() {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      cancelAnimationFrame(raf);
      running = false;
    },
    kick() {
      if (!running) render((performance.now() - start) / 1000, 0);
    },
  };
}

/** `?nowebgl=1` and `?reduced=1` force the fallbacks, for checking them in a browser that has both. */
function flag(name: string): boolean {
  try {
    return new URLSearchParams(window.location.search).get(name) === "1";
  } catch {
    return false;
  }
}

export function supportsWebGL(): boolean {
  if (flag("nowebgl")) return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return flag("reduced") || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function disposeScene(scene: THREE.Scene): void {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        const m = material as THREE.MeshStandardMaterial;
        m.map?.dispose();
        material.dispose();
      }
    }
  });
}
