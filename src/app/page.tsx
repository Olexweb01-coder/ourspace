"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BondMark from "@/components/BondMark";
import { api, ApiError } from "@/lib/api";
import { APP_NAME } from "@/lib/brand";
import { deriveKeys } from "@/lib/crypto-client";
import { initial } from "@/lib/format";
import { personalizeInstall } from "@/lib/install";
import { rememberSpace, savedSpaces, setVault, type SavedSpace } from "@/lib/vault";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function UnlockPage() {
  const router = useRouter();
  const [spaces, setSpaces] = useState<SavedSpace[] | null>(null);
  const [current, setCurrent] = useState<SavedSpace | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("s");
    const m = params.get("m");
    let list = savedSpaces();
    if (s && m && UUID.test(s) && UUID.test(m)) {
      const known = list.find((x) => x.spaceId === s);
      if (!known || known.memberId !== m) {
        rememberSpace({ spaceId: s, memberId: m, label: known?.label ?? "", myName: known?.myName ?? "" });
        list = savedSpaces();
      }
    }
    const pick = list.find((x) => x.spaceId === s) ?? list[0] ?? null;
    setSpaces(list);
    setCurrent(pick);
    if (pick) personalizeInstall(pick.spaceId, pick.memberId);
  }, []);

  function choose(s: SavedSpace) {
    setCurrent(s);
    setError(null);
    personalizeInstall(s.spaceId, s.memberId);
  }

  async function unlock(e: FormEvent) {
    e.preventDefault();
    if (!current || busy || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { salt, iterations } = await api<{ salt: string; iterations: number }>(`/api/auth/salt?spaceId=${current.spaceId}`);
      const { encKey, authToken } = await deriveKeys(password, salt, iterations);
      const res = await api<{ name: string; label: string }>("/api/auth/login", {
        body: { spaceId: current.spaceId, memberId: current.memberId, authToken, tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      rememberSpace({ ...current, label: res.label, myName: res.name });
      setVault({ encKey, spaceId: current.spaceId, memberId: current.memberId });
      setPassword("");
      router.push(`/chat?s=${current.spaceId}&m=${current.memberId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach your space. Check your connection and try again.");
      setBusy(false);
    }
  }

  if (spaces === null) return <main className="gate" />;

  if (!current) {
    return (
      <main className="gate">
        <BondMark size={64} />
        <h1 className="gate__title">{APP_NAME}</h1>
        <p className="gate__lead">This is a private space for two. Open the invite link you were sent to get in.</p>
        <Link className="quiet-link" href="/setup">Set up a new space</Link>
      </main>
    );
  }

  return (
    <main className="gate">
      <BondMark size={64} a={initial(current.myName)} b="" />
      <h1 className="gate__title">{APP_NAME}</h1>
      <p className="gate__lead">Enter the password only the two of you know.</p>

      {spaces.length > 1 && (
        <div className="chips" role="radiogroup" aria-label="Choose a space">
          {spaces.map((s) => (
            <button
              key={s.spaceId}
              type="button"
              role="radio"
              aria-checked={s.spaceId === current.spaceId}
              className={s.spaceId === current.spaceId ? "chip chip--on" : "chip"}
              onClick={() => choose(s)}
            >
              {s.label || "Our space"}
            </button>
          ))}
        </div>
      )}

      <form className="gate__form" onSubmit={unlock}>
        <label className="sr-only" htmlFor="pw">Shared password</label>
        <input
          id="pw"
          className="field"
          type="password"
          autoComplete="current-password"
          placeholder="Shared password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <button className="btn btn--wide" disabled={busy || !password}>
          {busy ? "Opening…" : "Unlock"}
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </main>
  );
}
