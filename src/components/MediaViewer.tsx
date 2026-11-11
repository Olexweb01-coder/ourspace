"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  kind: "photo" | "video" | "voice";
  url: string;
  caption?: string;
  onClose: () => void;
  actions?: ReactNode;
  closeLabel?: string;
};

// Full-screen view for a photo or video. Closes with the button or the Escape key.
export default function MediaViewer({ kind, url, caption, onClose, actions, closeLabel = "Close" }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onBack = (e: Event) => { e.preventDefault(); onClose(); };   // the back gesture closes the viewer
    window.addEventListener("keydown", onKey);
    window.addEventListener("ourspace-back", onBack);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("ourspace-back", onBack); };
  }, [onClose]);
  // Drawn at the top of the page, not inside the message list, so nothing (header, message box, side panel) can cover it.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  if (!host) return null;

  return createPortal(
    <div className="viewer" role="dialog" aria-modal="true" aria-label={kind === "photo" ? "Photo" : kind === "video" ? "Video" : "Voice note"}>
      <div className="viewer__stage">
        {kind === "photo" && <img src={url} alt={caption || "Photo"} className="viewer__media" />}
        {kind === "video" && <video src={url} className="viewer__media" controls autoPlay playsInline />}
        {kind === "voice" && <audio src={url} controls autoPlay />}
      </div>
      {caption && <p className="viewer__caption">{caption}</p>}
      <div className="viewer__bar">
        {actions}
        <button type="button" className="btn" onClick={onClose}>{closeLabel}</button>
      </div>
    </div>,
    host,
  );
}
