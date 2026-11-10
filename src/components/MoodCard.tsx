"use client";
import { useState } from "react";
import { MOODS, moodOf, type MoodKey } from "@/lib/rituals";

type Props = {
  myName: string;
  partnerName: string;
  guesses: MoodKey[];
  current: MoodKey | null;
  onPick: (key: MoodKey) => void;
  onLater: () => void;
};

// The daily check-in. The app's best guess comes first; one tap tells the other person.
export default function MoodCard({ myName, partnerName, guesses, current, onPick, onLater }: Props) {
  const [all, setAll] = useState(false);
  const top = guesses.slice(0, 3);
  const shown = all ? MOODS.map((m) => m.key) : top;
  return (
    <section className="mood-card" aria-label="How you feel today">
      <p className="mood-card__title">{current ? "Change today's feeling" : `How are you feeling today, ${myName}?`}</p>
      <p className="hint">{partnerName} will see it and know how to be with you today.</p>
      <div className="mood-grid">
        {shown.map((key, i) => {
          const m = moodOf(key)!;
          return (
            <button
              key={key}
              type="button"
              className={key === current ? "mood mood--on" : "mood"}
              style={{ ["--mood" as string]: m.color }}
              onClick={() => onPick(key)}
            >
              <span className="mood__dot" aria-hidden="true" />
              {m.label}
              {!all && i === 0 && !current && <span className="mood__guess">our guess</span>}
            </button>
          );
        })}
      </div>
      <div className="row">
        {!all && <button type="button" className="link-btn" onClick={() => setAll(true)}>More feelings</button>}
        <button type="button" className="link-btn link-btn--quiet" onClick={onLater}>{current ? "Close" : "Later"}</button>
      </div>
    </section>
  );
}
