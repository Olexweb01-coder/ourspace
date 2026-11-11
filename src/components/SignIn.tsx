"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import BondMark from "@/components/BondMark";
import { api, ApiError } from "@/lib/api";
import { APP_NAME } from "@/lib/brand";
import { deriveKeys, type DerivedKeys } from "@/lib/crypto-client";
import type { SavedSpace } from "@/lib/vault";

type Found = SavedSpace & { salt: string; iterations: number; partnerJoined?: boolean };
type Step = "choose" | "host" | "pick" | "shared" | "partner";
type Props = {
  /** Logs in with these keys; throws if the password is wrong. */
  attempt: (keys: DerivedKeys, s: SavedSpace) => Promise<void>;
  onBack?: () => void;
};

// The front door on any phone: host or partner, then the shared password. Or start a new space.
export default function SignIn({ attempt, onBack }: Props) {
  const [step, setStep] = useState<Step>("choose");
  const [hostPw, setHostPw] = useState("");
  const [name, setName] = useState("");
  const [shared, setShared] = useState("");
  const [spaces, setSpaces] = useState<Found[]>([]);
  const [chosen, setChosen] = useState<Found | null>(null);
  const [asHostByName, setAsHostByName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = (s: Step) => { setStep(s); setError(null); };
  const oops = (err: unknown, fallback: string) => setError(err instanceof ApiError ? err.message : fallback);

  // Tries the shared password against each space (normally just one). The first that opens wins.
  async function open(list: Found[]) {
    let last: unknown = null;
    for (const s of list) {
      try {
        const keys = await deriveKeys(shared, s.salt, s.iterations);
        await attempt(keys, { spaceId: s.spaceId, memberId: s.memberId, label: s.label, myName: s.myName });
        return;
      } catch (err) { last = err; }
    }
    throw last ?? new Error("no match");
  }

  async function hostSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !hostPw) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ unset: boolean; spaces: Found[] }>("/api/auth/host", { body: { hostPassword: hostPw } });
      setHostPw("");
      if (r.unset) { setAsHostByName(true); go("partner"); setError("No host password yet. Sign in with your name and shared password, then set one in Settings."); return; }
      if (r.spaces.length === 0) { setError("There are no spaces yet. Start a new one."); return; }
      setSpaces(r.spaces);
      if (r.spaces.length === 1) { setChosen(r.spaces[0]); go("shared"); } else go("pick");
    } catch (err) { oops(err, "Couldn't check that. Try again."); }
    finally { setBusy(false); }
  }

  async function sharedSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !shared || !chosen) return;
    setBusy(true); setError(null);
    try { await open([chosen]); }
    catch (err) { oops(err, "That shared password didn't open it."); setBusy(false); }
  }

  async function nameSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || !name.trim() || !shared) return;
    setBusy(true); setError(null);
    try {
      const r = await api<{ spaces: Found[] }>("/api/auth/find", { body: { name: name.trim(), role: asHostByName ? "host" : "partner" } });
      if (r.spaces.length === 0) {
        setError(asHostByName ? "No host with that name." : "No partner with that name yet. Use the name you joined with, or open the link you were sent.");
        setBusy(false);
        return;
      }
      await open(r.spaces);
    } catch (err) { oops(err, "That name and shared password don't match."); setBusy(false); }
  }

  const back = (to: Step) => <button type="button" className="quiet-link link-btn--quiet" onClick={() => { go(to); setShared(""); }}>‹ Back</button>;

  return (
    <main className="gate">
      <BondMark size={64} />
      <h1 className="gate__title">{APP_NAME}</h1>

      {step === "choose" && (
        <>
          <p className="gate__lead">A private space for two. How are you signing in?</p>
          <div className="doors">
            <button type="button" className="door" onClick={() => { setAsHostByName(false); go("partner"); }}>
              <span className="door__icon" aria-hidden="true">♥</span>
              <span><strong>I&apos;m their partner</strong><small>Sign in with your name and our shared password</small></span>
            </button>
            <button type="button" className="door" onClick={() => go("host")}>
              <span className="door__icon" aria-hidden="true">✦</span>
              <span><strong>I&apos;m the host</strong><small>I set up our space</small></span>
            </button>
            <Link className="door door--quiet" href="/setup">
              <span className="door__icon" aria-hidden="true">+</span>
              <span><strong>Start a new space</strong><small>For the host. Needs your host password</small></span>
            </Link>
          </div>
          {onBack && <button type="button" className="quiet-link link-btn--quiet" onClick={onBack}>‹ Back to my space</button>}
        </>
      )}

      {step === "host" && (
        <form className="gate__form" onSubmit={hostSubmit}>
          <p className="gate__lead">Welcome back. Your host password first.</p>
          <label className="sr-only" htmlFor="hostpw">Host password</label>
          <input id="hostpw" className="field" type="password" autoComplete="current-password" placeholder="Host password"
            value={hostPw} onChange={(e) => setHostPw(e.target.value)} autoFocus />
          <button className="btn btn--wide" disabled={busy || !hostPw}>{busy ? "Checking…" : "Continue"}</button>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="button" className="quiet-link link-btn--quiet" onClick={() => { setAsHostByName(true); go("partner"); }}>Sign in with my name instead</button>
          {back("choose")}
        </form>
      )}

      {step === "pick" && (
        <>
          <p className="gate__lead">Which space?</p>
          <div className="doors">
            {spaces.map((s) => (
              <button key={s.spaceId} type="button" className="door" onClick={() => { setChosen(s); go("shared"); }}>
                <span className="door__icon" aria-hidden="true">♥</span>
                <span><strong>You &amp; {s.label}</strong><small>{s.partnerJoined ? "Both joined" : `${s.label} hasn't joined yet`}</small></span>
              </button>
            ))}
          </div>
          {back("host")}
        </>
      )}

      {step === "shared" && chosen && (
        <form className="gate__form" onSubmit={sharedSubmit}>
          <p className="gate__lead">You &amp; {chosen.label}. The password only the two of you know.</p>
          <label className="sr-only" htmlFor="pw">Shared password</label>
          <input id="pw" className="field" type="password" autoComplete="current-password" placeholder="Shared password"
            value={shared} onChange={(e) => setShared(e.target.value)} autoFocus />
          <button className="btn btn--wide" disabled={busy || !shared}>{busy ? "Opening…" : "Open our space"}</button>
          {error && <p className="error" role="alert">{error}</p>}
          {back(spaces.length > 1 ? "pick" : "host")}
        </form>
      )}

      {step === "partner" && (
        <form className="gate__form" onSubmit={nameSubmit}>
          <p className="gate__lead">{asHostByName ? "Your name and the shared password." : "Welcome, love. Your name and the password only the two of you know."}</p>
          <label className="sr-only" htmlFor="nm">Your name</label>
          <input id="nm" className="field" autoComplete="given-name" placeholder={asHostByName ? "Your name" : "Your name (as you joined)"}
            value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={60} />
          <label className="sr-only" htmlFor="pw">Shared password</label>
          <input id="pw" className="field" type="password" autoComplete="current-password" placeholder="Shared password"
            value={shared} onChange={(e) => setShared(e.target.value)} />
          <button className="btn btn--wide" disabled={busy || !name.trim() || !shared}>{busy ? "Opening…" : "Open our space"}</button>
          {error && <p className="error" role="alert">{error}</p>}
          {!asHostByName && <p className="hint">First time? Open the link you were sent instead.</p>}
          {back("choose")}
        </form>
      )}
    </main>
  );
}
