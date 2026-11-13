import { db } from "@/lib/db";
import { claimMedia } from "@/lib/media-server";
import { B64_RE, fail, json, readJson } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

// Your profile: photo (shown in the joined circles), whether you're a man or a woman (for "him" and "her"),
// and what you call your partner (a nickname, encrypted on your phone; the server can't read it).
export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const body = await readJson<{ avatarMediaId?: string | null; gender?: string | null; nickname?: { iv?: string; ct?: string } | null }>(req);
  if (!body) return fail("Invalid request");
  const sql = db();

  if ("gender" in body) {
    const g = body.gender;
    if (g !== null && g !== "man" && g !== "woman") return fail("Choose man or woman.");
    await sql`update members set gender = ${g}::text where id = ${me.memberId}`;
    // Cycle tracking is only for women. A man's Cycle tab is a care page, so any entries he made are removed.
    if (g === "man") {
      await sql`delete from care_reminders where owner_id = ${me.memberId} and sent_at is null`;
      await sql`delete from cycles where member_id = ${me.memberId}`;
    }
  }

  if ("nickname" in body) {
    const n = body.nickname;
    if (n === null) {
      await sql`update members set nick_iv = null, nick_ct = null where id = ${me.memberId}`;
    } else {
      const ok = n && typeof n.iv === "string" && typeof n.ct === "string" && n.iv.length <= 32 && n.ct.length <= 400 && B64_RE.test(n.iv) && B64_RE.test(n.ct);
      if (!ok) return fail("That name didn't work. Try a shorter one.");
      await sql`update members set nick_iv = ${n!.iv!}, nick_ct = ${n!.ct!} where id = ${me.memberId}`;
    }
  }

  if ("avatarMediaId" in body) {
    let newId: string | null = null;
    if (body.avatarMediaId) {
      const claimed = await claimMedia(me, body.avatarMediaId, "avatar");
      if (!claimed) return fail("That photo didn't finish uploading. Try again.");
      newId = claimed.id;
      await sql`update media set expires_at = null where id = ${newId}`;
    }
    const old = await sql`select avatar_media_id from members where id = ${me.memberId}`;
    await sql`update members set avatar_media_id = ${newId}::uuid where id = ${me.memberId}`;
    if (old[0]?.avatar_media_id) await sql`update media set expires_at = now() where id = ${old[0].avatar_media_id}`;
  }
  return json({ ok: true });
}
