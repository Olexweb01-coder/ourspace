import { db } from "@/lib/db";
import { createInvite } from "@/lib/invites";
import { appUrl, fail, json, readJson, safeEqual } from "@/lib/server-utils";
import { createSession, getMe } from "@/lib/session";
import { createSpace, MAX_SPACES } from "@/lib/spaces";
import { saveTimezone } from "@/lib/streak-server";

type Body = {
  setupKey?: string; label?: string; hostName?: string;
  salt?: string; iterations?: number; authToken?: string; tz?: string;
};

// Tells the setup screen what to show. If this phone is signed in as the host, no key is ever asked for.
export async function GET() {
  const me = await getMe();
  const count = (await db()`select count(*)::int as n from spaces`)[0].n as number;
  if (me?.role === "host") return json({ mode: "host", name: me.name, used: count, max: MAX_SPACES });
  if (count === 0) return json({ mode: "key" });   // very first space (or every space was deleted)
  return json({ mode: "signin" });                // someone not signed in as the host: no form
}

// Creates a space. Allowed for the signed-in host, or with the setup key (first time / recovery only).
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body) return fail("Invalid request");

  const me = await getMe();
  const isHost = me?.role === "host";
  if (!isHost) {
    const envKey = process.env.HOST_SETUP_KEY || "";
    if (envKey.length < 16) return fail("Open your space first, then start a new one from there.", 403);
    if (typeof body.setupKey !== "string" || !safeEqual(body.setupKey, envKey)) {
      return fail(body.setupKey ? "Setup key is wrong." : "Open your space first, then start a new one from there.", 403);
    }
  }

  const made = await createSpace({ ...body, hostName: isHost ? me!.name : body.hostName });
  if ("error" in made) return fail(made.error, made.status);

  const invite = await createInvite(made.spaceId, "partner", appUrl(req));
  await createSession(made.memberId);
  await saveTimezone(made.memberId, body.tz);
  return json({ spaceId: made.spaceId, memberId: made.memberId, ...invite });
}
