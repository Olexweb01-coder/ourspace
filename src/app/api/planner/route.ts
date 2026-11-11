import { after } from "next/server";
import { db } from "@/lib/db";
import { validMonthDay } from "@/lib/planner";
import { pushTo, type PushPayload } from "@/lib/push";
import { B64_RE, fail, json, readJson, UUID_RE } from "@/lib/server-utils";
import { getMe, getPartnerId } from "@/lib/session";

type Body = Record<string, unknown> & { action?: string };

const okCipher = (iv: unknown, ct: unknown, max = 4000) =>
  typeof iv === "string" && iv.length <= 32 && B64_RE.test(iv) &&
  typeof ct === "string" && ct.length > 0 && ct.length <= max && B64_RE.test(ct);
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// Everything for the planner in one read: special days, goals, topics and cycles. All encrypted.
export async function GET() {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const sql = db();
  const [days, goals, topics, cycles] = await sql.transaction([
    sql`select id, kind, about_member, month, day, start_year, iv, ciphertext from special_days where space_id = ${me.spaceId}`,
    sql`select id, created_by, due_on::text as due_on, done_at, done_by, iv, ciphertext, created_at from goals
        where space_id = ${me.spaceId} order by created_at`,
    sql`select id, created_by, remind_at, remind_both, reminded_at, discussed_at, iv, ciphertext, created_at from topics
        where space_id = ${me.spaceId} order by created_at`,
    sql`select member_id, iv, ciphertext from cycles where space_id = ${me.spaceId}`,
  ]);
  return json({
    specialDays: days.map((d) => ({ id: d.id, kind: d.kind, aboutMember: d.about_member, month: d.month, day: d.day, startYear: d.start_year, iv: d.iv, ct: d.ciphertext })),
    goals: goals.map((g) => ({ id: g.id, createdBy: g.created_by, dueOn: g.due_on, doneAt: g.done_at, doneBy: g.done_by, iv: g.iv, ct: g.ciphertext, createdAt: g.created_at })),
    topics: topics.map((t) => ({ id: t.id, createdBy: t.created_by, remindAt: t.remind_at, remindBoth: t.remind_both, remindedAt: t.reminded_at, discussedAt: t.discussed_at, iv: t.iv, ct: t.ciphertext, createdAt: t.created_at })),
    cycles: cycles.map((c) => ({ memberId: c.member_id, iv: c.iv, ct: c.ciphertext })),
  });
}

export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const b = await readJson<Body>(req);
  if (!b?.action) return fail("Invalid request");
  const sql = db();
  const id = typeof b.id === "string" && UUID_RE.test(b.id) ? b.id : null;
  let notice: PushPayload | null = null;

  switch (b.action) {
    case "saveDay": {
      const kind = b.kind;
      if (!id || (kind !== "birthday" && kind !== "anniversary" && kind !== "special")) return fail("Invalid day");
      const month = Number(b.month), day = Number(b.day);
      if (!validMonthDay(month, day)) return fail("That date doesn't exist.");
      const startYear = b.startYear == null ? null : Number(b.startYear);
      if (startYear !== null && !(Number.isInteger(startYear) && startYear >= 1900 && startYear <= 2200)) return fail("Invalid year");
      let about: string | null = null;
      if (kind === "birthday") {
        if (typeof b.aboutMember !== "string" || !UUID_RE.test(b.aboutMember)) return fail("Whose birthday is it?");
        const m = await sql`select id from members where id = ${b.aboutMember} and space_id = ${me.spaceId}`;
        if (!m[0]) return fail("Whose birthday is it?");
        about = b.aboutMember;
      }
      if (!okCipher(b.iv, b.ct)) return fail("Invalid day");
      const count = await sql`select count(*)::int as n from special_days where space_id = ${me.spaceId}`;
      if (count[0].n >= 60) return fail("That's a lot of special days. Remove one first.");
      const rows = await sql`
        insert into special_days (id, space_id, created_by, kind, about_member, month, day, start_year, iv, ciphertext)
        values (${id}, ${me.spaceId}, ${me.memberId}, ${kind}, ${about}::uuid, ${month}, ${day}, ${startYear}::int, ${b.iv as string}, ${b.ct as string})
        on conflict (id) do update set kind = excluded.kind, about_member = excluded.about_member, month = excluded.month,
          day = excluded.day, start_year = excluded.start_year, iv = excluded.iv, ciphertext = excluded.ciphertext, updated_at = now()
        where special_days.space_id = excluded.space_id
        returning id`;
      if (!rows[0]) return fail("Invalid day");
      break;
    }
    case "deleteDay":
      if (!id) return fail("Invalid day");
      await sql`delete from special_days where id = ${id} and space_id = ${me.spaceId}`;
      break;

    case "saveGoal": {
      if (!id || !okCipher(b.iv, b.ct, 2000)) return fail("Invalid goal");
      const dueOn = b.dueOn == null || b.dueOn === "" ? null : b.dueOn;
      if (dueOn !== null && !isDay(dueOn)) return fail("Invalid date");
      const count = await sql`select count(*)::int as n from goals where space_id = ${me.spaceId}`;
      if (count[0].n >= 300) return fail("Too many goals. Remove some finished ones first.");
      const rows = await sql`
        insert into goals (id, space_id, created_by, due_on, iv, ciphertext)
        values (${id}, ${me.spaceId}, ${me.memberId}, ${dueOn}::date, ${b.iv as string}, ${b.ct as string})
        on conflict (id) do update set due_on = excluded.due_on, iv = excluded.iv, ciphertext = excluded.ciphertext, updated_at = now()
        where goals.space_id = excluded.space_id
        returning (xmax = 0) as inserted`;
      if (!rows[0]) return fail("Invalid goal");
      if (rows[0].inserted) notice = { title: `🎯 ${me.name} added a goal for you both`, body: "Open Our Space to see it.", tag: "goal" };
      break;
    }
    case "toggleGoal": {
      if (!id) return fail("Invalid goal");
      const done = b.done === true;
      const rows = await sql`
        update goals set done_at = ${done ? new Date().toISOString() : null}::timestamptz,
          done_by = ${done ? me.memberId : null}::uuid, updated_at = now()
        where id = ${id} and space_id = ${me.spaceId} and (done_at is null) = ${done}
        returning id`;
      if (rows[0] && done) notice = { title: `🎯 ${me.name} ticked off one of your goals`, body: "Open Our Space to celebrate.", tag: "goal" };
      break;
    }
    case "deleteGoal":
      if (!id) return fail("Invalid goal");
      await sql`delete from goals where id = ${id} and space_id = ${me.spaceId}`;
      break;

    case "saveTopic": {
      if (!id || !okCipher(b.iv, b.ct, 2000)) return fail("Invalid topic");
      let remindAt: string | null = null;
      if (b.remindAt != null && b.remindAt !== "") {
        const t = Date.parse(String(b.remindAt));
        if (Number.isNaN(t) || t > Date.now() + 400 * 86_400_000) return fail("Pick a reminder time within a year.");
        remindAt = new Date(t).toISOString();
      }
      const count = await sql`select count(*)::int as n from topics where space_id = ${me.spaceId}`;
      if (count[0].n >= 300) return fail("Too many topics. Remove some you've talked about.");
      const rows = await sql`
        insert into topics (id, space_id, created_by, remind_at, remind_both, iv, ciphertext)
        values (${id}, ${me.spaceId}, ${me.memberId}, ${remindAt}::timestamptz, ${b.remindBoth === true}, ${b.iv as string}, ${b.ct as string})
        on conflict (id) do update set remind_at = excluded.remind_at, remind_both = excluded.remind_both,
          reminded_at = case when topics.remind_at is distinct from excluded.remind_at then null else topics.reminded_at end,
          iv = excluded.iv, ciphertext = excluded.ciphertext, updated_at = now()
        where topics.space_id = excluded.space_id
        returning (xmax = 0) as inserted`;
      if (!rows[0]) return fail("Invalid topic");
      if (rows[0].inserted) notice = { title: `💬 ${me.name} wants to talk about something`, body: "It's in Things to talk about.", tag: "topic" };
      break;
    }
    case "toggleTopic": {
      if (!id) return fail("Invalid topic");
      await sql`
        update topics set discussed_at = ${b.discussed === true ? new Date().toISOString() : null}::timestamptz, updated_at = now()
        where id = ${id} and space_id = ${me.spaceId}`;
      break;
    }
    case "deleteTopic":
      if (!id) return fail("Invalid topic");
      await sql`delete from topics where id = ${id} and space_id = ${me.spaceId}`;
      break;

    case "saveCycle": {
      if (!okCipher(b.iv, b.ct, 8000)) return fail("Invalid data");
      await sql`
        insert into cycles (member_id, space_id, iv, ciphertext) values (${me.memberId}, ${me.spaceId}, ${b.iv as string}, ${b.ct as string})
        on conflict (member_id) do update set iv = excluded.iv, ciphertext = excluded.ciphertext, updated_at = now()`;
      // Replace this person's upcoming care reminders. They carry no reason, only a time and a recipient.
      await sql`delete from care_reminders where owner_id = ${me.memberId} and sent_at is null`;
      const care = Array.isArray(b.care) ? b.care.slice(0, 4) : [];
      const partnerId = await getPartnerId(me);
      for (const c of care as { who?: string; at?: string }[]) {
        const t = Date.parse(String(c?.at));
        if (Number.isNaN(t) || t < Date.now() - 3_600_000 || t > Date.now() + 120 * 86_400_000) continue;
        const recipient = c?.who === "partner" ? partnerId : me.memberId;
        if (!recipient) continue;
        await sql`insert into care_reminders (space_id, owner_id, recipient, notify_at)
                  values (${me.spaceId}, ${me.memberId}, ${recipient}, ${new Date(t).toISOString()}::timestamptz)`;
      }
      break;
    }
    default:
      return fail("Unknown action");
  }

  if (notice) {
    const partnerId = await getPartnerId(me);
    const payload = notice;
    after(() => pushTo(partnerId, payload));
  }
  return json({ ok: true });
}
