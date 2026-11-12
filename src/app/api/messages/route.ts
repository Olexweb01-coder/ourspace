import { after } from "next/server";
import { db } from "@/lib/db";
import { MEDIA_DAYS } from "@/lib/media-limits";
import { claimMedia } from "@/lib/media-server";
import { pushTo } from "@/lib/push";
import { isMilestone } from "@/lib/rituals";
import { getStreak } from "@/lib/streak-server";
import { B64_RE, fail, json, readJson, UUID_RE } from "@/lib/server-utils";
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

  const body = await readJson<{ iv?: string; ct?: string; viewOnce?: boolean; kind?: string; mediaId?: string; clientId?: string }>(req);
  const iv = body?.iv;
  const ct = body?.ct;
  if (typeof iv !== "string" || iv.length > 32 || !B64_RE.test(iv)) return fail("Invalid message");
  if (typeof ct !== "string" || ct.length === 0 || ct.length > MAX_CT || !B64_RE.test(ct)) return fail("Message is too long");
  const viewOnce = body?.viewOnce === true;
  const kind = (KINDS as readonly string[]).includes(body?.kind ?? "text") ? (body?.kind ?? "text") as Kind : null;
  if (!kind) return fail("Invalid message");

  const sql = db();
  // A retry of the same send (same tag from the phone) returns the first copy instead of making a second.
  // Checked before the file is claimed, so a retry of a photo that already went through still succeeds.
  const clientId = typeof body?.clientId === "string" && UUID_RE.test(body.clientId) ? body.clientId : null;
  if (clientId) {
    const dup = await sql`select id::text as id, created_at, expires_at from messages where sender_id = ${me.memberId} and client_id = ${clientId}::uuid`;
    if (dup[0]) return json({ id: dup[0].id, createdAt: dup[0].created_at, expiresAt: dup[0].expires_at, mediaExpiresAt: null });
  }

  let mediaId: string | null = null;
  if (kind !== "text") {
    const claimed = await claimMedia(me, body?.mediaId, "message");
    if (!claimed) return fail("The file didn't finish uploading. Try sending it again.");
    mediaId = claimed.id;
  }
  const rows = await sql`
    insert into messages (space_id, sender_id, kind, iv, ciphertext, view_once, expires_at, media_id, client_id)
    select s.id, ${me.memberId}, ${kind}, ${iv}, ${ct}, ${viewOnce},
           case when s.disappear_seconds is null then null else now() + make_interval(secs => s.disappear_seconds) end,
           ${mediaId}::uuid, ${clientId}::uuid
    from spaces s where s.id = ${me.spaceId}
    on conflict (sender_id, client_id) where client_id is not null do nothing
    returning id::text as id, created_at, expires_at`;
  if (!rows[0] && clientId) {
    const dup = await sql`select id::text as id, created_at, expires_at from messages where sender_id = ${me.memberId} and client_id = ${clientId}::uuid`;
    return json({ id: dup[0].id, createdAt: dup[0].created_at, expiresAt: dup[0].expires_at, mediaExpiresAt: null });
  }
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

  // Streaks: the first thing each of you sends on a day counts. When the second person sends, the day is complete.
  const firstToday = await sql`
    insert into activity_days (space_id, member_id, day)
    select ${me.spaceId}, ${me.memberId}, (now() at time zone h.timezone)::date
    from members h where h.space_id = ${me.spaceId} and h.role = 'host'
    on conflict do nothing
    returning day`;
  let streak: { current: number; todayDone: boolean } | null = null;
  if (firstToday[0]) {
    const s = await getStreak(me.spaceId);
    streak = { current: s.current, todayDone: s.todayDone };
    if (s.todayDone) {
      await sql`update spaces set best_streak = greatest(best_streak, ${s.current}) where id = ${me.spaceId}`;
      if (isMilestone(s.current) && partnerId) {
        const names = await sql`select id, display_name from members where space_id = ${me.spaceId}`;
        const nameOf = (id: string) => names.find((n) => n.id === id)?.display_name ?? "your love";
        const n = s.current;
        after(async () => {
          await pushTo(me.memberId, { title: `❤️ ${n} days in a row`, body: `You and ${nameOf(partnerId)} haven't missed a day. Come celebrate.`, tag: "milestone" });
          await pushTo(partnerId, { title: `❤️ ${n} days in a row`, body: `You and ${me.name} haven't missed a day. Come celebrate.`, tag: "milestone" });
        });
      }
    }
  }

  after(() => pushTo(partnerId, {
    title: `💌 ${me.name}`,
    body: viewOnce ? "Sent you something to see once." : PUSH_BODY[kind],
    tag: "message",
  }));

  return json({ id: msg.id, createdAt: msg.created_at, expiresAt: msg.expires_at, mediaExpiresAt, streak });
}
