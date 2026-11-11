import { createHmac } from "crypto";
import { headers } from "next/headers";
import { db } from "./db";
import { LOCK_MINUTES, MAX_FAILED, sha256 } from "./server-utils";

export const DOOR_COUNT = 5; // always this many entries, so nobody can tell how many spaces exist

// Decoy salts look exactly like real ones and never change between visits.
function secret(): string {
  return process.env.ADMIN_API_KEY || process.env.CRON_SECRET || process.env.DATABASE_URL || "ourspace";
}
export function decoySalt(i: number): string {
  return createHmac("sha256", secret()).update(`ourspace/door-decoy/${i}`).digest().subarray(0, 16).toString("base64");
}

/** Real salts plus decoys, DOOR_COUNT in total, in an order that hides which is which. */
export async function doorSalts(): Promise<{ salt: string; iterations: number }[]> {
  const rows = await db()`select kdf_salt, kdf_iterations from spaces order by created_at limit ${DOOR_COUNT}`;
  const list = rows.map((r) => ({ salt: r.kdf_salt as string, iterations: r.kdf_iterations as number }));
  const iterations = list[0]?.iterations ?? 600_000;
  for (let i = 0; list.length < DOOR_COUNT; i++) {
    const s = decoySalt(i);
    if (!list.some((x) => x.salt === s)) list.push({ salt: s, iterations });
  }
  return list.sort((a, b) => (a.salt < b.salt ? -1 : 1));
}

// ---- guessing guard, per network address (stored only as a one-way hash) ----
async function key(): Promise<string> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") || h.get("x-real-ip") || "unknown").split(",")[0].trim();
  return sha256(`door:${ip}:${secret()}`);
}
export async function doorLocked(): Promise<boolean> {
  const rows = await db()`select coalesce(locked_until > now(), false) as locked from auth_throttle where key = ${await key()}`;
  return rows[0]?.locked === true;
}
export async function doorFailed(): Promise<void> {
  await db()`
    insert into auth_throttle (key, failures, updated_at) values (${await key()}, 1, now())
    on conflict (key) do update set
      locked_until = case when auth_throttle.failures + 1 >= ${MAX_FAILED} then now() + make_interval(mins => ${LOCK_MINUTES}) else auth_throttle.locked_until end,
      failures     = case when auth_throttle.failures + 1 >= ${MAX_FAILED} then 0 else auth_throttle.failures + 1 end,
      updated_at   = now()`;
}
export async function doorOk(): Promise<void> {
  await db()`delete from auth_throttle where key = ${await key()}`;
}
