import { cookies } from "next/headers";
import { db } from "./db";
import { randomToken, sha256 } from "./server-utils";

export const SESSION_COOKIE = "ls_session";
const SESSION_DAYS = 7;

export type Me = {
  memberId: string;
  spaceId: string;
  role: "host" | "partner";
  name: string;
};

export async function createSession(memberId: string): Promise<void> {
  const token = randomToken();
  await db()`
    insert into sessions (token_hash, member_id, expires_at)
    values (${sha256(token)}, ${memberId}, now() + make_interval(days => ${SESSION_DAYS}))`;
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db()`delete from sessions where token_hash = ${sha256(token)}`;
  jar.delete(SESSION_COOKIE);
}

export async function getMe(): Promise<Me | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db()`
    select m.id, m.space_id, m.role, m.display_name
    from sessions s
    join members m on m.id = s.member_id
    where s.token_hash = ${sha256(token)}
      and s.expires_at > now()
      and m.banned = false
    limit 1`;
  const r = rows[0];
  if (!r) return null;
  return { memberId: r.id, spaceId: r.space_id, role: r.role, name: r.display_name };
}

export async function getPartnerId(me: Me): Promise<string | null> {
  const rows = await db()`
    select id from members where space_id = ${me.spaceId} and id <> ${me.memberId} and banned = false limit 1`;
  return rows[0]?.id ?? null;
}
