import { after } from "next/server";
import { db } from "@/lib/db";
import { isNotifyKey } from "@/lib/notify-prefs";
import { pron, type Gender } from "@/lib/pronouns";
import { pushTo } from "@/lib/push";
import { fail, json, readJson } from "@/lib/server-utils";
import { getMe, getPartnerId } from "@/lib/session";

// Choose which notifications you get. Turning message notifications off (or back on) tells your partner.
export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const b = await readJson<{ off?: unknown; quiet?: unknown }>(req);
  if (!b || !Array.isArray(b.off) || !b.off.every(isNotifyKey) || typeof b.quiet !== "boolean") return fail("Invalid request");
  const off = [...new Set(b.off as string[])];
  const sql = db();
  const before = (await sql`select notify_off, gender from members where id = ${me.memberId}`)[0];
  await sql`update members set notify_off = ${off}, notify_quiet = ${b.quiet} where id = ${me.memberId}`;
  const wasOff = ((before?.notify_off as string[]) ?? []).includes("messages");
  const nowOff = off.includes("messages");
  if (wasOff !== nowOff) {
    const partnerId = await getPartnerId(me);
    const p = pron((before?.gender ?? null) as Gender);
    after(() => pushTo(partnerId, nowOff
      ? { title: `🔕 ${me.name} turned off notifications for messages`, body: `Your messages will wait for ${p.obj} in the app.`, tag: "notif" }
      : { title: `🔔 ${me.name}`, body: "Notifications for messages are back on.", tag: "notif" }));
  }
  return json({ ok: true, off, quiet: b.quiet });
}
