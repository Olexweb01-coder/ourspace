"use client";
// Ringtones made on the phone (no sound files to download): a soft ring for incoming calls, a ringback for outgoing.
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx ??= new Ctx();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch { return null; }
}
function tone(c: AudioContext, freqs: number[], at: number, len: number, vol: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.03);
  g.gain.setValueAtTime(vol, at + len - 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  g.connect(c.destination);
  freqs.forEach((f) => { const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f; o.connect(g); o.start(at); o.stop(at + len + 0.02); });
}
/** Starts a ring; returns a function that stops it. */
export function ring(kind: "incoming" | "outgoing"): () => void {
  const c = audio();
  let stopped = false;
  const beat = () => {
    if (stopped || !c) return;
    const t = c.currentTime + 0.02;
    if (kind === "incoming") {
      [0, 0.32].forEach((d) => tone(c, [659, 784], t + d, 0.26, 0.18));
      try { navigator.vibrate?.([300, 200, 300]); } catch { /* no vibration */ }
    } else {
      tone(c, [440, 480], t, 1.1, 0.08);
    }
  };
  beat();
  const timer = setInterval(beat, kind === "incoming" ? 2200 : 3000);
  return () => { stopped = true; clearInterval(timer); try { navigator.vibrate?.(0); } catch { /* ignore */ } };
}
