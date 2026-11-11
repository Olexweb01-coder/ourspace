"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import MediaViewer from "@/components/MediaViewer";
import { clock } from "@/components/VoiceRecorder";
import { extensionFor, formatBytes, mediaUrl, saveToPhone, type MediaPayload } from "@/lib/media-client";
import type { Vault } from "@/lib/vault";

export type MediaState = { id: string; keptBy: string | null; expiresAt: string | null; gone: boolean } | null;

type Props = {
  payload: MediaPayload;
  media: MediaState;
  vault: Vault;
  partnerName: string;
  meId: string;
  onKeep: (keep: boolean) => void;
  onReact: () => void;
  onToast: (message: string) => void;
};

const NOUN: Record<MediaPayload["t"], string> = { photo: "photo", video: "video", voice: "voice note", file: "file" };

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

function fileName(p: MediaPayload): string {
  if (p.t === "file" || p.t === "video") return p.name;
  return `our-space-${p.t}-${p.mediaId.slice(0, 8)}.${extensionFor(p.mime)}`;
}

export default function MediaBubble({ payload, media, vault, partnerName, meId, onKeep, onReact, onToast }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const holder = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement>(null);

  const expired = !!media?.gone || (media?.expiresAt ? new Date(media.expiresAt).getTime() < Date.now() : false);

  async function load(): Promise<string | null> {
    if (url) return url;
    setLoading(true);
    try {
      const u = await mediaUrl(vault, payload.mediaId, payload.mime);
      setUrl(u);
      return u;
    } catch (err) {
      onToast((err as Error).message === "expired" ? `This ${NOUN[payload.t]} has expired.` : "Couldn't open it. Check your connection.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  // Photos, videos and voice notes download by themselves when they scroll into view: ready when you tap.
  useEffect(() => {
    if (payload.t === "file" || expired || url) return;
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); void load(); }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload.mediaId, expired]);

  useEffect(() => {
    if (payload.t === "voice" && url && audio.current && !audio.current.src) { audio.current.src = url; audio.current.preload = "auto"; }
  }, [url, payload.t]);

  if (expired) {
    return <div className="bubble bubble--once">This {NOUN[payload.t]} has expired.</div>;
  }

  const kept = !!media?.keptBy;
  const left = daysLeft(media?.expiresAt ?? null);
  const keepRow = (extra?: ReactNode) => (
    <div className="keep-line">
      {extra}
      <span>
        {kept
          ? (media?.keptBy === meId ? "Kept by you" : `Kept by ${partnerName}`)
          : left !== null ? (left <= 1 ? "Disappears within a day" : `Disappears in ${left} days`) : ""}
      </span>
      <button type="button" className="link-btn link-btn--quiet" onClick={onReact}>React</button>
      <button type="button" className="link-btn" onClick={() => onKeep(!kept)}>{kept ? "Unkeep" : "Keep"}</button>
    </div>
  );
  const keepLine = keepRow();

  async function save() {
    const u = await load();
    if (!u) return;
    try { await saveToPhone(u, fileName(payload), payload.mime); }
    catch { onToast("Couldn't save it. Try again."); }
  }

  const viewerActions = (
    <>
      <button type="button" className="btn btn--ghost" onClick={save}>Save to phone</button>
      <button type="button" className="btn btn--ghost" onClick={() => onKeep(!kept)}>{kept ? "Unkeep" : "Keep"}</button>
    </>
  );

  const caption = "caption" in payload && payload.caption ? <p className="media-caption">{payload.caption}</p> : null;

  if (payload.t === "photo") {
    const ratio = payload.w && payload.h ? payload.w / payload.h : 1;
    return (
      <div className="media" ref={holder}>
        <button
          type="button"
          className="photo"
          style={{ aspectRatio: String(Math.max(0.5, Math.min(2, ratio))), backgroundImage: payload.thumb ? `url(${payload.thumb})` : undefined }}
          onClick={async () => { if (await load()) setViewing(true); }}
          aria-label="Open photo"
        >
          {url && <img src={url} alt="" />}
        </button>
        {caption}
        {keepLine}
        {viewing && url && <MediaViewer kind="photo" url={url} caption={payload.caption} onClose={() => setViewing(false)} actions={viewerActions} />}
      </div>
    );
  }

  if (payload.t === "video" && payload.thumb) {
    const mins = payload.duration ? `${Math.floor(payload.duration / 60)}:${String(payload.duration % 60).padStart(2, "0")}` : "";
    return (
      <div className="media" ref={holder}>
        <button type="button" className="vthumb" onClick={async () => { if (await load()) setViewing(true); }}
          style={payload.w && payload.h ? { aspectRatio: `${payload.w} / ${payload.h}` } : undefined} aria-label={`Play video${mins ? `, ${mins}` : ""}`}>
          <img src={`data:image/jpeg;base64,${payload.thumb}`} alt="" />
          <span className="vthumb__play" aria-hidden="true">
            {url ? <svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" /></svg> : <span className="vthumb__spin" />}
          </span>
          <span className="vthumb__meta">{mins}{mins ? " · " : ""}{url ? formatBytes(payload.size) : "Downloading…"}</span>
        </button>
        {caption}
        {keepLine}
        {viewing && url && <MediaViewer kind="video" url={url} caption={payload.caption} onClose={() => setViewing(false)} actions={viewerActions} />}
      </div>
    );
  }

  if (payload.t === "video") {
    return (
      <div className="media" ref={holder}>
        <button type="button" className="media-card" onClick={async () => { if (await load()) setViewing(true); }}>
          <span className="media-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" /></svg>
          </span>
          <span className="media-card__text">
            <strong>{loading ? "Unlocking video…" : "Video"}</strong>
            <span>{formatBytes(payload.size)}</span>
          </span>
        </button>
        {caption}
        {keepLine}
        {viewing && url && <MediaViewer kind="video" url={url} caption={payload.caption} onClose={() => setViewing(false)} actions={viewerActions} />}
      </div>
    );
  }

  if (payload.t === "voice") {
    async function toggle() {
      const el = audio.current;
      if (!el) return;
      if (!el.src) {
        const u = await load();
        if (!u) return;
        el.src = u;
      }
      if (el.paused) { await el.play().catch(() => onToast("Couldn't play it on this phone.")); }
      else el.pause();
    }
    const wave = payload.wave && payload.wave.length ? payload.wave : Array.from({ length: 40 }, (_, i) => 18 + ((i * 37) % 23));
    return (
      <div className="media" ref={holder}>
        <div className="voice">
          <button type="button" className="voice__play" onClick={toggle} aria-label={playing ? "Pause" : "Play voice note"}>
            {playing
              ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
              : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>}
          </button>
          <span className="voice__wave" aria-hidden="true">
            {wave.map((h, i) => (
              <span key={i} className={i / wave.length < progress ? "on" : ""} style={{ height: `${Math.max(12, h)}%` }} />
            ))}
          </span>
          <span className="voice__time">{loading ? "…" : clock(payload.duration)}</span>
          <audio
            ref={audio}
            preload="none"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => { setPlaying(false); setProgress(0); }}
            onTimeUpdate={(e) => {
              const el = e.currentTarget;
              const total = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : payload.duration;
              setProgress(total ? Math.min(1, el.currentTime / total) : 0);
            }}
          />
        </div>
        {keepRow(<button type="button" className="link-btn" onClick={save}>Save</button>)}
      </div>
    );
  }

  return (
    <div className="media">
      <button type="button" className="media-card" onClick={save}>
        <span className="media-card__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm7 1.5V8h4.5z" /></svg>
        </span>
        <span className="media-card__text">
          <strong>{payload.name}</strong>
          <span>{loading ? "Unlocking…" : `${formatBytes(payload.size)}, tap to save`}</span>
        </span>
      </button>
      {caption}
      {keepLine}
    </div>
  );
}
