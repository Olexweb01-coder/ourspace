import { iceServers } from "@/lib/calls";
import { fail, json } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

// How to connect a call: direct first, the relay as a fallback. Signed-in members only.
export async function GET() {
  if (!(await getMe())) return fail("Locked", 401);
  return json({ iceServers: iceServers(), relay: iceServers().length > 1 });
}
