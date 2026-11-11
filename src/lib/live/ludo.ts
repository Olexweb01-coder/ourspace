// Ludo for two. Pure rules: the server rolls the dice and calls these.
// A token's progress: -1 = in base, 0..50 = on the track from its own start, 51..55 = home column, 56 = home.

export type LudoColor = "red" | "green" | "yellow" | "blue";
export const START: Record<LudoColor, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
/** Start squares and star squares: nobody can be captured here. */
export const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
export const HOME = 56;

export type LudoState = {
  kind: "ludo";
  players: { id: string; color: LudoColor }[];
  tokens: Record<string, number[]>;
  turn: string;
  phase: "roll" | "move";
  dice: number | null;
  sixes: number;
  winner: string | null;
  last: string;        // what just happened, for both screens
  moves: number;
};

export function initLudo(first: string, second: string, starter: string): LudoState {
  return {
    kind: "ludo",
    players: [{ id: first, color: "red" }, { id: second, color: "yellow" }],
    tokens: { [first]: [-1, -1, -1, -1], [second]: [-1, -1, -1, -1] },
    turn: starter,
    phase: "roll",
    dice: null,
    sixes: 0,
    winner: null,
    last: "Game on. Roll a 6 to bring a token out.",
    moves: 0,
  };
}

const colorOf = (s: LudoState, id: string) => s.players.find((p) => p.id === id)!.color;
const other = (s: LudoState, id: string) => s.players.find((p) => p.id !== id)!.id;

/** Track square (0..51) for a progress value, or null when in base / home column / home. */
export function trackSquare(color: LudoColor, progress: number): number | null {
  return progress >= 0 && progress <= 50 ? (START[color] + progress) % 52 : null;
}

export function legalMoves(s: LudoState, id: string): number[] {
  if (s.phase !== "move" || s.turn !== id || s.dice === null || s.winner) return [];
  const d = s.dice;
  return s.tokens[id].flatMap((p, i) => ((p === -1 ? d === 6 : p !== HOME && p + d <= HOME) ? [i] : []));
}

export function ludoRoll(s: LudoState, id: string, value: number): LudoState {
  if (s.winner) throw new Error("The game is over.");
  if (s.turn !== id) throw new Error("It's not your turn.");
  if (s.phase !== "roll") throw new Error("Move a token first.");
  if (!Number.isInteger(value) || value < 1 || value > 6) throw new Error("Bad dice.");
  const n: LudoState = { ...s, tokens: { ...s.tokens }, dice: value, sixes: value === 6 ? s.sixes + 1 : 0, moves: s.moves + 1 };
  if (n.sixes === 3) {
    return { ...n, phase: "roll", sixes: 0, turn: other(s, id), last: "Three 6s in a row. Turn lost." };
  }
  n.phase = "move";
  if (legalMoves(n, id).length === 0) {
    // Nothing can move. A 6 still earns another roll; otherwise the turn passes.
    return value === 6
      ? { ...n, phase: "roll", last: "Rolled a 6 but nothing can move. Roll again." }
      : { ...n, phase: "roll", sixes: 0, turn: other(s, id), last: `Rolled a ${value}. No move possible.` };
  }
  return { ...n, last: `Rolled a ${value}.` };
}

export function ludoMove(s: LudoState, id: string, token: number): LudoState {
  if (!legalMoves(s, id).includes(token)) throw new Error("That token can't move.");
  const d = s.dice!;
  const me = colorOf(s, id);
  const opp = other(s, id);
  const mine = [...s.tokens[id]];
  const from = mine[token];
  const to = from === -1 ? 0 : from + d;
  mine[token] = to;

  let captured = 0;
  const theirs = [...s.tokens[opp]];
  const sq = trackSquare(me, to);
  if (sq !== null && !SAFE.has(sq)) {
    const oc = colorOf(s, opp);
    theirs.forEach((p, i) => { if (trackSquare(oc, p) === sq) { theirs[i] = -1; captured++; } });
  }
  const finished = to === HOME;
  const won = mine.every((p) => p === HOME);
  const extra = !won && (d === 6 || captured > 0 || finished);
  const last = won ? "Won the game!" : captured ? `Captured ${captured === 1 ? "a token" : `${captured} tokens`}! Roll again.`
    : finished ? "A token made it home! Roll again." : from === -1 ? "A token came out." : `Moved ${d}.`;
  return {
    ...s,
    tokens: { ...s.tokens, [id]: mine, [opp]: theirs },
    phase: "roll",
    turn: extra || won ? id : opp,
    sixes: extra && d === 6 ? s.sixes : 0,
    winner: won ? id : null,
    last,
  };
}
