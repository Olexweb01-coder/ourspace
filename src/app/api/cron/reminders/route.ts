import { runCleanup } from "@/lib/cleanup";
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
  const sent = await sendDueReminders();
  // Runs every 15 minutes, so expired statuses and their photos leave storage promptly.
  const cleaned = await runCleanup().catch(() => null);
  return json({ ok: true, sent, cleaned });
}
