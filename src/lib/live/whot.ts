// Whot, Nigerian rules, for two. Pure rules: the server shuffles and calls these.
export type Shape = "circle" | "triangle" | "cross" | "square" | "star" | "whot";
export type Card = { s: Shape; n: number };
export const CALLABLE: Exclude<Shape, "whot">[] = ["circle", "triangle", "cross", "square", "star"];

export function fullDeck(): Card[] {
  const set = (s: Shape, ns: number[]) => ns.map((n) => ({ s, n }));
  return [
    ...set("circle", [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14]),
    ...set("triangle", [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14]),
    ...set("cross", [1, 2, 3, 5, 7, 10, 11, 13, 14]),
    ...set("square", [1, 2, 3, 5, 7, 10, 11, 13, 14]),
    ...set("star", [1, 2, 3, 4, 5, 7, 8]),
    ...set("whot", [20, 20, 20, 20, 20]),
  ]; // 54 cards
}

const SPECIAL = new Set([1, 2, 5, 8, 14, 20]);
export const CARD_NAME: Record<number, string> = { 1: "Hold on", 2: "Pick two", 5: "Pick three", 8: "Suspension", 14: "General market", 20: "Whot" };

export type WhotRules = {
  hand: 4 | 5 | 6;           // cards dealt to each player
  pickThree: boolean;        // 5 = pick three
  stack: boolean;            // a 2 can answer a 2, a 5 a 5
  generalMarket: boolean;    // 14 = everyone else takes one
  holdOn: boolean;           // 1 = play again
  suspension: boolean;       // 8 = skip the other player
  fast: boolean;             // nothing to play? go to market automatically
};
export const DEFAULT_WHOT: WhotRules = { hand: 6, pickThree: true, stack: true, generalMarket: true, holdOn: true, suspension: true, fast: false };
export function cleanWhotRules(r: Partial<WhotRules> | null | undefined): WhotRules {
  const hand = r?.hand === 4 || r?.hand === 5 ? r.hand : 6;
  return {
    hand, pickThree: r?.pickThree !== false, stack: r?.stack !== false, generalMarket: r?.generalMarket !== false,
    holdOn: r?.holdOn !== false, suspension: r?.suspension !== false, fast: r?.fast === true,
  };
}

export type WhotState = {
  kind: "whot";
  rules?: WhotRules;
  players: string[];
  hands: Record<string, Card[]>;
  deck: Card[];
  pile: Card[];                                   // last = top card
  turn: string;
  call: Exclude<Shape, "whot"> | null;            // shape asked for after a Whot
  pending: { count: number; by: 2 | 5 } | null;   // pick two / pick three waiting
  winner: string | null;
  ended: "empty" | "market" | null;
  totals: Record<string, number> | null;          // hand totals when the market runs out
  last: string;
  moves: number;
};

type Shuffle = (cards: Card[]) => Card[];
const other = (s: WhotState, id: string) => s.players.find((p) => p !== id)!;
export const cardValue = (c: Card) => (c.s === "star" ? c.n * 2 : c.n);

export function initWhot(a: string, b: string, starter: string, shuffle: Shuffle, rules: WhotRules = DEFAULT_WHOT): WhotState {
  const deck = shuffle(fullDeck());
  const hands = { [a]: deck.splice(0, rules.hand), [b]: deck.splice(0, rules.hand) };
  // The first face-up card is always a plain number card.
  let i = deck.findIndex((c) => !SPECIAL.has(c.n));
  if (i < 0) i = 0;
  const [first] = deck.splice(i, 1);
  return { kind: "whot", rules, players: [a, b], hands, deck, pile: [first], turn: starter, call: null, pending: null,
    winner: null, ended: null, totals: null, last: "Cards dealt. Match the shape or the number.", moves: 0 };
}

const whotRules = (s: WhotState) => s.rules ?? DEFAULT_WHOT;

export function canPlay(s: WhotState, c: Card): boolean {
  const top = s.pile[s.pile.length - 1];
  if (s.pending) return whotRules(s).stack && c.n === s.pending.by;   // answer a 2 with a 2 (if stacking is on)
  if (c.s === "whot") return true;
  if (s.call) return c.s === s.call;
  return c.s === top.s || c.n === top.n;
}

/** Takes cards from the market, reshuffling the pile under the top card when needed. */
function takeCards(s: WhotState, id: string, count: number, shuffle: Shuffle): { state: WhotState; got: number } {
  let deck = [...s.deck];
  let pile = [...s.pile];
  const hand = [...s.hands[id]];
  let got = 0;
  for (let k = 0; k < count; k++) {
    if (deck.length === 0 && pile.length > 1) {
      const top = pile.pop()!;
      deck = shuffle(pile);
      pile = [top];
    }
    if (deck.length === 0) break;
    hand.push(deck.shift()!);
    got++;
  }
  return { state: { ...s, deck, pile, hands: { ...s.hands, [id]: hand } }, got };
}

function endByMarket(s: WhotState): WhotState {
  const totals = Object.fromEntries(s.players.map((p) => [p, s.hands[p].reduce((t, c) => t + cardValue(c), 0)]));
  const [a, b] = s.players;
  const winner = totals[a] === totals[b] ? null : totals[a] < totals[b] ? a : b;
  return { ...s, ended: "market", totals, winner, last: winner ? "Market finished. Lowest hand wins." : "Market finished. It's a tie!" };
}

export function whotPlay(s: WhotState, id: string, index: number, call: string | null, shuffle: Shuffle): WhotState {
  if (s.winner || s.ended) throw new Error("The game is over.");
  if (s.turn !== id) throw new Error("It's not your turn.");
  const hand = s.hands[id];
  const card = hand[index];
  if (!card) throw new Error("That card isn't in your hand.");
  if (!canPlay(s, card)) throw new Error(s.pending ? (whotRules(s).stack ? `Play a ${s.pending.by} or go to market.` : `Go to market and pick ${s.pending.count}.`) : s.call ? `They asked for ${s.call}.` : "Match the shape or the number.");
  if (card.n === 20 && !CALLABLE.includes(call as Exclude<Shape, "whot">)) throw new Error("Choose a shape to ask for.");

  const opp = other(s, id);
  let n: WhotState = {
    ...s,
    hands: { ...s.hands, [id]: hand.filter((_, i) => i !== index) },
    pile: [...s.pile, card],
    call: null,
    moves: s.moves + 1,
  };
  if (n.hands[id].length === 0) return { ...n, pending: null, winner: id, ended: "empty", last: "Check up! Won the game." };
  const lastCard = n.hands[id].length === 1 ? " Last card!" : "";

  const r = whotRules(s);
  const plain = { ...n, turn: opp, pending: null, last: `Played ${card.n} ${card.s}.${lastCard}` };
  if ((card.n === 1 && !r.holdOn) || (card.n === 8 && !r.suspension) || (card.n === 14 && !r.generalMarket) || (card.n === 5 && !r.pickThree)) return plain;
  switch (card.n) {
    case 20: return { ...n, call: call as Exclude<Shape, "whot">, turn: opp, pending: null, last: `Whot! Asked for ${call}.${lastCard}` };
    case 1: return { ...n, turn: id, last: `Hold on. Play again.${lastCard}` };
    case 8: return { ...n, turn: id, last: `Suspension. Play again.${lastCard}` };
    case 14: {
      const r = takeCards(n, opp, 1, shuffle);
      n = r.state;
      return { ...n, turn: id, last: `General market! They took a card. Play again.${lastCard}` };
    }
    case 2: return { ...n, turn: opp, pending: { count: (s.pending?.count ?? 0) + 2, by: 2 }, last: `Pick two!${lastCard}` };
    case 5: return { ...n, turn: opp, pending: { count: (s.pending?.count ?? 0) + 3, by: 5 }, last: `Pick three!${lastCard}` };
    default: return { ...n, turn: opp, pending: null, last: `Played ${card.n} ${card.s}.${lastCard}` };
  }
}

/** Go to market: take the pick-two/three if one is waiting, otherwise one card. Your turn ends. */
export function whotDraw(s: WhotState, id: string, shuffle: Shuffle): WhotState {
  if (s.winner || s.ended) throw new Error("The game is over.");
  if (s.turn !== id) throw new Error("It's not your turn.");
  const count = s.pending?.count ?? 1;
  const r = takeCards(s, id, count, shuffle);
  const n = { ...r.state, pending: null, turn: other(s, id), moves: s.moves + 1,
    last: count > 1 ? `Picked ${r.got}.` : "Went to market." };
  if (r.got < count) return endByMarket(n);
  return n;
}

/** What one player is allowed to see: their own hand, only a count of the other's, and no market order. */
export function whotView(s: WhotState, me: string) {
  const { hands, deck, ...rest } = s;
  return { ...rest, hand: hands[me] ?? [], counts: Object.fromEntries(s.players.map((p) => [p, hands[p].length])), deckCount: deck.length };
}
