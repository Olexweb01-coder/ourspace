import { db } from "@/lib/db";
import { fail, json, readJson, UUID_RE } from "@/lib/server-utils";
import { getMe } from "@/lib/session";

// Disguise: your own photo as the app icon. Public on purpose (the phone shows the icon before you unlock),
// so it's only reachable by the member id, and it's only the icon you chose, nothing else.
const PNG_B64 = /^iVBORw0KGgo[A-Za-z0-9+/]+={0,2}$/;   // a PNG, in base64
const MAX = { png192: 200_000, png512: 900_000 };     // base64 characters

export async function GET(req: Request) {
  const url = new URL(req.url);
  const m = url.searchParams.get("m") || "";
  const size = url.searchParams.get("s") === "192" ? "192" : "512";
  if (!UUID_RE.test(m)) return new Response("Not found", { status: 404 });
  const rows = await db()`select png192, png512 from app_icons where member_id = ${m}`;
  if (!rows[0]) return new Response("Not found", { status: 404 });
  const bytes = Buffer.from(size === "192" ? rows[0].png192 : rows[0].png512, "base64");
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
}

export async function POST(req: Request) {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  const b = await readJson<{ png192?: string; png512?: string }>(req);
  const ok = (x: unknown, max: number) => typeof x === "string" && x.length <= max && PNG_B64.test(x);
  if (!ok(b?.png192, MAX.png192) || !ok(b?.png512, MAX.png512)) return fail("That picture didn't work. Try another one.");
  await db()`
    insert into app_icons (member_id, png192, png512) values (${me.memberId}, ${b!.png192!}, ${b!.png512!})
    on conflict (member_id) do update set png192 = excluded.png192, png512 = excluded.png512, updated_at = now()`;
  return json({ ok: true });
}

export async function DELETE() {
  const me = await getMe();
  if (!me) return fail("Locked", 401);
  await db()`delete from app_icons where member_id = ${me.memberId}`;
  return json({ ok: true });
}
