import { db } from "@/lib/db";
import { deleteBlobs } from "@/lib/media-server";
import { fail, json, safeEqual } from "@/lib/server-utils";

export const maxDuration = 60;

// Vercel Cron calls this daily with "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET || "";
  const header = req.headers.get("authorization") || "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) return fail("Unauthorized", 401);

  const sql = db();
  // 1. Messages past their time disappear (their files are marked to go with them by a trigger).
  await sql`update messages set deleted = true, iv = '', ciphertext = '', reactions = '{}'::jsonb, updated_at = now()
            where deleted = false and expires_at is not null and expires_at < now()`;

  // 2. Files past 30 days, opened view-once files, replaced photos and abandoned uploads leave storage.
  let removed = 0;
  for (let round = 0; round < 5; round++) {
    const rows = await sql`
      select id, pathname from media
      where (expires_at is not null and expires_at < now())
         or (status = 'pending' and created_at < now() - interval '1 day')
      limit 1000`;
    if (rows.length === 0) break;
    await deleteBlobs(rows.map((r) => r.pathname as string));
    await sql`delete from media where id = any(${rows.map((r) => r.id as string)}::uuid[])`;
    removed += rows.length;
  }

  await sql.transaction([
    sql`delete from messages where deleted = true and updated_at < now() - interval '30 days'`,
    sql`delete from sessions where expires_at < now()`,
    sql`delete from invites where expires_at < now() or used_at < now() - interval '30 days'`,
  ]);
  return json({ ok: true, filesRemoved: removed });
}
