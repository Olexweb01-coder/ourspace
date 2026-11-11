"use client";
import type { ReactNode } from "react";

type Props = {
  mark: ReactNode;            // the joined circles
  name: string;
  sub: ReactNode;             // "typing…", "here with you", etc.
  live: boolean;              // online right now: the heartline beats
  statusRing: "none" | "new" | "seen";
  streak: { count: number; done: boolean } | null;
  onMenu: () => void;
  onWho: () => void;
  onStreak: () => void;
  onNudge: (() => void) | null;
  nudgeLabel: string;
  onCall?: ((kind: "voice" | "video") => void) | null;
};

// The heading: her name in gold-rose, a heartbeat line that pulses while she's here.
export default function Header({ mark, name, sub, live, statusRing, streak, onMenu, onWho, onStreak, onNudge, nudgeLabel, onCall }: Props) {
  return (
    <header className={live ? "chead glass chead--live" : "chead glass"}>
      <button type="button" className="chead__menu icon-btn" onClick={onMenu} aria-label="Open menu">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16v2H4zm0 4.5h16v2H4zm0 4.5h10v2H4z" /></svg>
      </button>
      <button type="button" className="chead__who" onClick={onWho} aria-label={statusRing === "new" ? `${name} posted a status. Open it` : `About ${name}`}>
        <span className={`sring sring--${statusRing}`}>{mark}</span>
        <span className="chead__text">
          <span className="chead__name">{name}</span>
          <span className="chead__sub">{sub}</span>
        </span>
      </button>
      {streak && (
        <button type="button" className={streak.done ? "streak-pill streak-pill--done" : "streak-pill"} onClick={onStreak}
          aria-label={`${streak.count} day streak`}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5c-.4 0-.7-.1-1-.4C6.3 16 3 13.1 3 9.4 3 6.6 5.2 4.5 7.9 4.5c1.6 0 3.1.8 4.1 2.1 1-1.3 2.5-2.1 4.1-2.1 2.7 0 4.9 2.1 4.9 4.9 0 3.7-3.3 6.6-8 10.7-.3.3-.6.4-1 .4z" /></svg>
          {streak.count}
        </button>
      )}
      {onCall && (
        <>
          <button type="button" className="icon-btn chead__call" onClick={() => onCall("video")} aria-label={`Video call ${name}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z" /></svg>
          </button>
          <button type="button" className="icon-btn chead__call" onClick={() => onCall("voice")} aria-label={`Call ${name}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" /></svg>
          </button>
        </>
      )}
      {onNudge && (
        <button type="button" className="icon-btn icon-btn--heart" onClick={onNudge} aria-label={nudgeLabel}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5c-.4 0-.7-.1-1-.4C6.3 16 3 13.1 3 9.4 3 6.6 5.2 4.5 7.9 4.5c1.6 0 3.1.8 4.1 2.1 1-1.3 2.5-2.1 4.1-2.1 2.7 0 4.9 2.1 4.9 4.9 0 3.7-3.3 6.6-8 10.7-.3.3-.6.4-1 .4z" /></svg>
        </button>
      )}
      <svg className="heartline" viewBox="0 0 400 12" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="hl-grad" x1="0" x2="1">
            <stop offset="0" stopColor="var(--rose)" stopOpacity="0" />
            <stop offset="0.5" stopColor="var(--candle)" />
            <stop offset="1" stopColor="var(--rose)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="heartline__path" d="M0 8 H150 l8 -6 l7 10 l6 -9 l5 5 H250 l8 -6 l7 10 l6 -9 l5 5 H400" />
      </svg>
    </header>
  );
}
