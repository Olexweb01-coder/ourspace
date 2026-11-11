import { after } from "next/server";
import { db } from "@/lib/db";
import { applyAction, cleanSettings, isOver, LIVE_NAME, newState, PRESENT_SECONDS, viewFor, type LiveKind } from "@/lib/live/server";
import { pushTo } from "@/lib/push";
import { pron, type Gender } from "@/lib/pronouns";
import type { LudoState } from "@/lib/live/ludo";
import type { WhotState } from "@/lib/live/whot";
import { B64_RE, fail, json, readJson, UUID_RE } from "@/lib/server-utils";
import { getMe, type Me } from "@/lib/session";

async function ping(gameId: string, me: Me) {
  await db()`insert into live_presence (game_id, member_id, pinged_at) values (${gameId}, ${me.memberId}, now())
             on conflict (game_id, member_id) do update set pinged_at = now()`;
}

async function load(id: string, me: Me) {
  const rows = await db()`select id, kind, status, state, version, created_by, settings, bets, ready from live_games where id = ${id} and space_id = ${me.spaceId}`;
  return rows[0] ?? null;
}

async function bothHere(id: string): Promise<boolean> {
  const rows = await db()`select count(*)::int as n from live_presence
                          where game_id = ${id} and pinged_at > now() - make_interval(secs => ${PRESENT_SECONDS})`;
  return rows[0].n >= 2;
}

// Opening the table (and staying on it) says "I'm here". When you're both here and both ready, the game starts.
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
    const ready = (g.ready ?? []) as string[];
    if (people.length === 2 && people.every((p) => ready.includes(p.id))) {
      const first = g.created_by && people.some((p) => p.id === g.created_by) ? g.created_by : people[0].id;
      const second = people.find((p) => p.id !== first)!.id;
      const state = newState(g.kind as LiveKind, first, second, g.settings);
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
  // ---- before the game: settings, bets, ready ----
  if (g.status === "lobby") {
    const sql = db();
    if (body.action === "settings") {
      if (g.created_by !== me.memberId) return fail("Whoever opened the table sets the rules.", 403);
      const settings = cleanSettings(g.kind as LiveKind, (body as { settings?: unknown }).settings);
      await sql`update live_games set settings = ${JSON.stringify(settings)}::jsonb, ready = '{}', updated_at = now() where id = ${id} and status = 'lobby'`;
    } else if (body.action === "bet") {
      const b = body as { iv?: string; ct?: string };
      if (b.iv && b.ct) {
        if (b.iv.length > 32 || !B64_RE.test(b.iv) || b.ct.length > 2000 || !B64_RE.test(b.ct)) return fail("Invalid bet");
        await sql`update live_games set bets = bets || jsonb_build_object(${me.memberId}::text, jsonb_build_object('iv', ${b.iv}::text, 'ct', ${b.ct}::text)),
                  ready = '{}', updated_at = now() where id = ${id} and status = 'lobby'`;
      } else {
        await sql`update live_games set bets = bets - ${me.memberId}::text, ready = '{}', updated_at = now() where id = ${id} and status = 'lobby'`;
      }
    } else if (body.action === "ready") {
      if ((body as { ready?: boolean }).ready) {
        await sql`update live_games set ready = array_append(array_remove(ready, ${me.memberId}::text), ${me.memberId}::text), updated_at = now() where id = ${id} and status = 'lobby'`;
      } else {
        await sql`update live_games set ready = array_remove(ready, ${me.memberId}::text), updated_at = now() where id = ${id} and status = 'lobby'`;
      }
    } else {
      return fail("The game hasn't started yet.", 409);
    }
    await ping(id, me);
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

  // A winner: the loser now owes whatever the winner bet (the words stay encrypted).
  const winner = (next as { winner?: string | null }).winner ?? null;
  if (done && winner) {
    const sql = db();
    const loser = (await sql`select id, display_name from members where space_id = ${me.spaceId} and id <> ${winner} and banned = false limit 1`)[0];
    const w = (await sql`select display_name, gender from members where id = ${winner}`)[0];
    const bet = (g.bets ?? {})[winner] as { iv: string; ct: string } | undefined;
    if (loser && bet) {
      await sql`insert into love_debts (space_id, game_id, kind, owed_by, owed_to, iv, ciphertext)
                values (${me.spaceId}, ${id}, ${g.kind}, ${loser.id}, ${winner}, ${bet.iv}, ${bet.ct})`;
    }
    if (loser) {
      const o = pron((w?.gender ?? null) as Gender).obj;
      after(() => pushTo(loser.id, {
        title: `🏆 ${w?.display_name ?? "They"} won ${LIVE_NAME[g.kind as LiveKind]}`,
        body: bet ? `You owe ${o} your bet. Pay up with love.` : "Rematch?",
        tag: "live",
      }));
    }
  }
  return json(await viewFor(id, me.memberId));
}
