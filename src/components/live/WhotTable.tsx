"use client";
import { useState } from "react";
import { CALLABLE, CARD_NAME, type Card, type Shape } from "@/lib/live/whot";

export type WhotView = {
  kind: "whot";
  players: string[];
  hand: Card[];
  counts: Record<string, number>;
  deckCount: number;
  pile: Card[];
  turn: string;
  call: Exclude<Shape, "whot"> | null;
  pending: { count: number; by: 2 | 5 } | null;
  winner: string | null;
  ended: "empty" | "market" | null;
  totals: Record<string, number> | null;
  last: string;
};

const INK = "#6a2242";

export function ShapeIcon({ s, size = 26, color = INK }: { s: Shape; size?: number; color?: string }) {
  const v = 24;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${v} ${v}`} aria-hidden="true">
      {s === "circle" && <circle cx="12" cy="12" r="9" fill={color} />}
      {s === "triangle" && <polygon points="12,3 21.5,20 2.5,20" fill={color} />}
      {s === "cross" && <path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill={color} />}
      {s === "square" && <rect x="4" y="4" width="16" height="16" fill={color} />}
      {s === "star" && <polygon points="12,2 14.9,8.6 22,9.3 16.6,14 18.2,21 12,17.3 5.8,21 7.4,14 2,9.3 9.1,8.6" fill={color} />}
      {s === "whot" && <text x="12" y="16" textAnchor="middle" fontSize="8" fontWeight="800" fill={color}>WHOT</text>}
    </svg>
  );
}

export function WhotCard({ c, playable, onClick, small }: { c: Card; playable?: boolean; onClick?: () => void; small?: boolean }) {
  return (
    <button type="button" className={`wcard${small ? " wcard--small" : ""}${playable ? " wcard--play" : ""}`} onClick={onClick}
      disabled={!onClick} aria-label={`${c.s === "whot" ? "Whot" : `${c.n} ${c.s}`}${CARD_NAME[c.n] ? `, ${CARD_NAME[c.n]}` : ""}`}>
      <span className="wcard__n">{c.n}</span>
      <span className="wcard__shape"><ShapeIcon s={c.s} size={small ? 24 : 34} /></span>
      <span className="wcard__n wcard__n--b">{c.n}</span>
    </button>
  );
}

type Props = {
  view: WhotView;
  me: string;
  partnerName: string;
  canAct: boolean;
  canPlay: (c: Card) => boolean;
  onPlay: (index: number, call: string | null) => void;
  onDraw: () => void;
};

export default function WhotTable({ view, me, partnerName, canAct, canPlay, onPlay, onDraw }: Props) {
  const [askFor, setAskFor] = useState<number | null>(null);
  const opp = view.players.find((p) => p !== me)!;
  const top = view.pile[view.pile.length - 1];
  const myTurn = view.turn === me && canAct;

  return (
    <div className={myTurn ? "whot whot--myturn" : "whot"}>
      <div className="whot__opp" aria-label={`${partnerName} has ${view.counts[opp]} cards`}>
        {Array.from({ length: Math.min(view.counts[opp], 12) }, (_, i) => <span key={i} className="wback" style={{ marginLeft: i ? -26 : 0 }} />)}
        <span className="whot__count">{partnerName}: {view.counts[opp]} {view.counts[opp] === 1 ? "card. Last card!" : "cards"}</span>
      </div>

      <div className="whot__middle">
        <button type="button" className="wmarket" onClick={onDraw} disabled={!myTurn} aria-label={view.pending ? `Pick ${view.pending.count}` : "Go to market"}>
          <span className="wback wback--big" />
          <span className="wmarket__label">{view.pending && myTurn ? `Pick ${view.pending.count}` : "Market"}<small>{view.deckCount} left</small></span>
        </button>
        <div className="wpile">
          {top && <WhotCard c={top} />}
          {view.call && <span className="wcall">Asked for <ShapeIcon s={view.call} size={18} color="#f6c97f" /> {view.call}</span>}
          {view.pending && <span className="wcall wcall--warn">Pick {view.pending.count}!</span>}
        </div>
      </div>

      <div className="whot__hand" role="list" aria-label="Your cards">
        {view.hand.map((c, i) => {
          const ok = myTurn && canPlay(c);
          return (
            <span role="listitem" key={`${c.s}${c.n}${i}`}>
              <WhotCard c={c} small playable={ok} onClick={ok ? () => (c.n === 20 ? setAskFor(i) : onPlay(i, null)) : undefined} />
            </span>
          );
        })}
      </div>

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
