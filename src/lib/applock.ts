// The app lock on this phone. The shared password is entered once; after that a PIN, pattern or password opens the app.
// Version 2 works entirely on the phone: no internet needed to open, so it's instant even offline.
// Five wrong tries wipe the lock from this phone; then the shared password is needed again.
import { api, ApiError } from "./api";
import { keysFromMaster, lockSecrets, openMaster, openMasterLocal, sealMasterLocal, toB64, type DerivedKeys } from "./crypto-client";
import type { Vault } from "./vault";

export type LockKind = "pin" | "pattern" | "password";
type StoredV1 = { v?: 1; deviceId: string; deviceToken: string; lockSalt: string; kind: LockKind; pinLength?: number; memberId: string; iv: string; ct: string };
type StoredV2 = { v: 2; lockSalt: string; kind: LockKind; pinLength?: number; memberId: string; iv: string; ct: string; tries: number };
type Stored = StoredV1 | StoredV2;
export const MAX_LOCK_TRIES = 5;

const key = (spaceId: string) => `ourspace:lock:${spaceId}`;
const skipKey = (spaceId: string) => `ourspace:lockskip:${spaceId}`;
const rand = (n: number) => toB64(crypto.getRandomValues(new Uint8Array(n)));

export function getLock(spaceId: string): Stored | null {
  try {
    const s = JSON.parse(localStorage.getItem(key(spaceId)) || "null") as Stored | null;
    return s && s.iv && s.ct && s.lockSalt ? s : null;
  } catch {
    return null;
  }
}
function saveLock(spaceId: string, s: Stored) { localStorage.setItem(key(spaceId), JSON.stringify(s)); }

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

/** Forgets an old server-backed lock on the server (best effort; never blocks). */
function retireV1(s: Stored | null) {
  if (s && s.v !== 2 && "deviceId" in s) void api("/api/lock", { body: { action: "remove", deviceId: s.deviceId } }).catch(() => {});
}

/** Sets (or changes) the lock on this phone. Needs the app to be unlocked. No internet needed. */
export async function setUpLock(vault: Vault, kind: LockKind, value: string): Promise<void> {
  const before = getLock(vault.spaceId);
  const lockSalt = rand(16);
  const sealed = await sealMasterLocal(vault.master, value, lockSalt);
  saveLock(vault.spaceId, { v: 2, lockSalt, kind, memberId: vault.memberId, ...sealed, tries: 0, ...(kind === "pin" ? { pinLength: value.length } : {}) });
  try { localStorage.removeItem(skipKey(vault.spaceId)); } catch { /* ignore */ }
  retireV1(before);
}

export class LockReset extends Error {}
export class LockWrong extends Error {}

/** Opens the app with the lock. Throws LockWrong (try again) or LockReset (use the shared password). */
export async function unlockWithLock(spaceId: string, value: string): Promise<{ keys: DerivedKeys; memberId: string }> {
  const s = getLock(spaceId);
  if (!s) throw new LockReset("Use your shared password.");

  if (s.v === 2) {
    let master: Uint8Array<ArrayBuffer>;
    try {
      master = await openMasterLocal({ iv: s.iv, ct: s.ct }, value, s.lockSalt);
    } catch {
      const tries = (s.tries ?? 0) + 1;
      if (tries >= MAX_LOCK_TRIES) { clearLock(spaceId); throw new LockReset("Too many wrong tries. Use your shared password."); }
      saveLock(spaceId, { ...s, tries });
      const left = MAX_LOCK_TRIES - tries;
      throw new LockWrong(`That's not it. ${left} ${left === 1 ? "try" : "tries"} left.`);
    }
    if (s.tries) saveLock(spaceId, { ...s, tries: 0 });
    return { keys: await keysFromMaster(master), memberId: s.memberId };
  }

  // An older lock (kept a secret on the server): open it one last time, then move it onto the phone.
  const { proof, phoneHalf } = await lockSecrets(value, s.lockSalt);
  try {
    const res = await api<{ serverHalf: string; memberId: string }>("/api/lock", {
      body: { action: "unlock", deviceId: s.deviceId, deviceToken: s.deviceToken, lockProof: proof },
    });
    const master = await openMaster({ iv: s.iv, ct: s.ct }, res.serverHalf, phoneHalf, s.deviceId);
    const lockSalt = rand(16);
    saveLock(spaceId, { v: 2, lockSalt, kind: s.kind, memberId: res.memberId, ...(await sealMasterLocal(master, value, lockSalt)), tries: 0, ...(s.pinLength ? { pinLength: s.pinLength } : {}) });
    retireV1(s);
    return { keys: await keysFromMaster(master), memberId: res.memberId };
  } catch (err) {
    if (err instanceof ApiError && (err.status === 410 || err.status === 403)) {
      clearLock(spaceId);
      throw new LockReset(err.message);
    }
    if (err instanceof ApiError && err.status === 401) throw new LockWrong(err.message);
    throw err;
  }
}

export async function removeLock(spaceId: string): Promise<void> {
  retireV1(getLock(spaceId));
  clearLock(spaceId);
  skipLock(spaceId);
}

export const LOCK_LABEL: Record<LockKind, string> = { pin: "PIN", pattern: "Pattern", password: "Password" };
