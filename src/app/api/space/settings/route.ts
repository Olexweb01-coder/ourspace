import { after } from "next/server";
import { db } from "@/lib/db";
import { THEMES } from "@/lib/media-limits";
import { claimMedia } from "@/lib/media-server";
import { pushTo, type PushPayload } from "@/lib/push";
import { fail, json, readJson } from "@/lib/server-utils";
import { getMe, getPartnerId } from "@/lib/session";

const DISAPPEAR: Record<string, string> = { "3600": "1 hour", "86400": "24 hours", "604800": "7 days" };

type Body = { disappearSeconds?: number | null; theme?: string; backgroundMediaId?: string | null };

// Shared space settings. Either of you can change them, and the other is told.
export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const body = await readJson<Body>(req);
  if (!body) return fail("Invalid request");
  const sql = db();
  let notice: PushPayload | null = null;

  if ("disappearSeconds" in body) {
    const value = body.disappearSeconds ?? null;
    if (value !== null && !DISAPPEAR[String(value)]) return fail("Pick 1 hour, 24 hours, 7 days or off.");
    const rows = await sql`
      update spaces set disappear_seconds = ${value}::int
      where id = ${me.spaceId} and disappear_seconds is distinct from ${value}::int
      returning id`;
    if (rows[0]) {
      notice = {
        title: `⏳ ${me.name}`,
        body: value === null ? "Turned disappearing messages off." : `New messages now disappear after ${DISAPPEAR[String(value)]}.`,
        tag: "settings",
      };
    }
  }

  if ("theme" in body) {
    if (!(THEMES as readonly string[]).includes(body.theme ?? "")) return fail("Unknown theme.");
    const rows = await sql`
      update spaces set theme = ${body.theme} where id = ${me.spaceId} and theme <> ${body.theme} returning id`;
    if (rows[0]) notice = { title: `🎨 ${me.name}`, body: "Changed your chat theme.", tag: "settings" };
  }

  if ("backgroundMediaId" in body) {
    let newId: string | null = null;
    if (body.backgroundMediaId) {
      const claimed = await claimMedia(me, body.backgroundMediaId, "background");
      if (!claimed) return fail("That photo didn't finish uploading. Try again.");
      newId = claimed.id;
      await sql`update media set expires_at = null where id = ${newId}`;
    }
    const old = await sql`select background_media_id from spaces where id = ${me.spaceId}`;
    await sql`update spaces set background_media_id = ${newId}::uuid where id = ${me.spaceId}`;
    if (old[0]?.background_media_id) {
      await sql`update media set expires_at = now() where id = ${old[0].background_media_id}`;
    }
    notice = { title: `🖼️ ${me.name}`, body: newId ? "Changed your chat background." : "Removed your chat background.", tag: "settings" };
  }

  if (notice) {
    const partnerId = await getPartnerId(me);
    const payload = notice;
    after(() => pushTo(partnerId, payload));
  }
  const s = await sql`select disappear_seconds, theme, background_media_id from spaces where id = ${me.spaceId}`;
  return json({
    disappearSeconds: s[0].disappear_seconds ?? null,
    theme: s[0].theme,
    backgroundMediaId: s[0].background_media_id ?? null,
  });
}
