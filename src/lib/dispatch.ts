import { db } from "./db";
import { daysBetween, nextOccurrence } from "./planner";
import { pushTo, type PushPayload } from "./push";

type Member = { id: string; display_name: string };
type Day = { id: string; kind: string; about_member: string | null; start_year: number | null };

/** What each person is told about a special day, 7 days before, the day before, and on the day. */
export function specialDayMessage(d: Day, left: number, occ: string, to: Member, members: Member[]): PushPayload | null {
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.display_name ?? "";
  const other = members.find((m) => m.id !== to.id)?.display_name;
  const tag = `day-${d.id}`;

  if (d.kind === "birthday" && d.about_member) {
    if (d.about_member === to.id) {
      // No spoilers for the birthday person, just a celebration on the day.
      return left === 0
        ? { title: `🎂 Happy birthday, ${to.display_name}!`, body: other ? `${other} and Our Space are celebrating you today.` : "Our Space is celebrating you today.", tag }
        : null;
    }
    const who = nameOf(d.about_member);
    if (left === 7) return { title: `🎂 ${who}'s birthday is in a week`, body: "Time to plan something lovely.", tag };
    if (left === 1) return { title: `🎂 ${who}'s birthday is tomorrow`, body: "Make sure you're ready to celebrate.", tag };
    return { title: `🎂 It's ${who}'s birthday today`, body: `Make ${who} feel celebrated.`, tag };
  }

  if (d.kind === "anniversary") {
    if (left === 7) return { title: "💞 Your anniversary is in a week", body: "Time to plan something together.", tag };
    if (left === 1) return { title: "💞 Your anniversary is tomorrow", body: "Get ready to celebrate each other.", tag };
    const years = d.start_year ? Number(occ.slice(0, 4)) - d.start_year : null;
    return {
      title: years && years > 0 ? `💞 Happy ${years} ${years === 1 ? "year" : "years"} together` : "💞 Happy anniversary",
      body: "Open Our Space and celebrate together.",
      tag,
    };
  }

  if (left === 7) return { title: "✨ A special day is a week away", body: "Open Our Space to see what it is.", tag };
  if (left === 1) return { title: "✨ A special day is tomorrow", body: "Open Our Space to see what it is.", tag };
  return { title: "✨ Today is a special day", body: "Open Our Space to celebrate it.", tag };
}

/**
 * Sends every reminder that is due. Safe to run as often as you like: each one is recorded and never sent twice.
 * Day-based reminders wait until 9:00 in the host's time zone so nobody is woken at midnight.
 */
export async function sendDueReminders(): Promise<number> {
  const sql = db();
  let sent = 0;

  const spaces = await sql`
    select s.id, (now() at time zone h.timezone)::date::text as today,
           extract(hour from (now() at time zone h.timezone))::int as hour
    from spaces s join members h on h.space_id = s.id and h.role = 'host'`;

  for (const sp of spaces) {
    if (sp.hour < 9) continue;
    const members = (await sql`select id, display_name from members where space_id = ${sp.id} and banned = false`) as Member[];

    const days = (await sql`select id, kind, about_member, month, day, start_year from special_days where space_id = ${sp.id}`) as (Day & { month: number; day: number })[];
    for (const d of days) {
      const occ = nextOccurrence(d.month, d.day, sp.today);
      const left = daysBetween(sp.today, occ);
      if (left !== 7 && left !== 1 && left !== 0) continue;
      const claimed = await sql`insert into sent_reminders (key) values (${`day:${d.id}:${occ}:${left}`}) on conflict do nothing returning key`;
      if (!claimed[0]) continue;
      for (const m of members) {
        const msg = specialDayMessage(d, left, occ, m, members);
        if (msg) { await pushTo(m.id, msg); sent++; }
      }
    }

    const goals = await sql`select id from goals where space_id = ${sp.id} and done_at is null and due_on = ${sp.today}::date`;
    for (const g of goals) {
      const claimed = await sql`insert into sent_reminders (key) values (${`goal:${g.id}:${sp.today}`}) on conflict do nothing returning key`;
      if (!claimed[0]) continue;
      for (const m of members) { await pushTo(m.id, { title: "🎯 One of your goals is due today", body: "Open Our Space to see it.", tag: "goal" }); sent++; }
    }
  }

  // Things to talk about, at the time you picked.
  const topics = await sql`
    update topics set reminded_at = now()
    where remind_at <= now() and reminded_at is null and discussed_at is null
    returning space_id, created_by, remind_both`;
  for (const t of topics) {
    const members = (await sql`select id, display_name from members where space_id = ${t.space_id} and banned = false`) as Member[];
    const creator = members.find((m) => m.id === t.created_by);
    for (const m of members) {
      if (!t.remind_both && m.id !== t.created_by) continue;
      await pushTo(m.id, m.id === t.created_by
        ? { title: "💬 Remember what you wanted to talk about", body: "Open Our Space to see it.", tag: "topic" }
        : { title: `💬 ${creator?.display_name ?? "Someone"} wants to talk tonight`, body: "Open Our Space to see what about.", tag: "topic" });
      sent++;
    }
  }

  // Care reminders from a shared cycle. Deliberately vague: the reason stays encrypted on your phones.
  const care = await sql`
    update care_reminders set sent_at = now()
    where sent_at is null and notify_at <= now() and notify_at > now() - interval '3 days'
    returning recipient, owner_id`;
  for (const c of care) {
    if (c.recipient === c.owner_id) {
      await pushTo(c.recipient, { title: "🌸 A gentle heads-up for you", body: "Open Our Space when you have a moment.", tag: "care" });
    } else {
      const owner = await sql`select display_name from members where id = ${c.owner_id}`;
      await pushTo(c.recipient, { title: `💗 Be extra gentle with ${owner[0]?.display_name ?? "them"} this week`, body: "Open Our Space to see why.", tag: "care" });
    }
    sent++;
  }
  return sent;
}
