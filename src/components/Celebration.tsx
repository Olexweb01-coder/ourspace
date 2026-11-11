"use client";
import { LOVE } from "@/lib/emoji";

type Props = {
  kicker: string;
  big: string;
  label: string;
  line: string;
  cta?: string;
  bigIsText?: boolean;
  onClose: () => void;
};

// Full-screen celebration for streak milestones, birthdays, anniversaries and special days.
export default function Celebration({ kicker, big, label, line, cta = "Keep going together", bigIsText = false, onClose }: Props) {
  return (
    <div className="celebrate" role="dialog" aria-modal="true" aria-label={`${big} ${label}`}>
      <div className="celebrate__rings" aria-hidden="true"><span /><span /><span /></div>
      <div className="hearts hearts--loop" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} style={{ left: `${(i * 37 + 5) % 94}%`, animationDelay: `${((i * 0.19) % 3.4).toFixed(2)}s` }}>{LOVE}</span>
        ))}
      </div>
      <p className="celebrate__kicker">{kicker}</p>
      <p className={bigIsText ? "celebrate__num celebrate__num--text" : "celebrate__num"}>{big}</p>
      <p className="celebrate__label">{label}</p>
      <p className="celebrate__line">{line}</p>
      <button type="button" className="btn btn--wide celebrate__btn" onClick={onClose}>{cta}</button>
    </div>
  );
}

export function streakLine(days: number): string {
  return days >= 365 ? "A whole year of choosing each other, every single day." :
    days >= 100 ? "A hundred days and more. This is who you are now." :
    days >= 30 ? "A month without missing a day. That's real love." :
    days >= 7 ? "A full week of showing up for each other." :
    "Three days in a row. A beautiful start.";
}
