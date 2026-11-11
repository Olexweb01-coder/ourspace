"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { encryptJSON } from "@/lib/crypto-client";
import { onlyLoveAndAngry } from "@/lib/emoji";
import { compressImage, uploadEncrypted } from "@/lib/media-client";
import { STATUS_BGS, statusAad, type StatusPayload } from "@/lib/status";
import type { Vault } from "@/lib/vault";

type Props = { vault: Vault; partnerName: string; onClose: () => void; onPosted: () => void; onToast: (m: string) => void };

// Post a status: words on a colour, or a photo. Gone in 24 hours.
export default function StatusComposer({ vault, partnerName, onClose, onPosted, onToast }: Props) {
  const [mode, setMode] = useState<"text" | "photo">("text");
  const [text, setText] = useState("");
  const [bg, setBg] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  async function post() {
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      let payload: StatusPayload;
      let mediaId: string | undefined;
      if (mode === "photo") {
        if (!file) return;
        const img = await compressImage(file, 1440, 0.82);
        mediaId = await uploadEncrypted(vault, img.bytes, "status", setPct);
        payload = { t: "photo", mediaId, mime: "image/jpeg", w: img.w, h: img.h, thumb: img.thumb, caption: onlyLoveAndAngry(caption).trim() || undefined };
      } else {
        const t = onlyLoveAndAngry(text).trim();
        if (!t) return;
        payload = { t: "text", text: t, bg };
      }
      const { iv, ct } = await encryptJSON(vault.encKey, payload, statusAad(vault.spaceId, id));
      await api("/api/status", { body: { action: "post", id, iv, ct, mediaId } });
      onToast(`Posted. ${partnerName} can see it for 24 hours.`);
      onPosted();
      onClose();
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : (err as Error).message || "Couldn't post it. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="story-compose" role="dialog" aria-modal="true" aria-label="New status">
      <div className="story-compose__top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z" /></svg>
        </button>
        <div className="chips">
          <button type="button" className={mode === "text" ? "chip chip--on" : "chip"} onClick={() => setMode("text")}>Words</button>
          <button type="button" className={mode === "photo" ? "chip chip--on" : "chip"} onClick={() => setMode("photo")}>Photo</button>
        </div>
        <span style={{ width: 40 }} />
      </div>

      {mode === "text" ? (
        <div className="story-canvas" style={{ background: STATUS_BGS[bg] }}>
          <textarea className="story-canvas__input" value={text} maxLength={300} autoFocus
            placeholder={`Something for ${partnerName}…`} onChange={(e) => setText(onlyLoveAndAngry(e.target.value))} />
        </div>
      ) : (
        <div className="story-canvas story-canvas--photo">
          {preview
            ? <img src={preview} alt="Your photo" />
            : <label className="story-pick">Choose a photo<input type="file" accept="image/*" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>}
        </div>
      )}

      <div className="story-compose__bottom">
        {mode === "text" ? (
          <div className="swatches" role="radiogroup" aria-label="Colour">
            {STATUS_BGS.map((g, i) => (
              <button key={i} type="button" role="radio" aria-checked={bg === i} className={bg === i ? "swatch swatch--on" : "swatch"}
                style={{ background: g }} onClick={() => setBg(i)} aria-label={`Colour ${i + 1}`} />
            ))}
          </div>
        ) : (
          <input className="field" value={caption} maxLength={200} placeholder="Add a caption" onChange={(e) => setCaption(e.target.value)} />
        )}
        <button type="button" className="btn" onClick={post}
          disabled={busy || (mode === "text" ? !text.trim() : !file)}>
          {busy ? (mode === "photo" ? `Posting… ${pct}%` : "Posting…") : "Post for 24 hours"}
        </button>
      </div>
    </div>
  );
}
