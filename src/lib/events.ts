// Cards in the chat for things that happen elsewhere in the app: a game invite, who won and what's owed, a quiz, a Truth or Dare.
// They travel as ordinary encrypted text messages with the card's details attached, so an older version of the app
// still shows the words. Each card that must never repeat gets a fixed id made from what it's about.
export type LiveKind = "ludo" | "whot";
export type EventInfo =
  | { type: "live-invite"; kind: LiveKind; id: string }
  | { type: "live-result"; kind: LiveKind; id: string; winner: string; bet?: string }
  | { type: "quiz"; kind: "wyr" | "tot" | "know"; id: string }
  | { type: "card"; deck: "truth" | "dare" | "deep"; text: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const short = (x: unknown, max: number) => typeof x === "string" && x.length > 0 && x.length <= max;

/** Cards come from the other phone: only well-formed ones are drawn as cards. */
export function validEvent(e: unknown): e is EventInfo {
  if (!e || typeof e !== "object") return false;
  const v = e as Record<string, unknown>;
  switch (v.type) {
    case "live-invite": return (v.kind === "ludo" || v.kind === "whot") && typeof v.id === "string" && UUID.test(v.id);
    case "live-result": return (v.kind === "ludo" || v.kind === "whot") && typeof v.id === "string" && UUID.test(v.id)
      && typeof v.winner === "string" && UUID.test(v.winner) && (v.bet === undefined || short(v.bet, 300));
    case "quiz": return (v.kind === "wyr" || v.kind === "tot" || v.kind === "know") && typeof v.id === "string" && UUID.test(v.id);
    case "card": return (v.deck === "truth" || v.deck === "dare" || v.deck === "deep") && short(v.text, 600);
    default: return false;
  }
}

export const LIVE_TITLE: Record<LiveKind, string> = { ludo: "Ludo", whot: "Whot" };
export const QUIZ_TITLE = { wyr: "Would you rather", tot: "This or that", know: "How well do you know me" } as const;
export const DECK_TITLE = { truth: "Truth", dare: "Dare", deep: "Deep talk" } as const;

/** The words that go with a card (shown by older versions, in replies and as the preview). */
export function eventText(e: EventInfo, senderName: string, winnerName: string, loserName: string): string {
  switch (e.type) {
    case "live-invite": return `🎲 ${senderName} invited you to play ${LIVE_TITLE[e.kind]}`;
    case "live-result": return `🏆 ${winnerName} won ${LIVE_TITLE[e.kind]}${e.bet ? `. ${loserName} owes: ${e.bet}` : ""}`;
    case "quiz": return `🎲 ${senderName} started ${QUIZ_TITLE[e.kind]}. Your turn`;
    case "card": return `${DECK_TITLE[e.deck]}: ${e.text}`;
  }
}

/** The same id every time for the same seed, so a card can't be posted twice (even from two places). */
export async function stableId(seed: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ourspace-event:${seed}`))).slice(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50;   // version 5 style
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
