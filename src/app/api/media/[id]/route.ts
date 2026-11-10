import { get } from "@vercel/blob";
import { db } from "@/lib/db";
import { fail, UUID_RE } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

export const maxDuration = 60;

// Streams an encrypted file to a member of its space. The phone decrypts it.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail("Not found", 404);

  const rows = await db()`
    select md.pathname, coalesce(msg.view_once, false) as view_once
    from media md left join messages msg on msg.id = md.message_id
    where md.id = ${id} and md.space_id = ${me.spaceId} and md.status = 'ready'
      and (md.expires_at is null or md.expires_at > now())`;
  const row = rows[0];
  if (!row) return fail("This file has expired.", 410);

  const result = await get(row.pathname, { access: "private" });
  if (!result || result.statusCode !== 200) return fail("This file has expired.", 410);

  return new Response(result.stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(result.blob.size),
      // Encrypted bytes never change, so the phone keeps them instead of downloading again.
      "Cache-Control": row.view_once ? "no-store" : "private, max-age=31536000, immutable",
    },
  });
}
