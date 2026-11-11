"use client";
import { useEffect, useRef, useState } from "react";
import { pickAudioMime } from "@/lib/media-client";

const MAX_SECONDS = 300;

type Props = {
  onSend: (bytes: ArrayBuffer, mime: string, seconds: number, wave: number[]) => void;
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
  const [bars, setBars] = useState<number[]>([]);      // the last moments, for the live view
  const levels = useRef<number[]>([]);                  // everything, to save as the note's wave
  const meterStop = useRef<() => void>(() => {});
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
        // Measure the loudness ~12 times a second for the moving bars.
        try {
          const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          const ac = new Ctx();
          const an = ac.createAnalyser();
          an.fftSize = 512;
          ac.createMediaStreamSource(s).connect(an);
          const buf = new Uint8Array(an.fftSize);
          const meter = setInterval(() => {
            an.getByteTimeDomainData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; sum += d * d; }
            const level = Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
            levels.current.push(level);
            setBars((b) => [...b.slice(-39), level]);
          }, 80);
          const stopMeter = () => { clearInterval(meter); void ac.close().catch(() => {}); };
          s.getTracks()[0].addEventListener("ended", stopMeter);
          meterStop.current = stopMeter;
        } catch { /* no live bars on this browser; recording still works */ }
        rec.current = r;
        chunks.current = [];
        r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
        r.onstop = async () => {
          s.getTracks().forEach((t) => t.stop());
          meterStop.current();
          const secs = (Date.now() - started.current) / 1000;
          if (!sendOnStop.current) return callbacks.current.onCancel();
          if (secs < 1) return callbacks.current.onError("Hold on a little longer, that was too short.");
          const blob = new Blob(chunks.current, { type: r.mimeType || mime || "audio/webm" });
          callbacks.current.onSend(await blob.arrayBuffer(), blob.type, secs, toWave(levels.current, 40));
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
      meterStop.current();
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
      <span className="recorder__bars" aria-hidden="true">
        {Array.from({ length: 40 }, (_, i) => bars[bars.length - 40 + i] ?? 0).map((v, i) => (
          <span key={i} style={{ height: `${Math.max(8, Math.round(v * 100))}%` }} />
        ))}
      </span>
      <button type="button" className="send" onClick={() => stop(true)} disabled={!live} aria-label="Send voice note">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12 3.3 13.9z" /></svg>
      </button>
    </div>
  );
}

/** Squeezes the loudness readings into `n` bars (0–100), for the note's wave. */
export function toWave(levels: number[], n: number): number[] {
  if (levels.length === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * levels.length) / n), b = Math.max(a + 1, Math.floor(((i + 1) * levels.length) / n));
    let peak = 0;
    for (let j = a; j < b && j < levels.length; j++) peak = Math.max(peak, levels[j]);
    out.push(Math.round(peak * 100));
  }
  return out;
}
