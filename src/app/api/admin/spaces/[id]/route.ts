import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { deleteBlobs } from "@/lib/media-server";
import { fail, json, readJson, UUID_RE } from "@/lib/server-utils";

// PATCH { action: "ban" | "unban", role?: "partner" | "host" }
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return fail("Unauthorized", 401);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail("Unknown space", 404);
  const body = await readJson<{ action?: string; role?: string }>(req);
  const role = body?.role ?? "partner";
  if (role !== "partner" && role !== "host") return fail("role must be partner or host");
  if (body?.action !== "ban" && body?.action !== "unban") return fail("action must be ban or unban");
  const banned = body.action === "ban";

  const sql = db();
  const rows = await sql`
    update members set banned = ${banned}
    where space_id = ${id} and role = ${role}
    returning id, display_name`;
  if (!rows[0]) return fail("Nobody with that role in this space yet.", 404);

  if (banned) {
    // Kick them out right now on every device.
    await sql.transaction([
      sql`delete from sessions where member_id = ${rows[0].id}`,
      sql`delete from push_subscriptions where member_id = ${rows[0].id}`,
      sql`delete from invites where space_id = ${id} and role = ${role} and used_at is null`,
    ]);
  }
  return json({ ok: true, member: { id: rows[0].id, name: rows[0].display_name, banned } });
}

// DELETE – permanent. Call once without a body to see what will be lost and the exact
// confirmation phrase, then call again with { confirm: "<phrase>" }.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return fail("Unauthorized", 401);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return fail("Unknown space", 404);

  const sql = db();
  const info = await sql`
    select s.label,
           (select count(*)::int from messages where space_id = s.id) as messages,
           (select string_agg(display_name, ' & ') from members where space_id = s.id) as people,
           (select count(*)::int from media where space_id = s.id) as files
    from spaces s where s.id = ${id}`;
  if (!info[0]) return fail("Unknown space", 404);

  const phrase = `DELETE ${info[0].label}`;
  const body = await readJson<{ confirm?: string }>(req);
  if (body?.confirm !== phrase) {
    return json({
      error: "Confirmation required. This permanently erases the space, every message and both people's access. It cannot be undone.",
      requiredConfirm: phrase,
      willDelete: { label: info[0].label, people: info[0].people, messages: info[0].messages, files: info[0].files },
    }, 409);
  }

  // Files live outside the database, so remove them from storage first.
  const files = await sql`select pathname from media where space_id = ${id}`;
  await deleteBlobs(files.map((f) => f.pathname as string));
  await sql`delete from spaces where id = ${id}`;
  return json({ ok: true, deleted: info[0].label });
}
