import { after } from "next/server";
import { db } from "@/lib/db";
import { pushTo } from "@/lib/push";
import { fail, json, readJson, UUID_RE } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

// Love debts: what the loser of a live game owes the winner.
export async function GET() {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const rows = await db()`
    select id, game_id, kind, owed_by, owed_to, iv, ciphertext, created_at, paid_at from love_debts
    where space_id = ${me.spaceId} order by paid_at nulls first, created_at desc limit 60`;
  return json({ debts: rows.map((r) => ({ id: r.id, gameId: r.game_id, kind: r.kind, owedBy: r.owed_by, owedTo: r.owed_to, iv: r.iv, ct: r.ciphertext, createdAt: r.created_at, paidAt: r.paid_at })) });
}

// Only the one who is owed can mark it paid, or let it go.
export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const b = await readJson<{ action?: string; id?: string }>(req);
  if (!b?.id || !UUID_RE.test(b.id)) return fail("Invalid request");
  const sql = db();
  if (b.action === "paid") {
    const rows = await sql`update love_debts set paid_at = now() where id = ${b.id} and space_id = ${me.spaceId} and owed_to = ${me.memberId} and paid_at is null returning owed_by`;
    if (!rows[0]) return fail("Only the one who won can mark it paid.", 403);
    after(() => pushTo(rows[0].owed_by, { title: `❤️ ${me.name} says you paid up`, body: "Debt of love settled. Rematch?", tag: "debt" }));
    return json({ ok: true });
  }
  if (b.action === "forgive") {
    const rows = await sql`delete from love_debts where id = ${b.id} and space_id = ${me.spaceId} and owed_to = ${me.memberId} and paid_at is null returning owed_by`;
    if (!rows[0]) return fail("Only the one who won can let it go.", 403);
    after(() => pushTo(rows[0].owed_by, { title: `💗 ${me.name} let you off`, body: "One love debt forgiven.", tag: "debt" }));
    return json({ ok: true });
  }
  return fail("Unknown action");
}
