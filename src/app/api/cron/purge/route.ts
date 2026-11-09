import { db } from "@/lib/db";
import { fail, json, safeEqual } from "@/lib/server-utils";

// Vercel Cron calls this daily with "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET || "";
  const header = req.headers.get("authorization") || "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) return fail("Unauthorized", 401);

  const sql = db();
  await sql.transaction([
    sql`update messages set deleted = true, iv = '', ciphertext = '', reactions = '{}'::jsonb, updated_at = now()
        where deleted = false and expires_at is not null and expires_at < now()`,
    sql`delete from messages where deleted = true and updated_at < now() - interval '30 days'`,
    sql`delete from sessions where expires_at < now()`,
    sql`delete from invites where expires_at < now() or used_at < now() - interval '30 days'`,
  ]);
  return json({ ok: true });
}
