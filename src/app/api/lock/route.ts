import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { B64_RE, fail, json, readJson, safeEqual, sha256, UUID_RE } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

const MAX_TRIES = 5;
const b64 = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max && B64_RE.test(v);

type Body = { action?: string; deviceId?: string; deviceToken?: string; lockProof?: string; kind?: string };

// The app lock. The server keeps half of the phone's unlock secret and hands it over only for the right lock.
// 5 wrong tries wipe it, so a stolen phone can't be brute-forced; the shared password always still works.
export async function POST(req: Request) {
  const b = await readJson<Body>(req);
  const deviceId = typeof b?.deviceId === "string" && UUID_RE.test(b.deviceId) ? b.deviceId : null;
  if (!b?.action || !deviceId) return fail("Invalid request");
  const sql = db();

  if (b.action === "setup") {
    const me = await getMe();
    if (!me) return fail("Locked", 401);
    if (!b64(b.deviceToken, 64) || !b64(b.lockProof, 64)) return fail("Invalid lock");
    if (b.kind !== "pin" && b.kind !== "pattern" && b.kind !== "password") return fail("Invalid lock");
    const serverHalf = randomBytes(32).toString("base64");
    const rows = await sql`
      insert into device_locks (id, member_id, token_hash, lock_verifier, server_half, kind)
      values (${deviceId}, ${me.memberId}, ${sha256(b.deviceToken)}, ${sha256(b.lockProof)}, ${serverHalf}, ${b.kind})
      on conflict (id) do update set token_hash = excluded.token_hash, lock_verifier = excluded.lock_verifier,
        server_half = excluded.server_half, kind = excluded.kind, failed = 0
      where device_locks.member_id = excluded.member_id
      returning id`;
    if (!rows[0]) return fail("Invalid lock");
    // Keep at most 5 phones per person.
    await sql`delete from device_locks where member_id = ${me.memberId} and id not in (
      select id from device_locks where member_id = ${me.memberId} order by created_at desc limit 5)`;
    return json({ serverHalf });
  }

  if (b.action === "unlock") {
    if (!b64(b.deviceToken, 64) || !b64(b.lockProof, 64)) return fail("Invalid request");
    const rows = await sql`
      select d.token_hash, d.lock_verifier, d.server_half, d.member_id, m.space_id, m.banned
      from device_locks d join members m on m.id = d.member_id where d.id = ${deviceId}`;
    const d = rows[0];
    if (!d || !safeEqual(sha256(b.deviceToken), d.token_hash)) {
      return fail("The app lock on this phone was reset. Use your shared password.", 410);
    }
    if (d.banned) return fail("This space isn't available to you anymore.", 403);
    if (safeEqual(sha256(b.lockProof), d.lock_verifier)) {
      await sql`update device_locks set failed = 0, last_used_at = now() where id = ${deviceId}`;
      return json({ serverHalf: d.server_half, memberId: d.member_id, spaceId: d.space_id });
    }
    const f = await sql`update device_locks set failed = failed + 1 where id = ${deviceId} returning failed`;
    const failed = f[0]?.failed ?? MAX_TRIES;
    if (failed >= MAX_TRIES) {
      await sql`delete from device_locks where id = ${deviceId}`;
      return fail("Too many wrong tries. For safety, use your shared password to get back in.", 410);
    }
    const left = MAX_TRIES - failed;
    return fail(`That's not it. ${left} ${left === 1 ? "try" : "tries"} left.`, 401);
  }

  if (b.action === "remove") {
    const me = await getMe();
    if (!me) return fail("Locked", 401);
    await sql`delete from device_locks where id = ${deviceId} and member_id = ${me.memberId}`;
    return json({ ok: true });
  }

  return fail("Unknown action");
}
