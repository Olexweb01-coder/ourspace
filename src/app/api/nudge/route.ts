import { after } from "next/server";
import { db } from "@/lib/db";
import { pushTo } from "@/lib/push";
import { fail, json } from "@/lib/server-utils";
import { getMe, getPartnerId } from "@/lib/session";

export async function POST() {
  const me = await getMe();
  if (!me) return fail("Locked", 401);

  const rows = await db()`
    update members set last_nudge_at = now()
    where id = ${me.memberId} and (last_nudge_at is null or last_nudge_at < now() - interval '30 seconds')
    returning last_nudge_at`;
  if (!rows[0]) return fail("One nudge every 30 seconds — let it land.", 429);

  const partnerId = await getPartnerId(me);
  after(() => pushTo(partnerId, { title: `💗 ${me.name} is nudging you`, body: "Come online, I'm waiting for you.", tag: "nudge" }));
  return json({ ok: true });
}
