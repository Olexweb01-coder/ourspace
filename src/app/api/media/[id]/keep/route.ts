import { db } from "@/lib/db";
import { MEDIA_DAYS } from "@/lib/media-limits";
import { fail, json, readJson, UUID_RE } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

// Keep: the file (and its message) stay until someone unkeeps it.
// Unkeep: it goes back to the 30-day clock (at least one more day, so it never vanishes instantly).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail("Not found", 404);
  const body = await readJson<{ keep?: boolean }>(req);
  const keep = body?.keep === true;
  const sql = db();

  const rows = keep
    ? await sql`
        update media md set kept_by = ${me.memberId}, expires_at = null
        where md.id = ${id} and md.space_id = ${me.spaceId} and md.purpose = 'message' and md.status = 'ready'
          and (md.expires_at is null or md.expires_at > now())
          and not exists (select 1 from messages m where m.id = md.message_id and (m.view_once or m.deleted))
        returning md.message_id, md.expires_at`
    : await sql`
        update media md set kept_by = null,
          expires_at = greatest(md.created_at + make_interval(days => ${MEDIA_DAYS}), now() + interval '1 day')
        where md.id = ${id} and md.space_id = ${me.spaceId} and md.kept_by is not null
        returning md.message_id, md.expires_at`;
  if (!rows[0]) return fail(keep ? "This file can't be kept anymore." : "This file isn't kept.", 409);

  if (rows[0].message_id) {
    if (keep) {
      await sql`update messages set expires_at = null, updated_at = now() where id = ${rows[0].message_id}`;
    } else {
      await sql`update messages set updated_at = now() where id = ${rows[0].message_id}`;
    }
  }
  return json({ kept: keep, expiresAt: rows[0].expires_at });
}
