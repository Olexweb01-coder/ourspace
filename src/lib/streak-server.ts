import { db } from "./db";
import { computeStreak } from "./rituals";

export type StreakInfo = {
  today: string;
  current: number;
  best: number;
  todayDone: boolean;
  sentToday: string[];
  completeDays: string[];
};

/** Streak days are counted in the host's time zone. */
export async function getStreak(spaceId: string): Promise<StreakInfo> {
  const sql = db();
  const [days, todayRows] = await sql.transaction([
    sql`select day::text as day from activity_days
        where space_id = ${spaceId} and day > current_date - 800
        group by day having count(distinct member_id) >= 2
        order by day desc`,
    sql`with t as (
          select (now() at time zone coalesce(
            (select timezone from members where space_id = ${spaceId} and role = 'host'), 'Africa/Lagos'))::date as today)
        select t.today::text as today,
               coalesce((select array_agg(member_id::text) from activity_days a
                         where a.space_id = ${spaceId} and a.day = t.today), '{}') as sent_today,
               (select best_streak from spaces where id = ${spaceId}) as best
        from t`,
  ]);
  const completeDays = days.map((d) => d.day as string);
  const today = todayRows[0].today as string;
  const s = computeStreak(completeDays, today);
  return {
    today,
    current: s.current,
    best: Math.max(Number(todayRows[0].best ?? 0), s.longest, s.current),
    todayDone: s.todayDone,
    sentToday: todayRows[0].sent_today as string[],
    completeDays,
  };
}

/** Saves a time zone only if both the browser and Postgres understand it. */
export async function saveTimezone(memberId: string, tz: unknown): Promise<void> {
  if (typeof tz !== "string" || tz.length > 64 || !/^[A-Za-z_+\-/0-9]+$/.test(tz)) return;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    const sql = db();
    await sql`select now() at time zone ${tz}`;
    await sql`update members set timezone = ${tz} where id = ${memberId} and timezone <> ${tz}`;
  } catch {
    /* unknown zone: keep the old one */
  }
}
