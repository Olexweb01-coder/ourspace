import { after } from "next/server";
import { db } from "@/lib/db";
import { removeMessageMedia } from "@/lib/media-server";
import { fail, json, readJson } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

// Delete for everyone (your own messages; any time): the words are wiped and any file is removed from storage.
// Delete for me: hidden on all your devices; your partner still has it.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const { id } = await ctx.params;
  if (!/^\d{1,18}$/.test(id)) return fail("Not found", 404);
  const b = await readJson<{ for?: string }>(req);
  const sql = db();

  if (b?.for === "everyone") {
    const rows = await sql`
      update messages set deleted = true, deleted_reason = 'removed', iv = '', ciphertext = '', reactions = '{}'::jsonb, updated_at = now()
      where id = ${id}::bigint and space_id = ${me.spaceId} and sender_id = ${me.memberId} and deleted = false
      returning id`;
    if (!rows[0]) {
      const m = (await sql`select sender_id from messages where id = ${id}::bigint and space_id = ${me.spaceId}`)[0];
      if (!m) return fail("That message is already gone.", 404);
      if (m.sender_id !== me.memberId) return fail("You can only delete your own messages for everyone.", 403);
      return json({ ok: true });   // already deleted
    }
    after(() => removeMessageMedia(id));
    return json({ ok: true });
  }

  if (b?.for === "me") {
    const rows = await sql`select id from messages where id = ${id}::bigint and space_id = ${me.spaceId}`;
    if (!rows[0]) return json({ ok: true });
    await sql`insert into hidden_messages (member_id, message_id) values (${me.memberId}, ${id}::bigint) on conflict do nothing`;
    await sql`update messages set updated_at = now() where id = ${id}::bigint`;   // so your other devices hear about it
    return json({ ok: true });
  }
  return fail("Choose who to delete it for.");
}
