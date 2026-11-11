import { db } from "@/lib/db";
import { checkHostPassword, HOST_LOCK_MESSAGE, HOST_PASSWORD_MIN, hostPasswordIsSet, setHostPassword } from "@/lib/host";
import { createInvite } from "@/lib/invites";
import { appUrl, fail, json, readJson, safeEqual } from "@/lib/server-utils";
import { createSession, getMe } from "@/lib/session";
import { createSpace, MAX_SPACES } from "@/lib/spaces";
import { saveTimezone } from "@/lib/streak-server";

type Body = {
  hostPassword?: string;       // the host password (or a new one, the very first time)
  recoveryKey?: string;        // emergency only: HOST_SETUP_KEY, to reset a forgotten host password
  label?: string; hostName?: string; salt?: string; iterations?: number; authToken?: string; tz?: string;
};

// What the setup screen should ask for.
//  host   : signed in as the host on this phone -> nothing extra
//  password: ask for the host password
//  create : the very first space ever -> choose a host password now
//  settings: spaces exist but no host password yet -> set it in Settings (or use the emergency reset)
export async function GET() {
  const me = await getMe();
  const count = (await db()`select count(*)::int as n from spaces`)[0].n as number;
  const isSet = await hostPasswordIsSet();
  // Signed in as the host: your name is known, but the host password is still always asked for.
  if (me?.role === "host") return json({ mode: "host", name: me.name, used: count, max: MAX_SPACES, hostPasswordSet: isSet });
  if (isSet) return json({ mode: "password" });
  return json({ mode: count === 0 ? "create" : "settings" });
}

export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body) return fail("Invalid request");
  const me = await getMe();
  const isHost = me?.role === "host";

  // Every new space needs the host password, signed in or not.
  {
    const hostPassword = typeof body.hostPassword === "string" ? body.hostPassword : "";
    if (typeof body.recoveryKey === "string" && body.recoveryKey) {
      // Emergency reset: the long setup key from Vercel, plus a new host password.
      const envKey = process.env.HOST_SETUP_KEY || "";
      if (envKey.length < 16 || !safeEqual(body.recoveryKey, envKey)) return fail("That emergency key is wrong.", 403);
      if (hostPassword.length < HOST_PASSWORD_MIN) return fail(`Choose a host password of at least ${HOST_PASSWORD_MIN} characters.`);
      await setHostPassword(hostPassword);
    } else if (!(await hostPasswordIsSet())) {
      const count = (await db()`select count(*)::int as n from spaces`)[0].n as number;
      if (count > 0 && !isHost) return fail("Set your host password first: open your space, then Settings, then Host password.", 403);
      // The very first space, or the signed-in host who hasn't chosen one yet: choose it now.
      if (hostPassword.length < HOST_PASSWORD_MIN) return fail(`Choose a host password of at least ${HOST_PASSWORD_MIN} characters.`);
      await setHostPassword(hostPassword);
    } else {
      const check = await checkHostPassword(hostPassword);
      if (check === "locked") return fail(HOST_LOCK_MESSAGE, 429);
      if (check !== "ok") return fail("That host password isn't right.", 403);
    }
  }

  const made = await createSpace({ ...body, hostName: isHost ? me!.name : body.hostName });
  if ("error" in made) return fail(made.error, made.status);

  const invite = await createInvite(made.spaceId, "partner", appUrl(req));
  await createSession(made.memberId);
  await saveTimezone(made.memberId, body.tz);
  return json({ spaceId: made.spaceId, memberId: made.memberId, ...invite });
}
