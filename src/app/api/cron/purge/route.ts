import { runCleanup } from "@/lib/cleanup";
import { fail, json, safeEqual } from "@/lib/server-utils";

export const maxDuration = 60;

// Kept for manual runs. The scheduled job is /api/cron/daily.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET || "";
  const header = req.headers.get("authorization") || "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) return fail("Unauthorized", 401);
  return json({ ok: true, ...(await runCleanup()) });
}
