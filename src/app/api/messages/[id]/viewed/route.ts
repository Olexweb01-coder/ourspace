import { after } from "next/server";
import { db } from "@/lib/db";
import { pushTo } from "@/lib/push";
import { fail, json } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

// The receiver opened a view-once message: the ciphertext is wiped from the server for good.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const { id } = await ctx.params;
  if (!/^\d{1,18}$/.test(id)) return fail("Unknown message", 404);

  const rows = await db()`
    update messages set viewed_at = now(), deleted = true, iv = '', ciphertext = '', updated_at = now()
    where id = ${id}::bigint and space_id = ${me.spaceId} and view_once = true
      and sender_id <> ${me.memberId} and deleted = false
    returning sender_id`;
  if (rows[0]) {
    after(() => pushTo(rows[0].sender_id, { title: `👀 ${me.name}`, body: "Opened your view-once message.", tag: "viewed" }));
  }
  return json({ ok: true });
}
