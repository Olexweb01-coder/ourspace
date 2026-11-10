"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import BondMark from "@/components/BondMark";
import InviteBox from "@/components/InviteBox";
import { api, ApiError } from "@/lib/api";
import { APP_NAME } from "@/lib/brand";
import { deriveKeys, KDF_ITERATIONS, MIN_PASSWORD_LENGTH, newSalt } from "@/lib/crypto-client";
import { initial } from "@/lib/format";
import { personalizeInstall } from "@/lib/install";
import { rememberSpace, setVault } from "@/lib/vault";

type Done = { spaceId: string; memberId: string; inviteUrl: string; expiresAt: string };

export default function SetupPage() {
  const router = useRouter();
  const [setupKey, setSetupKey] = useState("");
  const [hostName, setHostName] = useState("");
  const [label, setLabel] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters. A short sentence only you two would say works best.`);
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      const salt = newSalt();
      const { encKey, authToken } = await deriveKeys(password, salt, KDF_ITERATIONS);
      const res = await api<Done>("/api/setup", {
        body: { setupKey, hostName, label, salt, iterations: KDF_ITERATIONS, authToken, tz: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      rememberSpace({ spaceId: res.spaceId, memberId: res.memberId, label, myName: hostName });
      setVault({ encKey, spaceId: res.spaceId, memberId: res.memberId });
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

  if (done) {
    return (
      <main className="gate">
        <BondMark size={64} a={initial(hostName)} b={initial(label)} />
        <h1 className="gate__title">Your space is ready</h1>
        <p className="gate__lead">Send {label} this link. She opens it, types the password, and adds {APP_NAME} to her home screen.</p>
        <InviteBox url={done.inviteUrl} expiresAt={done.expiresAt} />
        <button className="btn btn--wide" onClick={() => router.push(`/chat?s=${done.spaceId}&m=${done.memberId}`)}>
          Enter our space
        </button>
      </main>
    );
  }

  return (
    <main className="gate">
      <BondMark size={64} a={initial(hostName)} b={initial(label)} />
      <h1 className="gate__title">Make a space</h1>
      <p className="gate__lead">The password locks everything. It never leaves your phone, and nobody can reset it, so pick one you'll both remember.</p>
      <form className="gate__form" onSubmit={submit}>
        <label className="label" htmlFor="k">Setup key</label>
        <input id="k" className="field" type="password" value={setupKey} onChange={(e) => setSetupKey(e.target.value)} autoComplete="off" required />
        <label className="label" htmlFor="n">Your name</label>
        <input id="n" className="field" value={hostName} onChange={(e) => setHostName(e.target.value)} maxLength={40} required />
        <label className="label" htmlFor="l">What you call her</label>
        <input id="l" className="field" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="Babe" required />
        <label className="label" htmlFor="p">Shared password</label>
        <input id="p" className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        <label className="label" htmlFor="c">Type it again</label>
        <input id="c" className="field" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        <button className="btn btn--wide" disabled={busy}>{busy ? "Locking it up…" : "Create our space"}</button>
        {error && <p className="error" role="alert">{error}</p>}
      </form>
    </main>
  );
}
