"use client";
import { HOME, SAFE, START, type LudoColor, type LudoState } from "@/lib/live/ludo";

// A real 15 x 15 Ludo board. Coordinates are [column, row] cells.
const C = 20; // cell size in the SVG
export const TRACK: [number, number][] = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0],
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7],
  [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14],
  [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7],
  [0, 6],
];
export const HOME_COL: Record<LudoColor, [number, number][]> = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  green: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
};
export const BASE: Record<LudoColor, [number, number]> = { red: [0, 0], green: [9, 0], yellow: [9, 9], blue: [0, 9] };
export const LUDO_HEX: Record<LudoColor, string> = { red: "#d64560", green: "#3fa67a", yellow: "#e9b949", blue: "#4a7bd1" };

export function tokenCell(color: LudoColor, p: number, i: number): [number, number] {
  if (p === -1) { const [bx, by] = BASE[color]; return [bx + 1.5 + (i % 2) * 2, by + 1.5 + Math.floor(i / 2) * 2]; }
  if (p <= 50) { const [x, y] = TRACK[(START[color] + p) % 52]; return [x + 0.5, y + 0.5]; }
  if (p < HOME) { const [x, y] = HOME_COL[color][p - 51]; return [x + 0.5, y + 0.5]; }
  return [7.5 + (i % 2 ? 0.35 : -0.35), 7.5 + (i < 2 ? -0.35 : 0.35)];
}

type Props = { state: LudoState; me: string; legal: number[]; onMove: (token: number) => void };

export default function LudoBoard({ state, me, legal, onMove }: Props) {
  // Spread tokens that share a square so each stays tappable.
  const placed: { owner: string; color: LudoColor; i: number; x: number; y: number }[] = [];
  const seen = new Map<string, number>();
  for (const pl of state.players) {
    state.tokens[pl.id].forEach((p, i) => {
      let [x, y] = tokenCell(pl.color, p, i);
      if (p >= 0 && p < HOME) {
        const key = `${x},${y}`;
        const n = seen.get(key) ?? 0;
        seen.set(key, n + 1);
        x += [0, 0.22, -0.22, 0.22][n % 4]; y += [0, -0.18, 0.18, 0.18][n % 4];
      }
      placed.push({ owner: pl.id, color: pl.color, i, x, y });
    });
  }
  const star = (cx: number, cy: number) => {
    const pts = Array.from({ length: 10 }, (_, k) => {
      const r = k % 2 ? 3.2 : 7.2; const a = (Math.PI / 5) * k - Math.PI / 2;
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    }).join(" ");
    return <polygon points={pts} fill="none" stroke="#b8a07a" strokeWidth="1" />;
  };

  return (
    <svg className="ludo" viewBox={`0 0 ${15 * C} ${15 * C}`} role="img" aria-label="Ludo board">
      <rect width={15 * C} height={15 * C} rx="14" fill="#fbf3ea" />
      {(Object.keys(BASE) as LudoColor[]).map((c) => {
        const [bx, by] = BASE[c];
        return (
          <g key={c}>
            <rect x={bx * C} y={by * C} width={6 * C} height={6 * C} fill={LUDO_HEX[c]} opacity="0.92" rx={c === "red" || c === "green" ? 0 : 0} />
            <rect x={(bx + 0.8) * C} y={(by + 0.8) * C} width={4.4 * C} height={4.4 * C} rx="10" fill="#fff" opacity="0.92" />
            {[0, 1, 2, 3].map((i) => (
              <circle key={i} cx={(bx + 1.5 + (i % 2) * 2) * C} cy={(by + 1.5 + Math.floor(i / 2) * 2) * C} r={C * 0.62} fill={LUDO_HEX[c]} opacity="0.28" />
            ))}
          </g>
        );
      })}
      {TRACK.map(([x, y], i) => {
        const startOf = (Object.keys(START) as LudoColor[]).find((c) => START[c] === i);
        return (
          <g key={`t${i}`}>
            <rect x={x * C} y={y * C} width={C} height={C} fill={startOf ? LUDO_HEX[startOf] : "#fff"} stroke="#e4d6c6" strokeWidth="1" />
            {SAFE.has(i) && !startOf && star(x * C + C / 2, y * C + C / 2)}
          </g>
        );
      })}
      {(Object.keys(HOME_COL) as LudoColor[]).map((c) => HOME_COL[c].map(([x, y], i) => (
        <rect key={`h${c}${i}`} x={x * C} y={y * C} width={C} height={C} fill={LUDO_HEX[c]} opacity="0.85" stroke="#e4d6c6" strokeWidth="1" />
      )))}
      <polygon points={`${6 * C},${6 * C} ${9 * C},${6 * C} ${7.5 * C},${7.5 * C}`} fill={LUDO_HEX.green} />
      <polygon points={`${9 * C},${6 * C} ${9 * C},${9 * C} ${7.5 * C},${7.5 * C}`} fill={LUDO_HEX.yellow} />
      <polygon points={`${9 * C},${9 * C} ${6 * C},${9 * C} ${7.5 * C},${7.5 * C}`} fill={LUDO_HEX.blue} />
      <polygon points={`${6 * C},${9 * C} ${6 * C},${6 * C} ${7.5 * C},${7.5 * C}`} fill={LUDO_HEX.red} />
      <path transform={`translate(${7.5 * C - 9} ${7.5 * C - 8}) scale(0.75)`} fill="#fff"
        d="M12 20.5c-.4 0-.7-.1-1-.4C6.3 16 3 13.1 3 9.4 3 6.6 5.2 4.5 7.9 4.5c1.6 0 3.1.8 4.1 2.1 1-1.3 2.5-2.1 4.1-2.1 2.7 0 4.9 2.1 4.9 4.9 0 3.7-3.3 6.6-8 10.7-.3.3-.6.4-1 .4z" />

      {placed.map((t) => {
        const can = t.owner === me && legal.includes(t.i);
        return (
          <g key={`${t.owner}${t.i}`} className={can ? "ltoken ltoken--can" : "ltoken"}
            onClick={can ? () => onMove(t.i) : undefined} role={can ? "button" : undefined}
            aria-label={can ? `Move ${t.color} token ${t.i + 1}` : undefined}
            style={{ transform: `translate(${t.x * C}px, ${t.y * C}px)` }}>
            {can && <circle r={C * 0.56} fill="none" stroke="#1d0f18" strokeWidth="2" className="ltoken__ring" />}
            <circle r={C * 0.4} fill={LUDO_HEX[t.color]} stroke="#fff" strokeWidth="2.5" />
            <circle r={C * 0.14} fill="#fff" opacity="0.7" />
          </g>
        );
      })}
    </svg>
  );
}

export function Die({ value, rolling }: { value: number | null; rolling?: boolean }) {
  const pips: Record<number, [number, number][]> = {
    1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]],
    4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]],
    6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]],
  };
  return (
    <svg className={rolling ? "die die--roll" : "die"} viewBox="0 0 40 40" role="img" aria-label={value ? `Dice shows ${value}` : "Dice"}>
      <rect x="2" y="2" width="36" height="36" rx="9" fill="#fff" stroke="#e4d6c6" strokeWidth="2" />
      {(value ? pips[value] : []).map(([x, y], i) => <circle key={i} cx={x * 10} cy={y * 10} r="3.6" fill="#1d0f18" />)}
    </svg>
  );
}
