import { randomInt } from "crypto";
import { db } from "@/lib/db";
import { initLudo, ludoMove, ludoRoll, type LudoState } from "./ludo";
import { initWhot, whotDraw, whotPlay, whotView, type Card, type WhotState } from "./whot";

export const PRESENT_SECONDS = 8;
export type LiveKind = "ludo" | "whot";
export const LIVE_NAME: Record<LiveKind, string> = { ludo: "Ludo", whot: "Whot" };

/** Fair shuffle and dice from the server's secure random numbers, never from a phone. */
export function shuffle(cards: Card[]): Card[] {
  const a = [...cards];
  for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const rollDie = () => randomInt(1, 7);

export function newState(kind: LiveKind, first: string, second: string): LudoState | WhotState {
  const starter = randomInt(2) === 0 ? first : second;
  return kind === "ludo" ? initLudo(first, second, starter) : initWhot(first, second, starter, shuffle);
}

export function applyAction(kind: LiveKind, state: LudoState | WhotState, me: string, a: { action?: string; token?: number; index?: number; call?: string | null }) {
  if (kind === "ludo") {
    const s = state as LudoState;
    if (a.action === "roll") return ludoRoll(s, me, rollDie());
    if (a.action === "move") return ludoMove(s, me, Number(a.token));
  } else {
    const s = state as WhotState;
    if (a.action === "play") return whotPlay(s, me, Number(a.index), a.call ?? null, shuffle);
    if (a.action === "draw") return whotDraw(s, me, shuffle);
  }
  throw new Error("Unknown move.");
}

export const isOver = (s: LudoState | WhotState) => ("ended" in s ? !!s.ended || !!s.winner : !!s.winner);

/** Everything one player may see. In Whot, never the other hand or the market order. */
export async function viewFor(gameId: string, me: string) {
  const sql = db();
  const rows = await sql`
    select g.id, g.kind, g.status, g.state, g.version, g.created_by,
           coalesce((select json_agg(json_build_object('id', m.id, 'name', m.display_name,
             'present', exists (select 1 from live_presence p where p.game_id = g.id and p.member_id = m.id
                                and p.pinged_at > now() - make_interval(secs => ${PRESENT_SECONDS})))
             order by m.role) from members m where m.space_id = g.space_id and m.banned = false), '[]'::json) as people
    from live_games g where g.id = ${gameId}`;
  const g = rows[0];
  if (!g) return null;
  const state = g.state && g.kind === "whot" ? whotView(g.state as WhotState, me) : g.state;
  return { id: g.id, kind: g.kind as LiveKind, status: g.status, version: g.version, createdBy: g.created_by, people: g.people, state };
}
