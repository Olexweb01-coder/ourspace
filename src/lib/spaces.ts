import { db } from "./db";
import { B64_RE, sha256, str } from "./server-utils";

export const MAX_SPACES = 5;

type NewSpace = { label?: unknown; hostName?: unknown; salt?: unknown; iterations?: unknown; authToken?: unknown };

/** Validates and creates a space with its host. Returns an error message, or the new ids. */
export async function createSpace(input: NewSpace): Promise<{ error: string; status: number } | { spaceId: string; memberId: string }> {
  const label = str(input.label, 40);
  const hostName = str(input.hostName, 40);
  const salt = str(input.salt, 64);
  const authToken = str(input.authToken, 64);
  const iterations = Number(input.iterations);
  if (!label || !hostName) return { error: "Add your name and what you call them.", status: 400 };
  if (!salt || !B64_RE.test(salt) || !authToken || !B64_RE.test(authToken)) return { error: "Invalid key material.", status: 400 };
  if (!Number.isInteger(iterations) || iterations < 300_000 || iterations > 5_000_000) return { error: "Invalid iterations.", status: 400 };

  const sql = db();
  const count = await sql`select count(*)::int as n from spaces`;
  if (count[0].n >= MAX_SPACES) {
    return { error: `You already have ${MAX_SPACES} spaces. Remove one from the admin before adding another.`, status: 409 };
  }
  const rows = await sql`
    with s as (
      insert into spaces (label, kdf_salt, kdf_iterations, auth_hash)
      values (${label}, ${salt}, ${iterations}, ${sha256(authToken)})
      returning id
    ), m as (
      insert into members (space_id, role, display_name)
      select id, 'host', ${hostName} from s
      returning id, space_id
    )
    select id as member_id, space_id from m`;
  return { spaceId: rows[0].space_id, memberId: rows[0].member_id };
}
