import { after } from "next/server";
import { db } from "@/lib/db";
import { pushTo } from "@/lib/push";
import { B64_RE, fail, json, readJson } from "@/lib/server-utils";
import { getMe, getPartnerId } from "@/lib/session";

const MAX_TEXT_CT = 60_000; // base64 chars, ~ 10k characters of text

export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);

  const body = await readJson<{ iv?: string; ct?: string; viewOnce?: boolean }>(req);
  const iv = body?.iv;
  const ct = body?.ct;
  if (typeof iv !== "string" || iv.length > 32 || !B64_RE.test(iv)) return fail("Invalid message");
  if (typeof ct !== "string" || ct.length === 0 || ct.length > MAX_TEXT_CT || !B64_RE.test(ct)) return fail("Message is too long");
  const viewOnce = body?.viewOnce === true;

  const rows = await db()`
    insert into messages (space_id, sender_id, kind, iv, ciphertext, view_once, expires_at)
    select s.id, ${me.memberId}, 'text', ${iv}, ${ct}, ${viewOnce},
           case when s.disappear_seconds is null then null else now() + make_interval(secs => s.disappear_seconds) end
    from spaces s where s.id = ${me.spaceId}
    returning id::text as id, created_at, expires_at`;

  const partnerId = await getPartnerId(me);
  after(() => pushTo(partnerId, {
    title: `💌 ${me.name}`,
    body: viewOnce ? "Sent you something to see once." : "Sent you a message.",
    tag: "message",
  }));

  return json({ id: rows[0].id, createdAt: rows[0].created_at, expiresAt: rows[0].expires_at });
}
