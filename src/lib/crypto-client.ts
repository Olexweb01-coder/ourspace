// End-to-end encryption, runs only in the browser.
// password --PBKDF2(600k)--> master --HKDF--> encKey (AES-256-GCM, never leaves the device)
//                                       \--> authToken (proves the password to the server)
// The server stores sha256(authToken). It can never derive encKey from it.

export const KDF_ITERATIONS = 600_000;
export const MIN_PASSWORD_LENGTH = 10;

const te = new TextEncoder();
const td = new TextDecoder();

export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function newSalt(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

export type DerivedKeys = { encKey: CryptoKey; authToken: string; master: Uint8Array<ArrayBuffer> };

/** The slow step: shared password -> 32-byte master secret. */
export async function deriveMaster(password: string, saltB64: string, iterations: number): Promise<Uint8Array<ArrayBuffer>> {
  const base = await crypto.subtle.importKey("raw", te.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromB64(saltB64), iterations, hash: "SHA-256" },
    base,
    256,
  );
  return new Uint8Array(bits);
}

/** The fast step: master secret -> encryption key + login proof. The app lock stores the master, scrambled. */
export async function keysFromMaster(master: Uint8Array<ArrayBuffer>): Promise<DerivedKeys> {
  const hkdf = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveKey", "deriveBits"]);
  const empty = new Uint8Array(0);
  const encKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: empty, info: te.encode("ourspace/enc/v1") },
    hkdf,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable
    ["encrypt", "decrypt"],
  );
  const authBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: empty, info: te.encode("ourspace/auth/v1") },
    hkdf,
    256,
  );
  return { encKey, authToken: toB64(authBits), master };
}

export async function deriveKeys(password: string, saltB64: string, iterations: number): Promise<DerivedKeys> {
  return keysFromMaster(await deriveMaster(password, saltB64, iterations));
}

// ---------------- App lock ----------------
// lock (PIN / pattern / password) --PBKDF2--> 64 bytes: first half proves the lock to the server,
// second half never leaves the phone. Unlock key = HKDF(server half + phone half).

export const LOCK_ITERATIONS = 300_000;

export async function lockSecrets(lock: string, saltB64: string): Promise<{ proof: string; phoneHalf: Uint8Array<ArrayBuffer> }> {
  const base = await crypto.subtle.importKey("raw", te.encode(lock.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromB64(saltB64), iterations: LOCK_ITERATIONS, hash: "SHA-256" }, base, 512));
  const phoneHalf = new Uint8Array(new ArrayBuffer(32));
  phoneHalf.set(bits.slice(32));
  return { proof: toB64(bits.slice(0, 32)), phoneHalf };
}

async function unlockKey(serverHalfB64: string, phoneHalf: Uint8Array<ArrayBuffer>, deviceId: string): Promise<CryptoKey> {
  const server = fromB64(serverHalfB64);
  const joined = new Uint8Array(new ArrayBuffer(server.length + phoneHalf.length));
  joined.set(server, 0);
  joined.set(phoneHalf, server.length);
  const hkdf = await crypto.subtle.importKey("raw", joined, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: te.encode(`ourspace/applock/v1/${deviceId}`) },
    hkdf, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function sealMaster(master: Uint8Array<ArrayBuffer>, serverHalf: string, phoneHalf: Uint8Array<ArrayBuffer>, deviceId: string) {
  const key = await unlockKey(serverHalf, phoneHalf, deviceId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, master);
  return { iv: toB64(iv), ct: toB64(ct) };
}

export async function openMaster(sealed: { iv: string; ct: string }, serverHalf: string, phoneHalf: Uint8Array<ArrayBuffer>, deviceId: string) {
  const key = await unlockKey(serverHalf, phoneHalf, deviceId);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(sealed.iv) }, key, fromB64(sealed.ct));
  return new Uint8Array(pt);
}

export async function encryptJSON(key: CryptoKey, value: unknown, aad: string): Promise<{ iv: string; ct: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: te.encode(aad) },
    key,
    te.encode(JSON.stringify(value)),
  );
  return { iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptJSON<T>(key: CryptoKey, ivB64: string, ctB64: string, aad: string): Promise<T> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64), additionalData: te.encode(aad) },
    key,
    fromB64(ctB64),
  );
  return JSON.parse(td.decode(pt)) as T;
}

/** Binds each ciphertext to its space and sender so the server can't swap them around. */
export function messageAad(spaceId: string, senderId: string): string {
  return `msg:${spaceId}:${senderId}`;
}
