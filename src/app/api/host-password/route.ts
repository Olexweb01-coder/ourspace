import { HOST_PASSWORD_MIN, hostPasswordIsSet, setHostPassword } from "@/lib/host";
import { fail, json, readJson } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

// Signed-in host only: see whether a host password exists, and set or change it.
export async function GET() {
  const me = await getMe();
  if (me?.role !== "host") return fail("Only the host can see this.", 403);
  return json({ set: await hostPasswordIsSet() });
}

export async function POST(req: Request) {
  const me = await getMe();
  if (me?.role !== "host") return fail("Only the host can change this.", 403);
  const body = await readJson<{ password?: string }>(req);
  const pw = typeof body?.password === "string" ? body.password : "";
  if (pw.length < HOST_PASSWORD_MIN || pw.length > 200) return fail(`Use at least ${HOST_PASSWORD_MIN} characters.`);
  await setHostPassword(pw);
  return json({ ok: true });
}
