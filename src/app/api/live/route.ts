import { randomUUID } from "crypto";
import { after } from "next/server";
import { db } from "@/lib/db";
import { LIVE_NAME, type LiveKind } from "@/lib/live/server";
import { pushTo } from "@/lib/push";
import { fail, json, readJson } from "@/lib/server-utils";
import { getMe, getPartnerId } from "@/lib/session";

// The live table for this space: at most one at a time.
async function current(spaceId: string) {
  const sql = db();
  // Tables nobody joined within 30 minutes, or games left alone for a day, are closed.
  await sql`update live_games set status = 'done'
            where space_id = ${spaceId} and status <> 'done'
              and ((status = 'lobby' and updated_at < now() - interval '30 minutes') or updated_at < now() - interval '24 hours')`;
  const rows = await sql`select id, kind, status, created_by from live_games
                         where space_id = ${spaceId} and status in ('lobby','playing') order by updated_at desc limit 1`;
  return rows[0] ?? null;
}

export async function GET() {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const g = await current(me.spaceId);
  return json({ live: g ? { id: g.id, kind: g.kind, status: g.status, createdBy: g.created_by } : null });
}

export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const b = await readJson<{ kind?: string }>(req);
  if (b?.kind !== "ludo" && b?.kind !== "whot") return fail("Unknown game.");
  const kind = b.kind as LiveKind;
  const partnerId = await getPartnerId(me);
  if (!partnerId) return fail("Live games need two players. Invite your partner first.");

  const existing = await current(me.spaceId);
  if (existing) {
    if (existing.kind === kind) return json({ id: existing.id, created: false });
    return fail(`Finish or end your ${LIVE_NAME[existing.kind as LiveKind]} game first.`, 409);
  }
  const id = randomUUID();
  const sql = db();
  await sql`insert into live_games (id, space_id, kind, created_by) values (${id}, ${me.spaceId}, ${kind}, ${me.memberId})`;
  await sql`insert into live_presence (game_id, member_id) values (${id}, ${me.memberId})`;
  after(() => pushTo(partnerId, { title: `🎲 ${me.name} wants to play ${LIVE_NAME[kind]} now`, body: "Join while they're here.", tag: "live", open: `live:${kind}:${id}` }));
  return json({ id, created: true });
}
