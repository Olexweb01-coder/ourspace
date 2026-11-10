"use client";
import { useEffect, type ReactNode } from "react";

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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
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
    </div>
  );
}
