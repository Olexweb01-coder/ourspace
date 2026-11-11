"use client";
// One call between the two of you, built for weak networks:
// - the setup is sent in one bundle each way (fewer round trips), encrypted with the space key;
// - voice is top priority; video quality drops itself before the voice suffers;
// - a video channel always exists, so turning the camera on or sharing the screen needs no renegotiation;
// - after a network drop the call reconnects itself (a few tries) before giving up.
import { api, ApiError } from "./api";
import { decryptJSON, encryptJSON } from "./crypto-client";
import type { Vault } from "./vault";

export type CallKind = "voice" | "video";
export type CallPhase = "starting" | "ringing" | "connecting" | "active" | "reconnecting" | "ended";
export type Quality = "good" | "weak" | "poor";
export type EndReason = "hangup" | "declined" | "missed" | "busy" | "failed" | "remote" | "no-media";
type SignalType = "offer" | "answer" | "restart" | "restart-answer";
type CallRow = { id: string; status: string; answeredAt: string | null };

const callAad = (spaceId: string, callId: string) => `call:${spaceId}:${callId}`;
const GATHER_MS = 2500;      // how long to collect connection routes before sending them
const RESTART_GATHER_MS = 4000;
const MAX_RESTARTS = 3;

export type CallEvents = {
  onPhase: (p: CallPhase, reason?: EndReason) => void;
  onRemote: (stream: MediaStream) => void;
  onLocal: (stream: MediaStream) => void;
  onQuality: (q: Quality) => void;
  onVideoState: (s: { camera: boolean; screen: boolean; remoteVideo: boolean }) => void;
};

export class CallSession {
  readonly id: string;
  private pc: RTCPeerConnection | null = null;
  private local = new MediaStream();
  private remote = new MediaStream();
  private audioSender: RTCRtpSender | null = null;
  private videoSender: RTCRtpSender | null = null;
  private lastSignal = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private restarts = 0;
  private downSince: number | null = null;
  private done = false;
  private connectedOnce = false;
  private facing: "user" | "environment" = "user";
  camera = false;
  screen = false;
  muted = false;

  constructor(private vault: Vault, id: string, private role: "caller" | "callee", private kind: CallKind, private ev: CallEvents) {
    this.id = id;
  }

  // ---------------- starting ----------------
  /** Caller: get the mic (and camera), build the connection, send the offer, then wait for an answer. */
  async startAsCaller() {
    this.ev.onPhase("starting");
    if (!(await this.setup())) return;
    this.useTransceivers(
      this.pc!.addTransceiver(this.local.getAudioTracks()[0], { direction: "sendrecv", streams: [this.local] }),
      this.pc!.addTransceiver("video", { direction: "sendrecv", streams: [this.local] }));
    await this.tune(this.audioSender, { priority: "high", networkPriority: "high", maxBitrate: 40_000 });
    if (this.kind === "video") await this.setCamera(true);
    const offer = await this.pc!.createOffer();
    await this.pc!.setLocalDescription(offer);
    await this.gathered(GATHER_MS);
    await this.send("offer", this.pc!.localDescription!);
    this.ev.onPhase("ringing");
    this.poll(700);
  }

  /** Callee: answer (with or without camera): wait for the offer, reply with the answer. */
  async answer(withVideo: boolean) {
    this.ev.onPhase("connecting");
    if (!(await this.setup())) return;
    const offer = await this.waitFor("offer", 20_000);
    if (!offer) return this.finish("failed");
    const pc = this.pc!;
    await pc.setRemoteDescription(offer);
    // Use the channels the offer created (adding our own first would make a second, unconnected set).
    const ts = pc.getTransceivers();
    const at = ts.find((t) => t.receiver.track.kind === "audio")!;
    const vt = ts.find((t) => t.receiver.track.kind === "video")!;
    at.direction = "sendrecv"; vt.direction = "sendrecv";
    await at.sender.replaceTrack(this.local.getAudioTracks()[0]);
    try { at.sender.setStreams?.(this.local); vt.sender.setStreams?.(this.local); } catch { /* older browsers */ }
    this.useTransceivers(at, vt);
    await this.tune(this.audioSender, { priority: "high", networkPriority: "high", maxBitrate: 40_000 });
    if (withVideo) await this.setCamera(true);
    const ans = await this.pc!.createAnswer();
    await this.pc!.setLocalDescription(ans);
    await this.gathered(GATHER_MS);
    await this.send("answer", this.pc!.localDescription!);
    try { await api(`/api/call/${this.id}`, { body: { action: "answer" } }); }
    catch (err) { if (err instanceof ApiError && err.status === 409) return this.finish("missed"); }
    this.poll(700);
  }

  private useTransceivers(audio: RTCRtpTransceiver, video: RTCRtpTransceiver) {
    this.audioSender = audio.sender;
    this.videoSender = video.sender;
  }

  private async setup(): Promise<boolean> {
    let ice: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
    try { ice = (await api<{ iceServers: RTCIceServer[] }>("/api/call/ice")).iceServers; } catch { /* direct only */ }
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      mic.getAudioTracks().forEach((t) => this.local.addTrack(t));
    } catch {
      this.finish("no-media");
      return false;
    }
    const pc = new RTCPeerConnection({ iceServers: ice, iceCandidatePoolSize: 2, bundlePolicy: "max-bundle" });
    this.pc = pc;
    pc.ontrack = (e) => {
      if (!this.remote.getTracks().includes(e.track)) this.remote.addTrack(e.track);
      e.track.onunmute = () => { this.remoteFlowing = true; this.emitVideo(); };
      e.track.onmute = () => this.emitVideo();
      this.ev.onRemote(this.remote);
      this.emitVideo();
    };
    pc.onconnectionstatechange = () => this.onConnection();
    this.ev.onLocal(this.local);
    return true;
  }

  private async tune(sender: RTCRtpSender | null, enc: RTCRtpEncodingParameters & { networkPriority?: RTCPriorityType }) {
    if (!sender) return;
    try {
      const p = sender.getParameters();
      if (!p.encodings || p.encodings.length === 0) p.encodings = [{}];
      Object.assign(p.encodings[0], enc);
      await sender.setParameters(p);
    } catch { /* some browsers ignore parts of this */ }
  }

  // ---------------- signalling (encrypted, through our own server) ----------------
  private async send(type: SignalType, desc: RTCSessionDescriptionInit) {
    const { iv, ct } = await encryptJSON(this.vault.encKey, { type: desc.type, sdp: desc.sdp }, callAad(this.vault.spaceId, this.id));
    for (let attempt = 0; attempt < 4; attempt++) {
      try { await api(`/api/call/${this.id}`, { body: { action: "signal", type, iv, ct } }); return; }
      catch (err) { if (err instanceof ApiError && err.status < 500 && err.status !== 429) throw err; await sleep(600 * (attempt + 1)); }
    }
  }

  private pending: { type: SignalType; desc: RTCSessionDescriptionInit }[] = [];
  private async fetchSignals(): Promise<CallRow | null> {
    const r = await api<{ call: CallRow; signals: { id: number; type: SignalType; iv: string; ct: string }[] }>(`/api/call/${this.id}?after=${this.lastSignal}`);
    for (const s of r.signals) {
      this.lastSignal = Math.max(this.lastSignal, s.id);
      try {
        const desc = await decryptJSON<RTCSessionDescriptionInit>(this.vault.encKey, s.iv, s.ct, callAad(this.vault.spaceId, this.id));
        this.pending.push({ type: s.type, desc });
      } catch { /* not from our space: ignore */ }
    }
    return r.call;
  }

  private async waitFor(type: SignalType, ms: number): Promise<RTCSessionDescriptionInit | null> {
    const until = Date.now() + ms;
    while (Date.now() < until && !this.done) {
      const i = this.pending.findIndex((p) => p.type === type);
      if (i >= 0) return this.pending.splice(i, 1)[0].desc;
      try {
        const call = await this.fetchSignals();
        if (call && ["ended", "missed", "declined", "busy"].includes(call.status)) { this.finish(call.status === "ended" ? "remote" : call.status as EndReason); return null; }
      } catch { /* weak network: keep trying */ }
      await sleep(600);
    }
    return null;
  }

  private poll(ms: number) {
    if (this.done) return;
    this.timer = setTimeout(async () => {
      try {
        const call = await this.fetchSignals();
        if (call) {
          if (call.status === "declined") return this.finish("declined");
          if (call.status === "missed") return this.finish("missed");
          if (call.status === "busy") return this.finish("busy");
          if (call.status === "ended") return this.finish("remote");
        }
        await this.handlePending();
      } catch { /* weak network: try again next time */ }
      this.poll(this.connectedOnce ? 2000 : 700);
    }, ms);
  }

  private async handlePending() {
    const pc = this.pc;
    if (!pc) return;
    while (this.pending.length) {
      const { type, desc } = this.pending.shift()!;
      try {
        if ((type === "answer" || type === "restart-answer") && pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(desc);
          if (type === "answer") this.ev.onPhase("connecting");
        } else if (type === "restart" && this.role === "callee") {
          await pc.setRemoteDescription(desc);
          await pc.setLocalDescription(await pc.createAnswer());
          await this.gathered(RESTART_GATHER_MS);
          await this.send("restart-answer", pc.localDescription!);
        }
      } catch { /* a stale message: skip */ }
    }
  }

  /** Waits for connection routes (direct and relay) to be found, but never longer than `ms`. */
  private gathered(ms: number): Promise<void> {
    const pc = this.pc!;
    if (pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((res) => {
      const t = setTimeout(res, ms);
      pc.addEventListener("icegatheringstatechange", () => { if (pc.iceGatheringState === "complete") { clearTimeout(t); res(); } });
    });
  }

  // ---------------- staying connected ----------------
  private onConnection() {
    const pc = this.pc;
    if (!pc || this.done) return;
    const s = pc.connectionState;
    if (s === "connected") {
      this.downSince = null;
      if (!this.connectedOnce) { this.connectedOnce = true; this.startStats(); }
      this.ev.onPhase("active");
    } else if (s === "disconnected" || s === "failed") {
      if (!this.connectedOnce && s === "failed") { void this.restart(); return; }
      this.downSince ??= Date.now();
      this.ev.onPhase("reconnecting");
      // Give a blip a moment to heal by itself, then rebuild the route.
      setTimeout(() => { if (!this.done && this.pc?.connectionState !== "connected") void this.restart(); }, s === "failed" ? 0 : 4000);
    }
  }

  private restarting = false;
  private async restart() {
    if (this.done || this.restarting || this.role !== "caller") return;   // only one side restarts, so they never collide
    if (this.restarts >= MAX_RESTARTS) return this.finish("failed");
    this.restarting = true;
    this.restarts++;
    try {
      const pc = this.pc!;
      await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
      await this.gathered(RESTART_GATHER_MS);
      await this.send("restart", pc.localDescription!);
    } catch { /* try again on the next drop */ }
    finally { this.restarting = false; }
    setTimeout(() => { if (!this.done && this.pc?.connectionState !== "connected") void this.restart(); }, 12_000);
  }

  // Every 2 seconds: how is the line? Weak lines get lighter video so the voice stays clear.
  private lastLevel: Quality = "good";
  private lastFrames = -1;
  private remoteFlowing = true;   // are video frames actually arriving? (a turned-off camera just stops them)
  private startStats() {
    this.statsTimer = setInterval(async () => {
      const pc = this.pc;
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        let rtt = 0, lost = 0, recv = 0, frames = -1;
        stats.forEach((r) => {
          if (r.type === "inbound-rtp" && r.kind === "video") frames = r.framesDecoded ?? frames;
          if (r.type === "candidate-pair" && r.state === "succeeded" && r.nominated) rtt = r.currentRoundTripTime ?? rtt;
          if (r.type === "inbound-rtp" && r.kind === "audio") { lost = r.packetsLost ?? 0; recv = r.packetsReceived ?? 0; }
        });
        const flowing = frames > this.lastFrames && frames > 0;
        this.lastFrames = frames;
        if (flowing !== this.remoteFlowing) { this.remoteFlowing = flowing; this.emitVideo(); }
        const lossRate = recv + lost > 0 ? lost / (recv + lost) : 0;
        const level: Quality = rtt > 0.6 || lossRate > 0.08 ? "poor" : rtt > 0.3 || lossRate > 0.03 ? "weak" : "good";
        if (level !== this.lastLevel) {
          this.lastLevel = level;
          this.ev.onQuality(level);
          await this.tune(this.videoSender, level === "poor" ? { maxBitrate: 150_000, scaleResolutionDownBy: 2, maxFramerate: 15 }
            : level === "weak" ? { maxBitrate: 350_000, scaleResolutionDownBy: 1.5, maxFramerate: 20 }
            : { maxBitrate: this.screen ? 1_200_000 : 800_000, scaleResolutionDownBy: 1, maxFramerate: 30 });
        }
      } catch { /* stats not available */ }
    }, 2000);
  }

  // ---------------- controls ----------------
  setMuted(m: boolean) {
    this.muted = m;
    this.local.getAudioTracks().forEach((t) => { t.enabled = !m; });
  }

  async setCamera(on: boolean): Promise<boolean> {
    if (on) {
      try {
        const cam = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.facing, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } } });
        const track = cam.getVideoTracks()[0];
        this.stopVideo();
        this.local.addTrack(track);
        await this.videoSender?.replaceTrack(track);
        this.camera = true; this.screen = false;
      } catch { return false; }
    } else {
      this.stopVideo();
      await this.videoSender?.replaceTrack(null);
      this.camera = false;
    }
    this.ev.onLocal(this.local);
    this.emitVideo();
    return true;
  }

  async flipCamera() {
    if (!this.camera) return;
    this.facing = this.facing === "user" ? "environment" : "user";
    await this.setCamera(true);
  }

  /** Computers only: browsers on phones don't allow sharing the screen. */
  static canShareScreen() { return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia && !/Android|iPhone|iPad/i.test(navigator.userAgent); }

  async setScreen(on: boolean): Promise<boolean> {
    if (on) {
      try {
        const disp = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
        const track = disp.getVideoTracks()[0];
        track.contentHint = "detail";
        this.stopVideo();
        this.local.addTrack(track);
        await this.videoSender?.replaceTrack(track);
        this.screen = true; this.camera = false;
        track.onended = () => { void this.setScreen(false); };
      } catch { return false; }
    } else {
      this.stopVideo();
      await this.videoSender?.replaceTrack(null);
      this.screen = false;
    }
    this.ev.onLocal(this.local);
    this.emitVideo();
    return true;
  }

  private stopVideo() {
    this.local.getVideoTracks().forEach((t) => { t.stop(); this.local.removeTrack(t); });
  }

  private emitVideo() {
    const remoteVideo = this.remoteFlowing && this.remote.getVideoTracks().some((t) => t.readyState === "live" && !t.muted);
    this.ev.onVideoState({ camera: this.camera, screen: this.screen, remoteVideo });
  }

  // ---------------- ending ----------------
  async hangUp() {
    if (this.done) return;
    this.finish("hangup");
    try { await api(`/api/call/${this.id}`, { body: { action: "end" } }); } catch { /* the other phone will notice */ }
  }

  async decline() {
    this.finish("declined");
    try { await api(`/api/call/${this.id}`, { body: { action: "decline" } }); } catch { /* it becomes missed */ }
  }

  private finish(reason: EndReason) {
    if (this.done) return;
    this.done = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.local.getTracks().forEach((t) => t.stop());
    try { this.pc?.close(); } catch { /* already closed */ }
    this.pc = null;
    if (reason !== "hangup" && reason !== "declined") void api(`/api/call/${this.id}`, { body: { action: "end" } }).catch(() => {});
    this.ev.onPhase("ended", reason);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
