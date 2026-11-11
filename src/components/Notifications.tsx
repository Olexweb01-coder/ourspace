"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { NOTIFY_CATEGORIES, type NotifyKey } from "@/lib/notify-prefs";

/** The pop-up while notifications are off on this phone. Comes back each time the app opens. */
export function NotifPrompt({ partnerName, partnerPossessive, needsHomeScreen, onTurnOn, onNotNow }: {
  partnerName: string; partnerPossessive: string; needsHomeScreen: boolean; onTurnOn: () => void; onNotNow: () => void;
}) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Turn on notifications" onClick={onNotNow}>
      <div className="sheet-up glass nprompt" onClick={(e) => e.stopPropagation()}>
        <span className="nprompt__bell" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1z" /></svg>
        </span>
        <p className="nprompt__title">Never miss {partnerName}</p>
        {needsHomeScreen ? (
          <p className="hint">On iPhone, add Our Space to your Home Screen first: tap the Share button, then <strong>Add to Home Screen</strong>, then open it from there.</p>
        ) : (
          <p className="hint">Turn on notifications so you know the moment {partnerPossessive === "their" ? "they write" : `${partnerPossessive === "her" ? "she writes" : "he writes"}`}, nudges you, or wants to play.</p>
        )}
        {!needsHomeScreen && <button type="button" className="btn btn--wide" onClick={onTurnOn}>Turn on notifications</button>}
        <button type="button" className="btn btn--ghost btn--wide" onClick={onNotNow}>Not now</button>
        <p className="hint nprompt__fine">If notifications stay off, {partnerName} will see that.</p>
      </div>
    </div>
  );
}

/** Settings → Notifications: on/off for this phone, which kinds, and quiet hours. */
export function NotifySettings({ state, off: initialOff, quiet: initialQuiet, partnerName, onTurnOn, onToast }: {
  state: "on" | "off" | "unknown"; off: string[]; quiet: boolean; partnerName: string; onTurnOn: () => void; onToast: (m: string) => void;
}) {
  const [off, setOff] = useState<string[]>(initialOff);
  const [quiet, setQuiet] = useState(initialQuiet);
  async function save(nextOff: string[], nextQuiet: boolean) {
    const prev = { off, quiet };
    setOff(nextOff); setQuiet(nextQuiet);   // instant on screen; saved in the background
    try { await api("/api/push/prefs", { body: { off: nextOff, quiet: nextQuiet } }); }
    catch (err) { setOff(prev.off); setQuiet(prev.quiet); onToast(err instanceof ApiError ? err.message : "Couldn't save that. Try again."); }
  }
  const toggle = (k: NotifyKey) => save(off.includes(k) ? off.filter((x) => x !== k) : [...off, k], quiet);
  return (
    <div className="nset">
      {state === "on"
        ? <p className="hint">On for this phone. {partnerName} is told if you turn message notifications off.</p>
        : <button type="button" className="btn" onClick={onTurnOn}>Turn on notifications</button>}
      <div className="nset__rows">
        <div className="nset__row"><span>Nudges and calls<small>Always on, so you can always reach each other</small></span><span className="switch switch--on switch--locked" aria-label="Always on" /></div>
        {NOTIFY_CATEGORIES.map((c) => (
          <button key={c.key} type="button" className="nset__row" role="switch" aria-checked={!off.includes(c.key)} onClick={() => toggle(c.key)}>
            <span>{c.label}{c.hint && <small>{c.hint}</small>}</span>
            <span className={off.includes(c.key) ? "switch" : "switch switch--on"} aria-hidden="true" />
          </button>
        ))}
        <button type="button" className="nset__row" role="switch" aria-checked={quiet} onClick={() => save(off, !quiet)}>
          <span>Quiet hours<small>11 pm to 7 am. Nudges and calls still come.</small></span>
          <span className={quiet ? "switch switch--on" : "switch"} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
