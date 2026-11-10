import { after } from "next/server";
import { db } from "@/lib/db";
import { MEDIA_DAYS } from "@/lib/media-limits";
import { claimMedia } from "@/lib/media-server";
import { pushTo } from "@/lib/push";
import { B64_RE, fail, json, readJson } from "@/lib/server-utils";
import { getMe, getPartnerId } from "@/lib/session";

const MAX_CT = 60_000; // base64 chars: text, or a file's description + tiny preview
const KINDS = ["text", "photo", "video", "voice", "file"] as const;
type Kind = (typeof KINDS)[number];

const PUSH_BODY: Record<Kind, string> = {
  text: "Sent you a message.",
  photo: "Sent you a photo.",
  video: "Sent you a video.",
  voice: "Sent you a voice note.",
  file: "Sent you a file.",
};

export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);

  const body = await readJson<{ iv?: string; ct?: string; viewOnce?: boolean; kind?: string; mediaId?: string }>(req);
  const iv = body?.iv;
  const ct = body?.ct;
  if (typeof iv !== "string" || iv.length > 32 || !B64_RE.test(iv)) return fail("Invalid message");
  if (typeof ct !== "string" || ct.length === 0 || ct.length > MAX_CT || !B64_RE.test(ct)) return fail("Message is too long");
  const viewOnce = body?.viewOnce === true;
  const kind = (KINDS as readonly string[]).includes(body?.kind ?? "text") ? (body?.kind ?? "text") as Kind : null;
  if (!kind) return fail("Invalid message");

  let mediaId: string | null = null;
  if (kind !== "text") {
    const claimed = await claimMedia(me, body?.mediaId, "message");
    if (!claimed) return fail("The file didn't finish uploading. Try sending it again.");
    mediaId = claimed.id;
  }

  const sql = db();
  const rows = await sql`
    insert into messages (space_id, sender_id, kind, iv, ciphertext, view_once, expires_at, media_id)
    select s.id, ${me.memberId}, ${kind}, ${iv}, ${ct}, ${viewOnce},
           case when s.disappear_seconds is null then null else now() + make_interval(secs => s.disappear_seconds) end,
           ${mediaId}::uuid
    from spaces s where s.id = ${me.spaceId}
    returning id::text as id, created_at, expires_at`;
  const msg = rows[0];

  let mediaExpiresAt: string | null = null;
  if (mediaId) {
    // Files last 30 days, or less if the message disappears sooner.
    const m = await sql`
      update media set message_id = ${msg.id}::bigint,
        expires_at = least(now() + make_interval(days => ${MEDIA_DAYS}), ${msg.expires_at}::timestamptz)
      where id = ${mediaId}
      returning expires_at`;
    mediaExpiresAt = m[0]?.expires_at ?? null;
  }

  const partnerId = await getPartnerId(me);
  after(() => pushTo(partnerId, {
    title: `💌 ${me.name}`,
    body: viewOnce ? "Sent you something to see once." : PUSH_BODY[kind],
    tag: "message",
  }));

  return json({ id: msg.id, createdAt: msg.created_at, expiresAt: msg.expires_at, mediaExpiresAt });
}
