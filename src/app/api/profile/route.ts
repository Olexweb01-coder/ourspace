import { db } from "@/lib/db";
import { claimMedia } from "@/lib/media-server";
import { fail, json, readJson } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

// Sets or removes your profile picture (shown in the joined circles).
export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const body = await readJson<{ avatarMediaId?: string | null }>(req);
  const sql = db();

  let newId: string | null = null;
  if (body?.avatarMediaId) {
    const claimed = await claimMedia(me, body.avatarMediaId, "avatar");
    if (!claimed) return fail("That photo didn't finish uploading. Try again.");
    newId = claimed.id;
    await sql`update media set expires_at = null where id = ${newId}`;
  }

  const old = await sql`select avatar_media_id from members where id = ${me.memberId}`;
  await sql`update members set avatar_media_id = ${newId}::uuid where id = ${me.memberId}`;
  if (old[0]?.avatar_media_id) {
    await sql`update media set expires_at = now() where id = ${old[0].avatar_media_id}`;
  }
  return json({ avatarMediaId: newId });
}
