import { createInvite } from "@/lib/invites";
import { appUrl, fail, json } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

// The host can make a fresh invite link (new phone, lost app, link expired).
export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  if (me.role !== "host") return fail("Only the host can create invite links.", 403);
  return json(await createInvite(me.spaceId, "partner", appUrl(req)));
}
