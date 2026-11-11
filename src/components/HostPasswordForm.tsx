"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";

// Host only: the short password for starting new spaces from any phone.
export default function HostPasswordForm({ onToast }: { onToast: (m: string) => void }) {
  const [isSet, setIsSet] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api<{ set: boolean }>("/api/host-password").then((r) => setIsSet(r.set)).catch(() => setIsSet(null)); }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 6) return setError("Use at least 6 characters.");
    if (pw !== pw2) return setError("They don't match.");
    setBusy(true);
    try {
      await api("/api/host-password", { body: { password: pw } });
      setIsSet(true); setOpen(false); setPw(""); setPw2("");
      onToast("Host password saved");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save it. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <>
        <p className="hint">{isSet ? "Set. Use it to start a new space from any phone." : "Not set yet. Choose one so you can start a new space from any phone."}</p>
        <button className="btn btn--ghost" onClick={() => setOpen(true)}>{isSet ? "Change host password" : "Set host password"}</button>
      </>
    );
  }
  return (
    <form className="gate__form" onSubmit={save}>
      <label className="label" htmlFor="hpw">New host password</label>
      <input id="hpw" className="field" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" autoFocus />
      <label className="label" htmlFor="hpw2">Type it again</label>
      <input id="hpw2" className="field" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
      <p className="hint">Different from your shared password. Only you need it.</p>
      <div className="row">
        <button className="btn" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="btn btn--ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
