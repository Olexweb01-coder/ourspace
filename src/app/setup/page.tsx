"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import BondMark from "@/components/BondMark";
import InviteBox from "@/components/InviteBox";
import { api, ApiError } from "@/lib/api";
import { APP_NAME } from "@/lib/brand";
import { deriveKeys, KDF_ITERATIONS, MIN_PASSWORD_LENGTH, newSalt } from "@/lib/crypto-client";
import { initial } from "@/lib/format";
import { personalizeInstall } from "@/lib/install";
import { rememberSpace, setVault } from "@/lib/vault";

type Mode =
  | { mode: "host"; name: string; used: number; max: number }   // signed in as host: nothing extra
  | { mode: "password" }                                          // ask for the host password
  | { mode: "create" }                                            // very first space: choose a host password
  | { mode: "settings" };                                         // spaces exist, no host password yet
type Done = { spaceId: string; memberId: string; inviteUrl: string; expiresAt: string };

export default function SetupPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [recover, setRecover] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [hostPassword, setHostPassword] = useState("");
  const [hostConfirm, setHostConfirm] = useState("");
  const [hostName, setHostName] = useState("");
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    api<Mode>("/api/setup").then((m) => { setMode(m); if (m.mode === "host") setHostName(m.name); })
      .catch(() => setMode({ mode: "password" }));
  }, []);

  const asHost = mode?.mode === "host";
  // A new host password is chosen on the very first space, or when using the emergency reset.
  const choosingHostPw = !asHost && (mode?.mode === "create" || recover);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters. A short sentence only you two would say works best.`);
    if (password !== confirm) return setError("The two shared passwords don't match.");
    if (choosingHostPw && hostPassword !== hostConfirm) return setError("The two host passwords don't match.");
    if (!asHost && hostPassword.length < 6) return setError("The host password is at least 6 characters.");
    setBusy(true);
    try {
      const salt = newSalt();
      const { encKey, authToken, master } = await deriveKeys(password, salt, KDF_ITERATIONS);
      const res = await api<Done>("/api/setup", {
        body: {
          ...(asHost ? {} : { hostPassword }), ...(recover ? { recoveryKey } : {}),
          hostName, label, salt, iterations: KDF_ITERATIONS, authToken,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      rememberSpace({ spaceId: res.spaceId, memberId: res.memberId, label, myName: hostName });
      setVault({ encKey, master, spaceId: res.spaceId, memberId: res.memberId });
      personalizeInstall(res.spaceId, res.memberId);
      setPassword("");
      setConfirm("");
      setDone(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the space. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (!mode) return <main className="gate" aria-busy="true" />;

  if (done) {
    return (
      <main className="gate">
        <BondMark size={64} a={initial(hostName)} b={initial(label)} />
        <h1 className="gate__title">Your space is ready</h1>
        <p className="gate__lead">Send {label} this link. They open it, type the shared password, and add {APP_NAME} to their home screen.</p>
        <InviteBox url={done.inviteUrl} expiresAt={done.expiresAt} />
        <button className="btn btn--wide" onClick={() => router.push(`/chat?s=${done.spaceId}&m=${done.memberId}`)}>Enter our space</button>
      </main>
    );
  }

  // Spaces exist but no host password has been chosen yet: set it from inside the app first.
  if (mode.mode === "settings" && !recover) {
    return (
      <main className="gate">
        <BondMark size={64} />
        <h1 className="gate__title">New space</h1>
        <p className="gate__lead">Choose your host password first: open your space, then Settings, then Host password. After that you can start a space from any phone with it.</p>
        <button className="btn btn--wide" onClick={() => router.push("/")}>Open my space</button>
        <button type="button" className="quiet-link link-btn--quiet" onClick={() => setRecover(true)}>Emergency reset</button>
      </main>
    );
  }

  return (
    <main className="gate">
      <BondMark size={64} a={initial(hostName)} b={initial(label)} />
      <h1 className="gate__title">{asHost ? "A new space" : "Make a space"}</h1>
      <p className="gate__lead">
        {asHost
          ? `Signed in as ${hostName}. ${mode.mode === "host" ? `${mode.used} of ${mode.max} spaces used. ` : ""}The password locks everything and nobody can reset it, so pick one you'll both remember.`
          : recover
            ? "Emergency reset: enter the key from Vercel and choose a new host password."
            : "The shared password locks everything. It never leaves your phone, and nobody can reset it."}
      </p>
      <form className="gate__form" onSubmit={submit}>
        {recover && (
          <>
            <label className="label" htmlFor="rk">Emergency key (HOST_SETUP_KEY from Vercel)</label>
            <input id="rk" className="field" type="password" value={recoveryKey} onChange={(e) => setRecoveryKey(e.target.value)} autoComplete="off" required />
          </>
        )}
        {!asHost && (
          <>
            <label className="label" htmlFor="hp">{choosingHostPw ? "Choose a host password" : "Host password"}</label>
            <input id="hp" className="field" type="password" value={hostPassword} onChange={(e) => setHostPassword(e.target.value)}
              autoComplete={choosingHostPw ? "new-password" : "current-password"} required autoFocus />
            {choosingHostPw && (
              <>
                <label className="label" htmlFor="hp2">Type the host password again</label>
                <input id="hp2" className="field" type="password" value={hostConfirm} onChange={(e) => setHostConfirm(e.target.value)} autoComplete="new-password" required />
                <p className="hint">Only for starting new spaces. Make it different from any shared password.</p>
              </>
            )}
          </>
        )}
        {!asHost && (
          <>
            <label className="label" htmlFor="n">Your name</label>
            <input id="n" className="field" value={hostName} onChange={(e) => setHostName(e.target.value)} maxLength={40} required />
          </>
        )}
        <label className="label" htmlFor="l">What you call them</label>
        <input id="l" className="field" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="Babe" required autoFocus={asHost} />
        <label className="label" htmlFor="p">Shared password</label>
        <input id="p" className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        <label className="label" htmlFor="c">Type it again</label>
        <input id="c" className="field" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        <button className="btn btn--wide" disabled={busy}>{busy ? "Locking it up…" : "Create our space"}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
      {mode.mode === "password" && !recover && (
        <button type="button" className="quiet-link link-btn--quiet" onClick={() => { setRecover(true); setError(null); }}>Forgot your host password?</button>
      )}
    </main>
  );
}
