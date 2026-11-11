import { db } from "@/lib/db";
import { fail, json } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

// "typing…": lasts 6 seconds unless refreshed. The phone pings at most every 4 seconds while typing.
export async function POST() {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  await db()`update members set typing_until = now() + interval '6 seconds' where id = ${me.memberId}`;
  return json({ ok: true });
}
