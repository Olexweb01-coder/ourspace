import { db } from "@/lib/db";
import { fail, json, readJson } from "@/lib/server-utils";

// Signing in as the partner on any phone: your name tells us which space to check the shared password against.
// Only the salt comes back; the shared password is checked by /api/auth/login like always.
export async function POST(req: Request) {
  const b = await readJson<{ name?: string; role?: string }>(req);
  const name = typeof b?.name === "string" ? b.name.trim().toLowerCase().slice(0, 60) : "";
  const role = b?.role === "host" ? "host" : "partner";
  if (name.length < 1) return fail("Enter your name.");
  const rows = await db()`
    select s.id as space_id, s.label, s.kdf_salt, s.kdf_iterations, m.id as member_id, m.display_name
    from members m join spaces s on s.id = m.space_id
    where m.role = ${role} and m.banned = false
      and (lower(trim(m.display_name)) = ${name} or (${role} = 'partner' and lower(trim(s.label)) = ${name}))
    order by s.created_at limit 5`;
  return json({
    spaces: rows.map((r) => ({ spaceId: r.space_id, memberId: r.member_id, label: r.label, myName: r.display_name, salt: r.kdf_salt, iterations: r.kdf_iterations })),
  });
}
