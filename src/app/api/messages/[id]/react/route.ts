import { after } from "next/server";
import { db } from "@/lib/db";
import { pushTo } from "@/lib/push";
import { fail, json, readJson } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const { id } = await ctx.params;
  if (!/^\d{1,18}$/.test(id)) return fail("Unknown message", 404);

  const body = await readJson<{ reaction?: string | null }>(req);
  const reaction = body?.reaction ?? null;
  if (reaction !== null && reaction !== "love" && reaction !== "angry") return fail("Only love or angry.");

  const rows = await db()`
    update messages set
      reactions = case when ${reaction}::text is null
                       then reactions - ${me.memberId}::text
                       else reactions || jsonb_build_object(${me.memberId}::text, ${reaction}::text) end,
      updated_at = now()
    where id = ${id}::bigint and space_id = ${me.spaceId} and deleted = false
    returning sender_id`;
  if (!rows[0]) return fail("That message is gone.", 404);

  const senderId: string = rows[0].sender_id;
  if (reaction && senderId !== me.memberId) {
    after(() => pushTo(senderId, reaction === "love"
      ? { title: `❤️ ${me.name}`, body: "Loved your message.", tag: "reaction" }
      : { title: `😠 ${me.name}`, body: "Is angry about your message. Go talk.", tag: "reaction" }));
  }
  return json({ ok: true });
}
