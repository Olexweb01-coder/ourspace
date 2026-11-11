import { after } from "next/server";
import { db } from "@/lib/db";
import { claimMedia } from "@/lib/media-server";
import { pushTo } from "@/lib/push";
import { B64_RE, fail, json, readJson, UUID_RE } from "@/lib/server-utils";
import { getMe, getPartnerId } from "@/lib/session";

// Statuses: just for the two of you, gone after 24 hours (the photo too).
export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const b = await readJson<{ action?: string; id?: string; iv?: string; ct?: string; mediaId?: string }>(req);
  const id = typeof b?.id === "string" && UUID_RE.test(b.id) ? b.id : null;
  if (!b?.action || !id) return fail("Invalid request");
  const sql = db();

  if (b.action === "post") {
    if (typeof b.iv !== "string" || b.iv.length > 32 || !B64_RE.test(b.iv)) return fail("Invalid status");
    if (typeof b.ct !== "string" || !b.ct || b.ct.length > 8000 || !B64_RE.test(b.ct)) return fail("Invalid status");
    const live = await sql`select count(*)::int as n from statuses where member_id = ${me.memberId} and expires_at > now()`;
    if (live[0].n >= 30) return fail("That's a lot of statuses for one day. Let some expire first.");
    let mediaId: string | null = null;
    if (b.mediaId) {
      const claimed = await claimMedia(me, b.mediaId, "status");
      if (!claimed) return fail("The photo didn't finish uploading. Try again.");
      mediaId = claimed.id;
      await sql`update media set expires_at = now() + interval '24 hours' where id = ${mediaId}`;
    }
    await sql`
      insert into statuses (id, space_id, member_id, media_id, iv, ciphertext)
      values (${id}, ${me.spaceId}, ${me.memberId}, ${mediaId}::uuid, ${b.iv}, ${b.ct})
      on conflict (id) do nothing`;
    const partnerId = await getPartnerId(me);
    after(() => pushTo(partnerId, { title: `✨ ${me.name} posted a status`, body: "It disappears in 24 hours.", tag: "status" }));
    return json({ ok: true });
  }

  if (b.action === "seen") {
    await sql`update statuses set seen_at = now()
              where id = ${id} and space_id = ${me.spaceId} and member_id <> ${me.memberId} and seen_at is null`;
    return json({ ok: true });
  }

  if (b.action === "delete") {
    const rows = await sql`delete from statuses where id = ${id} and member_id = ${me.memberId} returning media_id`;
    if (rows[0]?.media_id) await sql`update media set expires_at = now() where id = ${rows[0].media_id}`;
    return json({ ok: true });
  }
  return fail("Unknown action");
}
