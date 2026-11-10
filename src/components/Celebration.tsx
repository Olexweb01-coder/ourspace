"use client";
import { LOVE } from "@/lib/emoji";

type Props = { days: number; names: string; onClose: () => void };

// A streak milestone, celebrated properly.
export default function Celebration({ days, names, onClose }: Props) {
  const line =
    days >= 365 ? "A whole year of choosing each other, every single day." :
    days >= 100 ? "A hundred days and more. This is who you are now." :
    days >= 30 ? "A month without missing a day. That's real love." :
    days >= 7 ? "A full week of showing up for each other." :
    "Three days in a row. A beautiful start.";
  return (
    <div className="celebrate" role="dialog" aria-modal="true" aria-label={`${days} days in a row`}>
      <div className="celebrate__rings" aria-hidden="true"><span /><span /><span /></div>
      <div className="hearts hearts--loop" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} style={{ left: `${(i * 37 + 5) % 94}%`, animationDelay: `${((i * 0.19) % 3.4).toFixed(2)}s` }}>{LOVE}</span>
        ))}
      </div>
      <p className="celebrate__kicker">{names}</p>
      <p className="celebrate__num">{days}</p>
      <p className="celebrate__label">days in a row</p>
      <p className="celebrate__line">{line}</p>
      <button type="button" className="btn btn--wide celebrate__btn" onClick={onClose}>Keep going together</button>
    </div>
  );
}
