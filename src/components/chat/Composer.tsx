"use client";
import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { ANGRY, LOVE } from "@/lib/emoji";

type Props = {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  draft: string;
  onDraft: (v: string) => void;
  onSubmit: (e?: FormEvent) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  disabled: boolean;
  sending: boolean;
  viewOnce: boolean;
  onToggleOnce: () => void;
  onAttach: () => void;
  attachOpen: boolean;
  onCamera: () => void;
  onRecord: () => void;
  onEmoji: (e: string) => void;
  reply: { name: string; preview: string } | null;
  onCancelReply: () => void;
  editing?: { preview: string } | null;
  onCancelEdit?: () => void;
};

export default function Composer(p: Props) {
  return (
    <div className="composer2">
      {p.editing && (
        <div className="replybar replybar--edit glass">
          <span className="replybar__line" aria-hidden="true" />
          <span className="replybar__text">
            <strong>Editing message</strong>
            <span>{p.editing.preview}</span>
          </span>
          <button type="button" className="icon-btn" onClick={p.onCancelEdit} aria-label="Cancel editing">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z" /></svg>
          </button>
        </div>
      )}
      {p.reply && !p.editing && (
        <div className="replybar glass">
          <span className="replybar__line" aria-hidden="true" />
          <span className="replybar__text">
            <strong>Replying to {p.reply.name}</strong>
            <span>{p.reply.preview}</span>
          </span>
          <button type="button" className="icon-btn" onClick={p.onCancelReply} aria-label="Cancel reply">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z" /></svg>
          </button>
        </div>
      )}
      <form className="composer2__row" onSubmit={p.onSubmit}>
        <div className={p.viewOnce ? "pill glass pill--once" : "pill glass"}>
          <button type="button" className="pill__emoji" onClick={() => p.onEmoji(LOVE)} aria-label="Add love">{LOVE}</button>
          <button type="button" className="pill__emoji" onClick={() => p.onEmoji(ANGRY)} aria-label="Add angry">{ANGRY}</button>
          <label className="sr-only" htmlFor="draft">Message</label>
          <textarea
            id="draft"
            ref={p.inputRef}
            className="pill__input"
            rows={1}
            value={p.draft}
            placeholder={p.placeholder}
            onChange={(e) => p.onDraft(e.target.value)}
            onKeyDown={p.onKeyDown}
            disabled={p.disabled}
            maxLength={8000}
          />
          <button type="button" className={p.viewOnce ? "pill__icon pill__icon--on" : "pill__icon"} onClick={p.onToggleOnce}
            aria-pressed={p.viewOnce} aria-label="View once" title="View once">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C6.5 5 2.7 9.4 1.6 11.4a1.3 1.3 0 0 0 0 1.2C2.7 14.6 6.5 19 12 19s9.3-4.4 10.4-6.4a1.3 1.3 0 0 0 0-1.2C21.3 9.4 17.5 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" /></svg>
          </button>
          <button type="button" className={p.attachOpen ? "pill__icon pill__icon--on" : "pill__icon"} onClick={p.onAttach}
            aria-expanded={p.attachOpen} aria-label="Attach" disabled={p.disabled}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 6.5v10a4.5 4.5 0 0 1-9 0V5a3 3 0 0 1 6 0v10.5a1.5 1.5 0 0 1-3 0V6.5H9v9a3 3 0 0 0 6 0V5a4.5 4.5 0 0 0-9 0v11.5a6 6 0 0 0 12 0v-10z" /></svg>
          </button>
          {!p.draft.trim() && (
            <button type="button" className="pill__icon" onClick={p.onCamera} aria-label="Camera" disabled={p.disabled}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3zm3 14.5a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /></svg>
            </button>
          )}
        </div>
        {p.draft.trim() ? (
          <button className="send2" disabled={p.sending || p.disabled} aria-label="Send">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12 3.3 13.9z" /></svg>
          </button>
        ) : (
          <button type="button" className="send2" onClick={p.onRecord} disabled={p.disabled} aria-label="Record a voice note">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 0 0-7 0v6A3.5 3.5 0 0 0 12 15zm6-3.5a6 6 0 0 1-12 0H4.5a7.5 7.5 0 0 0 6.75 7.46V21h1.5v-2.04a7.5 7.5 0 0 0 6.75-7.46z" /></svg>
          </button>
        )}
      </form>
    </div>
  );
}
