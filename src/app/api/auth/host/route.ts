import { db } from "@/lib/db";
import { checkHostPassword, HOST_LOCK_MESSAGE } from "@/lib/host";
import { fail, json, readJson } from "@/lib/server-utils";

// Signing in as the host on any phone: the host password shows your spaces.
// The shared password of each space is still checked separately (and never seen here).
export async function POST(req: Request) {
  const b = await readJson<{ hostPassword?: string }>(req);
  const pw = typeof b?.hostPassword === "string" ? b.hostPassword : "";
  if (!pw) return fail("Enter your host password.");
  const check = await checkHostPassword(pw);
  if (check === "unset") return json({ unset: true, spaces: [] });
  if (check === "locked") return fail(HOST_LOCK_MESSAGE, 429);
  if (check === "wrong") return fail("That isn't your host password.", 401);
  const rows = await db()`
    select s.id as space_id, s.label, s.kdf_salt, s.kdf_iterations, h.id as host_id, h.display_name as host_name,
           exists (select 1 from members p where p.space_id = s.id and p.role = 'partner') as partner_joined
    from spaces s join members h on h.space_id = s.id and h.role = 'host' and h.banned = false
    order by s.created_at`;
  return json({
    unset: false,
    spaces: rows.map((r) => ({ spaceId: r.space_id, memberId: r.host_id, label: r.label, myName: r.host_name,
      partnerJoined: r.partner_joined, salt: r.kdf_salt, iterations: r.kdf_iterations })),
  });
}
