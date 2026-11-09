import { db } from "./db";
import { LOCK_MINUTES, MAX_FAILED, safeEqual, sha256 } from "./server-utils";

export type PasswordCheck = "ok" | "wrong" | "locked" | "missing";

/** Checks the shared password proof for a space, with lockout after repeated failures. */
export async function checkSpacePassword(spaceId: string, authToken: string): Promise<PasswordCheck> {
  const sql = db();
  const rows = await sql`
    select auth_hash, failed_logins, coalesce(locked_until > now(), false) as locked
    from spaces where id = ${spaceId}`;
  const s = rows[0];
  if (!s) return "missing";
  if (s.locked) return "locked";
  if (safeEqual(sha256(authToken), s.auth_hash)) {
    if (s.failed_logins > 0) await sql`update spaces set failed_logins = 0, locked_until = null where id = ${spaceId}`;
    return "ok";
  }
  await sql`
    update spaces set
      locked_until  = case when failed_logins + 1 >= ${MAX_FAILED} then now() + make_interval(mins => ${LOCK_MINUTES}) else locked_until end,
      failed_logins = case when failed_logins + 1 >= ${MAX_FAILED} then 0 else failed_logins + 1 end
    where id = ${spaceId}`;
  return "wrong";
}

export function passwordError(result: PasswordCheck): { message: string; status: number } {
  switch (result) {
    case "locked": return { message: `Too many wrong tries. Wait ${LOCK_MINUTES} minutes and try again.`, status: 429 };
    case "missing": return { message: "This space no longer exists.", status: 404 };
    default: return { message: "That password doesn't open this space.", status: 401 };
  }
}
