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

export type DerivedKeys = { encKey: CryptoKey; authToken: string };

export async function deriveKeys(password: string, saltB64: string, iterations: number): Promise<DerivedKeys> {
  const base = await crypto.subtle.importKey("raw", te.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const master = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromB64(saltB64), iterations, hash: "SHA-256" },
    base,
    256,
  );
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
  return { encKey, authToken: toB64(authBits) };
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
