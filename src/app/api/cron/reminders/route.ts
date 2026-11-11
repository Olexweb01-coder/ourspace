import { sendDueReminders } from "@/lib/dispatch";
import { fail, json, safeEqual } from "@/lib/server-utils";

export const maxDuration = 60;

// Can be called often (e.g. every 15 minutes from cron-job.org) so reminders arrive on time.
// Accepts "Authorization: Bearer <CRON_SECRET>" or "?key=<CRON_SECRET>".
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET || "";
  const header = req.headers.get("authorization") || "";
  const key = new URL(req.url).searchParams.get("key") || "";
  const allowed = !!secret && (safeEqual(header, `Bearer ${secret}`) || safeEqual(key, secret));
  if (!allowed) return fail("Unauthorized", 401);
  return json({ ok: true, sent: await sendDueReminders() });
}
