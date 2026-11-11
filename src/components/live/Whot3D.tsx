"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CALLABLE, type Card, type Shape } from "@/lib/live/whot";
import { canvasTexture, easeInOut, Stage } from "@/lib/live/stage";
import { ShapeIcon, type WhotView } from "./WhotTable";

type Props = {
  view: WhotView; me: string; partnerName: string; canAct: boolean;
  canPlay: (c: Card) => boolean; onPlay: (index: number, call: string | null) => void; onDraw: () => void;
};

const W = 1.3, H = 1.85, T = 0.025;
const INK = "#6a2242";

function shapePath(g: CanvasRenderingContext2D, s: Shape, cx: number, cy: number, r: number) {
  g.beginPath();
  if (s === "circle") g.arc(cx, cy, r, 0, Math.PI * 2);
  else if (s === "triangle") { g.moveTo(cx, cy - r); g.lineTo(cx + r * 1.05, cy + r * 0.85); g.lineTo(cx - r * 1.05, cy + r * 0.85); g.closePath(); }
  else if (s === "square") g.rect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7);
  else if (s === "cross") { const a = r * 0.36; g.rect(cx - a, cy - r, a * 2, r * 2); g.rect(cx - r, cy - a, r * 2, a * 2); }
  else if (s === "star") { for (let k = 0; k < 10; k++) { const ang = (Math.PI / 5) * k - Math.PI / 2; const rad = k % 2 ? r * 0.45 : r; g.lineTo(cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)); } g.closePath(); }
}

const texCache = new Map<string, THREE.Texture>();
function frontTexture(c: Card) {
  const key = `${c.s}${c.n}`;
  if (texCache.has(key)) return texCache.get(key)!;
  const tex = canvasTexture(260, 370, (g) => {
    const grad = g.createLinearGradient(0, 0, 260, 370);
    grad.addColorStop(0, "#fffaf3"); grad.addColorStop(1, "#f3e3d2");
    g.fillStyle = grad; g.fillRect(0, 0, 260, 370);
    g.strokeStyle = INK; g.lineWidth = 10; g.strokeRect(9, 9, 242, 352);
    g.fillStyle = INK; g.font = "800 46px Georgia, serif";
    g.textAlign = "left"; g.fillText(String(c.n), 24, 64);
    g.save(); g.translate(236, 306); g.rotate(Math.PI); g.textAlign = "left"; g.fillText(String(c.n), 0, 0); g.restore();
    if (c.s === "whot") {
      g.textAlign = "center"; g.font = "800 52px Georgia, serif"; g.fillText("WHOT", 130, 196);
      g.font = "italic 26px Georgia, serif"; g.fillText("ask any shape", 130, 236);
    } else {
      shapePath(g, c.s, 130, 190, 66); g.fill();
      shapePath(g, c.s, 46, 104, 15); g.fill();
    }
  });
  texCache.set(key, tex);
  return tex;
}
function backTexture() {
  if (texCache.has("back")) return texCache.get("back")!;
  const tex = canvasTexture(260, 370, (g) => {
    g.fillStyle = "#6a2242"; g.fillRect(0, 0, 260, 370);
    for (let i = -370; i < 370; i += 22) { g.strokeStyle = "#8e2f52"; g.lineWidth = 9; g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 370, 370); g.stroke(); }
    g.strokeStyle = "#f6c97f"; g.lineWidth = 6; g.strokeRect(16, 16, 228, 338);
    g.fillStyle = "#1d0f18"; g.beginPath(); g.ellipse(130, 185, 72, 52, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#f6c97f"; g.font = "800 40px Georgia, serif"; g.textAlign = "center"; g.fillText("WHOT", 130, 200);
  });
  texCache.set("back", tex);
  return tex;
}
function feltTexture() {
  return canvasTexture(1024, 1024, (g) => {
    const grad = g.createRadialGradient(512, 512, 60, 512, 512, 720);
    grad.addColorStop(0, "#5c1f3a"); grad.addColorStop(1, "#22101b");
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 1024);
    const img = g.getImageData(0, 0, 1024, 1024);
    for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 14; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    g.putImageData(img, 0, 0);
    g.strokeStyle = "rgba(246,201,127,0.28)"; g.lineWidth = 6; g.beginPath(); g.ellipse(512, 540, 360, 250, 0, 0, Math.PI * 2); g.stroke();
  });
}

function cardMesh(front: Card | null): THREE.Mesh {
  const side = new THREE.MeshStandardMaterial({ color: 0xf3e3d2, roughness: 0.6 });
  const top = new THREE.MeshStandardMaterial({ map: front ? frontTexture(front) : backTexture(), roughness: 0.42 });
  const bottom = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.42 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(W, T, H), [side, side, top, bottom, side, side]);
  m.castShadow = true; m.receiveShadow = true;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.16, H + 0.16), new THREE.MeshBasicMaterial({ color: 0xf6c97f, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = -T; glow.visible = false; glow.name = "glow";
  m.add(glow);
  return m;
}

type Pose = { p: THREE.Vector3; r: THREE.Euler };
const pose = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): Pose => ({ p: new THREE.Vector3(x, y, z), r: new THREE.Euler(rx, ry, rz) });
const MARKET = pose(-1.55, 0.1, -0.1, Math.PI, 0.08, 0);

export default function Whot3D({ view, me, partnerName, canAct, canPlay, onPlay, onDraw }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const meshes = useRef(new Map<string, THREE.Mesh>());
  const handKeys = useRef<string[]>([]);
  const marketMesh = useRef<THREE.Group | null>(null);
  const [askFor, setAskFor] = useState<number | null>(null);
  const live = useRef({ view, canAct, canPlay, onPlay, onDraw, me });
  live.current = { view, canAct, canPlay, onPlay, onDraw, me };

  useEffect(() => {
    const stage = new Stage(host.current!, 42);
    stageRef.current = stage;
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(22, 22), new THREE.MeshStandardMaterial({ map: feltTexture(), roughness: 0.95 }));
    felt.rotation.x = -Math.PI / 2; felt.receiveShadow = true;
    stage.scene.add(felt);
    const market = new THREE.Group();
    for (let i = 0; i < 12; i++) { const c = cardMesh(null); c.position.set(MARKET.p.x, 0.02 + i * T, MARKET.p.z); c.rotation.copy(MARKET.r); c.rotation.y += (i % 3) * 0.02; market.add(c); }
    stage.scene.add(market);
    marketMesh.current = market;
    // Fit the table (about 7.6 wide, your hand included) into the screen.
    stage.onResize = (aspect) => {
      const half = Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2));
      const d = Math.max(7.6 / (2 * half * Math.min(aspect, 1.2)), 9);
      stage.camera.position.set(0, d * 0.83, d * 0.6);
      stage.camera.lookAt(0, 0, 0.75);
    };
    stage.resize();
    // Tap targets that sit on each card in your hand (also what screen readers use).
    const tmp = new THREE.Vector3();
    const playCard = (idx: number) => {
      const { view: v, canAct: act, canPlay: cp } = live.current;
      if (!act || v.turn !== live.current.me) return;
      const c = v.hand[idx];
      if (!c || !cp(c)) return;
      if (c.n === 20) setAskFor(idx); else live.current.onPlay(idx, null);
    };
    const placeTargets = (myTurn: boolean) => {
      const box = overlay.current;
      if (!box) return;
      const keys = handKeys.current;
      while (box.children.length < keys.length) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "tap3d tap3d--card";
        b.addEventListener("click", () => playCard(Number(b.dataset.index)));
        box.appendChild(b);
      }
      Array.from(box.children).forEach((el, k) => {
        const b = el as HTMLButtonElement;
        const m = k < keys.length ? meshes.current.get(keys[k]) : null;
        const c = live.current.view.hand[k];
        if (!m || !c) { b.hidden = true; return; }
        m.getWorldPosition(tmp); tmp.project(stage.camera);
        b.hidden = false;
        b.dataset.index = String(k);
        const ok = myTurn && live.current.canPlay(c);
        b.disabled = !ok;
        b.setAttribute("aria-label", `${c.s === "whot" ? "Whot" : `${c.n} ${c.s}`}${ok ? ", play" : ""}`);
        const tr = `translate(${Math.round(((tmp.x + 1) / 2) * box.clientWidth - 22)}px, ${Math.round(((1 - tmp.y) / 2) * box.clientHeight - 34)}px)`;
        if (b.style.transform !== tr) b.style.transform = tr;
        b.style.zIndex = String(10 + k);
      });
    };
    stage.onFrame = (t) => {
      const { view: v, canAct: act, canPlay: cp } = live.current;
      const myTurn = act && v.turn === live.current.me;
      placeTargets(myTurn);
      let glowing = false;
      handKeys.current.forEach((k, i) => {
        const m = meshes.current.get(k);
        const c = v.hand[i];
        if (!m || !c) return;
        const glow = m.getObjectByName("glow") as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
        const ok = myTurn && cp(c);
        glow.visible = ok;
        if (ok) { glow.material.opacity = 0.55 + 0.35 * Math.sin(t / 240); glowing = true; }
      });
      return glowing;
    };
    const onTap = (e: PointerEvent) => {
      const { view: v, canAct: act, canPlay: cp } = live.current;
      if (!act || v.turn !== live.current.me) return;
      void cp;
      const hit = stage.pick(e.clientX, e.clientY, marketMesh.current ? [marketMesh.current] : []);
      if (!hit) return;
      if (marketMesh.current && (marketMesh.current === hit || marketMesh.current.children.includes(hit as THREE.Mesh))) live.current.onDraw();
    };
    stage.renderer.domElement.addEventListener("pointerup", onTap);
    return () => {
      stage.renderer.domElement.removeEventListener("pointerup", onTap);
      stage.dispose(); stageRef.current = null; meshes.current.clear(); handKeys.current = [];
    };
  }, []);

  // Lay the table out, flying each card from wherever it was to where it belongs now.
  const layoutKey = JSON.stringify([view.hand, view.counts, view.pile.slice(-5), view.deckCount, view.turn, canAct]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.invalidate();
    const opp = view.players.find((p) => p !== me)!;
    const old = new Map(meshes.current);
    const next = new Map<string, THREE.Mesh>();
    const targets = new Map<string, Pose>();
    const occ = new Map<string, number>();
    const newHandKeys = view.hand.map((c) => { const b = `${c.s}${c.n}`; const n = occ.get(b) ?? 0; occ.set(b, n + 1); return `h:${b}#${n}`; });

    // My hand: a fan facing me.
    const n = view.hand.length;
    const spread = Math.min(0.9, 5.4 / Math.max(n, 1));
    newHandKeys.forEach((k, i) => {
      const x = (i - (n - 1) / 2) * spread;
      const lift = live.current.canAct && view.turn === me && live.current.canPlay(view.hand[i]) ? 0.3 : 0;
      targets.set(k, pose(x, 0.75 + i * 0.004 + lift, 3.35 + Math.abs(x) * 0.05 - lift * 0.2, 0.95, 0, -x * 0.035));
    });
    // Their hand: backs only, a fan across the table.
    const on = view.counts[opp] ?? 0;
    const ospread = Math.min(0.75, 5.4 / Math.max(on, 1));
    for (let i = 0; i < on; i++) { const x = (i - (on - 1) / 2) * ospread; targets.set(`o:${i}`, pose(x, 0.7, -2.7, -1.05, 0, x * 0.04)); }
    // The pile: the last few cards, gently scattered.
    const shown = view.pile.slice(-5);
    shown.forEach((c, i) => {
      const idx = view.pile.length - shown.length + i;
      const j = ((idx * 9301 + 49297) % 233280) / 233280;
      targets.set(`p:${idx}:${c.s}${c.n}`, pose(1.4 + (j - 0.5) * 0.25, 0.03 + i * 0.012, -0.1 + (j - 0.5) * 0.2, 0, (j - 0.5) * 0.7, 0));
    });

    // Reuse meshes: a card that left my hand flies to the pile.
    const removedHand = [...old.keys()].filter((k) => k.startsWith("h:") && !targets.has(k));
    const oppBefore = [...old.keys()].filter((k) => k.startsWith("o:")).length;
    for (const [k, t] of targets) {
      let m = old.get(k);
      if (m) old.delete(k);
      else if (k.startsWith("p:")) {
        const card: Card = { s: k.split(":")[2].replace(/\d+$/, "") as Shape, n: Number(k.split(":")[2].match(/\d+$/)![0]) };
        const fromHand = removedHand.shift();
        const reuse = fromHand ? old.get(fromHand) : undefined;
        if (reuse) { old.delete(fromHand!); (reuse.material as THREE.MeshStandardMaterial[])[2].map = frontTexture(card); m = reuse; }
        else {
          m = cardMesh(card);
          const src = on < oppBefore ? pose(0, 0.7, -2.7, -1.05, 0, 0) : MARKET; // from their hand, else the market
          m.position.copy(src.p); m.rotation.copy(src.r);
          stage.scene.add(m);
        }
      } else {
        m = cardMesh(k.startsWith("h:") ? view.hand[newHandKeys.indexOf(k)] : null);
        m.position.copy(MARKET.p); m.position.y += 0.4; m.rotation.copy(MARKET.r);
        stage.scene.add(m);
      }
      next.set(k, m);
      const from = { p: m.position.clone(), r: m.rotation.clone() };
      const mesh = m;
      const far = from.p.distanceTo(t.p) > 0.5;
      stage.tween(far ? 520 : 220, (x) => {
        mesh.position.lerpVectors(from.p, t.p, x);
        if (far) mesh.position.y += Math.sin(x * Math.PI) * 0.9;
        mesh.rotation.set(from.r.x + (t.r.x - from.r.x) * x, from.r.y + (t.r.y - from.r.y) * x, from.r.z + (t.r.z - from.r.z) * x);
      }, undefined, easeInOut);
    }
    old.forEach((m) => stage.scene.remove(m));
    meshes.current = next;
    handKeys.current = newHandKeys;
    // The market stack shrinks as it empties.
    marketMesh.current?.children.forEach((c, i) => { c.visible = i < Math.min(12, Math.ceil(view.deckCount / 3)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, me]);

  const myTurn = canAct && view.turn === me;
  return (
    <div className="whot3d">
      <div ref={host} className="whot3d__stage" role="img" aria-label="Whot table. Tap a glowing card to play it, or the market to draw." />
      <div ref={overlay} className="taps3d" />
      <div className="whot3d__hud">
        <span className="whud glass">{partnerName}: {view.counts[view.players.find((p) => p !== me)!]} {view.counts[view.players.find((p) => p !== me)!] === 1 ? "card. Last card!" : "cards"}</span>
        <span className="whud glass">Market: {view.deckCount}</span>
        {view.call && <span className="whud whud--gold glass">Asked for <ShapeIcon s={view.call} size={16} color="#f6c97f" /> {view.call}</span>}
        {view.pending && <span className="whud whud--warn glass">Pick {view.pending.count}!</span>}
      </div>
      {myTurn && !view.hand.some((c) => canPlay(c)) && (
        <button type="button" className="btn whot3d__market" onClick={onDraw}>{view.pending ? `Pick ${view.pending.count}` : "Go to market"}</button>
      )}
      {askFor !== null && (
        <div className="modal modal--center" role="dialog" aria-modal="true" aria-label="Ask for a shape" onClick={() => setAskFor(null)}>
          <div className="lock-modal" onClick={(e) => e.stopPropagation()}>
            <p className="sheet__title">Whot! Ask for a shape</p>
            <div className="wshapes">
              {CALLABLE.map((s) => (
                <button key={s} type="button" className="wshape" onClick={() => { const i = askFor; setAskFor(null); onPlay(i, s); }}>
                  <ShapeIcon s={s} size={30} color="#f6c97f" /><span>{s}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
