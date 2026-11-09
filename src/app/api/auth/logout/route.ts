import { json } from "@/lib/server-utils";
import { destroySession } from "@/lib/session";

export async function POST() {
  await destroySession();
  return json({ ok: true });
}
