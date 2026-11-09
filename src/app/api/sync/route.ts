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
      ? sql`select id::text as id, sender_id, kind, view_once, viewed_at, deleted, reactions, expires_at, created_at,
                   case when deleted then null else iv end as iv,
                   case when deleted then null else ciphertext end as ciphertext
            from messages where space_id = ${me.spaceId} and updated_at > ${since.toISOString()}::timestamptz - interval '3 seconds'
            order by updated_at asc limit 500`
      : sql`select * from (select id::text as id, sender_id, kind, view_once, viewed_at, deleted, reactions, expires_at, created_at,
                   case when deleted then null else iv end as iv,
                   case when deleted then null else ciphertext end as ciphertext
            from messages where space_id = ${me.spaceId} order by messages.id desc limit 150) t
            order by id::bigint asc`,
    sql`select id, role, display_name, banned, notifications, last_seen_at, last_nudge_at
        from members where space_id = ${me.spaceId}`,
    sql`select label, disappear_seconds from spaces where id = ${me.spaceId}`,
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
    })),
    space: { label: spaces[0]?.label, disappearSeconds: spaces[0]?.disappear_seconds ?? null },
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
    })),
  });
}
