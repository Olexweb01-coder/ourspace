"use client";
import { DECK_TITLE, LIVE_TITLE, QUIZ_TITLE, type EventInfo } from "@/lib/events";

// A card in the chat. Tapping it opens what it's about.
export default function EventCard({ ev, mine, meId, senderName, otherName, onOpen }: {
  ev: EventInfo; mine: boolean; meId: string; senderName: string; otherName: string; onOpen: () => void;
}) {
  let icon = "🎲", title = "", sub = "", action = "Open";
  switch (ev.type) {
    case "live-invite":
      title = mine ? `You invited ${otherName} to ${LIVE_TITLE[ev.kind]}` : `${senderName} invited you to ${LIVE_TITLE[ev.kind]}`;
      sub = mine ? "The table is open" : "Play now, while you're both here";
      action = mine ? "Back to the table" : "Join the table";
      break;
    case "live-result": {
      icon = "🏆";
      const iWon = ev.winner === meId;
      title = iWon ? `You won ${LIVE_TITLE[ev.kind]}` : `${mine ? otherName : senderName} won ${LIVE_TITLE[ev.kind]}`;
      sub = ev.bet ? (iWon ? `${mine ? otherName : senderName} owes you: ${ev.bet}` : `You owe: ${ev.bet}`) : "No bet this time";
      action = ev.bet ? "See Love debts" : "Play again";
      break;
    }
    case "quiz":
      title = mine ? `You started ${QUIZ_TITLE[ev.kind]}` : `${senderName} started ${QUIZ_TITLE[ev.kind]}`;
      sub = mine ? `Waiting for ${otherName}` : "Your turn";
      action = mine ? "Open" : "Play";
      break;
    case "debt-remind":
      icon = "💗";
      title = mine ? `You reminded ${otherName}` : `${senderName} is reminding you`;
      sub = `${mine ? `${otherName} still owes` : "You still owe"}: ${ev.items.slice(0, 3).join(", ")}${ev.items.length > 3 || ev.more ? ` and ${(ev.items.length > 3 ? ev.items.length - 3 : 0) + (ev.more ?? 0)} more` : ""}`;
      action = "See Love debts";
      break;
    case "card":
      icon = ev.deck === "dare" ? "🔥" : ev.deck === "deep" ? "💭" : "💬";
      title = DECK_TITLE[ev.deck];
      sub = ev.text;
      action = "Draw one back";
      break;
  }
  return (
    <button type="button" className={`evcard evcard--${ev.type}`} onClick={onOpen}>
      <span className="evcard__icon" aria-hidden="true">{icon}</span>
      <span className="evcard__text">
        <strong>{title}</strong>
        <span>{sub}</span>
        <em>{action} ›</em>
      </span>
    </button>
  );
}
