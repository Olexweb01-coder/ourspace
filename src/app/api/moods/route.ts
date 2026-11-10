import { after } from "next/server";
import { db } from "@/lib/db";
import { pushTo } from "@/lib/push";
import { B64_RE, fail, json, readJson } from "@/lib/server-utils";
import { getMe, getPartnerId } from "@/lib/session";

// Saves today's feeling. It's encrypted on the phone, so the server and the notification never say which one.
export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const body = await readJson<{ day?: string; iv?: string; ct?: string }>(req);
  const day = body?.day ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail("Invalid day");
  const diff = Math.abs(Date.parse(`${day}T12:00:00Z`) - Date.now()) / 86_400_000;
  if (!(diff < 2)) return fail("Invalid day");
  if (typeof body?.iv !== "string" || body.iv.length > 32 || !B64_RE.test(body.iv)) return fail("Invalid feeling");
  if (typeof body?.ct !== "string" || body.ct.length > 500 || !B64_RE.test(body.ct)) return fail("Invalid feeling");

  const rows = await db()`
    insert into moods (space_id, member_id, day, iv, ciphertext)
    values (${me.spaceId}, ${me.memberId}, ${day}::date, ${body.iv}, ${body.ct})
    on conflict (member_id, day) do update set iv = excluded.iv, ciphertext = excluded.ciphertext, updated_at = now()
    returning (xmax = 0) as inserted`;

  const partnerId = await getPartnerId(me);
  after(() => pushTo(partnerId, {
    title: `${me.name} ${rows[0].inserted ? "shared" : "changed"} today's feeling`,
    body: "Open Our Space to see how they feel.",
    tag: "mood",
  }));
  return json({ ok: true });
}
