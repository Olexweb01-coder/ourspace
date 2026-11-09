import { after } from "next/server";
import { db } from "@/lib/db";
import { pushTo } from "@/lib/push";
import { fail, json, readJson } from "@/lib/server-utils";
import { getMe, getPartnerId } from "@/lib/session";

const ALLOWED: Record<string, string> = { "3600": "1 hour", "86400": "24 hours", "604800": "7 days" };

export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const body = await readJson<{ disappearSeconds?: number | null }>(req);
  const value = body?.disappearSeconds ?? null;
  if (value !== null && !ALLOWED[String(value)]) return fail("Pick 1 hour, 24 hours, 7 days or off.");

  const rows = await db()`
    update spaces set disappear_seconds = ${value}::int
    where id = ${me.spaceId} and disappear_seconds is distinct from ${value}::int
    returning id`;

  if (rows[0]) {
    const partnerId = await getPartnerId(me);
    after(() => pushTo(partnerId, {
      title: `⏳ ${me.name}`,
      body: value === null ? "Turned disappearing messages off." : `New messages now disappear after ${ALLOWED[String(value)]}.`,
      tag: "settings",
    }));
  }
  return json({ disappearSeconds: value });
}
