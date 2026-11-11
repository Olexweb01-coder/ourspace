"use client";
import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "@/lib/media-client";
import { STATUS_BGS, timeAgo, type StatusItem } from "@/lib/status";
import type { Vault } from "@/lib/vault";

type Props = {
  items: StatusItem[];
  ownerName: string;
  mine: boolean;
  partnerName: string;
  vault: Vault;
  onSeen: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

const TEXT_MS = 5000;
const PHOTO_MS = 6500;

// Full screen, progress bars on top, tap right for next, left for back, hold to pause.
export default function StatusViewer({ items, ownerName, mine, partnerName, vault, onSeen, onDelete, onClose }: Props) {
  const firstUnseen = mine ? 0 : Math.max(0, items.findIndex((s) => !s.seenAt));
  const [i, setI] = useState(firstUnseen);
  const [progress, setProgress] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const paused = useRef(false);
  const item = items[i];

  useEffect(() => {
    if (!item) return;
    setProgress(0);
    setUrl(null);
    if (!mine && !item.seenAt) onSeen(item.id);
    if (item.payload?.t === "photo") {
      mediaUrl(vault, item.payload.mediaId, item.payload.mime).then(setUrl).catch(() => setUrl(""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const ready = item?.payload?.t !== "photo" || url !== null;
  useEffect(() => {
    if (!item || !ready) return;
    const total = item.payload?.t === "photo" ? PHOTO_MS : TEXT_MS;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      if (!paused.current) setProgress((p) => Math.min(1, p + (now - last) / total));
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [item, ready]);

  useEffect(() => {
    if (progress < 1) return;
    if (i < items.length - 1) setI(i + 1); else onClose();
  }, [progress, i, items.length, onClose]);

  if (!item) return null;
  const p = item.payload;

  return (
    <div className="story" role="dialog" aria-modal="true" aria-label={`${ownerName}'s status`}
      onPointerDown={() => { paused.current = true; }}
      onPointerUp={(e) => {
        paused.current = false;
        const third = (e.currentTarget as HTMLElement).clientWidth / 3;
        if ((e.target as HTMLElement).closest("button")) return;
        if (e.clientX < third) { if (i > 0) setI(i - 1); else setProgress(0); }
        else if (i < items.length - 1) setI(i + 1); else onClose();
      }}>
      <div className="story__bars">
        {items.map((s, n) => (
          <span key={s.id}><span style={{ width: `${n < i ? 100 : n === i ? progress * 100 : 0}%` }} /></span>
        ))}
      </div>
      <div className="story__head">
        <span><strong>{mine ? "My status" : ownerName}</strong> · {timeAgo(item.createdAt)}</span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z" /></svg>
        </button>
      </div>

      {!p ? <div className="story__body"><p className="story__text">This status couldn&apos;t be unlocked.</p></div>
        : p.t === "text" ? (
          <div className="story__body" style={{ background: STATUS_BGS[p.bg] ?? STATUS_BGS[0] }}>
            <p className="story__text">{p.text}</p>
          </div>
        ) : (
          <div className="story__body story__body--photo" style={p.thumb ? { backgroundImage: `url(${p.thumb})` } : undefined}>
            {url ? <img src={url} alt={p.caption || "Status photo"} /> : url === "" ? <p className="story__text">This photo has expired.</p> : null}
            {p.caption && <p className="story__caption">{p.caption}</p>}
          </div>
        )}

      {mine && (
        <div className="story__foot glass">
          <span>{item.seenAt ? `Seen by ${partnerName} · ${timeAgo(item.seenAt)}` : "Not seen yet"}</span>
          <button type="button" className="link-btn" onClick={() => { onDelete(item.id); if (items.length <= 1) onClose(); else setI(Math.max(0, i - 1)); }}>Delete</button>
        </div>
      )}
    </div>
  );
}
