import { db } from "@/lib/db";
import { checkSpacePassword, passwordError } from "@/lib/password";
import { B64_RE, fail, json, readJson, str, UUID_RE } from "@/lib/server-utils";
import { createSession } from "@/lib/session";

export async function POST(req: Request) {
  const body = await readJson<{ spaceId?: string; memberId?: string; authToken?: string }>(req);
  const spaceId = body?.spaceId ?? "";
  const memberId = body?.memberId ?? "";
  const authToken = str(body?.authToken, 64);
  if (!UUID_RE.test(spaceId) || !UUID_RE.test(memberId) || !authToken || !B64_RE.test(authToken)) {
    return fail("Invalid request");
  }

  const members = await db()`
    select m.id, m.banned, m.role, m.display_name, s.label
    from members m join spaces s on s.id = m.space_id
    where m.id = ${memberId} and m.space_id = ${spaceId}`;
  const m = members[0];
  if (!m) return fail("This device isn't linked to that space anymore. Use a fresh invite link.", 404);
  if (m.banned) return fail("This space isn't available to you anymore.", 403);

  const check = await checkSpacePassword(spaceId, authToken);
  if (check !== "ok") {
    const e = passwordError(check);
    return fail(e.message, e.status);
  }

  await createSession(memberId);
  return json({ ok: true, role: m.role, name: m.display_name, label: m.label });
}
