import { db } from "@/lib/db";
import { createInvite } from "@/lib/invites";
import { appUrl, B64_RE, fail, json, readJson, safeEqual, sha256, str } from "@/lib/server-utils";
import { createSession } from "@/lib/session";

const MAX_SPACES = 5;

type Body = {
  setupKey?: string; label?: string; hostName?: string;
  salt?: string; iterations?: number; authToken?: string;
};

export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body) return fail("Invalid request");

  const envKey = process.env.HOST_SETUP_KEY || "";
  if (envKey.length < 16) return fail("HOST_SETUP_KEY is not configured on the server (min 16 characters).", 500);
  if (typeof body.setupKey !== "string" || !safeEqual(body.setupKey, envKey)) return fail("Setup key is wrong.", 401);

  const label = str(body.label, 40);
  const hostName = str(body.hostName, 40);
  const salt = str(body.salt, 64);
  const authToken = str(body.authToken, 64);
  const iterations = Number(body.iterations);
  if (!label || !hostName) return fail("Add your name and what you call her.");
  if (!salt || !B64_RE.test(salt) || !authToken || !B64_RE.test(authToken)) return fail("Invalid key material.");
  if (!Number.isInteger(iterations) || iterations < 300_000 || iterations > 5_000_000) return fail("Invalid iterations.");

  const sql = db();
  const count = await sql`select count(*)::int as n from spaces`;
  if (count[0].n >= MAX_SPACES) return fail(`You already have ${MAX_SPACES} spaces. Remove one from the admin before adding another.`, 409);

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
  const { member_id: memberId, space_id: spaceId } = rows[0];

  const invite = await createInvite(spaceId, "partner", appUrl(req));
  await createSession(memberId);
  return json({ spaceId, memberId, ...invite });
}
