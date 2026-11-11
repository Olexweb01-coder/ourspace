"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { deriveKeys } from "@/lib/crypto-client";
import { forgetAllMediaUrls } from "@/lib/media-client";
import { rememberSpace, savedSpaces, setVault, type SavedSpace } from "@/lib/vault";

type Props = { currentSpaceId: string; isHost: boolean; onClose: () => void };
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// Like switching accounts in WhatsApp: the spaces this phone knows, each opened with its own shared password.
// Only ever shown on this phone; nothing here is visible to anyone in another space.
export default function SpaceSwitcher({ currentSpaceId, isHost, onClose }: Props) {
  const router = useRouter();
  const [list] = useState<SavedSpace[]>(() => savedSpaces());
  const [open, setOpen] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function switchTo(e: FormEvent, s: SavedSpace) {
    e.preventDefault();
    if (busy || !pw) return;
    setBusy(true); setError(null);
    try {
      const { salt, iterations } = await api<{ salt: string; iterations: number }>(`/api/auth/salt?spaceId=${s.spaceId}`);
      const keys = await deriveKeys(pw, salt, iterations);
      const res = await api<{ name: string; label: string }>("/api/auth/login", {
        body: { spaceId: s.spaceId, memberId: s.memberId, authToken: keys.authToken, tz: tz() },
      });
      setPw("");
      forgetAllMediaUrls();
      rememberSpace({ ...s, label: res.label, myName: res.name });
      setVault({ encKey: keys.encKey, master: keys.master, spaceId: s.spaceId, memberId: s.memberId });
      router.replace(`/hop?s=${s.spaceId}&m=${s.memberId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach that space. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Your spaces" onClick={onClose}>
      <div className="sheet-up glass switcher" onClick={(e) => e.stopPropagation()}>
        <p className="sheet__title">Your spaces</p>
        <div className="switcher__list">
          {list.map((s) => {
            const here = s.spaceId === currentSpaceId;
            return (
              <div key={s.spaceId} className={here ? "sw sw--here" : "sw"}>
                <button type="button" className="sw__row" disabled={here} onClick={() => { setOpen(open === s.spaceId ? null : s.spaceId); setPw(""); setError(null); }}>
                  <span className="sw__dot" aria-hidden="true">{(s.label || "?").charAt(0).toUpperCase()}</span>
                  <span className="sw__text"><strong>{s.myName || "You"} &amp; {s.label || "your love"}</strong><small>{here ? "Open now" : "Tap, then enter its shared password"}</small></span>
                </button>
                {open === s.spaceId && !here && (
                  <form className="sw__form" onSubmit={(e) => switchTo(e, s)}>
                    <label className="sr-only" htmlFor={`sw-${s.spaceId}`}>Shared password for {s.label}</label>
                    <input id={`sw-${s.spaceId}`} className="field" type="password" autoComplete="off" placeholder="Shared password"
                      value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
                    <button className="btn" disabled={busy || !pw}>{busy ? "Opening…" : "Open"}</button>
                    {error && <p className="error" role="alert">{error}</p>}
                  </form>
                )}
              </div>
            );
          })}
        </div>
        <button type="button" className="btn btn--ghost btn--wide" onClick={() => router.push("/?another=1")}>Add another space</button>
        {isHost && <button type="button" className="link-btn link-btn--quiet" onClick={() => router.push("/setup")}>Start a new space</button>}
      </div>
    </div>
  );
}
