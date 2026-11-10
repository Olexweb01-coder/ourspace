import { db } from "@/lib/db";
import { fail, json } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

// One round trip: purge expired, mark me as seen, fetch changes + who's around.
export async function GET(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);

  const sinceRaw = new URL(req.url).searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  if (since && Number.isNaN(since.getTime())) return fail("Bad cursor");

  const sql = db();
  const results = await sql.transaction([
    sql`update messages set deleted = true, iv = '', ciphertext = '', reactions = '{}'::jsonb, updated_at = now()
        where space_id = ${me.spaceId} and deleted = false and expires_at is not null and expires_at < now()`,
    sql`update members set last_seen_at = now() where id = ${me.memberId}`,
    sql`select now() as now`,
    since
      // 3s overlap so commits that raced the last cursor are never missed; client de-dupes by id.
      ? sql`select msg.id::text as id, msg.sender_id, msg.kind, msg.view_once, msg.viewed_at, msg.deleted,
              msg.reactions, msg.expires_at, msg.created_at, msg.media_id,
              case when msg.deleted then null else msg.iv end as iv,
              case when msg.deleted then null else msg.ciphertext end as ciphertext,
              md.kept_by as media_kept_by, md.expires_at as media_expires_at,
              (msg.media_id is not null and (md.id is null or (md.expires_at is not null and md.expires_at < now()))) as media_gone
            from messages msg left join media md on md.id = msg.media_id
            where msg.space_id = ${me.spaceId}
              and msg.updated_at > ${since.toISOString()}::timestamptz - interval '3 seconds'
            order by msg.updated_at asc limit 500`
      : sql`select * from (
              select msg.id::text as id, msg.sender_id, msg.kind, msg.view_once, msg.viewed_at, msg.deleted,
                msg.reactions, msg.expires_at, msg.created_at, msg.media_id,
                case when msg.deleted then null else msg.iv end as iv,
                case when msg.deleted then null else msg.ciphertext end as ciphertext,
                md.kept_by as media_kept_by, md.expires_at as media_expires_at,
                (msg.media_id is not null and (md.id is null or (md.expires_at is not null and md.expires_at < now()))) as media_gone
              from messages msg left join media md on md.id = msg.media_id
              where msg.space_id = ${me.spaceId}
              order by msg.id desc limit 150) t
            order by id::bigint asc`,
    sql`select id, role, display_name, banned, notifications, last_seen_at, last_nudge_at, avatar_media_id
        from members where space_id = ${me.spaceId}`,
    sql`select label, disappear_seconds, theme, background_media_id from spaces where id = ${me.spaceId}`,
  ]);

  const [, , nowRows, messages, members, spaces] = results;
  return json({
    now: nowRows[0].now,
    me: { id: me.memberId, role: me.role, name: me.name, spaceId: me.spaceId },
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      name: m.display_name,
      banned: m.banned,
      notifications: m.notifications,
      lastSeenAt: m.last_seen_at,
      lastNudgeAt: m.last_nudge_at,
      avatarMediaId: m.avatar_media_id,
    })),
    space: {
      label: spaces[0]?.label,
      disappearSeconds: spaces[0]?.disappear_seconds ?? null,
      theme: spaces[0]?.theme ?? "candle",
      backgroundMediaId: spaces[0]?.background_media_id ?? null,
    },
    messages: messages.map((r) => ({
      id: r.id,
      senderId: r.sender_id,
      kind: r.kind,
      viewOnce: r.view_once,
      viewedAt: r.viewed_at,
      deleted: r.deleted,
      reactions: r.reactions ?? {},
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      iv: r.iv,
      ct: r.ciphertext,
      media: r.media_id
        ? { id: r.media_id, keptBy: r.media_kept_by, expiresAt: r.media_expires_at, gone: r.media_gone }
        : null,
    })),
  });
}
