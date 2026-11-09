// Holds the decryption key in memory only. Closing or locking the app forgets it.
export type Vault = {
  encKey: CryptoKey;
  spaceId: string;
  memberId: string;
};

let vault: Vault | null = null;

export const setVault = (v: Vault) => { vault = v; };
export const getVault = () => vault;
export const clearVault = () => { vault = null; };

// Devices remember which space they belong to (not secret – the password still is).
export type SavedSpace = { spaceId: string; memberId: string; label: string; myName: string };
const KEY = "ls_spaces";

export function savedSpaces(): SavedSpace[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedSpace[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function rememberSpace(s: SavedSpace) {
  const list = savedSpaces().filter((x) => x.spaceId !== s.spaceId);
  list.unshift(s);
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 5)));
}

export function forgetSpace(spaceId: string) {
  localStorage.setItem(KEY, JSON.stringify(savedSpaces().filter((x) => x.spaceId !== spaceId)));
}
