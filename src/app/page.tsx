"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import BondMark from "@/components/BondMark";
import LockInput from "@/components/LockInput";
import LockSetup from "@/components/LockSetup";
import SignIn from "@/components/SignIn";
import { api, ApiError } from "@/lib/api";
import { getLock, LockReset, LockWrong, lockSkipped, skipLock, unlockWithLock } from "@/lib/applock";
import { APP_NAME } from "@/lib/brand";
import { deriveKeys, type DerivedKeys } from "@/lib/crypto-client";
import { initial } from "@/lib/format";
import { personalizeInstall } from "@/lib/install";
import { forgetSpace, rememberSpace, savedSpaces, setVault, type SavedSpace, type Vault } from "@/lib/vault";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function UnlockPage() {
  const router = useRouter();
  const [spaces, setSpaces] = useState<SavedSpace[] | null>(null);
  const [current, setCurrent] = useState<SavedSpace | null>(null);
  const [mode, setMode] = useState<"lock" | "password">("password");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerLock, setOfferLock] = useState<Vault | null>(null);
  const [another, setAnother] = useState(false);

  function choose(s: SavedSpace | null) {
    setCurrent(s);
    setError(null);
    if (!s) return;
    personalizeInstall(s.spaceId, s.memberId);
    setMode(getLock(s.spaceId) ? "lock" : "password");
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("s");
    const m = params.get("m");
    let list = savedSpaces();
    // Which space opens:
    // - from a notification (from=n), or a link to a space this phone doesn't know yet: that space;
    // - otherwise (e.g. the Home Screen icon): the space you used most recently, so a switch sticks.
    //   The icon's address only matters on a fresh install (an iPhone Home Screen app starts with empty memory).
    const valid = !!(s && m && UUID.test(s) && UUID.test(m));
    const known = valid ? list.find((x) => x.spaceId === s) : undefined;
    const fromNotification = params.get("from") === "n";
    if (valid && (!known || known.memberId !== m) && (fromNotification || list.length === 0 || !known)) {
      rememberSpace({ spaceId: s!, memberId: m!, label: known?.label ?? "", myName: known?.myName ?? "" });
      list = savedSpaces();
    }
    setSpaces(list);
    const wanted = valid && (fromNotification || !known) ? list.find((x) => x.spaceId === s) : undefined;
    choose(wanted ?? list[0] ?? null);
    if (params.get("another") === "1") setAnother(true);
    // Forget spaces this phone remembers that no longer exist (e.g. after a reset), so nothing stale shows.
    // At most once a day, in the background: opening the app never waits on the network for this.
    let lastCheck = 0;
    try { lastCheck = Number(localStorage.getItem("ourspace:spacecheck") || 0); localStorage.setItem("ourspace:spacecheck", String(Date.now())); } catch { /* ignore */ }
    if (Date.now() - lastCheck > 86_400_000) void Promise.all(list.map(async (x) => {
      try { await api(`/api/auth/salt?spaceId=${x.spaceId}`); return true; }
      catch (err) { if (err instanceof ApiError && err.status === 404) { forgetSpace(x.spaceId); return false; } return true; }
    })).then((alive) => {
      if (alive.every(Boolean)) return;
      const left = savedSpaces();
      setSpaces(left);
      choose(left.find((x) => x.spaceId === s) ?? left[0] ?? null);
    });
  }, []);

  async function finish(keys: DerivedKeys, s: SavedSpace, viaPassword: boolean) {
    const res = await api<{ name: string; label: string }>("/api/auth/login", {
      body: { spaceId: s.spaceId, memberId: s.memberId, authToken: keys.authToken, tz: tz() },
    });
    opened(keys, { ...s, label: res.label, myName: res.name }, viaPassword);
  }

  // A space is open (the server session exists): remember it, keep the key in memory, maybe offer a quicker lock.
  function opened(keys: DerivedKeys, s: SavedSpace, viaPassword: boolean) {
    const res = { name: s.myName, label: s.label };
    rememberSpace(s);
    const vault: Vault = { encKey: keys.encKey, master: keys.master, spaceId: s.spaceId, memberId: s.memberId };
    setVault(vault);
    setPassword("");
    // After the shared password, offer a quicker lock for next time (once, unless skipped).
    if (viaPassword && !getLock(s.spaceId) && !lockSkipped(s.spaceId)) {
      setCurrent({ ...s, myName: res.name, label: res.label });
      setOfferLock(vault);
      setBusy(false);
      return;
    }
    router.push(`/chat?s=${s.spaceId}&m=${s.memberId}`);
  }

  async function withPassword(e: FormEvent) {
    e.preventDefault();
    if (!current || busy || !password) return;
    setBusy(true);
    setError(null);
    try {
      const { salt, iterations } = await api<{ salt: string; iterations: number }>(`/api/auth/salt?spaceId=${current.spaceId}`);
      await finish(await deriveKeys(password, salt, iterations), current, true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach your space. Check your connection and try again.");
      setBusy(false);
    }
  }

  async function withLock(value: string) {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      // All on this phone: no internet. The chat reconnects to the server by itself once it's open.
      const { keys } = await unlockWithLock(current.spaceId, value);
      opened(keys, current, false);
    } catch (err) {
      if (err instanceof LockReset) { setMode("password"); setError(err.message); }
      else if (err instanceof LockWrong) setError(err.message);
      else setError(err instanceof ApiError ? err.message : "Couldn't reach your space. Check your connection and try again.");
      setBusy(false);
    }
  }

  if (spaces === null) return <main className="gate" />;

  if (offerLock && current) {
    const go = () => router.push(`/chat?s=${current.spaceId}&m=${current.memberId}`);
    return (
      <main className="gate">
        <BondMark size={56} a={initial(current.myName)} />
        <h1 className="gate__title">Quicker next time?</h1>
        <LockSetup vault={offerLock} partnerName={current.label || undefined} onDone={go}
          onSkip={() => { skipLock(current.spaceId); go(); }} skipLabel="Not now, I'll use the shared password" />
      </main>
    );
  }

  // A phone that doesn't know a space yet (or "Sign in another way"): host, partner, or start a new space.
  if (!current || another) {
    return <SignIn onOpened={(keys, sp) => opened(keys, sp, true)} onBack={current ? () => setAnother(false) : undefined} />;
  }

  const lock = getLock(current.spaceId);
  return (
    <main className="gate">
      <BondMark size={64} a={initial(current.myName)} b="" />
      <h1 className="gate__title">{APP_NAME}</h1>

      {mode === "lock" && lock ? (
        <>
          <p className="gate__lead">{lock.kind === "pattern" ? "Draw your pattern." : lock.kind === "pin" ? "Enter your PIN." : "Enter your app lock password."}</p>
          <LockInput key={current.spaceId} kind={lock.kind} pinLength={lock.pinLength} busy={busy} onSubmit={withLock} />
          {busy && <p className="hint">Opening…</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <button type="button" className="quiet-link link-btn--quiet" onClick={() => { setMode("password"); setError(null); }}>
            Use the shared password instead
          </button>
        </>
      ) : (
        <>
          <p className="gate__lead">Enter the password only the two of you know.</p>
          <form className="gate__form" onSubmit={withPassword}>
            <label className="sr-only" htmlFor="pw">Shared password</label>
            <input id="pw" className="field" type="password" autoComplete="current-password" placeholder="Shared password"
              value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            <button className="btn btn--wide" disabled={busy || !password}>{busy ? "Opening…" : "Unlock"}</button>
            {error && <p className="error" role="alert">{error}</p>}
          </form>
          {lock && (
            <button type="button" className="quiet-link link-btn--quiet" onClick={() => { setMode("lock"); setError(null); }}>
              Use my {lock.kind === "pin" ? "PIN" : lock.kind} instead
            </button>
          )}
        </>
      )}
      <button type="button" className="quiet-link link-btn--quiet" onClick={() => { setAnother(true); setError(null); }}>Sign in another way</button>
    </main>
  );
}
