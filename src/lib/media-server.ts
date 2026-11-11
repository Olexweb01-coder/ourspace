import { del, head } from "@vercel/blob";
import { db } from "./db";
import type { MediaPurpose } from "./media-limits";
import { UUID_RE } from "./server-utils";
import type { Me } from "./session";

export const MEDIA_PATH_RE = /^spaces\/([0-9a-f-]{36})\/([0-9a-f-]{36})\.bin$/;

/**
 * Confirms an encrypted file really reached storage, records its size and marks it ready.
 * Only the uploader can claim it, once, for the purpose it was uploaded for.
 */
export async function claimMedia(me: Me, mediaId: unknown, purpose: MediaPurpose): Promise<{ id: string; size: number } | null> {
  if (typeof mediaId !== "string" || !UUID_RE.test(mediaId)) return null;
  const sql = db();
  const rows = await sql`
    select pathname from media
    where id = ${mediaId} and space_id = ${me.spaceId} and uploader_id = ${me.memberId}
      and purpose = ${purpose} and status = 'pending' and message_id is null`;
  const row = rows[0];
  if (!row) return null;
  let size: number;
  try {
    size = (await head(row.pathname)).size;
  } catch {
    return null; // upload never finished
  }
  await sql`update media set status = 'ready', size = ${size} where id = ${mediaId}`;
  return { id: mediaId, size };
}

/** Removes files from Blob storage in batches. */
export async function deleteBlobs(pathnames: string[]): Promise<void> {
  for (let i = 0; i < pathnames.length; i += 500) {
    const chunk = pathnames.slice(i, i + 500);
    if (chunk.length) await del(chunk);
  }
}

/** Removes a message's photo, video, voice note or file from storage right away (view once opened, or deleted for everyone). */
export async function removeMessageMedia(messageId: string): Promise<void> {
  const sql = db();
  const rows = await sql`select id, pathname from media where message_id = ${messageId}::bigint`;
  if (rows.length === 0) return;
  await deleteBlobs(rows.map((r) => r.pathname as string));
  await sql`delete from media where id = any(${rows.map((r) => r.id as string)}::uuid[])`;
}
