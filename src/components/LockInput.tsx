"use client";
import { useRef, useState, type FormEvent, type PointerEvent } from "react";
import type { LockKind } from "@/lib/applock";

type Props = {
  kind: LockKind;
  pinLength?: number;            // when known, the PIN submits by itself
  busy?: boolean;
  submitLabel?: string;
  onSubmit: (value: string) => void;
};

// PIN pad, 3x3 pattern, or password: whichever this phone uses.
export default function LockInput({ kind, pinLength, busy, submitLabel = "Unlock", onSubmit }: Props) {
  if (kind === "pin") return <PinPad length={pinLength} busy={busy} submitLabel={submitLabel} onSubmit={onSubmit} />;
  if (kind === "pattern") return <Pattern busy={busy} onSubmit={onSubmit} />;
  return <PasswordBox busy={busy} submitLabel={submitLabel} onSubmit={onSubmit} />;
}

function PinPad({ length, busy, submitLabel, onSubmit }: { length?: number; busy?: boolean; submitLabel: string; onSubmit: (v: string) => void }) {
  const [pin, setPin] = useState("");
  const max = length ?? 6;
  function press(d: string) {
    if (busy || pin.length >= max) return;
    const next = pin + d;
    setPin(next);
    if (length && next.length === length) { onSubmit(next); setTimeout(() => setPin(""), 250); }
  }
  return (
    <div className="pin">
      <div className="pin__dots" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: length ?? Math.max(4, pin.length) }, (_, i) => <span key={i} className={i < pin.length ? "on" : ""} />)}
      </div>
      <div className="pin__keys">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" className="pin__key" onClick={() => press(d)} disabled={busy}>{d}</button>
        ))}
        <button type="button" className="pin__key pin__key--text" onClick={() => setPin(pin.slice(0, -1))} disabled={busy || !pin} aria-label="Delete">Delete</button>
        <button type="button" className="pin__key" onClick={() => press("0")} disabled={busy}>0</button>
        {length
          ? <span />
          : <button type="button" className="pin__key pin__key--text" onClick={() => { onSubmit(pin); setPin(""); }} disabled={busy || pin.length < 4}>{submitLabel}</button>}
      </div>
    </div>
  );
}

const DOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ i: i + 1, x: 50 + (i % 3) * 100, y: 50 + Math.floor(i / 3) * 100 }));

function Pattern({ busy, onSubmit }: { busy?: boolean; onSubmit: (v: string) => void }) {
  const [path, setPath] = useState<number[]>([]);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const drawing = useRef(false);
  const svg = useRef<SVGSVGElement>(null);

  function at(e: PointerEvent): { x: number; y: number } {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 300, y: ((e.clientY - r.top) / r.height) * 300 };
  }
  function hit(p: { x: number; y: number }, current: number[]) {
    const d = DOTS.find((d) => Math.hypot(d.x - p.x, d.y - p.y) < 34);
    return d && !current.includes(d.i) ? d.i : null;
  }
  function down(e: PointerEvent) {
    if (busy) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const p = at(e);
    const h = hit(p, []);
    setPath(h ? [h] : []);
    setPointer(p);
  }
  function move(e: PointerEvent) {
    if (!drawing.current) return;
    const p = at(e);
    setPointer(p);
    setPath((cur) => { const h = hit(p, cur); return h ? [...cur, h] : cur; });
  }
  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    setPointer(null);
    const value = path.join("-");
    setTimeout(() => setPath([]), 300);
    if (path.length) onSubmit(value);
  }
  const pts = path.map((i) => DOTS[i - 1]);
  return (
    <svg ref={svg} className="pattern" viewBox="0 0 300 300" role="img" aria-label="Draw your pattern"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      {pts.length > 0 && (
        <polyline points={[...pts.map((p) => `${p.x},${p.y}`), ...(pointer ? [`${pointer.x},${pointer.y}`] : [])].join(" ")}
          fill="none" stroke="var(--candle)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
      )}
      {DOTS.map((d) => (
        <g key={d.i}>
          <circle cx={d.x} cy={d.y} r="30" fill="transparent" />
          <circle cx={d.x} cy={d.y} r={path.includes(d.i) ? 13 : 9} fill={path.includes(d.i) ? "var(--candle)" : "var(--muted)"} />
        </g>
      ))}
    </svg>
  );
}

function PasswordBox({ busy, submitLabel, onSubmit }: { busy?: boolean; submitLabel: string; onSubmit: (v: string) => void }) {
  const [value, setValue] = useState("");
  function submit(e: FormEvent) { e.preventDefault(); if (value) { onSubmit(value); setValue(""); } }
  return (
    <form className="gate__form" onSubmit={submit}>
      <label className="sr-only" htmlFor="lockpw">App lock password</label>
      <input id="lockpw" className="field" type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      <button className="btn btn--wide" disabled={busy || !value}>{busy ? "Opening…" : submitLabel}</button>
    </form>
  );
}
