import { db } from "./db";

export const RING_SECONDS = 45;          // unanswered after this: missed
export const STALE_HOURS = 4;            // a call nobody ended (phone died): closed after this
export type CallKind = "voice" | "video";
export type CallStatus = "ringing" | "active" | "ended" | "missed" | "declined" | "busy";

/** Tidies calls in a space: unanswered → missed, abandoned → ended. Returns calls that just became missed. */
export async function settleCalls(spaceId: string): Promise<{ id: string; caller_id: string; callee_id: string; kind: CallKind }[]> {
  const sql = db();
  const missed = await sql`
    update calls set status = 'missed', ended_at = now()
    where space_id = ${spaceId} and status = 'ringing' and created_at < now() - make_interval(secs => ${RING_SECONDS})
    returning id, caller_id, callee_id, kind`;
  await sql`update calls set status = 'ended', ended_at = now()
            where space_id = ${spaceId} and status = 'active' and created_at < now() - make_interval(hours => ${STALE_HOURS})`;
  return missed as { id: string; caller_id: string; callee_id: string; kind: CallKind }[];
}

/** The relay settings, only ever given to signed-in members. Direct connection is always tried first. */
export function iceServers(): RTCIceServer[] {
  const list: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] },   // free, no account: finds the direct route
  ];
  const urls = (process.env.TURN_URL || "").split(",").map((u) => u.trim()).filter((u) => /^turns?:/.test(u));
  if (urls.length && process.env.TURN_USERNAME && process.env.TURN_PASSWORD) {
    // Also offer TCP for networks that block UDP (common on some mobile data and office Wi-Fi).
    const withTcp = urls.flatMap((u) => (u.startsWith("turn:") && !u.includes("transport=") ? [u, `${u}?transport=tcp`] : [u]));
    list.push({ urls: withTcp, username: process.env.TURN_USERNAME, credential: process.env.TURN_PASSWORD });
  }
  return list;
}
