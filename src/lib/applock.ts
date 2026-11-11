// The app lock on this phone. The shared password is entered once; after that a PIN, pattern or password opens the app.
import { api, ApiError } from "./api";
import { keysFromMaster, lockSecrets, openMaster, sealMaster, toB64, type DerivedKeys } from "./crypto-client";
import type { Vault } from "./vault";

export type LockKind = "pin" | "pattern" | "password";
type Stored = { deviceId: string; deviceToken: string; lockSalt: string; kind: LockKind; pinLength?: number; memberId: string; iv: string; ct: string };

const key = (spaceId: string) => `ourspace:lock:${spaceId}`;
const skipKey = (spaceId: string) => `ourspace:lockskip:${spaceId}`;
const rand = (n: number) => toB64(crypto.getRandomValues(new Uint8Array(n)));

export function getLock(spaceId: string): Stored | null {
  try {
    const s = JSON.parse(localStorage.getItem(key(spaceId)) || "null") as Stored | null;
    return s && s.deviceId && s.iv ? s : null;
  } catch {
    return null;
  }
}

export function clearLock(spaceId: string) {
  try { localStorage.removeItem(key(spaceId)); } catch { /* ignore */ }
}

export const lockSkipped = (spaceId: string) => { try { return localStorage.getItem(skipKey(spaceId)) === "1"; } catch { return false; } };
export const skipLock = (spaceId: string) => { try { localStorage.setItem(skipKey(spaceId), "1"); } catch { /* ignore */ } };

export function validLock(kind: LockKind, value: string): string | null {
  if (kind === "pin") return /^\d{4,6}$/.test(value) ? null : "Use 4 to 6 numbers.";
  if (kind === "pattern") return value.split("-").length >= 4 ? null : "Connect at least 4 dots.";
  return value.length >= 4 ? null : "Use at least 4 characters.";
}

/** Sets (or changes) the lock on this phone. Needs the app to be unlocked. */
export async function setUpLock(vault: Vault, kind: LockKind, value: string): Promise<void> {
  const existing = getLock(vault.spaceId);
  const deviceId = existing?.deviceId ?? crypto.randomUUID();
  const deviceToken = rand(32);
  const lockSalt = rand(16);
  const { proof, phoneHalf } = await lockSecrets(value, lockSalt);
  const { serverHalf } = await api<{ serverHalf: string }>("/api/lock", {
    body: { action: "setup", deviceId, deviceToken, lockProof: proof, kind },
  });
  const sealed = await sealMaster(vault.master, serverHalf, phoneHalf, deviceId);
  const stored: Stored = { deviceId, deviceToken, lockSalt, kind, memberId: vault.memberId, ...sealed, ...(kind === "pin" ? { pinLength: value.length } : {}) };
  localStorage.setItem(key(vault.spaceId), JSON.stringify(stored));
  try { localStorage.removeItem(skipKey(vault.spaceId)); } catch { /* ignore */ }
}

export class LockReset extends Error {}

/** Opens the app with the lock. Throws LockReset when the shared password is needed again. */
export async function unlockWithLock(spaceId: string, value: string): Promise<{ keys: DerivedKeys; memberId: string }> {
  const s = getLock(spaceId);
  if (!s) throw new LockReset("Use your shared password.");
  const { proof, phoneHalf } = await lockSecrets(value, s.lockSalt);
  try {
    const res = await api<{ serverHalf: string; memberId: string }>("/api/lock", {
      body: { action: "unlock", deviceId: s.deviceId, deviceToken: s.deviceToken, lockProof: proof },
    });
    const master = await openMaster({ iv: s.iv, ct: s.ct }, res.serverHalf, phoneHalf, s.deviceId);
    return { keys: await keysFromMaster(master), memberId: res.memberId };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 410 || err.status === 403)) {
      clearLock(spaceId);
      throw new LockReset(err.message);
    }
    throw err;
  }
}

export async function removeLock(spaceId: string): Promise<void> {
  const s = getLock(spaceId);
  if (s) await api("/api/lock", { body: { action: "remove", deviceId: s.deviceId } }).catch(() => {});
  clearLock(spaceId);
  skipLock(spaceId);
}

export const LOCK_LABEL: Record<LockKind, string> = { pin: "PIN", pattern: "Pattern", password: "Password" };
