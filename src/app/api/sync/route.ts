import { RING_SECONDS, STALE_HOURS } from "@/lib/calls";
import { after } from "next/server";
import { pushTo } from "@/lib/push";
import { db } from "@/lib/db";
import { fail, json } from "@/lib/server-utils";
import { computeStreak } from "@/lib/rituals";
import { getMe } from "@/lib/session";

// One round trip: purge expired, mark me as seen, fetch changes + who's around.
export async function GET(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);

  const sinceRaw = new URL(req.url).searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;
  if (since && Number.isNaN(since.getTime())) return fail("Bad cursor");

  const sql = db();
  // Everything in ONE round trip to the database (fewer trips = faster on weak networks).
  const results = await sql.transaction([
    // unanswered calls become missed; abandoned calls end (same rules as lib/calls.ts)
    sql`update calls set status = 'missed', ended_at = now()
        where space_id = ${me.spaceId} and status = 'ringing' and created_at < now() - make_interval(secs => ${RING_SECONDS})
        returning id, caller_id, callee_id, kind`,
    sql`update calls set status = 'ended', ended_at = now()
        where space_id = ${me.spaceId} and status = 'active' and created_at < now() - make_interval(hours => ${STALE_HOURS})`,
    sql`update messages set deleted = true, iv = '', ciphertext = '', reactions = '{}'::jsonb, updated_at = now()
        where space_id = ${me.spaceId} and deleted = false and expires_at is not null and expires_at < now()`,
    sql`update members set last_seen_at = now() where id = ${me.memberId}`,
    sql`select now() as now`,
    since
      // 3s overlap so commits that raced the last cursor are never missed; client de-dupes by id.
      ? sql`select msg.id::text as id, msg.sender_id, msg.kind, msg.view_once, msg.viewed_at, msg.deleted,
              msg.reactions, msg.expires_at, msg.created_at, msg.edited_at, msg.deleted_reason, msg.client_id,
              exists (select 1 from hidden_messages h where h.message_id = msg.id and h.member_id = ${me.memberId}) as hidden_for_me, msg.media_id,
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
                msg.reactions, msg.expires_at, msg.created_at, msg.edited_at, msg.deleted_reason, msg.client_id,
              exists (select 1 from hidden_messages h where h.message_id = msg.id and h.member_id = ${me.memberId}) as hidden_for_me, msg.media_id,
                case when msg.deleted then null else msg.iv end as iv,
                case when msg.deleted then null else msg.ciphertext end as ciphertext,
                md.kept_by as media_kept_by, md.expires_at as media_expires_at,
                (msg.media_id is not null and (md.id is null or (md.expires_at is not null and md.expires_at < now()))) as media_gone
              from messages msg left join media md on md.id = msg.media_id
              where msg.space_id = ${me.spaceId}
              order by msg.id desc limit 150) t
            order by id::bigint asc`,
    sql`select id, role, display_name, banned, notifications, notify_off, notify_quiet, last_seen_at, last_nudge_at, avatar_media_id,
          (typing_until > now()) as typing, gender
        from members where space_id = ${me.spaceId}`,
    sql`select label, disappear_seconds, theme, background_media_id, best_streak from spaces where id = ${me.spaceId}`,
    sql`select day::text as day from activity_days
        where space_id = ${me.spaceId} and day > current_date - 800
        group by day having count(distinct member_id) >= 2 order by day desc`,
    sql`with t as (
          select (now() at time zone coalesce(
            (select timezone from members where space_id = ${me.spaceId} and role = 'host'), 'Africa/Lagos'))::date as today)
        select t.today::text as today,
               coalesce((select array_agg(member_id::text) from activity_days a
                         where a.space_id = ${me.spaceId} and a.day = t.today), '{}') as sent_today
        from t`,
    sql`select member_id, day::text as day, iv, ciphertext, updated_at from moods
        where space_id = ${me.spaceId} and day >= current_date - 8 order by day`,
    sql`select id, kind, about_member, month, day, start_year, iv, ciphertext from special_days where space_id = ${me.spaceId}`,
    sql`select member_id, iv, ciphertext from cycles where space_id = ${me.spaceId}`,
    sql`select g.id, g.kind, g.created_by from games g
        where g.space_id = ${me.spaceId} and g.finished_at is null
          and not exists (select 1 from game_answers a where a.game_id = g.id and a.member_id = ${me.memberId})`,
    sql`delete from statuses where space_id = ${me.spaceId} and expires_at < now()`,
    sql`select id, member_id, media_id, iv, ciphertext, created_at, expires_at, seen_at from statuses
        where space_id = ${me.spaceId} and expires_at > now() order by created_at`,
    sql`select g.id, g.kind, g.status, g.created_by,
          exists (select 1 from live_presence p where p.game_id = g.id and p.member_id <> ${me.memberId}
                  and p.pinged_at > now() - interval '8 seconds') as partner_here
        from live_games g
        where g.space_id = ${me.spaceId} and g.status in ('lobby','playing') and g.updated_at > now() - interval '30 minutes'
        order by g.updated_at desc limit 1`,
    sql`select id, caller_id, callee_id, kind, status, created_at, answered_at, ended_at from calls
        where space_id = ${me.spaceId} and created_at > now() - interval '30 days' order by created_at desc limit 40`,
  ]);

  const [missedNow, , , , nowRows, messages, members, spaces, streakDays, todayRows, moods, specialDays, cycles, gamesWaiting, , statuses, liveRows, callRows] = results;
  for (const m of missedNow) after(() => pushTo(m.callee_id, { title: "Missed call", body: `You missed a ${m.kind} call.`, tag: "call" }));
  const completeDays = streakDays.map((d) => d.day as string);
  const today = todayRows[0].today as string;
  const st = computeStreak(completeDays, today);
  return json({
    now: nowRows[0].now,
    me: { id: me.memberId, role: me.role, name: me.name, spaceId: me.spaceId },
    members: members.map((m) => ({
      id: m.id,
      role: m.role,
      name: m.display_name,
      banned: m.banned,
      notifications: m.notifications,
      notifyOff: m.notify_off ?? [],
      notifyQuiet: m.notify_quiet === true,
      lastSeenAt: m.last_seen_at,
      lastNudgeAt: m.last_nudge_at,
      avatarMediaId: m.avatar_media_id,
      typing: m.typing === true,
      gender: m.gender ?? null,
    })),
    space: {
      label: spaces[0]?.label,
      disappearSeconds: spaces[0]?.disappear_seconds ?? null,
      theme: spaces[0]?.theme ?? "candle",
      backgroundMediaId: spaces[0]?.background_media_id ?? null,
    },
    streak: {
      today,
      current: st.current,
      best: Math.max(Number(spaces[0]?.best_streak ?? 0), st.longest, st.current),
      todayDone: st.todayDone,
      sentToday: todayRows[0].sent_today as string[],
    },
    specialDays: specialDays.map((d) => ({ id: d.id, kind: d.kind, aboutMember: d.about_member, month: d.month, day: d.day, startYear: d.start_year, iv: d.iv, ct: d.ciphertext })),
    statuses: statuses.map((st) => ({
      id: st.id, memberId: st.member_id, mediaId: st.media_id, iv: st.iv, ct: st.ciphertext,
      createdAt: st.created_at, expiresAt: st.expires_at, seenAt: st.seen_at,
    })),
    calls: callRows.map((c) => ({ id: c.id, callerId: c.caller_id, calleeId: c.callee_id, kind: c.kind, status: c.status,
      createdAt: c.created_at, answeredAt: c.answered_at, endedAt: c.ended_at })),
    live: liveRows[0] ? { id: liveRows[0].id, kind: liveRows[0].kind, status: liveRows[0].status, createdBy: liveRows[0].created_by, partnerHere: liveRows[0].partner_here } : null,
    gamesWaiting: gamesWaiting.map((g) => ({ id: g.id, kind: g.kind, createdBy: g.created_by })),
    cycles: cycles.map((c) => ({ memberId: c.member_id, iv: c.iv, ct: c.ciphertext })),
    moods: moods.map((m) => ({ memberId: m.member_id, day: m.day, iv: m.iv, ct: m.ciphertext, updatedAt: m.updated_at })),
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
      editedAt: r.edited_at ?? null,
      deletedReason: r.deleted_reason ?? null,
      clientId: r.client_id ?? null,
      hidden: r.hidden_for_me === true,
      iv: r.iv,
      ct: r.ciphertext,
      media: r.media_id
        ? { id: r.media_id, keptBy: r.media_kept_by, expiresAt: r.media_expires_at, gone: r.media_gone }
        : null,
    })),
  });
}
