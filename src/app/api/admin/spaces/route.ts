import { isAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { fail, json } from "@/lib/server-utils";

// GET /api/admin/spaces – every space with its people. No message content (it's encrypted anyway).
export async function GET(req: Request) {
  if (!isAdmin(req)) return fail("Unauthorized", 401);
  const rows = await db()`
    select s.id, s.label, s.created_at, s.disappear_seconds,
           (select count(*)::int from messages where space_id = s.id and deleted = false) as message_count,
           (select max(created_at) from messages where space_id = s.id) as last_message_at,
           coalesce((
             select json_agg(json_build_object(
               'id', m.id, 'role', m.role, 'name', m.display_name, 'banned', m.banned,
               'notifications', m.notifications, 'lastSeenAt', m.last_seen_at
             ) order by m.role)
             from members m where m.space_id = s.id
           ), '[]'::json) as members
    from spaces s order by s.created_at`;
  return json({
    limit: 5,
    used: rows.length,
    spaces: rows.map((r) => ({
      id: r.id,
      label: r.label,
      createdAt: r.created_at,
      disappearSeconds: r.disappear_seconds,
      messageCount: r.message_count,
      lastMessageAt: r.last_message_at,
      members: r.members,
    })),
  });
}
