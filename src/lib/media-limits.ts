// Shared by the phone and the server. Vercel Hobby Blob: 1 GB stored, 2,000 advanced operations a month.
export const MB = 1024 * 1024;
export const STORE_LIMIT_BYTES = 1024 * MB;
export const STORE_SAFETY_BYTES = 40 * MB;
export const MONTHLY_UPLOAD_LIMIT = 2000;
export const MONTHLY_UPLOAD_RESERVE = 150; // leave room for clean-up operations
export const MEDIA_DAYS = 30;
export const ENCRYPTION_OVERHEAD = 64; // 12-byte nonce + 16-byte tag, rounded up

export type MediaPurpose = "message" | "avatar" | "background" | "status";
export const MAX_BYTES: Record<MediaPurpose, number> = {
  message: 50 * MB,
  avatar: 3 * MB,
  background: 8 * MB,
  status: 8 * MB,
};

export const THEMES = ["candle", "rose", "midnight", "blush"] as const;
export type Theme = (typeof THEMES)[number];
