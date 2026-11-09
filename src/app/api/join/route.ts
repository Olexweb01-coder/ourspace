import { after } from "next/server";
import { db } from "@/lib/db";
import { checkSpacePassword, passwordError } from "@/lib/password";
import { pushTo } from "@/lib/push";
import { B64_RE, fail, json, readJson, sha256, str } from "@/lib/server-utils";
import { createSession } from "@/lib/session";

async function findInvite(token: string) {
  const rows = await db()`
    select i.space_id, i.role, s.kdf_salt, s.kdf_iterations, s.label,
           (select display_name from members where space_id = s.id and role = 'host') as host_name,
           (select display_name from members where space_id = s.id and role = i.role) as existing_name
    from invites i join spaces s on s.id = i.space_id
    where i.token_hash = ${sha256(token)} and i.used_at is null and i.expires_at > now()`;
  return rows[0] ?? null;
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!token || token.length > 100) return fail("This invite link isn't valid.", 404);
  const inv = await findInvite(token);
  if (!inv) return fail("This invite link has expired or was already used. Ask for a new one.", 404);
  return json({
    spaceId: inv.space_id,
    role: inv.role,
    salt: inv.kdf_salt,
    iterations: inv.kdf_iterations,
    hostName: inv.host_name,
    label: inv.label,
    existingName: inv.existing_name,
  });
}

export async function POST(req: Request) {
  const body = await readJson<{ token?: string; name?: string; authToken?: string }>(req);
  const token = str(body?.token, 100);
  const authToken = str(body?.authToken, 64);
  if (!token || !authToken || !B64_RE.test(authToken)) return fail("Invalid request");

  const inv = await findInvite(token);
  if (!inv) return fail("This invite link has expired or was already used. Ask for a new one.", 404);

  const check = await checkSpacePassword(inv.space_id, authToken);
  if (check !== "ok") {
    const e = passwordError(check);
    return fail(e.message, e.status);
  }

  const name = inv.existing_name ?? str(body?.name, 40);
  if (!name) return fail("Tell us your name.");

  const sql = db();
  const claimed = await sql`
    update invites set used_at = now()
    where token_hash = ${sha256(token)} and used_at is null and expires_at > now()
    returning space_id`;
  if (claimed.length === 0) return fail("This invite link was just used. Ask for a new one.", 409);

  const rows = await sql`
    insert into members (space_id, role, display_name)
    values (${inv.space_id}, ${inv.role}, ${name})
    on conflict (space_id, role) do update set display_name = members.display_name
    returning id, banned, display_name, (xmax = 0) as inserted`;
  const member = rows[0];
  if (member.banned) return fail("This space isn't available to you anymore.", 403);

  await createSession(member.id);

  if (member.inserted && inv.role === "partner") {
    const host = await sql`select id from members where space_id = ${inv.space_id} and role = 'host'`;
    after(() => pushTo(host[0]?.id ?? null, {
      title: `💞 ${member.display_name} is here`,
      body: "Your space is ready. Say something sweet.",
      tag: "joined",
    }));
  }

  return json({ spaceId: inv.space_id, memberId: member.id, name: member.display_name, label: inv.label, role: inv.role });
}
