import { db } from "@/lib/db";
import { MONTHLY_UPLOAD_LIMIT, STORE_LIMIT_BYTES } from "@/lib/media-limits";
import { fail, json } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

export async function GET() {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const rows = await db()`
    select coalesce(sum(size) filter (where space_id = ${me.spaceId}), 0)::bigint as space_bytes,
           coalesce(sum(size) filter (where space_id = ${me.spaceId} and expires_at is null), 0)::bigint as kept_bytes,
           coalesce(sum(size), 0)::bigint as total_bytes,
           count(*) filter (where created_at >= date_trunc('month', now()))::int as uploads_this_month
    from media`;
  const r = rows[0];
  return json({
    spaceBytes: Number(r.space_bytes),
    keptBytes: Number(r.kept_bytes),
    totalBytes: Number(r.total_bytes),
    limitBytes: STORE_LIMIT_BYTES,
    uploadsThisMonth: r.uploads_this_month,
    uploadLimit: MONTHLY_UPLOAD_LIMIT,
  });
}
