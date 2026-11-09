import { after } from "next/server";
import { db } from "@/lib/db";
import { pushTo } from "@/lib/push";
import { fail, json, readJson } from "@/lib/server-utils";
import { getMe, getPartnerId } from "@/lib/session";

type Sub = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const body = await readJson<{ subscription?: Sub }>(req);
  const sub = body?.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 1000 ||
      typeof p256dh !== "string" || p256dh.length > 200 || typeof auth !== "string" || auth.length > 100) {
    return fail("Invalid subscription");
  }

  const sql = db();
  await sql`
    insert into push_subscriptions (endpoint, member_id, p256dh, auth)
    values (${endpoint}, ${me.memberId}, ${p256dh}, ${auth})
    on conflict (endpoint) do update set member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth`;
  const rows = await sql`
    with prev as (select notifications from members where id = ${me.memberId})
    update members set notifications = 'on' where id = ${me.memberId}
    returning (select notifications from prev) as before`;

  if (rows[0]?.before === "off") {
    const partnerId = await getPartnerId(me);
    after(() => pushTo(partnerId, { title: `🔔 ${me.name}`, body: "Turned notifications back on.", tag: "notif" }));
  }
  return json({ ok: true });
}
