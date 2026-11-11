// A small 3D stage for the board games: renderer, camera, lights, smooth tweens and tap picking.
import * as THREE from "three";

type Tween = { t0: number; dur: number; step: (k: number) => void; done?: () => void; ease: (x: number) => number };
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private tweens: Tween[] = [];
  private raf = 0;
  private ro: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  /** Called every tick; return true while something needs to keep moving (a bobbing pawn, a spinning dice). */
  onFrame: ((t: number) => boolean | void) | null = null;
  private dirty = true;
  private frame = 0;
  private slow = 0;
  onResize: ((aspect: number) => void) | null = null;

  constructor(private host: HTMLElement, fov = 40) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "manipulation";
    host.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 200);

    // Warm, soft light from above with a key light that throws shadows.
    this.scene.add(new THREE.HemisphereLight(0xfff1e6, 0x2b1622, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(-6, 14, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -12; key.shadow.camera.right = 12; key.shadow.camera.top = 12; key.shadow.camera.bottom = -12;
    key.shadow.bias = -0.0008;
    key.shadow.radius = 3;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xf6c97f, 0.55);
    rim.position.set(8, 6, -10);
    this.scene.add(rim);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    const loop = (t: number) => {
      this.tick(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.onResize?.(w / h);
    this.dirty = true;
  }

  tweensIdle() { return this.tweens.length === 0; }

  /** Ask for one redraw (after moving something without a tween). */
  invalidate() { this.dirty = true; }

  tween(dur: number, step: (k: number) => void, done?: () => void, ease = easeInOut) {
    this.tweens.push({ t0: performance.now(), dur, step, done, ease });
    this.dirty = true;
  }

  /** Runs tweens one after another. */
  chain(steps: { dur: number; step: (k: number) => void; ease?: (x: number) => number }[], done?: () => void) {
    const run = (i: number) => {
      if (i >= steps.length) return done?.();
      const s = steps[i];
      this.tween(s.dur, s.step, () => run(i + 1), s.ease ?? easeInOut);
    };
    run(0);
  }

  // Draws only when something changed or is moving: nothing moving means no work, no battery.
  private tick(t: number) {
    const now = performance.now();
    const running = this.tweens;
    this.tweens = [];                       // tweens started from a "done" land here too
    for (const tw of running) {
      const k = Math.min(1, (now - tw.t0) / tw.dur);
      tw.step(tw.ease(k));
      if (k < 1) this.tweens.push(tw); else tw.done?.();
    }
    const keep = this.onFrame?.(t) === true;
    this.frame++;
    const animating = running.length > 0 || this.tweens.length > 0;
    // Gentle idle motion (bobbing, glowing) is drawn at half rate.
    if (!(animating || this.dirty || (keep && this.frame % 2 === 0))) return;
    this.dirty = false;
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    // A phone that struggles gets fewer pixels to draw, automatically.
    if (performance.now() - t0 > 34) {
      if (++this.slow > 8 && this.renderer.getPixelRatio() > 1) {
        this.renderer.setPixelRatio(Math.max(1, this.renderer.getPixelRatio() - 0.5));
        this.resize();
        this.slow = 0;
      }
    } else this.slow = Math.max(0, this.slow - 1);
  }

  /** The object under a tap, among the ones you pass in. */
  pick(clientX: number, clientY: number, objects: THREE.Object3D[]): THREE.Object3D | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const hit = this.raycaster.intersectObjects(objects, true)[0];
    return hit ? hit.object : null;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      mats.forEach((mat) => {
        (mat as THREE.MeshStandardMaterial).map?.dispose();
        mat.dispose();
      });
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
