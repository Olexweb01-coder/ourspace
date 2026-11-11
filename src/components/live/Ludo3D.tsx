"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { HOME, SAFE, START, type LudoColor, type LudoState } from "@/lib/live/ludo";
import { canvasTexture, easeOut, Stage } from "@/lib/live/stage";
import { BASE, HOME_COL, LUDO_HEX, TRACK, tokenCell } from "./LudoBoard";

type Props = { state: LudoState; me: string; legal: number[]; onMove: (token: number) => void };
const BOARD_TOP = 0.26;

// Paints the board top once, at high resolution.
function boardTexture() {
  const S = 2048, C = S / 15;
  return canvasTexture(S, S, (g) => {
    g.fillStyle = "#fbf3ea"; g.fillRect(0, 0, S, S);
    (Object.keys(BASE) as LudoColor[]).forEach((c) => {
      const [bx, by] = BASE[c];
      const grad = g.createLinearGradient(bx * C, by * C, (bx + 6) * C, (by + 6) * C);
      grad.addColorStop(0, LUDO_HEX[c]); grad.addColorStop(1, shade(LUDO_HEX[c], -0.18));
      g.fillStyle = grad; g.fillRect(bx * C, by * C, 6 * C, 6 * C);
      g.fillStyle = "rgba(255,255,255,0.94)"; roundRect(g, (bx + 0.8) * C, (by + 0.8) * C, 4.4 * C, 4.4 * C, C * 0.5); g.fill();
      for (let i = 0; i < 4; i++) {
        g.beginPath(); g.arc((bx + 1.5 + (i % 2) * 2) * C, (by + 1.5 + Math.floor(i / 2) * 2) * C, C * 0.62, 0, Math.PI * 2);
        g.fillStyle = hexA(LUDO_HEX[c], 0.25); g.fill();
        g.lineWidth = C * 0.06; g.strokeStyle = hexA(LUDO_HEX[c], 0.55); g.stroke();
      }
    });
    TRACK.forEach(([x, y], i) => {
      const startOf = (Object.keys(START) as LudoColor[]).find((c) => START[c] === i);
      g.fillStyle = startOf ? LUDO_HEX[startOf] : "#ffffff";
      g.fillRect(x * C, y * C, C, C);
      g.strokeStyle = "#e2d2c0"; g.lineWidth = C * 0.05; g.strokeRect(x * C, y * C, C, C);
      if (SAFE.has(i) && !startOf) star(g, x * C + C / 2, y * C + C / 2, C * 0.36, C * 0.16, "#c9a776");
      if (startOf) star(g, x * C + C / 2, y * C + C / 2, C * 0.36, C * 0.16, "rgba(255,255,255,0.85)");
    });
    (Object.keys(HOME_COL) as LudoColor[]).forEach((c) => HOME_COL[c].forEach(([x, y]) => {
      g.fillStyle = LUDO_HEX[c]; g.fillRect(x * C, y * C, C, C);
      g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = C * 0.05; g.strokeRect(x * C, y * C, C, C);
    }));
    const tri = (pts: [number, number][], col: string) => { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x * C, y * C) : g.moveTo(x * C, y * C))); g.closePath(); g.fillStyle = col; g.fill(); };
    tri([[6, 6], [9, 6], [7.5, 7.5]], LUDO_HEX.green);
    tri([[9, 6], [9, 9], [7.5, 7.5]], LUDO_HEX.yellow);
    tri([[9, 9], [6, 9], [7.5, 7.5]], LUDO_HEX.blue);
    tri([[6, 9], [6, 6], [7.5, 7.5]], LUDO_HEX.red);
    g.save(); g.translate(7.5 * C, 7.5 * C); g.scale(C / 30, C / 30); g.translate(-12, -12.5);
    g.fillStyle = "#ffffff"; g.fill(new Path2D("M12 20.5c-.4 0-.7-.1-1-.4C6.3 16 3 13.1 3 9.4 3 6.6 5.2 4.5 7.9 4.5c1.6 0 3.1.8 4.1 2.1 1-1.3 2.5-2.1 4.1-2.1 2.7 0 4.9 2.1 4.9 4.9 0 3.7-3.3 6.6-8 10.7-.3.3-.6.4-1 .4z"));
    g.restore();
  });
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function star(g: CanvasRenderingContext2D, cx: number, cy: number, R: number, r: number, col: string) {
  g.beginPath();
  for (let k = 0; k < 10; k++) { const a = (Math.PI / 5) * k - Math.PI / 2; const rad = k % 2 ? r : R; g.lineTo(cx + rad * Math.cos(a), cy + rad * Math.sin(a)); }
  g.closePath(); g.fillStyle = col; g.fill();
}
const hexA = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const shade = (hex: string, k: number) => { const n = parseInt(hex.slice(1), 16); const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + k)))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; };

// A classic pawn: wide base, slim neck, round head.
function pawnMesh(color: string): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12 });
  const profile = [[0, 0], [0.34, 0], [0.36, 0.05], [0.3, 0.11], [0.19, 0.18], [0.13, 0.38], [0.115, 0.46], [0.2, 0.5], [0.2, 0.53], [0.11, 0.57], [0, 0.57]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), mat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 24), mat);
  head.position.y = 0.7;
  [body, head].forEach((m) => { m.castShadow = true; m.receiveShadow = true; g.add(m); });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 12, 48), new THREE.MeshBasicMaterial({ color: 0xf6c97f, transparent: true, opacity: 0.95 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.03; ring.visible = false; ring.name = "ring";
  g.add(ring);
  g.scale.setScalar(1.32);
  return g;
}

export default function Ludo3D({ state, me, legal, onMove }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const pawns = useRef(new Map<string, THREE.Group>());          // key "playerId:index"
  const shown = useRef(new Map<string, number>());                // progress currently on screen
  const legalRef = useRef<number[]>(legal);
  const onMoveRef = useRef(onMove);
  legalRef.current = legal; onMoveRef.current = onMove;

  // Build the scene once.
  useEffect(() => {
    const el = host.current!;
    const stage = new Stage(el, 36);
    stageRef.current = stage;
    const board = new THREE.Group();
    board.name = "board";
    stage.scene.add(board);

    const wood = new THREE.MeshStandardMaterial({ color: 0x6b3423, roughness: 0.55 });
    const top = new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.5 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(15, 0.5, 15), [wood, wood, top, wood, wood, wood]);
    slab.receiveShadow = true; slab.castShadow = true;
    board.add(slab);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(16, 0.62, 16), new THREE.MeshStandardMaterial({ color: 0x4a2216, roughness: 0.45, metalness: 0.05 }));
    frame.position.y = -0.08; frame.receiveShadow = true; frame.castShadow = true;
    board.add(frame);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x1d0f18, roughness: 0.95 }));
    table.rotation.x = -Math.PI / 2; table.position.y = -0.4; table.receiveShadow = true;
    stage.scene.add(table);

    // Phones are tall: pull the camera back so the whole board fits the width.
    // Fit the whole board (16 wide with its frame) into the screen width, at a gentle tilt.
    stage.onResize = (aspect) => {
      const half = Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2));
      const fitWidth = 18.4 / (2 * half * Math.min(aspect, 1.15));
      const fitHeight = 15.5 / (2 * half);
      const d = Math.max(fitWidth, fitHeight);
      stage.camera.position.set(0, d * 0.84, d * 0.55);
      stage.camera.lookAt(0, -0.5, 0.9);
    };
    stage.resize();

    // Thumb-sized tap targets that follow each movable pawn (also what screen readers use).
    const v = new THREE.Vector3();
    const placeTargets = () => {
      const box = overlay.current;
      if (!box) return;
      const mine = legalRef.current;
      while (box.children.length < mine.length) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "tap3d";
        b.addEventListener("click", () => onMoveRef.current(Number(b.dataset.token)));
        box.appendChild(b);
      }
      Array.from(box.children).forEach((el, k) => {
        const b = el as HTMLButtonElement;
        const token = mine[k];
        const g = token === undefined ? null : pawns.current.get(`${me}:${token}`);
        if (!g) { b.hidden = true; return; }
        g.getWorldPosition(v); v.y += 0.45; v.project(stage.camera);
        b.hidden = false;
        b.dataset.token = String(token);
        b.setAttribute("aria-label", `Move pawn ${token + 1}`);
        const tr = `translate(${Math.round(((v.x + 1) / 2) * box.clientWidth - 24)}px, ${Math.round(((1 - v.y) / 2) * box.clientHeight - 24)}px)`;
        if (b.style.transform !== tr) b.style.transform = tr;
      });
    };

    // Movable pawns bob and their rings pulse.
    stage.onFrame = (t) => {
      placeTargets();
      let moving = false;
      pawns.current.forEach((g, key) => {
        const [owner, idx] = key.split(":");
        const can = owner === me && legalRef.current.includes(Number(idx));
        const ring = g.getObjectByName("ring")!;
        ring.visible = can;
        const bob = can ? 0.1 * Math.abs(Math.sin(t / 260)) : 0;
        g.children[0].position.y = bob;          // body
        g.children[1].position.y = 0.7 + bob;    // head
        if (can) { (ring as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.opacity = 0.55 + 0.45 * Math.sin(t / 220); moving = true; }
      });
      return moving;
    };

    const onTap = (e: PointerEvent) => {
      const groups = Array.from(pawns.current.entries()).filter(([k]) => k.startsWith(`${me}:`) && legalRef.current.includes(Number(k.split(":")[1])));
      const hit = stage.pick(e.clientX, e.clientY, groups.map(([, g]) => g));
      if (!hit) return;
      const entry = groups.find(([, g]) => g === hit || g.children.includes(hit));
      if (entry) onMoveRef.current(Number(entry[0].split(":")[1]));
    };
    stage.renderer.domElement.addEventListener("pointerup", onTap);
    return () => {
      stage.renderer.domElement.removeEventListener("pointerup", onTap);
      stage.dispose();
      stageRef.current = null;
      pawns.current.clear();
      shown.current.clear();
    };
  }, [me]);

  // Place or animate pawns whenever the game state changes.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const board = stage.scene.getObjectByName("board")!;
    const myColor = state.players.find((p) => p.id === me)?.color ?? "red";
    // Turn the board so your own base sits nearest you, bottom-left.
    const [bx, by] = BASE[myColor];
    const cx = bx + 3 - 7.5, cz = by + 3 - 7.5;
    // Rotating by θ about Y turns a direction at angle φ (in x,z) to φ - θ; aim it at (x -4.5, z +4.5).
    const turn = Math.atan2(cz, cx) - Math.atan2(4.5, -4.5);
    if (board.rotation.y !== turn) { board.rotation.y = turn; stage.invalidate(); }

    const world = (color: LudoColor, p: number, i: number, offset = 0): THREE.Vector3 => {
      const [x, y] = tokenCell(color, p, i);
      const o = [[0, 0], [0.22, -0.18], [-0.22, 0.18], [0.22, 0.18]][offset % 4];
      return new THREE.Vector3(x - 7.5 + (p >= 0 && p < HOME ? o[0] : 0), BOARD_TOP, y - 7.5 + (p >= 0 && p < HOME ? o[1] : 0));
    };
    // Tokens sharing a square spread out slightly.
    const stackCount = new Map<string, number>();
    const offsetOf = (color: LudoColor, p: number) => {
      if (p < 0 || p >= HOME) return 0;
      const [x, y] = tokenCell(color, p, 0);
      const k = `${x},${y}`;
      const n = stackCount.get(k) ?? 0;
      stackCount.set(k, n + 1);
      return n;
    };

    for (const pl of state.players) {
      state.tokens[pl.id].forEach((p, i) => {
        const key = `${pl.id}:${i}`;
        let g = pawns.current.get(key);
        const off = offsetOf(pl.color, p);
        const target = world(pl.color, p, i, off);
        if (!g) {
          g = pawnMesh(LUDO_HEX[pl.color]);
          g.position.copy(target);
          board.add(g);
          pawns.current.set(key, g);
          shown.current.set(key, p);
          stage.invalidate();
          return;
        }
        const from = shown.current.get(key) ?? p;
        shown.current.set(key, p);
        if (from === p) {
          if (!g.position.equals(target) && stage.tweensIdle()) { g.position.copy(target); stage.invalidate(); }
          return;
        }
        const pawn = g;
        if (p > from) {
          // Hop square by square along the path.
          const stops: THREE.Vector3[] = [];
          for (let q = Math.max(from + 1, 0); q <= p; q++) stops.push(world(pl.color, q, i, q === p ? off : 0));
          if (from === -1) stops.splice(0, stops.length, world(pl.color, 0, i, off));
          const hop = state.rules?.fast ? 85 : 170;
          stage.chain(stops.map((stop) => {
            const start = pawn.position.clone();
            return { dur: hop, ease: (x: number) => x, step: (k: number) => {
              pawn.position.lerpVectors(start, stop, k);
              pawn.position.y = BOARD_TOP + Math.sin(k * Math.PI) * 0.55;
            } };
          }), () => pawn.position.copy(target));
        } else {
          // Captured: fly back home to base in an arc, after a short beat.
          const start = pawn.position.clone();
          setTimeout(() => stage.tween(650, (k) => {
            pawn.position.lerpVectors(start, target, k);
            pawn.position.y = BOARD_TOP + Math.sin(k * Math.PI) * 2.2;
            pawn.rotation.z = k * Math.PI * 2;
          }, () => { pawn.rotation.z = 0; pawn.position.copy(target); }, easeOut), 520);
        }
      });
    }
  }, [state, me]);

  return (
    <div className="ludo3d">
      <div ref={host} className="ludo3d__stage" role="img" aria-label="Ludo board. Tap a glowing pawn to move it." />
      <div ref={overlay} className="taps3d" />
    </div>
  );
}
