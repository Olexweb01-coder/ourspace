import { db } from "@/lib/db";
import { applyAction, isOver, newState, PRESENT_SECONDS, viewFor, type LiveKind } from "@/lib/live/server";
import type { LudoState } from "@/lib/live/ludo";
import type { WhotState } from "@/lib/live/whot";
import { fail, json, readJson, UUID_RE } from "@/lib/server-utils";
import { getMe, type Me } from "@/lib/session";

async function ping(gameId: string, me: Me) {
  await db()`insert into live_presence (game_id, member_id, pinged_at) values (${gameId}, ${me.memberId}, now())
             on conflict (game_id, member_id) do update set pinged_at = now()`;
}

async function load(id: string, me: Me) {
  const rows = await db()`select id, kind, status, state, version, created_by from live_games where id = ${id} and space_id = ${me.spaceId}`;
  return rows[0] ?? null;
}

async function bothHere(id: string): Promise<boolean> {
  const rows = await db()`select count(*)::int as n from live_presence
                          where game_id = ${id} and pinged_at > now() - make_interval(secs => ${PRESENT_SECONDS})`;
  return rows[0].n >= 2;
}

// Opening the table (and staying on it) says "I'm here". When you're both here, the game starts.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail("Not found", 404);
  const g = await load(id, me);
  if (!g) return fail("This game has ended.", 404);
  if (g.status !== "done") await ping(id, me);

  if (g.status === "lobby" && (await bothHere(id))) {
    const people = await db()`select id from members where space_id = ${me.spaceId} and banned = false order by role`;
    if (people.length === 2) {
      const first = g.created_by && people.some((p) => p.id === g.created_by) ? g.created_by : people[0].id;
      const second = people.find((p) => p.id !== first)!.id;
      const state = newState(g.kind as LiveKind, first, second);
      await db()`update live_games set status = 'playing', state = ${JSON.stringify(state)}::jsonb, version = version + 1, updated_at = now()
                 where id = ${id} and status = 'lobby'`;
    }
  }
  return json(await viewFor(id, me.memberId));
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail("Not found", 404);
  const body = await readJson<{ action?: string; version?: number; token?: number; index?: number; call?: string | null }>(req);
  if (!body?.action) return fail("Invalid request");
  const g = await load(id, me);
  if (!g) return fail("This game has ended.", 404);

  if (body.action === "end") {
    await db()`update live_games set status = 'done', updated_at = now() where id = ${id} and status <> 'done'`;
    return json(await viewFor(id, me.memberId));
  }
  if (g.status !== "playing" || !g.state) return fail("The game hasn't started yet.", 409);
  await ping(id, me);
  if (!(await bothHere(id))) return fail("Paused. You can only play while you're both here.", 409);
  if (body.version !== g.version) return fail("stale", 409);

  let next: LudoState | WhotState;
  try {
    next = applyAction(g.kind as LiveKind, g.state as LudoState | WhotState, me.memberId, body);
  } catch (err) {
    return fail((err as Error).message || "That move isn't allowed.");
  }
  const done = isOver(next);
  const saved = await db()`
    update live_games set state = ${JSON.stringify(next)}::jsonb, version = version + 1, updated_at = now(),
      status = ${done ? "done" : "playing"}
    where id = ${id} and version = ${g.version}
    returning id`;
  if (!saved[0]) return fail("stale", 409);
  return json(await viewFor(id, me.memberId));
}
