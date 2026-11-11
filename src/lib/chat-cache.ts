"use client";
// Your chat, kept on this phone so it opens instantly. Stored encrypted with the space key (like everything else),
// so it's unreadable without your lock or the shared password. Older than 7 days: ignored and refetched.
import { decryptJSON, encryptJSON } from "./crypto-client";
import type { Vault } from "./vault";

const DB = "ourspace-cache", STORE = "spaces", MAX_AGE = 7 * 86_400_000;
const aad = (spaceId: string) => `cache:${spaceId}`;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function loadCache<T>(v: Vault): Promise<T | null> {
  try {
    const db = await open();
    const rec = await new Promise<{ at: number; iv: string; ct: string } | undefined>((res, rej) => {
      const q = db.transaction(STORE).objectStore(STORE).get(v.spaceId);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
    db.close();
    if (!rec || Date.now() - rec.at > MAX_AGE) return null;
    return await decryptJSON<T>(v.encKey, rec.iv, rec.ct, aad(v.spaceId));
  } catch {
    return null;   // no cache, private browsing, or a different key: just load normally
  }
}

export async function saveCache(v: Vault, data: unknown): Promise<void> {
  try {
    const { iv, ct } = await encryptJSON(v.encKey, data, aad(v.spaceId));
    const db = await open();
    await new Promise<void>((res, rej) => {
      const t = db.transaction(STORE, "readwrite");
      t.objectStore(STORE).put({ at: Date.now(), iv, ct }, v.spaceId);
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    });
    db.close();
  } catch { /* storage full or unavailable: the app still works, just without the instant start */ }
}

export async function clearCache(spaceId: string): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((res) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).delete(spaceId); t.oncomplete = () => res(); t.onerror = () => res(); });
    db.close();
  } catch { /* ignore */ }
}
