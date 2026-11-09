import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { createInvite } from "@/lib/invites";
import { appUrl, fail, json, readJson, UUID_RE } from "@/lib/server-utils";

// POST { role?: "partner" | "host" } – fresh 7-day link. Works for a new partner
// or to re-link an existing one on a new phone (they still need the password).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return fail("Unauthorized", 401);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail("Unknown space", 404);
  const body = await readJson<{ role?: string }>(req);
  const role = body?.role ?? "partner";
  if (role !== "partner" && role !== "host") return fail("role must be partner or host");

  const sql = db();
  const exists = await sql`select 1 from spaces where id = ${id}`;
  if (!exists[0]) return fail("Unknown space", 404);
  const banned = await sql`select 1 from members where space_id = ${id} and role = ${role} and banned = true`;
  if (banned[0]) return fail("That person is banned. Unban first.", 409);

  return json(await createInvite(id, role, appUrl(req)));
}
