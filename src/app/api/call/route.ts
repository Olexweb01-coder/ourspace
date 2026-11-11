import { randomUUID } from "crypto";
import { after } from "next/server";
import { settleCalls } from "@/lib/calls";
import { db } from "@/lib/db";
import { pushTo } from "@/lib/push";
import { fail, json, readJson } from "@/lib/server-utils";
import { getMe, getPartnerId } from "@/lib/session";

// Start a call: it rings your partner (in the app, and with a notification if the app is closed).
export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const b = await readJson<{ kind?: string }>(req);
  const kind = b?.kind === "video" ? "video" : "voice";
  const partnerId = await getPartnerId(me);
  if (!partnerId) return fail("Calls need two of you. Invite your partner first.");
  const sql = db();
  await settleCalls(me.spaceId);
  const busy = await sql`select id from calls where space_id = ${me.spaceId} and status in ('ringing','active') limit 1`;
  if (busy[0]) return fail("There's already a call going on.", 409);
  const id = randomUUID();
  await sql`insert into calls (id, space_id, caller_id, callee_id, kind) values (${id}, ${me.spaceId}, ${me.memberId}, ${partnerId}, ${kind})`;
  after(() => pushTo(partnerId, {
    title: `${kind === "video" ? "📹" : "📞"} ${me.name} is calling`,
    body: `${kind === "video" ? "Video" : "Voice"} call. Tap to answer.`,
    tag: "call",
  }));
  return json({ id });
}
