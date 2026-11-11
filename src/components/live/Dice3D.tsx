"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { canvasTexture, easeOut, Stage } from "@/lib/live/stage";

// Faces in three.js order: +x, -x, +y, -y, +z, -z  ->  3, 4, 2, 5, 1, 6 (opposite faces add to 7).
const FACE_VALUES = [3, 4, 2, 5, 1, 6];
const PIPS: Record<number, [number, number][]> = {
  1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]],
};
// The rotation that turns each value to face you, plus a slight tilt so it looks like a real cube.
const FACING: Record<number, [number, number]> = { 1: [0, 0], 6: [0, Math.PI], 3: [0, -Math.PI / 2], 4: [0, Math.PI / 2], 2: [Math.PI / 2, 0], 5: [-Math.PI / 2, 0] };
const TILT: [number, number] = [-0.42, 0.5];

type Props = { value: number | null; rollId: number; spinning: boolean; size?: number };

export default function Dice3D({ value, rollId, spinning, size = 92 }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const cube = useRef<THREE.Mesh | null>(null);
  const stage = useRef<Stage | null>(null);
  const spinRef = useRef(spinning);
  spinRef.current = spinning;

  useEffect(() => {
    const s = new Stage(host.current!, 30);
    stage.current = s;
    s.camera.position.set(0, 0.6, 4.2);
    s.camera.lookAt(0, 0, 0);
    s.onResize = () => { s.camera.position.set(0, 0.6, 4.2); s.camera.lookAt(0, 0, 0); };
    const mats = FACE_VALUES.map((v) => new THREE.MeshPhysicalMaterial({
      map: canvasTexture(256, 256, (g) => {
        g.fillStyle = "#fffaf3"; g.fillRect(0, 0, 256, 256);
        PIPS[v].forEach(([x, y]) => {
          g.beginPath(); g.arc(x * 64, y * 64, 24, 0, Math.PI * 2);
          g.fillStyle = v === 1 ? "#c2416b" : "#1d0f18"; g.fill();
        });
      }),
      roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2,
    }));
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(1.4, 1.4, 1.4, 6, 0.22), mats);
    mesh.castShadow = true;
    mesh.rotation.set(TILT[0], TILT[1], 0);
    s.scene.add(mesh);
    cube.current = mesh;
    // While waiting for the server's roll, keep tumbling.
    s.onFrame = () => {
      if (!spinRef.current || !cube.current) return false;
      cube.current.rotation.x += 0.32; cube.current.rotation.y += 0.27; cube.current.rotation.z += 0.11;
      return true;
    };
    return () => { s.dispose(); stage.current = null; cube.current = null; };
  }, []);

  // Land on the rolled value with a satisfying tumble.
  useEffect(() => {
    const s = stage.current, m = cube.current;
    if (!s || !m || !value || spinning) return;
    const [fx, fy] = FACING[value];
    const target = new THREE.Euler(fx + TILT[0] + Math.PI * 4, fy + TILT[1] + Math.PI * 2, 0);
    const from = m.rotation.clone();
    const base = new THREE.Euler(from.x % (Math.PI * 2), from.y % (Math.PI * 2), from.z % (Math.PI * 2));
    s.tween(700, (k) => {
      m.rotation.set(base.x + (target.x - base.x) * k, base.y + (target.y - base.y) * k, base.z * (1 - k));
      m.position.y = Math.sin(k * Math.PI) * 0.35;
    }, () => { m.position.y = 0; }, easeOut);
  }, [value, rollId, spinning]);

  return <div ref={host} className="dice3d" style={{ width: size, height: size }} role="img" aria-label={value ? `Dice shows ${value}` : "Dice"} />;
}
