import { db } from "./db";
import { pushTo } from "./push";
import { missingDay } from "./rituals";
import { getStreak } from "./streak-server";

/** Evening nudge to whoever hasn't sent anything yet, when a streak of 2+ days would break at midnight. */
export async function sendStreakReminders(): Promise<number> {
  const sql = db();
  const spaces = await sql`select id from spaces`;
  let sent = 0;
  for (const s of spaces) {
    const streak = await getStreak(s.id);
    if (streak.current < 2 || streak.todayDone) continue;
    const members = await sql`select id, display_name from members where space_id = ${s.id} and banned = false`;
    if (members.length < 2) continue;
    for (const m of members) {
      if (streak.sentToday.includes(m.id)) continue;
      const other = members.find((x) => x.id !== m.id);
      await pushTo(m.id, {
        title: `❤️ Your ${streak.current}-day streak ends at midnight`,
        body: `Send ${other?.display_name ?? "them"} something before the day is over.`,
        tag: "streak",
      });
      sent++;
    }
  }
  return sent;
}

/** Tells someone who's been away that the other one misses them: day 1, 2, 3, 5, 7, then weekly. */
export async function sendMissingYou(): Promise<number> {
  const sql = db();
  const away = await sql`
    select m.id, p.display_name as partner_name,
           floor(extract(epoch from now() - m.last_seen_at) / 86400)::int as days
    from members m
    join members p on p.space_id = m.space_id and p.id <> m.id and p.banned = false
    where m.banned = false
      and m.last_seen_at < now() - interval '23 hours'
      and p.last_seen_at > m.last_seen_at
      and (m.last_missing_push_at is null or m.last_missing_push_at < now() - interval '20 hours')`;
  let sent = 0;
  for (const a of away) {
    const days = Math.max(1, Number(a.days));
    if (!missingDay(days)) continue;
    await pushTo(a.id, {
      title: `💗 ${a.partner_name} misses you`,
      body: days === 1 ? "It's been a day. Come say hi." : `It's been ${days} days. Your space is waiting.`,
      tag: "missing",
    });
    await sql`update members set last_missing_push_at = now() where id = ${a.id}`;
    sent++;
  }
  return sent;
}
