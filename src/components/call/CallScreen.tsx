"use client";
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";
import { CallSession, type CallKind, type CallPhase, type EndReason, type Quality } from "@/lib/call-client";
import { ring } from "@/lib/ringer";
import type { Vault } from "@/lib/vault";

type Props = {
  vault: Vault;
  callId: string;
  role: "caller" | "callee";
  kind: CallKind;
  partnerName: string;
  partnerAvatar: string | null;
  onClose: (summary: { reason: EndReason; seconds: number }) => void;
};

const ENDED: Record<EndReason, string> = {
  hangup: "Call ended", remote: "Call ended", declined: "Declined", missed: "No answer", busy: "Busy",
  failed: "Couldn't connect. Try Wi-Fi and call again.", "no-media": "Allow the microphone to make calls.",
};

export default function CallScreen({ vault, callId, role, kind, partnerName, partnerAvatar, onClose }: Props) {
  const session = useRef<CallSession | null>(null);
  const [phase, setPhase] = useState<CallPhase>(role === "callee" ? "ringing" : "starting");
  const [reason, setReason] = useState<EndReason | null>(null);
  const [quality, setQuality] = useState<Quality>("good");
  const [vid, setVid] = useState({ camera: false, screen: false, remoteVideo: false });
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [swapped, setSwapped] = useState(false);
  const [answered, setAnswered] = useState(role === "caller");
  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);
  const startedAt = useRef<number | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);

  // Build the call once.
  useEffect(() => {
    const s = new CallSession(vault, callId, role, kind, {
      onPhase: (p, r) => {
        setPhase(p);
        if (p === "active" && startedAt.current === null) startedAt.current = Date.now();
        if (p === "ended") {
          setReason(r ?? "hangup");
          const secs = startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0;
          setTimeout(() => onClose({ reason: r ?? "hangup", seconds: secs }), r === "failed" || r === "no-media" ? 3200 : 1400);
        }
      },
      onRemote: (stream) => { remoteStream.current = stream; attach(); },
      onLocal: (stream) => { localStream.current = stream; attach(); },
      onQuality: setQuality,
      onVideoState: setVid,
    });
    session.current = s;
    if (role === "caller") void s.startAsCaller();
    return () => { void s.hangUp(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The video elements can move (corner, swapped, hidden): always give each one its stream again.
  function attach() {
    for (const [el, stream] of [[remoteRef.current, remoteStream.current], [localRef.current, localStream.current]] as const) {
      if (el && stream && el.srcObject !== stream) { el.srcObject = stream; void el.play().catch(() => {}); }
    }
  }
  useEffect(attach, [vid, swapped, phase]);

  // Ringing sounds; the timer once connected; keep the screen awake during the call.
  useEffect(() => {
    if (phase === "ringing" && role === "callee" && !answered) return ring("incoming");
    if (phase === "ringing" && role === "caller") return ring("outgoing");
  }, [phase, role, answered]);
  useEffect(() => {
    if (phase !== "active" && phase !== "reconnecting") return;
    const t = setInterval(() => { if (startedAt.current) setSeconds(Math.round((Date.now() - startedAt.current) / 1000)); }, 1000);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    if (phase === "active") void nav.wakeLock?.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { void lock?.release().catch(() => {}); };
  }, [phase]);

  // Your own picture: drag it anywhere; it glides to the nearest corner when you let go.
  const [pip, setPip] = useState({ x: -1, y: -1, corner: "tr" as "tl" | "tr" | "bl" | "br", dragging: false });
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  function down(e: RPointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: RPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    drag.current.moved = true;
    setPip((p) => ({ ...p, x: e.clientX - drag.current!.dx, y: e.clientY - drag.current!.dy, dragging: true }));
  }
  function up(e: RPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) { setSwapped((s) => !s); return; }   // a tap swaps big and small
    const left = e.clientX < window.innerWidth / 2, top = e.clientY < window.innerHeight / 2;
    setPip({ x: -1, y: -1, dragging: false, corner: `${top ? "t" : "b"}${left ? "l" : "r"}` as "tl" | "tr" | "bl" | "br" });
  }

  const s = session.current;
  const showVideo = vid.remoteVideo || vid.camera || vid.screen;
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const status =
    phase === "ended" ? ENDED[reason ?? "hangup"]
    : phase === "ringing" ? (role === "caller" ? "Ringing…" : `Incoming ${kind} call`)
    : phase === "starting" ? "Calling…"
    : phase === "connecting" ? "Connecting…"
    : phase === "reconnecting" ? "Reconnecting…"
    : time;

  if (!host) return null;
  return createPortal(
    <div className={`call${showVideo ? " call--video" : ""}`} role="dialog" aria-modal="true" aria-label={`Call with ${partnerName}`}>
      <video ref={remoteRef} className={`call__remote${swapped ? " call__remote--small" : ""}${vid.remoteVideo ? "" : " call__hidden"}`} playsInline autoPlay />

      {(!vid.remoteVideo || swapped) && (
        <div className="call__who">
          {partnerAvatar ? <img src={partnerAvatar} alt="" className="call__avatar" /> : <span className="call__avatar call__avatar--letter">{partnerName.charAt(0).toUpperCase()}</span>}
          <p className="call__name">{partnerName}</p>
        </div>
      )}
      <p className="call__status" aria-live="polite">{status}</p>
      {quality !== "good" && phase === "active" && (
        <p className="call__weak">{quality === "poor" ? "Very weak network. Video is lowered to keep your voice clear." : "Weak network, still connected"}</p>
      )}

      {(vid.camera || vid.screen) && (
        <div className={`call__pip call__pip--${pip.corner}${pip.dragging ? " call__pip--drag" : ""}${swapped ? " call__pip--big" : ""}`}
          style={pip.dragging ? { left: pip.x, top: pip.y, right: "auto", bottom: "auto" } : undefined}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} role="button" aria-label="Your camera. Drag to move, tap to swap.">
          <video ref={localRef} playsInline autoPlay muted className={vid.camera && !vid.screen ? "call__mirror" : ""} />
        </div>
      )}
      {!(vid.camera || vid.screen) && <video ref={localRef} playsInline autoPlay muted className="call__hidden" />}

      {phase === "ringing" && role === "callee" && !answered ? (
        <div className="call__bar call__bar--answer">
          <button type="button" className="cbtn cbtn--end" onClick={() => void s?.decline()} aria-label="Decline">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9c-1.6 0-3.2.25-4.6.7v3.1c0 .4-.2.7-.6.9-1 .5-1.9 1.1-2.6 1.8-.2.2-.4.3-.7.3s-.5-.1-.7-.3L.3 13.1A1 1 0 0 1 0 12.4c0-.3.1-.5.3-.7A16.9 16.9 0 0 1 12 7c4.5 0 8.6 1.8 11.7 4.7.2.2.3.4.3.7s-.1.5-.3.7l-2.5 2.5c-.2.2-.4.3-.7.3s-.5-.1-.7-.3c-.8-.7-1.6-1.3-2.6-1.8a1 1 0 0 1-.6-.9V9.7C15.2 9.2 13.6 9 12 9z" /></svg>
          </button>
          <button type="button" className="cbtn cbtn--answer" onClick={() => { setAnswered(true); void s?.answer(false); }} aria-label="Answer with voice">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" /></svg>
          </button>
          {kind === "video" && (
            <button type="button" className="cbtn cbtn--answer" onClick={() => { setAnswered(true); void s?.answer(true); }} aria-label="Answer with video">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z" /></svg>
            </button>
          )}
        </div>
      ) : phase !== "ended" && (
        <div className="call__bar">
          <button type="button" className={muted ? "cbtn cbtn--on" : "cbtn"} onClick={() => { const m = !muted; setMuted(m); s?.setMuted(m); }} aria-pressed={muted} aria-label={muted ? "Unmute" : "Mute"}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{muted
              ? <path d="M19 11h-1.7c0 .7-.2 1.4-.4 2l1.2 1.2c.6-1 .9-2 .9-3.2zm-4 .2V5a3 3 0 0 0-6 0v.2zM4.3 3 3 4.3l6 6V11a3 3 0 0 0 3 3l.7-.1 1.7 1.7A5 5 0 0 1 7 11H5.3a6.7 6.7 0 0 0 5.7 6.6V21h2v-3.4a6.7 6.7 0 0 0 2.5-.9l4.2 4.3 1.3-1.3z" />
              : <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5.3-3A5.3 5.3 0 0 1 12 16.1 5.3 5.3 0 0 1 6.7 11H5c0 3.4 2.7 6.2 6 6.7V21h2v-3.3c3.3-.5 6-3.3 6-6.7z" />}</svg>
          </button>
          <button type="button" className={vid.camera ? "cbtn cbtn--on" : "cbtn"} onClick={() => void s?.setCamera(!vid.camera)} aria-pressed={vid.camera} aria-label={vid.camera ? "Turn camera off" : "Turn camera on"}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z" /></svg>
          </button>
          {vid.camera && (
            <button type="button" className="cbtn" onClick={() => void s?.flipCamera()} aria-label="Flip camera">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 5h-3.2L15 3H9L7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-8 13a5 5 0 0 1-4.6-3H5l3-3 3 3H9.2a3 3 0 0 0 5.6-1h2a5 5 0 0 1-4.8 4zm4-6-3-3h1.8a3 3 0 0 0-5.6 1h-2a5 5 0 0 1 9.4-1H19z" /></svg>
            </button>
          )}
          {CallSession.canShareScreen() && (
            <button type="button" className={vid.screen ? "cbtn cbtn--on" : "cbtn"} onClick={() => void s?.setScreen(!vid.screen)} aria-pressed={vid.screen} aria-label={vid.screen ? "Stop sharing" : "Share screen"}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2H0v2h24v-2zm-7-3.5V12c-2.8 0-4.6.8-6 2.6.6-2.6 2.2-5.1 6-5.6V6.5l4 4z" /></svg>
            </button>
          )}
          <button type="button" className="cbtn cbtn--end" onClick={() => void s?.hangUp()} aria-label="End call">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9c-1.6 0-3.2.25-4.6.7v3.1c0 .4-.2.7-.6.9-1 .5-1.9 1.1-2.6 1.8-.2.2-.4.3-.7.3s-.5-.1-.7-.3L.3 13.1A1 1 0 0 1 0 12.4c0-.3.1-.5.3-.7A16.9 16.9 0 0 1 12 7c4.5 0 8.6 1.8 11.7 4.7.2.2.3.4.3.7s-.1.5-.3.7l-2.5 2.5c-.2.2-.4.3-.7.3s-.5-.1-.7-.3c-.8-.7-1.6-1.3-2.6-1.8a1 1 0 0 1-.6-.9V9.7C15.2 9.2 13.6 9 12 9z" /></svg>
          </button>
        </div>
      )}
    </div>,
    host,
  );
}
