import { db } from "@/lib/db";
import { B64_RE, fail, json, readJson } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

const EDIT_MINUTES = 15;
const MAX_CT = 60_000;

// Edit your own text message within 15 minutes. The new words arrive encrypted, like the original.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const { id } = await ctx.params;
  if (!/^\d{1,18}$/.test(id)) return fail("Not found", 404);
  const b = await readJson<{ iv?: string; ct?: string }>(req);
  const iv = b?.iv, ct = b?.ct;
  if (typeof iv !== "string" || iv.length > 32 || !B64_RE.test(iv)) return fail("Invalid message");
  if (typeof ct !== "string" || ct.length === 0 || ct.length > MAX_CT || !B64_RE.test(ct)) return fail("Message is too long");

  const sql = db();
  const rows = await sql`
    update messages set iv = ${iv}, ciphertext = ${ct}, edited_at = now(), updated_at = now()
    where id = ${id} and space_id = ${me.spaceId} and sender_id = ${me.memberId}
      and kind = 'text' and view_once = false and deleted = false
      and created_at > now() - make_interval(mins => ${EDIT_MINUTES})
    returning edited_at`;
  if (rows[0]) return json({ ok: true, editedAt: rows[0].edited_at });

  const m = (await sql`select sender_id, kind, view_once, deleted, created_at > now() - make_interval(mins => ${EDIT_MINUTES}) as fresh
                       from messages where id = ${id} and space_id = ${me.spaceId}`)[0];
  if (!m || m.deleted) return fail("That message is gone.", 404);
  if (m.sender_id !== me.memberId) return fail("You can only edit your own messages.", 403);
  if (m.kind !== "text" || m.view_once) return fail("Only text messages can be edited.", 400);
  return fail(`Messages can only be edited for ${EDIT_MINUTES} minutes after sending.`, 409);
}
