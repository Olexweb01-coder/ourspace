import { db } from "@/lib/db";
import { DOOR_COUNT, doorFailed, doorLocked, doorOk } from "@/lib/doors";
import { checkHostPassword, HOST_LOCK_MESSAGE } from "@/lib/host";
import { B64_RE, fail, json, LOCK_MINUTES, readJson, safeEqual, sha256 } from "@/lib/server-utils";
import { createSession } from "@/lib/session";
import { saveTimezone } from "@/lib/streak-server";

type Try = { salt?: string; token?: string };

// Signs in from the front door. The phone sends one proof per door (never the password);
// whichever space it opens is the one you belong to. A miss counts against this network, never against a space.
export async function POST(req: Request) {
  const b = await readJson<{ role?: string; hostPassword?: string; tries?: Try[]; tz?: string }>(req);
  const role = b?.role === "host" ? "host" : "partner";
  const tries = Array.isArray(b?.tries) ? b!.tries!.slice(0, DOOR_COUNT) : [];
  if (tries.length === 0 || tries.some((t) => typeof t.salt !== "string" || typeof t.token !== "string" || !B64_RE.test(t.salt) || !B64_RE.test(t.token) || t.token.length > 64)) {
    return fail("Invalid request");
  }
  if (await doorLocked()) return fail(`Too many wrong tries. Wait ${LOCK_MINUTES} minutes and try again.`, 429);

  if (role === "host") {
    const check = await checkHostPassword(typeof b?.hostPassword === "string" ? b.hostPassword : "");
    if (check === "locked") return fail(HOST_LOCK_MESSAGE, 429);
    if (check === "unset") return fail("No host password yet. Use your space's link once, then set one in Settings.", 401);
    if (check === "wrong") { await doorFailed(); return fail("Those passwords don't match.", 401); }
  }

  const sql = db();
  const salts = tries.map((t) => t.salt!);
  const spaces = await sql`select id, kdf_salt, auth_hash, coalesce(locked_until > now(), false) as locked, label
                           from spaces where kdf_salt = any(${salts})`;
  for (const t of tries) {
    const s = spaces.find((x) => x.kdf_salt === t.salt);
    if (!s || !safeEqual(sha256(t.token!), s.auth_hash)) continue;
    if (s.locked) return fail(`Too many wrong tries on this space. Wait ${LOCK_MINUTES} minutes and try again.`, 429);
    const m = (await sql`select id, display_name, banned from members where space_id = ${s.id} and role = ${role} limit 1`)[0];
    if (!m) return fail(role === "partner" ? "You haven't joined yet. Open the link you were sent." : "This space has no host.", 404);
    if (m.banned) return fail("This space isn't available to you anymore.", 403);
    await doorOk();
    await createSession(m.id);
    await saveTimezone(m.id, b?.tz);
    return json({ ok: true, salt: s.kdf_salt, spaceId: s.id, memberId: m.id, name: m.display_name, label: s.label });
  }
  await doorFailed();
  return fail(role === "host" ? "Those passwords don't match." : "That password doesn't open a space.", 401);
}
