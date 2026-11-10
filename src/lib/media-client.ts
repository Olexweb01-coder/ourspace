// Files are encrypted on the phone with the space key before they leave it,
// uploaded straight to private storage, and decrypted only on your two phones.
import { upload } from "@vercel/blob/client";
import { MAX_BYTES, MB, type MediaPurpose } from "./media-limits";
import type { Vault } from "./vault";

export type MediaPayload =
  | { t: "photo"; mediaId: string; mime: string; w: number; h: number; thumb?: string; size: number; caption?: string }
  | { t: "video"; mediaId: string; mime: string; name: string; size: number; caption?: string }
  | { t: "voice"; mediaId: string; mime: string; duration: number; size: number }
  | { t: "file"; mediaId: string; mime: string; name: string; size: number; caption?: string };

export const fileAad = (spaceId: string, mediaId: string) => `file:${spaceId}:${mediaId}`;

export async function encryptBytes(key: CryptoKey, bytes: ArrayBuffer, aad: string): Promise<Blob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) }, key, bytes);
  return new Blob([iv, ct], { type: "application/octet-stream" });
}

export async function decryptBytes(key: CryptoKey, data: ArrayBuffer, aad: string): Promise<ArrayBuffer> {
  const iv = new Uint8Array(data.slice(0, 12));
  const ct = data.slice(12);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(aad) }, key, ct);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * MB) return `${(n / MB).toFixed(n < 10 * MB ? 1 : 0)} MB`;
  return `${(n / (1024 * MB)).toFixed(2)} GB`;
}

/** Encrypts and uploads. Returns the media id to attach to a message, profile or background. */
export async function uploadEncrypted(
  vault: Vault,
  bytes: ArrayBuffer,
  purpose: MediaPurpose,
  onProgress?: (percent: number) => void,
): Promise<string> {
  if (bytes.byteLength > MAX_BYTES[purpose]) {
    throw new Error(`That's too big. The limit is ${formatBytes(MAX_BYTES[purpose])}.`);
  }
  const mediaId = crypto.randomUUID();
  const encrypted = await encryptBytes(vault.encKey, bytes, fileAad(vault.spaceId, mediaId));
  await upload(`spaces/${vault.spaceId}/${mediaId}.bin`, encrypted, {
    access: "private",
    handleUploadUrl: "/api/media/upload",
    contentType: "application/octet-stream",
    clientPayload: JSON.stringify({ purpose }),
    multipart: encrypted.size > 8 * MB,
    onUploadProgress: (p) => onProgress?.(Math.round(p.percentage)),
  });
  return mediaId;
}

// Decrypted files stay in memory while the app is unlocked, so scrolling back doesn't re-download.
const urls = new Map<string, Promise<string>>();

export function mediaUrl(vault: Vault, mediaId: string, mime: string): Promise<string> {
  let p = urls.get(mediaId);
  if (!p) {
    p = (async () => {
      const res = await fetch(`/api/media/${mediaId}`, { credentials: "same-origin" });
      if (!res.ok) throw new Error(res.status === 410 ? "expired" : "failed");
      const plain = await decryptBytes(vault.encKey, await res.arrayBuffer(), fileAad(vault.spaceId, mediaId));
      return URL.createObjectURL(new Blob([plain], { type: mime || "application/octet-stream" }));
    })();
    p.catch(() => urls.delete(mediaId));
    urls.set(mediaId, p);
  }
  return p;
}

export function forgetMediaUrl(mediaId: string) {
  const p = urls.get(mediaId);
  urls.delete(mediaId);
  p?.then((u) => URL.revokeObjectURL(u)).catch(() => {});
}

export function forgetAllMediaUrls() {
  for (const id of Array.from(urls.keys())) forgetMediaUrl(id);
}

/** Shrinks a photo before encrypting: keeps it sharp on a phone while saving storage. */
export async function compressImage(file: Blob, maxSide: number, quality = 0.82): Promise<{ bytes: ArrayBuffer; w: number; h: number; thumb: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This phone can't prepare photos.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("This phone can't prepare photos.");

  // A blurry 24px preview travels inside the encrypted message so the photo has a shape instantly.
  const t = document.createElement("canvas");
  const ts = 24 / Math.max(w, h);
  t.width = Math.max(1, Math.round(w * ts));
  t.height = Math.max(1, Math.round(h * ts));
  t.getContext("2d")?.drawImage(bitmap, 0, 0, t.width, t.height);
  const thumb = t.toDataURL("image/jpeg", 0.5);
  bitmap.close();

  return { bytes: await blob.arrayBuffer(), w, h, thumb };
}

/** Saves the unlocked file to the phone: the share sheet on phones ("Save image" / "Save to Files"), a download elsewhere. */
export async function saveToPhone(url: string, name: string, mime: string): Promise<void> {
  const blob = await (await fetch(url)).blob();
  const file = new File([blob], name, { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
    }
  }
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function extensionFor(mime: string): string {
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("mp4")) return mime.startsWith("audio") ? "m4a" : "mp4";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("ogg")) return "ogg";
  return "bin";
}

/** Picks a voice format both iPhone and Android can play back. */
export function pickAudioMime(): string {
  const options = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  if (typeof MediaRecorder === "undefined") return "";
  return options.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}
