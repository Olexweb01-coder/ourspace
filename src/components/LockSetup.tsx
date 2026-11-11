"use client";
import { useState } from "react";
import LockInput from "@/components/LockInput";
import { ApiError } from "@/lib/api";
import { LOCK_LABEL, setUpLock, validLock, type LockKind } from "@/lib/applock";
import type { Vault } from "@/lib/vault";

type Props = { vault: Vault; partnerName?: string; onDone: (kind: LockKind) => void; onSkip?: () => void; skipLabel?: string };

// Choose a PIN, pattern or password, enter it twice, done.
export default function LockSetup({ vault, partnerName, onDone, onSkip, skipLabel = "Not now" }: Props) {
  const [kind, setKind] = useState<LockKind>("pin");
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [round, setRound] = useState(0); // remounts the input between steps

  async function enter(value: string) {
    setError(null);
    if (first === null) {
      const problem = validLock(kind, value);
      if (problem) { setError(problem); setRound((r) => r + 1); return; }
      setFirst(value);
      setRound((r) => r + 1);
      return;
    }
    if (value !== first) {
      setError("They didn't match. Start again.");
      setFirst(null);
      setRound((r) => r + 1);
      return;
    }
    setBusy(true);
    try {
      await setUpLock(vault, kind, value);
      onDone(kind);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the lock. Check your connection.");
      setFirst(null);
      setRound((r) => r + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="locksetup">
      <p className="gate__lead">
        {first === null
          ? "Pick how you'd like to open the app on this phone. You'll only need the shared password again if you forget it."
          : `Enter the same ${LOCK_LABEL[kind].toLowerCase()} again.`}
      </p>
      {first === null && (
        <div className="chips" role="radiogroup" aria-label="Lock type">
          {(["pin", "pattern", "password"] as LockKind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "chip chip--on" : "chip"}
              onClick={() => { setKind(k); setError(null); setRound((r) => r + 1); }}>
              {LOCK_LABEL[k]}
            </button>
          ))}
        </div>
      )}
      <LockInput key={`${kind}-${round}`} kind={kind} pinLength={first !== null && kind === "pin" ? first.length : undefined}
        busy={busy} submitLabel={first === null ? "Next" : "Save"} onSubmit={enter} />
      {error && <p className="error" role="alert">{error}</p>}
      {partnerName && first === null && (
        <p className="hint">{partnerName} sets their own on their phone. You can choose the same one or different ones, whatever feels right for you two.</p>
      )}
      {onSkip && <button type="button" className="quiet-link link-btn--quiet" onClick={onSkip}>{skipLabel}</button>}
    </div>
  );
}
