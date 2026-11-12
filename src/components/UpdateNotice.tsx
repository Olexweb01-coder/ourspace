"use client";
import { useEffect, useState } from "react";
import { CHANGELOG, thisBuild, type ChangeEntry } from "@/lib/changelog";

const SEEN_KEY = "ourspace:whatsnew";

/** True once a newer version than this one is live. Checks on open, every minute while on screen, and on return. */
export function useUpdateReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const mine = thisBuild();
    if (mine === "dev") return;
    let alive = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const j = (await r.json()) as { build?: string };
        if (alive && j.build && j.build !== "dev" && j.build !== mine) setReady(true);
      } catch { /* offline: try again later */ }
    };
    void check();
    const t = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", check); };
  }, []);
  return ready;
}

/** The newest "what's new" entry, until this phone has seen it. */
export function useWhatsNew(): [ChangeEntry | null, () => void] {
  const [entry, setEntry] = useState<ChangeEntry | null>(null);
  useEffect(() => {
    try { if (localStorage.getItem(SEEN_KEY) !== CHANGELOG[0].id) setEntry(CHANGELOG[0]); } catch { /* private mode */ }
  }, []);
  const done = () => { try { localStorage.setItem(SEEN_KEY, CHANGELOG[0].id); } catch { /* private mode */ } setEntry(null); };
  return [entry, done];
}

export function WhatsNew({ entry, onClose }: { entry: ChangeEntry; onClose: () => void }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="What's new" onClick={onClose}>
      <div className="sheet-up glass whatsnew" onClick={(e) => e.stopPropagation()}>
        <p className="whatsnew__kicker">What&apos;s new</p>
        <h2 className="whatsnew__title">{entry.title}</h2>
        <ul className="whatsnew__list">{entry.items.map((t) => <li key={t}>{t}</li>)}</ul>
        <button type="button" className="btn btn--wide" onClick={onClose}>Lovely</button>
      </div>
    </div>
  );
}
