import { runCleanup } from "@/lib/cleanup";
import { sendMissingYou, sendStreakReminders } from "@/lib/reminders";
import { fail, json, safeEqual } from "@/lib/server-utils";

export const maxDuration = 60;

// Vercel Cron, every evening (19:00 UTC = 20:00 in Lagos): streak warnings, missing-you, clean-up.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET || "";
  const header = req.headers.get("authorization") || "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) return fail("Unauthorized", 401);

  const result: Record<string, unknown> = {};
  for (const [name, job] of [
    ["streakReminders", sendStreakReminders],
    ["missingYou", sendMissingYou],
    ["cleanup", runCleanup],
  ] as const) {
    try {
      result[name] = await job();
    } catch (err) {
      console.error(`cron ${name} failed`, err);
      result[name] = "failed";
    }
  }
  return json({ ok: true, ...result });
}
