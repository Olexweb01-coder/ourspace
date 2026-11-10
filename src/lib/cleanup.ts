import { db } from "./db";
import { deleteBlobs } from "./media-server";

/** Daily housekeeping: disappear expired messages, remove expired files, old sessions and invites. */
export async function runCleanup(): Promise<{ filesRemoved: number }> {
  const sql = db();
  await sql`update messages set deleted = true, iv = '', ciphertext = '', reactions = '{}'::jsonb, updated_at = now()
            where deleted = false and expires_at is not null and expires_at < now()`;

  let filesRemoved = 0;
  for (let round = 0; round < 5; round++) {
    const rows = await sql`
      select id, pathname from media
      where (expires_at is not null and expires_at < now())
         or (status = 'pending' and created_at < now() - interval '1 day')
      limit 1000`;
    if (rows.length === 0) break;
    await deleteBlobs(rows.map((r) => r.pathname as string));
    await sql`delete from media where id = any(${rows.map((r) => r.id as string)}::uuid[])`;
    filesRemoved += rows.length;
  }

  await sql.transaction([
    sql`delete from messages where deleted = true and updated_at < now() - interval '30 days'`,
    sql`delete from sessions where expires_at < now()`,
    sql`delete from invites where expires_at < now() or used_at < now() - interval '30 days'`,
    sql`delete from moods where day < current_date - 400`,
  ]);
  return { filesRemoved };
}
