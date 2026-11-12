import webpush from "web-push";
import { db } from "./db";
import { ALWAYS_TAGS, categoryOf, IN_APP_QUIET_TAGS, IN_APP_SECONDS, QUIET_FROM, QUIET_TO } from "./notify-prefs";
import { sectionOfTag, type OpenTarget } from "./notify-open";

let configured: boolean | null = null;

function configure(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!pub || !priv || !subject) {
    console.warn("Web push disabled: VAPID env vars missing");
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export type PushPayload = { title: string; body: string; tag?: string; url?: string; open?: OpenTarget };

/**
 * Sends a notification to every device of a member.
 * Payloads never contain message content – the server can't read it anyway.
 */
export async function pushTo(memberId: string | null, payload: PushPayload): Promise<void> {
  if (!memberId || !configure()) return;
  const sql = db();
  const target = await wants(memberId, payload.tag);
  if (!target) return;
  // Which space it's from: tapping opens that space, and opening the space clears its notifications.
  // And what it's about: tapping opens that exact place (a game table, Love debts, the planner…).
  const open = payload.open ?? sectionOfTag(payload.tag) ?? undefined;
  const full = { ...payload, open, space: target.spaceId,
    url: payload.url ?? `/?s=${target.spaceId}&m=${memberId}&from=n${open ? `&open=${encodeURIComponent(open)}` : ""}` };
  const subs = await sql`select endpoint, p256dh, auth from push_subscriptions where member_id = ${memberId}`;
  if (subs.length === 0) return;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(full),
          { TTL: 60 * 60 * 24, urgency: "high" },
        );
      } catch (err: unknown) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await sql`delete from push_subscriptions where endpoint = ${s.endpoint}`;
        } else {
          console.error("push failed", code);
        }
      }
    }),
  );

  // Every device unsubscribed (e.g. notifications switched off at OS level)
  const left = await sql`select count(*)::int as n from push_subscriptions where member_id = ${memberId}`;
  if (left[0].n === 0) {
    await sql`update members set notifications = 'off' where id = ${memberId}`;
  }
}

/** Respects each person's choices: kinds they turned off, and quiet hours (11 pm to 7 am their time). */
async function wants(memberId: string, tag: string | undefined): Promise<{ spaceId: string } | null> {
  const rows = await db()`select space_id, notify_off, notify_quiet, timezone,
                                 coalesce(last_seen_at > now() - make_interval(secs => ${IN_APP_SECONDS}), false) as in_app
                          from members where id = ${memberId}`;
  const m = rows[0];
  if (!m) return null;
  const yes = { spaceId: m.space_id as string };
  if (tag === "call" && m.in_app) return null;   // looking at the app: the ringing screen is already up
  if (tag && ALWAYS_TAGS.includes(tag)) return yes;
  if (m.in_app && tag && IN_APP_QUIET_TAGS.includes(tag)) return null;   // already looking at the app
  const cat = categoryOf(tag);
  if (cat && (m.notify_off as string[] | null)?.includes(cat)) return null;
  if (m.notify_quiet) {
    let hour = 12;
    try { hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: m.timezone || "Africa/Lagos" }).format(new Date())); } catch { /* keep midday */ }
    if (hour >= QUIET_FROM || hour < QUIET_TO) return null;
  }
  return yes;
}
