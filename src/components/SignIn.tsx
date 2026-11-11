"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import BondMark from "@/components/BondMark";
import { api, ApiError } from "@/lib/api";
import { APP_NAME } from "@/lib/brand";
import { deriveKeys, type DerivedKeys } from "@/lib/crypto-client";
import type { SavedSpace } from "@/lib/vault";

type Door = { salt: string; iterations: number };
type Opened = { salt: string; spaceId: string; memberId: string; name: string; label: string };
type Step = "choose" | "host" | "partner";
type Props = {
  /** Called once a space has opened (the server session already exists). */
  onOpened: (keys: DerivedKeys, s: SavedSpace) => void;
  onBack?: () => void;
};
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// The front door on any phone. Host: host password + shared password. Partner: shared password only.
// The phone tries the shared password against every door (some are decoys), so nobody can tell how many spaces exist.
export default function SignIn({ onOpened, onBack }: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [hostPw, setHostPw] = useState("");
  const [shared, setShared] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = (s: Step) => { setStep(s); setError(null); setShared(""); setHostPw(""); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !shared || (step === "host" && !hostPw)) return;
    setBusy(true);
    setError(null);
    try {
      const { doors } = await api<{ doors: Door[] }>("/api/auth/doors");
      const keys = await Promise.all(doors.map((d) => deriveKeys(shared, d.salt, d.iterations)));
      const res = await api<Opened>("/api/auth/open", {
        body: {
          role: step === "host" ? "host" : "partner",
          ...(step === "host" ? { hostPassword: hostPw } : {}),
          tries: doors.map((d, i) => ({ salt: d.salt, token: keys[i].authToken })),
          tz: tz(),
        },
      });
      const k = keys[doors.findIndex((d) => d.salt === res.salt)];
      setShared(""); setHostPw("");
      onOpened(k, { spaceId: res.spaceId, memberId: res.memberId, label: res.label, myName: res.name });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach Our Space. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <main className="gate">
      <BondMark size={64} />
      {step === "choose" && (
        <>
          <h1 className="gate__title">{APP_NAME}</h1>
          <p className="gate__lead">How are you signing in?</p>
          <div className="doors">
            <button type="button" className="door" onClick={() => go("host")}>
              <span className="door__icon" aria-hidden="true">✦</span>
              <span><strong>I&apos;m the host</strong><small>Host password and shared password</small></span>
            </button>
            <button type="button" className="door" onClick={() => go("partner")}>
              <span className="door__icon" aria-hidden="true">♥</span>
              <span><strong>I&apos;m the partner</strong><small>Just our shared password</small></span>
            </button>
            <Link className="door door--quiet" href="/setup">
              <span className="door__icon" aria-hidden="true">+</span>
              <span><strong>Start a new space</strong><small>Host only</small></span>
            </Link>
          </div>
          {onBack && <button type="button" className="quiet-link link-btn--quiet" onClick={onBack}>‹ Back</button>}
        </>
      )}

      {step !== "choose" && (
        <form className="gate__form" onSubmit={submit}>
          <h1 className="gate__title">{step === "host" ? "Welcome back" : "Welcome, love"}</h1>
          <p className="gate__lead">{step === "host" ? "Sign in as the host" : "The password only the two of you know"}</p>
          {step === "host" && (
            <>
              <label className="sr-only" htmlFor="hostpw">Host password</label>
              <input id="hostpw" className="field" type="password" autoComplete="off" placeholder="Host password"
                value={hostPw} onChange={(e) => setHostPw(e.target.value)} autoFocus />
            </>
          )}
          <label className="sr-only" htmlFor="pw">Shared password</label>
          <input id="pw" className="field" type="password" autoComplete="current-password" placeholder="Shared password"
            value={shared} onChange={(e) => setShared(e.target.value)} autoFocus={step === "partner"} />
          <button className="btn btn--wide" disabled={busy || !shared || (step === "host" && !hostPw)}>{busy ? "Opening…" : "Open our space"}</button>
          {busy && <p className="hint">This can take a few seconds the first time.</p>}
          {error && <p className="error" role="alert">{error}</p>}
          {step === "partner" && <p className="hint">First time here? Open the link you were sent.</p>}
          <button type="button" className="quiet-link link-btn--quiet" onClick={() => go("choose")}>‹ Back</button>
        </form>
      )}
    </main>
  );
}
