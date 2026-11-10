"use client";
import { useEffect, useRef, useState } from "react";
import { pickAudioMime } from "@/lib/media-client";

const MAX_SECONDS = 300;

type Props = {
  onSend: (bytes: ArrayBuffer, mime: string, seconds: number) => void;
  onCancel: () => void;
  onError: (message: string) => void;
};

export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function VoiceRecorder({ onSend, onCancel, onError }: Props) {
  const [seconds, setSeconds] = useState(0);
  const [live, setLive] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const sendOnStop = useRef(false);
  const callbacks = useRef({ onSend, onCancel, onError });
  callbacks.current = { onSend, onCancel, onError };

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        const mime = pickAudioMime();
        const r = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
        rec.current = r;
        chunks.current = [];
        r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
        r.onstop = async () => {
          s.getTracks().forEach((t) => t.stop());
          const secs = (Date.now() - started.current) / 1000;
          if (!sendOnStop.current) return callbacks.current.onCancel();
          if (secs < 1) return callbacks.current.onError("Hold on a little longer, that was too short.");
          const blob = new Blob(chunks.current, { type: r.mimeType || mime || "audio/webm" });
          callbacks.current.onSend(await blob.arrayBuffer(), blob.type, secs);
        };
        started.current = Date.now();
        r.start(250);
        setLive(true);
        timer = setInterval(() => {
          const secs = (Date.now() - started.current) / 1000;
          setSeconds(secs);
          if (secs >= MAX_SECONDS) stop(true);
        }, 250);
      } catch {
        callbacks.current.onError("Microphone is blocked. Allow it for this app in your phone's settings.");
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (rec.current && rec.current.state !== "inactive") {
        sendOnStop.current = false;
        rec.current.onstop = null;
        rec.current.stop();
      }
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function stop(send: boolean) {
    sendOnStop.current = send;
    if (rec.current && rec.current.state !== "inactive") rec.current.stop();
    else if (!send) callbacks.current.onCancel();
  }

  return (
    <div className="recorder" role="group" aria-label="Recording a voice note">
      <button type="button" className="btn btn--ghost btn--small" onClick={() => stop(false)}>Cancel</button>
      <span className="recorder__dot" aria-hidden="true" />
      <span className="recorder__time" aria-live="off">{live ? clock(seconds) : "Starting…"}</span>
      <span className="recorder__hint">{live ? `Up to ${MAX_SECONDS / 60} minutes` : ""}</span>
      <button type="button" className="send" onClick={() => stop(true)} disabled={!live} aria-label="Send voice note">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12 3.3 13.9z" /></svg>
      </button>
    </div>
  );
}
