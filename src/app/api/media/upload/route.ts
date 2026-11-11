import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  ENCRYPTION_OVERHEAD, MAX_BYTES, MONTHLY_UPLOAD_LIMIT, MONTHLY_UPLOAD_RESERVE,
  STORE_LIMIT_BYTES, STORE_SAFETY_BYTES, type MediaPurpose,
} from "@/lib/media-limits";
import { MEDIA_PATH_RE } from "@/lib/media-server";
import { getMe } from "@/lib/session";

// Hands the phone a short-lived token to upload one encrypted file straight to private Blob storage.
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const me = await getMe();
        if (!me) throw new Error("Unlock the app first.");

        const match = MEDIA_PATH_RE.exec(pathname);
        if (!match || match[1] !== me.spaceId) throw new Error("Invalid upload.");
        const mediaId = match[2];

        let purpose: MediaPurpose = "message";
        try {
          const p = JSON.parse(clientPayload || "{}").purpose;
          if (p === "avatar" || p === "background" || p === "message" || p === "status") purpose = p;
        } catch { /* default */ }

        const sql = db();
        const usage = await sql`
          select coalesce(sum(size), 0)::bigint as total,
                 count(*) filter (where created_at >= date_trunc('month', now()))::int as this_month,
                 count(*) filter (where status = 'pending' and uploader_id = ${me.memberId}
                                  and created_at > now() - interval '1 hour')::int as pending_mine
          from media`;
        const u = usage[0];
        if (Number(u.total) + MAX_BYTES[purpose] > STORE_LIMIT_BYTES - STORE_SAFETY_BYTES) {
          throw new Error("Storage is full. Unkeep some old photos or videos in settings to make room.");
        }
        if (u.this_month >= MONTHLY_UPLOAD_LIMIT - MONTHLY_UPLOAD_RESERVE) {
          throw new Error("You've reached this month's upload limit. It resets on the 1st.");
        }
        if (u.pending_mine >= 30) throw new Error("Too many uploads at once. Wait a moment.");

        const inserted = await sql`
          insert into media (id, space_id, uploader_id, pathname, purpose)
          values (${mediaId}, ${me.spaceId}, ${me.memberId}, ${pathname}, ${purpose})
          on conflict (id) do nothing
          returning id`;
        if (!inserted[0]) throw new Error("Invalid upload.");

        return {
          allowedContentTypes: ["application/octet-stream"],
          maximumSizeInBytes: MAX_BYTES[purpose] + ENCRYPTION_OVERHEAD,
          addRandomSuffix: false,
          allowOverwrite: false,
          cacheControlMaxAge: 60 * 60 * 24 * 365,
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Upload failed" }, { status: 400 });
  }
}
