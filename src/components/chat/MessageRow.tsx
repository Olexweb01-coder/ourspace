"use client";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ANGRY, LOVE } from "@/lib/emoji";

export type ReplyRef = { id: string; from: string; preview: string };

type Props = {
  id: string;
  mine: boolean;
  groupStart: boolean;            // first of a run from the same person: gets the tail
  time: string;
  disappears: boolean;
  ticks: "none" | "sent" | "seen";
  reply: ReplyRef | null;
  replyName: (memberId: string) => string;
  reactions: ("love" | "angry")[];
  highlighted: boolean;
  wide?: boolean;                 // media bubbles
  canReply: boolean;
  onReply: () => void;
  onMenu: (rect: DOMRect) => void;
  onLove: () => void;
  onJump: (id: string) => void;
  children: ReactNode;
};

const SWIPE_TRIGGER = 64;
const SWIPE_MAX = 90;

// One message. Swipe right to reply, long-press (or right-click) for the menu, double-tap to love.
export default function MessageRow(p: Props) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const swiping = useRef(false);
  const moved = useRef(false);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);
  const bubble = useRef<HTMLDivElement>(null);
  const fired = useRef(false);

  function clearPress() { if (press.current) { clearTimeout(press.current); press.current = null; } }

  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    swiping.current = false;
    moved.current = false;
    fired.current = false;
    clearPress();
    press.current = setTimeout(() => {
      if (!moved.current && bubble.current) { fired.current = true; navigator.vibrate?.(8); p.onMenu(bubble.current.getBoundingClientRect()); }
    }, 430);
  }

  function move(e: PointerEvent) {
    const s = start.current;
    if (!s) return;
    const x = e.clientX - s.x;
    const y = e.clientY - s.y;
    if (Math.abs(x) > 8 || Math.abs(y) > 8) { moved.current = true; clearPress(); }
    if (!p.canReply) return;
    if (!swiping.current && x > 12 && Math.abs(x) > Math.abs(y) * 1.6) swiping.current = true;
    if (swiping.current) {
      const next = Math.max(0, Math.min(SWIPE_MAX, x));
      if (next >= SWIPE_TRIGGER && dx < SWIPE_TRIGGER) navigator.vibrate?.(10);
      setDx(next);
    }
  }

  function up() {
    clearPress();
    if (swiping.current && dx >= SWIPE_TRIGGER) p.onReply();
    else if (!moved.current && !fired.current) {
      const now = Date.now();
      if (now - lastTap.current < 300) { p.onLove(); lastTap.current = 0; } else lastTap.current = now;
    }
    swiping.current = false;
    start.current = null;
    setDx(0);
  }

  return (
    <div
      id={`msg-${p.id}`}
      className={`row${p.mine ? " row--mine" : ""}${p.groupStart ? " row--start" : ""}${p.highlighted ? " row--flash" : ""}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => { e.preventDefault(); if (bubble.current) p.onMenu(bubble.current.getBoundingClientRect()); }}
    >
      <span className="row__reply-cue" style={{ opacity: Math.min(1, dx / SWIPE_TRIGGER), transform: `scale(${0.6 + Math.min(1, dx / SWIPE_TRIGGER) * 0.4})` }} aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" /></svg>
      </span>
      <div
        ref={bubble}
        className={`b${p.mine ? " b--mine" : ""}${p.groupStart ? " b--tail" : ""}${p.wide ? " b--wide" : ""}`}
        style={dx ? { transform: `translateX(${dx}px)`, transition: "none" } : undefined}
      >
        {p.reply && (
          <button type="button" className="quote" onClick={(e) => { e.stopPropagation(); p.onJump(p.reply!.id); }}>
            <span className="quote__who">{p.replyName(p.reply.from)}</span>
            <span className="quote__text">{p.reply.preview}</span>
          </button>
        )}
        {p.children}
        <span className="b__meta">
          {p.disappears && <span aria-label="Disappears">⏳</span>}
          {p.time}
          {p.ticks !== "none" && (
            <svg className={p.ticks === "seen" ? "ticks ticks--seen" : "ticks"} viewBox="0 0 18 12" aria-label={p.ticks === "seen" ? "Seen" : "Sent"}>
              <path d="M1 6.5l3.2 3.2L11 2.8" />
              {p.ticks === "seen" && <path d="M6.5 9.7L13.4 2.8" />}
            </svg>
          )}
        </span>
        {p.reactions.length > 0 && (
          <span className="b__reacts" aria-label="Reactions">
            {p.reactions.map((r, i) => <span key={i}>{r === "love" ? LOVE : ANGRY}</span>)}
          </span>
        )}
      </div>
    </div>
  );
}

type MenuProps = {
  rect: DOMRect;
  mine: boolean;
  canReact: boolean;
  canCopy: boolean;
  myReaction: "love" | "angry" | null;
  onReact: (r: "love" | "angry") => void;
  onReply: () => void;
  onCopy: () => void;
  onClose: () => void;
};

// The long-press menu: love or angry, reply, copy.
export function MessageMenu({ rect, mine, canReact, canCopy, myReaction, onReact, onReply, onCopy, onClose }: MenuProps) {
  const top = Math.max(76, Math.min(rect.top - 64, (typeof window !== "undefined" ? window.innerHeight : 800) - 220));
  const side = mine ? { right: Math.max(10, (typeof window !== "undefined" ? window.innerWidth : 400) - rect.right) } : { left: Math.max(10, rect.left) };
  return (
    <div className="mmenu-backdrop" onClick={onClose}>
      <div className="mmenu glass" style={{ top, ...side }} onClick={(e) => e.stopPropagation()} role="menu">
        {canReact && (
          <div className="mmenu__reacts">
            <button type="button" aria-pressed={myReaction === "love"} onClick={() => onReact("love")} aria-label="Love">{LOVE}</button>
            <button type="button" aria-pressed={myReaction === "angry"} onClick={() => onReact("angry")} aria-label="Angry">{ANGRY}</button>
          </div>
        )}
        <button type="button" className="mmenu__item" role="menuitem" onClick={onReply}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" /></svg>Reply
        </button>
        {canCopy && (
          <button type="button" className="mmenu__item" role="menuitem" onClick={onCopy}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11z" /></svg>Copy
          </button>
        )}
      </div>
    </div>
  );
}
