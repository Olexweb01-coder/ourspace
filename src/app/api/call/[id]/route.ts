import { after } from "next/server";
import { settleCalls } from "@/lib/calls";
import { db } from "@/lib/db";
import { pushTo } from "@/lib/push";
import { B64_RE, fail, json, readJson, UUID_RE } from "@/lib/server-utils";
import { getMe, type Me } from "@/lib/session";

async function load(id: string, me: Me) {
  const rows = await db()`select id, caller_id, callee_id, kind, status, created_at, answered_at, ended_at from calls
                          where id = ${id} and space_id = ${me.spaceId} and (caller_id = ${me.memberId} or callee_id = ${me.memberId})`;
  return rows[0] ?? null;
}
const view = (c: Record<string, unknown>) => ({ id: c.id, callerId: c.caller_id, calleeId: c.callee_id, kind: c.kind, status: c.status,
  createdAt: c.created_at, answeredAt: c.answered_at, endedAt: c.ended_at });

// Polled during a call: its state, plus any new (encrypted) setup messages from the other phone.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail("Not found", 404);
  const missed = await settleCalls(me.spaceId);
  for (const m of missed) after(() => pushTo(m.callee_id, { title: "Missed call", body: `You missed a ${m.kind} call.`, tag: "call" }));
  const c = await load(id, me);
  if (!c) return fail("Not found", 404);
  const after_ = Number(new URL(req.url).searchParams.get("after") || 0);
  const signals = await db()`select id, type, iv, ciphertext from call_signals
                             where call_id = ${id} and from_member <> ${me.memberId} and id > ${Number.isFinite(after_) ? after_ : 0}
                             order by id limit 20`;
  return json({ call: view(c), signals: signals.map((s) => ({ id: Number(s.id), type: s.type, iv: s.iv, ct: s.ciphertext })) });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail("Not found", 404);
  const b = await readJson<{ action?: string; type?: string; iv?: string; ct?: string }>(req);
  const c = await load(id, me);
  if (!c) return fail("Not found", 404);
  const sql = db();
  const done = (s: string) => ["ended", "missed", "declined", "busy"].includes(s);

  switch (b?.action) {
    case "signal": {
      if (done(c.status as string)) return fail("This call has ended.", 409);
      if (!["offer", "answer", "restart", "restart-answer"].includes(b.type ?? "")) return fail("Invalid signal");
      if (typeof b.iv !== "string" || b.iv.length > 32 || !B64_RE.test(b.iv) || typeof b.ct !== "string" || b.ct.length > 40_000 || !B64_RE.test(b.ct)) return fail("Invalid signal");
      await sql`insert into call_signals (call_id, from_member, type, iv, ciphertext) values (${id}, ${me.memberId}, ${b.type}, ${b.iv}, ${b.ct})`;
      return json({ ok: true });
    }
    case "answer": {
      if (c.callee_id !== me.memberId) return fail("Only the one being called can answer.", 403);
      const rows = await sql`update calls set status = 'active', answered_at = now() where id = ${id} and status = 'ringing' returning id`;
      if (!rows[0]) return fail("This call isn't ringing any more.", 409);
      return json({ call: view((await load(id, me))!) });
    }
    case "decline": {
      await sql`update calls set status = 'declined', ended_at = now() where id = ${id} and status = 'ringing' and callee_id = ${me.memberId}`;
      return json({ call: view((await load(id, me))!) });
    }
    case "end": {
      // Hanging up before an answer counts as a missed call for the other person.
      const rows = await sql`update calls set status = case when status = 'ringing' then 'missed' else 'ended' end, ended_at = now()
                             where id = ${id} and status in ('ringing','active') returning status, caller_id, callee_id, kind`;
      if (rows[0]?.status === "missed" && rows[0].caller_id === me.memberId) {
        after(() => pushTo(rows[0].callee_id, { title: `Missed call from ${me.name}`, body: `${rows[0].kind === "video" ? "Video" : "Voice"} call.`, tag: "call" }));
      }
      after(() => sql`delete from call_signals where call_id = ${id}`);
      return json({ call: view((await load(id, me))!) });
    }
  }
  return fail("Unknown action");
}
