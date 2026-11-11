import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { db } from "./db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const HOST_PASSWORD_MIN = 6;
const MAX_TRIES = 5;
const LOCK_MINUTES = 15;

async function hash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 32);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function hostPasswordIsSet(): Promise<boolean> {
  const rows = await db()`select password_hash from host_settings where id = 1`;
  return !!rows[0]?.password_hash;
}

export async function setHostPassword(password: string): Promise<void> {
  const h = await hash(password);
  await db()`
    insert into host_settings (id, password_hash, failed, locked_until, updated_at) values (1, ${h}, 0, null, now())
    on conflict (id) do update set password_hash = excluded.password_hash, failed = 0, locked_until = null, updated_at = now()`;
}

export type HostCheck = "ok" | "wrong" | "locked" | "unset";

/** Checks the host password, with a 15-minute lock after 5 wrong tries. */
export async function checkHostPassword(password: string): Promise<HostCheck> {
  const sql = db();
  const rows = await sql`select password_hash, coalesce(locked_until > now(), false) as locked from host_settings where id = 1`;
  const row = rows[0];
  if (!row?.password_hash) return "unset";
  if (row.locked) return "locked";
  const [, saltB64, keyB64] = String(row.password_hash).split("$");
  const expected = Buffer.from(keyB64, "base64");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length);
  if (actual.length === expected.length && timingSafeEqual(actual, expected)) {
    await sql`update host_settings set failed = 0, locked_until = null where id = 1`;
    return "ok";
  }
  await sql`
    update host_settings set
      locked_until = case when failed + 1 >= ${MAX_TRIES} then now() + make_interval(mins => ${LOCK_MINUTES}) else locked_until end,
      failed = case when failed + 1 >= ${MAX_TRIES} then 0 else failed + 1 end
    where id = 1`;
  return "wrong";
}

export const HOST_LOCK_MESSAGE = `Too many wrong tries. Wait ${LOCK_MINUTES} minutes and try again.`;
