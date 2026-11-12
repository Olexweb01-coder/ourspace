import { db } from "@/lib/db";
import { fail, json, readJson } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

// "typing…" or "recording audio…": lasts 6 seconds unless refreshed (the phone pings every 4 s while it lasts).
// "stop" clears it at once (e.g. the voice note was sent or cancelled).
export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const b = await readJson<{ kind?: string }>(req);
  const kind = b?.kind === "recording" ? "recording" : b?.kind === "stop" ? "stop" : "typing";
  const sql = db();
  if (kind === "stop") {
    await sql`update members set typing_until = now() where id = ${me.memberId}`;
    return json({ ok: true });
  }
  try {
    await sql`update members set typing_until = now() + interval '6 seconds', typing_kind = ${kind} where id = ${me.memberId}`;
  } catch {
    // The database doesn't have typing_kind yet: still show "typing…".
    await sql`update members set typing_until = now() + interval '6 seconds' where id = ${me.memberId}`;
  }
  return json({ ok: true });
}
