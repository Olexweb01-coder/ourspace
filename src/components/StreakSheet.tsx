"use client";
import { nextMilestone } from "@/lib/rituals";

type Props = {
  current: number;
  best: number;
  todayDone: boolean;
  iSent: boolean;
  partnerName: string;
  onClose: () => void;
};

export default function StreakSheet({ current, best, todayDone, iSent, partnerName, onClose }: Props) {
  const next = nextMilestone(current);
  const status = todayDone
    ? "You've both shown up today. The streak is safe."
    : iSent
      ? `Waiting on ${partnerName} today.`
      : current > 0
        ? `Your turn today. Send ${partnerName} something before midnight.`
        : `Send ${partnerName} something today, and ask them to do the same. That starts your streak.`;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Your streak" onClick={onClose}>
      <div className="streak-sheet" onClick={(e) => e.stopPropagation()}>
        <p className="streak-sheet__num">{current}</p>
        <p className="streak-sheet__label">{current === 1 ? "day in a row" : "days in a row"}</p>
        <p className="streak-sheet__status">{status}</p>
        <dl className="streak-sheet__facts">
          <div><dt>Longest</dt><dd>{best} {best === 1 ? "day" : "days"}</dd></div>
          <div><dt>Next celebration</dt><dd>{next} days{current > 0 ? `, ${next - current} to go` : ""}</dd></div>
        </dl>
        <p className="hint">A day counts when you both send something, even a single heart.</p>
        <button type="button" className="btn btn--wide" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
