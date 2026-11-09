import { db } from "@/lib/db";
import { fail, json, UUID_RE } from "@/lib/server-utils";

export async function GET(req: Request) {
  const spaceId = new URL(req.url).searchParams.get("spaceId") || "";
  if (!UUID_RE.test(spaceId)) return fail("Unknown space", 404);
  const rows = await db()`select kdf_salt, kdf_iterations from spaces where id = ${spaceId}`;
  if (!rows[0]) return fail("This space no longer exists.", 404);
  return json({ salt: rows[0].kdf_salt, iterations: rows[0].kdf_iterations });
}
