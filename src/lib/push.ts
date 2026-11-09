import webpush from "web-push";
import { db } from "./db";

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

export type PushPayload = { title: string; body: string; tag?: string; url?: string };

/**
 * Sends a notification to every device of a member.
 * Payloads never contain message content – the server can't read it anyway.
 */
export async function pushTo(memberId: string | null, payload: PushPayload): Promise<void> {
  if (!memberId || !configure()) return;
  const sql = db();
  const subs = await sql`select endpoint, p256dh, auth from push_subscriptions where member_id = ${memberId}`;
  if (subs.length === 0) return;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
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
