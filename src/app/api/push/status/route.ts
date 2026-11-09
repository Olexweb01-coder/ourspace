import { after } from "next/server";
import { db } from "@/lib/db";
import { pushTo } from "@/lib/push";
import { fail, json, readJson } from "@/lib/server-utils";
import { getMe, getPartnerId } from "@/lib/session";

// Called when this device notices its notifications are off, so the partner is told honestly.
export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const body = await readJson<{ state?: string }>(req);
  if (body?.state !== "off") return fail("Invalid state");

  const rows = await db()`
    update members set notifications = 'off'
    where id = ${me.memberId} and notifications <> 'off'
    returning id`;
  if (rows[0]) {
    const partnerId = await getPartnerId(me);
    after(() => pushTo(partnerId, {
      title: `🔕 ${me.name} turned notifications off`,
      body: "They won't get alerts until they switch them back on.",
      tag: "notif",
    }));
  }
  return json({ ok: true });
}
