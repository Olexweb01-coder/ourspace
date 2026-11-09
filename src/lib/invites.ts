import { db } from "./db";
import { randomToken, sha256 } from "./server-utils";

export const INVITE_DAYS = 7;

export async function createInvite(spaceId: string, role: "host" | "partner", baseUrl: string) {
  const token = randomToken();
  const sql = db();
  await sql`delete from invites where space_id = ${spaceId} and role = ${role} and used_at is null`;
  const rows = await sql`
    insert into invites (token_hash, space_id, role, expires_at)
    values (${sha256(token)}, ${spaceId}, ${role}, now() + make_interval(days => ${INVITE_DAYS}))
    returning expires_at`;
  return { inviteUrl: `${baseUrl}/join/${token}`, expiresAt: rows[0].expires_at as string };
}
