"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import BondMark from "@/components/BondMark";
import Celebration, { streakLine } from "@/components/Celebration";
import InviteBox from "@/components/InviteBox";
import MediaBubble, { type MediaState } from "@/components/MediaBubble";
import MediaViewer from "@/components/MediaViewer";
import MoodCard from "@/components/MoodCard";
import Planner from "@/components/Planner";
import StreakSheet from "@/components/StreakSheet";
import VoiceRecorder from "@/components/VoiceRecorder";
import { api, ApiError } from "@/lib/api";
import { APP_NAME } from "@/lib/brand";
import { decryptJSON, encryptJSON, messageAad } from "@/lib/crypto-client";
import { ANGRY, LOVE, onlyLoveAndAngry } from "@/lib/emoji";
import { dayLabel, initial, isOnline, sinceLabel, timeOf } from "@/lib/format";
import { personalizeInstall } from "@/lib/install";
import {
  compressImage, forgetAllMediaUrls, forgetMediaUrl, formatBytes, mediaUrl, uploadEncrypted, type MediaPayload,
} from "@/lib/media-client";
import { MAX_BYTES, type Theme } from "@/lib/media-limits";
import { countdownLabel, daysBetween, EMPTY_CYCLE, nextOccurrence, plannerAad, predictCycle, type CycleData, type DayKind } from "@/lib/planner";
import { guessMoods, isMilestone, localDay, moodAad, moodOf, type MoodKey } from "@/lib/rituals";
import { enableNotifications, isIOS, isStandalone, pushSupported, reportNotificationState } from "@/lib/push-client";
import { clearVault, getVault, type Vault } from "@/lib/vault";

type Reaction = "love" | "angry";
type Member = {
  id: string; role: "host" | "partner"; name: string; banned: boolean;
  notifications: "on" | "off" | "unknown"; lastSeenAt: string | null; lastNudgeAt: string | null;
  avatarMediaId: string | null;
};
type Msg = {
  id: string; senderId: string; kind: string; viewOnce: boolean; viewedAt: string | null; deleted: boolean;
  reactions: Record<string, Reaction>; expiresAt: string | null; createdAt: string; iv: string | null; ct: string | null;
  media: MediaState;
};
type Space = { label: string; disappearSeconds: number | null; theme: Theme; backgroundMediaId: string | null };
type MoodRow = { memberId: string; day: string; iv: string; ct: string; updatedAt: string };
type Mood = { memberId: string; day: string; key: MoodKey; updatedAt: string };
type Streak = { today: string; current: number; best: number; todayDone: boolean; sentToday: string[] };
type SpecialRow = { id: string; kind: DayKind; aboutMember: string | null; month: number; day: number; startYear: number | null; iv: string; ct: string };
type Special = Omit<SpecialRow, "iv" | "ct"> & { title: string };
type CycleRow = { memberId: string; iv: string; ct: string };
type SyncResponse = {
  now: string;
  specialDays: SpecialRow[];
  cycles: CycleRow[];
  streak: Streak;
  moods: MoodRow[];
  me: { id: string; role: "host" | "partner"; name: string; spaceId: string };
  members: Member[];
  space: Space;
  messages: Msg[];
};
type Info = Omit<SyncResponse, "messages" | "now" | "moods" | "specialDays" | "cycles">;
type TextPayload = { t: "text"; body: string };
type Payload = TextPayload | MediaPayload;
type Usage = { spaceBytes: number; keptBytes: number; totalBytes: number; limitBytes: number; uploadsThisMonth: number; uploadLimit: number };
type Upload = { id: string; label: string; pct: number };
type OnceView = { kind: "text"; text: string } | { kind: "photo" | "video" | "voice"; url: string; mediaId: string; caption?: string };

const POLL_MS = 2500;
const LOCK_AFTER_MS = 2 * 60 * 1000;
const DISAPPEAR_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Off" },
  { value: 3600, label: "1 hour" },
  { value: 86400, label: "24 hours" },
  { value: 604800, label: "7 days" },
];
const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "candle", label: "Candlelight" },
  { value: "rose", label: "Rose" },
  { value: "midnight", label: "Midnight" },
  { value: "blush", label: "Blush" },
];
const NOUN: Record<string, string> = { photo: "Photo", video: "Video", voice: "Voice note", file: "File", text: "Message" };

export default function ChatPage() {
  const router = useRouter();
  const vaultRef = useRef<Vault | null>(null);
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [msgs, setMsgs] = useState<Map<string, Msg>>(() => new Map());
  const payloads = useRef(new Map<string, Payload | null>());
  const [, bump] = useReducer((x: number) => x + 1, 0);

  const cursor = useRef<string | null>(null);
  const syncing = useRef(false);
  const syncAgain = useRef(false);
  const hiddenAt = useRef<number | null>(null);
  const seenNudge = useRef<string | null | undefined>(undefined);

  const [draft, setDraft] = useState("");
  const [viewOnce, setViewOnce] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [recording, setRecording] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [once, setOnce] = useState<OnceView | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [invite, setInvite] = useState<{ inviteUrl: string; expiresAt: string } | null>(null);
  const [notif, setNotif] = useState<"on" | "off" | "unknown">("unknown");
  const [toast, setToast] = useState<string | null>(null);
  const [hearts, setHearts] = useState(0);
  const [welcome, setWelcome] = useState(false);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busySetting, setBusySetting] = useState<string | null>(null);
  const [moods, setMoods] = useState<Mood[]>([]);
  const moodCache = useRef(new Map<string, MoodKey | null>());
  const [moodLater, setMoodLater] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);
  const [streakOpen, setStreakOpen] = useState(false);
  const [celebrate, setCelebrate] = useState<{ kicker: string; big: string; label: string; line: string; cta?: string; bigIsText?: boolean } | null>(null);
  const [specials, setSpecials] = useState<Special[]>([]);
  const [cycleMap, setCycleMap] = useState<Record<string, CycleData>>({});
  const plainCache = useRef(new Map<string, unknown>());
  const [plannerOpen, setPlannerOpen] = useState(false);
  const prevDone = useRef<boolean | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const backgroundInput = useRef<HTMLInputElement>(null);
  const atBottom = useRef(true);
  const lastTap = useRef<{ id: string; at: number } | null>(null);

  const lockOut = useCallback(() => {
    clearVault();
    forgetAllMediaUrls();
    const v = vaultRef.current;
    router.replace(v ? `/?s=${v.spaceId}&m=${v.memberId}` : `/${window.location.search}`);
  }, [router]);

  // ---------- boot ----------
  useEffect(() => {
    const v = getVault();
    if (!v) {
      const p = new URLSearchParams(window.location.search);
      router.replace(p.get("s") && p.get("m") ? `/?s=${p.get("s")}&m=${p.get("m")}` : "/");
      return;
    }
    vaultRef.current = v;
    personalizeInstall(v.spaceId, v.memberId);
    setWelcome(new URLSearchParams(window.location.search).get("welcome") === "1");
    const clean = `/chat?s=${v.spaceId}&m=${v.memberId}`;
    if (window.location.pathname + window.location.search !== clean) window.history.replaceState(null, "", clean);
    setReady(true);
    void reportNotificationState().then(setNotif);
  }, [router]);

  // ---------- decryption ----------
  const decryptList = useCallback(async (list: Msg[]) => {
    const v = vaultRef.current;
    if (!v) return;
    const todo = list.filter((m) => !m.deleted && !m.viewOnce && m.iv && m.ct && !payloads.current.has(m.id));
    if (todo.length === 0) return;
    await Promise.all(todo.map(async (m) => {
      try {
        const p = await decryptJSON<Payload>(v.encKey, m.iv as string, m.ct as string, messageAad(v.spaceId, m.senderId));
        payloads.current.set(m.id, p && typeof p === "object" && "t" in p ? p : null);
      } catch {
        payloads.current.set(m.id, null);
      }
    }));
    bump();
  }, []);

  const decryptMoods = useCallback(async (rows: MoodRow[]) => {
    const v = vaultRef.current;
    if (!v) return;
    const out: Mood[] = [];
    for (const r of rows) {
      const k = `${r.memberId}:${r.day}:${r.iv}`;
      if (!moodCache.current.has(k)) {
        try {
          const p = await decryptJSON<{ mood: string }>(v.encKey, r.iv, r.ct, moodAad(v.spaceId, r.memberId, r.day));
          moodCache.current.set(k, moodOf(p.mood)?.key ?? null);
        } catch {
          moodCache.current.set(k, null);
        }
      }
      const key = moodCache.current.get(k);
      if (key) out.push({ memberId: r.memberId, day: r.day, key, updatedAt: r.updatedAt });
    }
    setMoods((prev) => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out));
  }, []);

  const decryptPlans = useCallback(async (days: SpecialRow[], cycles: CycleRow[]) => {
    const v = vaultRef.current;
    if (!v) return;
    const open = async <T,>(what: "day" | "cycle", id: string, iv: string, ct: string): Promise<T | null> => {
      const k = `${what}:${id}:${iv}`;
      if (!plainCache.current.has(k)) {
        try { plainCache.current.set(k, await decryptJSON<T>(v.encKey, iv, ct, plannerAad(what, v.spaceId, id))); }
        catch { plainCache.current.set(k, null); }
      }
      return plainCache.current.get(k) as T | null;
    };
    const out: Special[] = [];
    for (const d of days) {
      const p = await open<{ title: string }>("day", d.id, d.iv, d.ct);
      out.push({ id: d.id, kind: d.kind, aboutMember: d.aboutMember, month: d.month, day: d.day, startYear: d.startYear, title: p?.title ?? "" });
    }
    const cm: Record<string, CycleData> = {};
    for (const c of cycles) {
      const p = await open<CycleData>("cycle", c.memberId, c.iv, c.ct);
      if (p) cm[c.memberId] = { ...EMPTY_CYCLE, ...p };
    }
    setSpecials((prev) => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out));
    setCycleMap((prev) => (JSON.stringify(prev) === JSON.stringify(cm) ? prev : cm));
  }, []);

  // ---------- sync ----------
  const syncNow = useCallback(async () => {
    if (!vaultRef.current) return;
    if (syncing.current) { syncAgain.current = true; return; }
    syncing.current = true;
    try {
      const q = cursor.current ? `?since=${encodeURIComponent(cursor.current)}` : "";
      const data = await api<SyncResponse>(`/api/sync${q}`);
      cursor.current = data.now;
      setInfo({ me: data.me, members: data.members, space: data.space, streak: data.streak });
      void decryptMoods(data.moods ?? []);
      void decryptPlans(data.specialDays ?? [], data.cycles ?? []);
      if (data.messages.length) {
        setMsgs((prev) => {
          const next = new Map(prev);
          for (const m of data.messages) next.set(m.id, m);
          return next;
        });
        await decryptList(data.messages);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) lockOut();
    } finally {
      syncing.current = false;
      if (syncAgain.current) { syncAgain.current = false; void syncNow(); }
    }
  }, [decryptList, decryptMoods, decryptPlans, lockOut]);

  useEffect(() => {
    if (!ready) return;
    void syncNow();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void syncNow(); }, POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
      } else {
        if (hiddenAt.current && Date.now() - hiddenAt.current > LOCK_AFTER_MS) return lockOut();
        hiddenAt.current = null;
        void syncNow();
      }
    };
    const onSwMessage = (e: MessageEvent) => { if (e.data?.type === "push") void syncNow(); };

    document.addEventListener("visibilitychange", onVisibility);
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  }, [ready, syncNow, lockOut]);

  // ---------- derived ----------
  const me = info?.me ?? null;
  const partner = useMemo(() => info?.members.find((m) => m.id !== info.me.id) ?? null, [info]);
  const host = info?.members.find((m) => m.role === "host") ?? null;
  const guest = info?.members.find((m) => m.role === "partner") ?? null;

  // Profile pictures and the chat background, unlocked on this phone.
  const avatarKey = info?.members.map((m) => `${m.id}:${m.avatarMediaId ?? ""}`).join("|") ?? "";
  useEffect(() => {
    const v = vaultRef.current;
    if (!v || !info) return;
    let alive = true;
    for (const m of info.members) {
      if (!m.avatarMediaId) {
        setAvatars((a) => { if (!(m.id in a)) return a; const c = { ...a }; delete c[m.id]; return c; });
        continue;
      }
      mediaUrl(v, m.avatarMediaId, "image/jpeg")
        .then((u) => { if (alive) setAvatars((a) => (a[m.id] === u ? a : { ...a, [m.id]: u })); })
        .catch(() => {});
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarKey]);

  const backgroundId = info?.space.backgroundMediaId ?? null;
  useEffect(() => {
    const v = vaultRef.current;
    if (!v || !backgroundId) { setBackgroundUrl(null); return; }
    let alive = true;
    mediaUrl(v, backgroundId, "image/jpeg").then((u) => { if (alive) setBackgroundUrl(u); }).catch(() => {});
    return () => { alive = false; };
  }, [backgroundId]);

  // A nudge from them: float hearts (only for new nudges, not the one already there on open)
  useEffect(() => {
    const at = partner?.lastNudgeAt ?? null;
    if (seenNudge.current === undefined) { if (info) seenNudge.current = at; return; }
    if (at && at !== seenNudge.current) {
      seenNudge.current = at;
      setHearts((h) => h + 1);
      setToast(`${partner?.name} nudged you`);
    }
  }, [partner?.lastNudgeAt, partner?.name, info]);

  // Milestones get the full celebration once per phone; any completed day gets a little toast.
  const streak = info?.streak ?? null;
  useEffect(() => {
    if (!streak || !info) return;
    if (streak.todayDone && isMilestone(streak.current)) {
      const key = `ourspace:celebrated:${info.me.spaceId}:${streak.current}:${streak.today}`;
      try {
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, "1");
          const host = info.members.find((m) => m.role === "host");
          const guest = info.members.find((m) => m.role === "partner");
          setCelebrate({ kicker: `${host?.name ?? ""} & ${guest?.name ?? info.space.label}`, big: String(streak.current), label: "days in a row", line: streakLine(streak.current) });
        }
      } catch { /* private mode */ }
    } else if (prevDone.current === false && streak.todayDone && streak.current > 0) {
      setToast(`Day ${streak.current} together ${LOVE}`);
    }
    prevDone.current = streak.todayDone;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak?.todayDone, streak?.current]);

  useEffect(() => {
    if (!info || specials.length === 0) return;
    const t = localDay();
    const meId = info.me.id;
    const nameOf = (id: string | null) => info.members.find((m) => m.id === id)?.name ?? "";
    const other = info.members.find((m) => m.id !== meId)?.name ?? info.space.label;
    for (const d of specials) {
      if (nextOccurrence(d.month, d.day, t) !== t) continue;
      const key = `ourspace:special:${d.id}:${t}`;
      try { if (localStorage.getItem(key)) continue; localStorage.setItem(key, "1"); } catch { continue; }
      const years = d.startYear ? Number(t.slice(0, 4)) - d.startYear : 0;
      if (d.kind === "birthday") {
        const mine = d.aboutMember === meId;
        const who = nameOf(d.aboutMember);
        setCelebrate(mine
          ? { kicker: "Today is yours", big: `Happy birthday, ${info.me.name}`, label: years > 0 ? `${years} looks beautiful on you` : "made with love", line: `${other} is celebrating you today. So is this little space.`, cta: "Thank you", bigIsText: true }
          : { kicker: "Today", big: `It's ${who}'s birthday`, label: years > 0 ? `${who} turns ${years}` : "a day to celebrate", line: `Make today all about ${who}. Start with a message.`, cta: `Celebrate ${who}`, bigIsText: true });
      } else if (d.kind === "anniversary") {
        setCelebrate(years > 0
          ? { kicker: "Happy anniversary", big: String(years), label: years === 1 ? "year together" : "years together", line: "Every one of them chosen. Here's to the next.", cta: "Here's to us" }
          : { kicker: "Today", big: "Happy anniversary", label: "to the two of you", line: "Here's to everything you are together.", cta: "Here's to us", bigIsText: true });
      } else {
        setCelebrate({ kicker: "Today", big: d.title || "A special day", label: "is today", line: "A day that matters to you both. Make it count.", cta: "Celebrate", bigIsText: true });
      }
      break;
    }
  }, [specials, info]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3400);
    return () => clearTimeout(t);
  }, [toast]);

  const visible = useMemo(() => {
    const now = Date.now();
    return Array.from(msgs.values())
      // Show live messages, plus opened view-once markers. Hide anything past its disappear time.
      .filter((m) => (!m.deleted || (m.viewOnce && !!m.viewedAt)) && !(m.expiresAt && !m.deleted && new Date(m.expiresAt).getTime() < now))
      .sort((a, b) => Number(a.id) - Number(b.id));
  }, [msgs]);

  useEffect(() => {
    const el = listRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [visible.length, ready, uploads.length]);

  // Grow the message box with what you type (Safari doesn't support field-sizing yet).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft]);

  // ---------- sending ----------
  function addLocal(v: Vault, id: string, kind: string, res: { createdAt: string; expiresAt: string | null; mediaExpiresAt?: string | null }, iv: string, ct: string, sentOnce: boolean, mediaId?: string) {
    setMsgs((prev) => {
      const next = new Map(prev);
      next.set(id, {
        id, senderId: v.memberId, kind, viewOnce: sentOnce, viewedAt: null, deleted: false, reactions: {},
        expiresAt: res.expiresAt, createdAt: res.createdAt, iv, ct,
        media: mediaId ? { id: mediaId, keptBy: null, expiresAt: res.mediaExpiresAt ?? null, gone: false } : null,
      });
      return next;
    });
    atBottom.current = true;
  }

  async function postMessage(payload: Payload, mediaId?: string) {
    const v = vaultRef.current;
    if (!v) throw new Error("locked");
    const sentOnce = viewOnce;
    const { iv, ct } = await encryptJSON(v.encKey, payload, messageAad(v.spaceId, v.memberId));
    const res = await api<{ id: string; createdAt: string; expiresAt: string | null; mediaExpiresAt: string | null }>("/api/messages", {
      body: { iv, ct, viewOnce: sentOnce, kind: payload.t, mediaId },
    });
    payloads.current.set(res.id, payload);
    addLocal(v, res.id, payload.t, res, iv, ct, sentOnce, mediaId);
    setViewOnce(false);
    void syncNow();
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = onlyLoveAndAngry(draft).trim();
    if (!vaultRef.current || !body || sending) return;
    setSending(true);
    try {
      await postMessage({ t: "text", body });
      setDraft("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return lockOut();
      setToast(err instanceof ApiError ? err.message : "Not sent. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  /** Encrypts, uploads with a progress bar, then sends the message that points to it. */
  async function sendMedia(label: string, bytes: ArrayBuffer, build: (mediaId: string, caption?: string) => MediaPayload) {
    const v = vaultRef.current;
    if (!v) return;
    const caption = onlyLoveAndAngry(draft).trim() || undefined;
    const job: Upload = { id: crypto.randomUUID(), label, pct: 0 };
    setUploads((u) => [...u, job]);
    atBottom.current = true;
    try {
      const mediaId = await uploadEncrypted(v, bytes, "message", (pct) =>
        setUploads((u) => u.map((x) => (x.id === job.id ? { ...x, pct } : x))));
      await postMessage(build(mediaId, caption), mediaId);
      if (caption) setDraft("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return lockOut();
      setToast((err as Error).message || `${label} didn't send. Try again.`);
    } finally {
      setUploads((u) => u.filter((x) => x.id !== job.id));
    }
  }

  async function onPhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setAttachOpen(false);
    for (const file of files.slice(0, 10)) {
      try {
        if (file.type === "image/gif" && file.size <= 8 * 1024 * 1024) {
          const bmp = await createImageBitmap(file);
          const dims = { w: bmp.width, h: bmp.height };
          bmp.close();
          await sendMedia("Photo", await file.arrayBuffer(), (mediaId, caption) =>
            ({ t: "photo", mediaId, mime: "image/gif", ...dims, size: file.size, caption }));
          continue;
        }
        const img = await compressImage(file, 1600);
        await sendMedia("Photo", img.bytes, (mediaId, caption) =>
          ({ t: "photo", mediaId, mime: "image/jpeg", w: img.w, h: img.h, thumb: img.thumb, size: img.bytes.byteLength, caption }));
      } catch {
        // A format this phone can't draw (e.g. some HEIC files): send it as a file instead.
        await sendFile(file);
      }
    }
  }

  async function onVideo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setAttachOpen(false);
    if (!file) return;
    if (file.size > MAX_BYTES.message) return setToast(`Videos can be up to ${formatBytes(MAX_BYTES.message)}. Trim it and try again.`);
    await sendMedia("Video", await file.arrayBuffer(), (mediaId, caption) =>
      ({ t: "video", mediaId, mime: file.type || "video/mp4", name: file.name || "video.mp4", size: file.size, caption }));
  }

  async function sendFile(file: File) {
    if (file.size > MAX_BYTES.message) return setToast(`Files can be up to ${formatBytes(MAX_BYTES.message)}.`);
    await sendMedia("File", await file.arrayBuffer(), (mediaId, caption) =>
      ({ t: "file", mediaId, mime: file.type || "application/octet-stream", name: file.name || "file", size: file.size, caption }));
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setAttachOpen(false);
    if (file) await sendFile(file);
  }

  async function onVoice(bytes: ArrayBuffer, mime: string, seconds: number) {
    setRecording(false);
    await sendMedia("Voice note", bytes, (mediaId) =>
      ({ t: "voice", mediaId, mime, duration: Math.round(seconds), size: bytes.byteLength }));
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
      e.preventDefault();
      void send();
    }
  }

  // ---------- reacting, keeping, view once ----------
  async function react(m: Msg, r: Reaction) {
    if (!me) return;
    const next = m.reactions[me.id] === r ? null : r;
    setMsgs((prev) => {
      const copy = new Map(prev);
      const reactions = { ...m.reactions };
      if (next) reactions[me.id] = next; else delete reactions[me.id];
      copy.set(m.id, { ...m, reactions });
      return copy;
    });
    setActiveId(null);
    try {
      await api(`/api/messages/${m.id}/react`, { body: { reaction: next } });
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Couldn't react. Try again.");
      void syncNow();
    }
  }

  function tapBubble(m: Msg) {
    const now = Date.now();
    if (lastTap.current && lastTap.current.id === m.id && now - lastTap.current.at < 320) {
      lastTap.current = null;
      void react(m, "love"); // double tap = love
      return;
    }
    lastTap.current = { id: m.id, at: now };
    setActiveId((cur) => (cur === m.id ? null : m.id));
  }

  async function keep(m: Msg, value: boolean) {
    if (!m.media || !me) return;
    try {
      const res = await api<{ kept: boolean; expiresAt: string | null }>(`/api/media/${m.media.id}/keep`, { body: { keep: value } });
      setMsgs((prev) => {
        const copy = new Map(prev);
        const cur = copy.get(m.id);
        if (cur?.media) {
          copy.set(m.id, {
            ...cur,
            expiresAt: value ? null : cur.expiresAt,
            media: { ...cur.media, keptBy: value ? me.id : null, expiresAt: res.expiresAt },
          });
        }
        return copy;
      });
      setToast(value ? "Kept. It stays until one of you unkeeps it." : "Unkept. It will disappear on its 30-day clock.");
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Couldn't change that. Try again.");
    }
  }

  async function openOnce(m: Msg) {
    const v = vaultRef.current;
    if (!v || !m.iv || !m.ct) return;
    let payload: Payload;
    try {
      payload = await decryptJSON<Payload>(v.encKey, m.iv, m.ct, messageAad(v.spaceId, m.senderId));
    } catch {
      return setToast("This message couldn't be opened.");
    }
    if (payload.t === "text") {
      setOnce({ kind: "text", text: payload.body });
    } else if (payload.t === "file") {
      return setToast("Files can't be sent as view once.");
    } else {
      try {
        const url = await mediaUrl(v, payload.mediaId, payload.mime);
        setOnce({ kind: payload.t, url, mediaId: payload.mediaId, caption: "caption" in payload ? payload.caption : undefined });
      } catch {
        return setToast("Couldn't open it. Check your connection and try again.");
      }
    }
    // Only now that it's on screen: burn it on the server.
    setMsgs((prev) => {
      const copy = new Map(prev);
      copy.set(m.id, { ...m, deleted: true, viewedAt: new Date().toISOString(), iv: null, ct: null });
      return copy;
    });
    api(`/api/messages/${m.id}/viewed`, { method: "POST" }).catch(() => {});
  }

  function closeOnce() {
    if (once && once.kind !== "text") forgetMediaUrl(once.mediaId);
    setOnce(null);
  }

  async function pickMood(key: MoodKey) {
    const v = vaultRef.current;
    if (!v) return;
    const day = localDay();
    try {
      const { iv, ct } = await encryptJSON(v.encKey, { mood: key }, moodAad(v.spaceId, v.memberId, day));
      await api("/api/moods", { body: { day, iv, ct } });
      const now = new Date().toISOString();
      setMoods((prev) => [...prev.filter((m) => !(m.memberId === v.memberId && m.day === day)), { memberId: v.memberId, day, key, updatedAt: now }]);
      setMoodOpen(false);
      setToast(`${partner?.name ?? "They"} will see you feel ${moodOf(key)?.label.toLowerCase()} today`);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Couldn't save that. Try again.");
    }
  }

  // ---------- header actions & settings ----------
  async function nudge() {
    try {
      await api("/api/nudge", { method: "POST" });
      setToast(`Nudge sent ${LOVE}`);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Couldn't nudge. Try again.");
    }
  }

  async function saveSettings(body: Record<string, unknown>, done: string) {
    try {
      const s = await api<Pick<Space, "disappearSeconds" | "theme" | "backgroundMediaId">>("/api/space/settings", { body });
      setInfo((i) => (i ? { ...i, space: { ...i.space, ...s } } : i));
      setToast(done);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Couldn't change that. Try again.");
    }
  }

  async function onAvatar(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const v = vaultRef.current;
    if (!file || !v) return;
    setBusySetting("avatar");
    try {
      const img = await compressImage(file, 512, 0.85);
      const mediaId = await uploadEncrypted(v, img.bytes, "avatar");
      await api("/api/profile", { body: { avatarMediaId: mediaId } });
      await syncNow();
      setToast("Your photo is in the circles now");
    } catch (err) {
      setToast((err as Error).message || "Couldn't update your photo.");
    } finally {
      setBusySetting(null);
    }
  }

  async function removeAvatar() {
    try {
      await api("/api/profile", { body: { avatarMediaId: null } });
      await syncNow();
    } catch {
      setToast("Couldn't remove your photo.");
    }
  }

  async function onBackground(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const v = vaultRef.current;
    if (!file || !v) return;
    setBusySetting("background");
    try {
      const img = await compressImage(file, 1600, 0.8);
      const mediaId = await uploadEncrypted(v, img.bytes, "background");
      await saveSettings({ backgroundMediaId: mediaId }, "New background set for both of you");
    } catch (err) {
      setToast((err as Error).message || "Couldn't set the background.");
    } finally {
      setBusySetting(null);
    }
  }

  useEffect(() => {
    if (!menuOpen) return;
    api<Usage>("/api/media/usage").then(setUsage).catch(() => {});
  }, [menuOpen]);

  async function turnOnNotifications() {
    const result = await enableNotifications();
    if (result === "on") { setNotif("on"); setToast("Notifications on"); }
    else if (result === "denied") { setNotif("off"); setToast("Notifications are blocked. Allow them in your phone's settings for this app."); }
    else setToast(isIOS() && !isStandalone() ? `Add ${APP_NAME} to your Home Screen first.` : "This browser can't do notifications.");
  }

  async function makeInvite() {
    try {
      setInvite(await api<{ inviteUrl: string; expiresAt: string }>("/api/space/invite", { method: "POST" }));
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Couldn't make a link. Try again.");
    }
  }

  async function lockNow() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    lockOut();
  }

  // ---------- render ----------
  if (!ready || !info || !me) return <main className="gate" aria-busy="true" />;
  const vault = vaultRef.current as Vault;

  const online = isOnline(partner?.lastSeenAt ?? null);
  const partnerName = partner?.name ?? info.space.label;
  const showInstall = isIOS() && !isStandalone();
  const showNotifAsk = !showInstall && pushSupported() && notif !== "on";
  const disappear = DISAPPEAR_OPTIONS.find((o) => o.value === info.space.disappearSeconds) ?? DISAPPEAR_OPTIONS[0];
  const myAvatar = info.members.find((m) => m.id === me.id)?.avatarMediaId ?? null;
  const usedPct = usage ? Math.min(100, Math.round((usage.totalBytes / usage.limitBytes) * 100)) : 0;

  const today = localDay();
  const myMood = moods.find((m) => m.memberId === me.id && m.day === today)?.key ?? null;
  const partnerMoodRow = partner
    ? moods.filter((m) => m.memberId === partner.id && Date.now() - new Date(m.updatedAt).getTime() < 24 * 3600_000)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
    : null;
  const partnerMood = partnerMoodRow ? moodOf(partnerMoodRow.key) : null;
  const awayDays = partner?.lastSeenAt ? Math.floor((Date.now() - new Date(partner.lastSeenAt).getTime()) / 86_400_000) : 0;
  const angryLately = Array.from(msgs.values()).some((m) => m.reactions[me.id] === "angry" && Date.now() - new Date(m.createdAt).getTime() < 86_400_000);
  const guesses = guessMoods({
    hour: new Date().getHours(),
    recent: moods.filter((m) => m.memberId === me.id && m.day !== today).sort((a, b) => b.day.localeCompare(a.day)).map((m) => m.key),
    apartDays: awayDays,
    angryLately,
    partnerMood: partnerMoodRow?.key ?? null,
  });
  const showMoodCard = !!partner && (moodOpen || (!myMood && !moodLater));
  const st = info.streak;
  const iSentToday = st.sentToday.includes(me.id);
  const streakAtRisk = !!partner && st.current >= 2 && !st.todayDone && new Date().getHours() >= 18;

  const upcoming = specials
    .map((d) => ({ ...d, left: daysBetween(today, nextOccurrence(d.month, d.day, today)) }))
    // No spoilers: your own birthday only shows on the day.
    .filter((d) => d.left >= 1 && d.left <= 7 && !(d.kind === "birthday" && d.aboutMember === me.id))
    .sort((a, b) => a.left - b.left)[0] ?? null;
  const upcomingText = upcoming
    ? upcoming.kind === "birthday" ? `${info.members.find((m) => m.id === upcoming.aboutMember)?.name ?? ""}'s birthday is ${countdownLabel(upcoming.left)}. Plan something lovely.`
      : upcoming.kind === "anniversary" ? `Your anniversary is ${countdownLabel(upcoming.left)}.`
      : `${upcoming.title || "A special day"} is ${countdownLabel(upcoming.left)}.`
    : null;
  const theirCycle = partner ? cycleMap[partner.id] : undefined;
  const careP = theirCycle?.share ? predictCycle(theirCycle, today) : null;
  const careText = careP && partner
    ? careP.inPeriod ? `Day ${careP.periodDay} of ${partner.name}'s period. A little extra care goes a long way.`
      : careP.daysUntilNext >= 0 && careP.daysUntilNext <= 2 ? `${partner.name}'s period may start ${countdownLabel(careP.daysUntilNext)}. Be extra gentle.`
      : null
    : null;

  let lastDay = "";
  return (
    <main className="chat" data-theme={info.space.theme}>
      {backgroundUrl && <div className="chat__bg" style={{ backgroundImage: `url(${backgroundUrl})` }} aria-hidden="true" />}

      <header className="chat__head">
        <BondMark
          size={40}
          a={initial(host?.name)}
          b={initial(guest?.name ?? info.space.label)}
          aSrc={host ? avatars[host.id] : null}
          bSrc={guest ? avatars[guest.id] : null}
          alive={online}
          title={`${me.name} and ${partnerName}`}
        />
        <div className="chat__who">
          <div className="chat__nameRow">
            <h1 className="chat__name">{partnerName}</h1>
            {partner && (
              <button type="button" className={st.todayDone ? "streak-pill streak-pill--done" : "streak-pill"} onClick={() => setStreakOpen(true)}
                aria-label={`${st.current} day streak. Open streak details`}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5c-.4 0-.7-.1-1-.4C6.3 16 3 13.1 3 9.4 3 6.6 5.2 4.5 7.9 4.5c1.6 0 3.1.8 4.1 2.1 1-1.3 2.5-2.1 4.1-2.1 2.7 0 4.9 2.1 4.9 4.9 0 3.7-3.3 6.6-8 10.7-.3.3-.6.4-1 .4z" /></svg>
                {st.current}
              </button>
            )}
          </div>
          <p className={online ? "chat__status chat__status--live" : "chat__status"}>
            {partner ? sinceLabel(partner.lastSeenAt) : "hasn't joined yet"}
            {partner?.notifications === "off" && <span className="pill">notifications off</span>}
          </p>
        </div>
        <button className="icon-btn" onClick={() => setPlannerOpen(true)} aria-label="Special days, cycle, goals and things to talk about">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2zm12 7H5v10h14zm-7 2.2c.7-.8 2.6-.9 2.9.8.3 1.6-1.6 2.9-2.9 3.9-1.3-1-3.2-2.3-2.9-3.9.3-1.7 2.2-1.6 2.9-.8z" /></svg>
        </button>
        {partner && (
          <button className="icon-btn icon-btn--heart" onClick={nudge} aria-label={`Nudge ${partnerName}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5c-.4 0-.7-.1-1-.4C6.3 16 3 13.1 3 9.4 3 6.6 5.2 4.5 7.9 4.5c1.6 0 3.1.8 4.1 2.1 1-1.3 2.5-2.1 4.1-2.1 2.7 0 4.9 2.1 4.9 4.9 0 3.7-3.3 6.6-8 10.7-.3.3-.6.4-1 .4z" /></svg>
          </button>
        )}
        <button className="icon-btn" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-label="Settings">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
        </button>
      </header>

      {menuOpen && (
        <section className="sheet" aria-label="Settings">
          <div className="sheet__group">
            <p className="sheet__title">Your photo</p>
            <div className="row">
              <button className="btn btn--ghost" onClick={() => avatarInput.current?.click()} disabled={busySetting === "avatar"}>
                {busySetting === "avatar" ? "Uploading…" : myAvatar ? "Change photo" : "Add a photo"}
              </button>
              {myAvatar && <button className="btn btn--ghost" onClick={removeAvatar}>Remove</button>}
            </div>
            <p className="hint">It fills your circle at the top of the chat. Only the two of you can see it.</p>
          </div>

          <div className="sheet__group">
            <p className="sheet__title">Theme</p>
            <div className="chips">
              {THEME_OPTIONS.map((t) => (
                <button key={t.value} className={t.value === info.space.theme ? "chip chip--on" : "chip"} onClick={() => saveSettings({ theme: t.value }, `${t.label} theme on`)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sheet__group">
            <p className="sheet__title">Chat background</p>
            <div className="row">
              <button className="btn btn--ghost" onClick={() => backgroundInput.current?.click()} disabled={busySetting === "background"}>
                {busySetting === "background" ? "Uploading…" : info.space.backgroundMediaId ? "Change background" : "Choose a photo"}
              </button>
              {info.space.backgroundMediaId && (
                <button className="btn btn--ghost" onClick={() => saveSettings({ backgroundMediaId: null }, "Background removed")}>Remove</button>
              )}
            </div>
            <p className="hint">Either of you can set it, and you both see it.</p>
          </div>

          <div className="sheet__group">
            <p className="sheet__title">Disappearing messages</p>
            <div className="chips">
              {DISAPPEAR_OPTIONS.map((o) => (
                <button key={o.label} className={o.value === disappear.value ? "chip chip--on" : "chip"}
                  onClick={() => saveSettings({ disappearSeconds: o.value }, o.value === null ? "Messages stay" : "New messages will disappear")}>
                  {o.label}
                </button>
              ))}
            </div>
            <p className="hint">Either of you can change this. It applies to new messages.</p>
          </div>

          <div className="sheet__group">
            <p className="sheet__title">Storage</p>
            {usage ? (
              <>
                <div className="meter" role="img" aria-label={`${usedPct}% of storage used`}><span style={{ width: `${usedPct}%` }} /></div>
                <p className="hint">
                  {formatBytes(usage.totalBytes)} of {formatBytes(usage.limitBytes)} used. Your space: {formatBytes(usage.spaceBytes)}, of which {formatBytes(usage.keptBytes)} is kept.
                  {" "}Uploads this month: {usage.uploadsThisMonth} of {usage.uploadLimit.toLocaleString()}.
                </p>
                <p className="hint">Photos, videos, voice notes and files disappear after 30 days unless one of you keeps them.</p>
              </>
            ) : <p className="hint">Checking…</p>}
          </div>

          <div className="sheet__group">
            <p className="sheet__title">Notifications on this phone</p>
            {notif === "on"
              ? <p className="hint">On. {partnerName} will see if you turn them off.</p>
              : <button className="btn btn--ghost" onClick={turnOnNotifications}>Turn on notifications</button>}
          </div>

          {me.role === "host" && (
            <div className="sheet__group">
              <p className="sheet__title">Invite link</p>
              {invite
                ? <InviteBox url={invite.inviteUrl} expiresAt={invite.expiresAt} />
                : <button className="btn btn--ghost" onClick={makeInvite}>{partner ? "Make a link for her new phone" : "Make an invite link"}</button>}
            </div>
          )}

          <div className="sheet__group">
            <button className="btn btn--ghost" onClick={lockNow}>Lock now</button>
          </div>
        </section>
      )}

      {showInstall && (
        <div className="banner">
          Add {APP_NAME} to your Home Screen: tap Share, then <strong>Add to Home Screen</strong>. Notifications only work from there.
        </div>
      )}
      {showNotifAsk && (
        <div className="banner">
          {notif === "off" ? `Notifications are off here, and ${partnerName} can see that.` : "Turn on notifications so nudges and messages reach you."}
          <button className="btn btn--small" onClick={turnOnNotifications}>Turn on</button>
        </div>
      )}
      {(partnerMood || (myMood && !showMoodCard)) && (
        <div className="moodstrip">
          {partnerMood && partner && (
            <p className="moodstrip__them" style={{ ["--mood" as string]: partnerMood.color }}>
              <span className="mood__dot" aria-hidden="true" />
              <span><strong>{partner.name} feels {partnerMood.label.toLowerCase()}.</strong> {partnerMood.hint(partner.name)}</span>
            </p>
          )}
          {!showMoodCard && (
            <button type="button" className="moodstrip__me" onClick={() => setMoodOpen(true)}>
              {myMood ? <>You: {moodOf(myMood)?.label} <span className="link-btn">Change</span></> : <span className="link-btn">Share how you feel today</span>}
            </button>
          )}
        </div>
      )}
      {showMoodCard && (
        <MoodCard
          myName={me.name}
          partnerName={partnerName}
          guesses={guesses}
          current={myMood}
          onPick={pickMood}
          onLater={() => { setMoodLater(true); setMoodOpen(false); }}
        />
      )}
      {upcomingText && (
        <button type="button" className="banner banner--gold" onClick={() => setPlannerOpen(true)}>{upcomingText}</button>
      )}
      {careText && <div className="banner banner--care">{careText}</div>}
      {streakAtRisk && (
        <div className="banner banner--warm">
          {iSentToday
            ? `Waiting on ${partnerName}. Your ${st.current}-day streak ends at midnight.`
            : `Your ${st.current}-day streak ends at midnight. Send ${partnerName} something.`}
        </div>
      )}
      {partner && awayDays >= 1 && (
        <div className="away-card">
          <p><strong>{partner.name} has been away {awayDays} {awayDays === 1 ? "day" : "days"}.</strong></p>
          <p className="hint">
            {partner.notifications === "off"
              ? `${partner.name}'s notifications are off, so nothing will alert them. Everything you send will be here when they're back.`
              : `Every message will reach ${partner.name}, along with a little reminder that you miss each other.`}
          </p>
        </div>
      )}
      {welcome && (
        <div className="banner banner--warm">
          You&apos;re in. Everything here is locked with your shared password.
          <button className="btn btn--small btn--ghost" onClick={() => setWelcome(false)}>Got it</button>
        </div>
      )}

      <div
        className="chat__list"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {visible.length === 0 && uploads.length === 0 && (
          <div className="empty">
            {partner
              ? <p>Nothing here yet. Say the first thing.</p>
              : (
                <>
                  <p>{info.space.label} hasn&apos;t joined yet. Send her the invite link.</p>
                  {me.role === "host" && !invite && <button className="btn" onClick={makeInvite}>Make an invite link</button>}
                  {invite && <InviteBox url={invite.inviteUrl} expiresAt={invite.expiresAt} />}
                </>
              )}
          </div>
        )}

        {visible.map((m) => {
          const mine = m.senderId === me.id;
          const day = dayLabel(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          const payload = payloads.current.get(m.id);
          const reactions = Object.values(m.reactions);
          const noun = NOUN[m.kind] ?? "Message";
          return (
            <div key={m.id} className="msg-wrap">
              {showDay && <p className="day">{day}</p>}
              <div className={mine ? "msg msg--mine" : "msg"}>
                {m.viewOnce ? (
                  mine ? (
                    <div className="bubble bubble--once">{m.deleted || m.viewedAt ? "Opened" : `${noun}, view once, sent`}</div>
                  ) : m.deleted || m.viewedAt ? (
                    <div className="bubble bubble--once">Viewed</div>
                  ) : (
                    <button className="bubble bubble--once bubble--sealed" onClick={() => openOnce(m)}>
                      {noun} to see once. Tap to open.
                    </button>
                  )
                ) : payload && payload.t !== "text" ? (
                  <div className="bubble bubble--media" onDoubleClick={() => react(m, "love")}>
                    <MediaBubble
                      payload={payload}
                      media={m.media}
                      vault={vault}
                      partnerName={partnerName}
                      meId={me.id}
                      onKeep={(k) => keep(m, k)}
                      onReact={() => setActiveId((c) => (c === m.id ? null : m.id))}
                      onToast={setToast}
                    />
                  </div>
                ) : (
                  <button className="bubble" onClick={() => tapBubble(m)} aria-label="Message. Tap to react, double tap to love.">
                    {payload === undefined ? <span className="muted">Unlocking…</span>
                      : payload === null ? <span className="muted">Couldn&apos;t unlock this message</span>
                      : payload.body}
                  </button>
                )}
                <span className="meta">
                  {m.expiresAt && <span aria-label="Disappears">⏳ </span>}
                  {timeOf(m.createdAt)}
                </span>
                {reactions.length > 0 && (
                  <span className="reacts" aria-label="Reactions">
                    {reactions.map((r, i) => <span key={i}>{r === "love" ? LOVE : ANGRY}</span>)}
                  </span>
                )}
                {activeId === m.id && !m.viewOnce && (
                  <div className="react-bar" role="group" aria-label="React">
                    <button onClick={() => react(m, "love")} aria-pressed={m.reactions[me.id] === "love"} aria-label="Love">{LOVE}</button>
                    <button onClick={() => react(m, "angry")} aria-pressed={m.reactions[me.id] === "angry"} aria-label="Angry">{ANGRY}</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {uploads.map((u) => (
          <div key={u.id} className="msg msg--mine">
            <div className="bubble bubble--once uploading">
              Sending {u.label.toLowerCase()}… {u.pct}%
              <span className="meter"><span style={{ width: `${u.pct}%` }} /></span>
            </div>
          </div>
        ))}
      </div>

      {attachOpen && (
        <div className="attach" role="menu">
          <button role="menuitem" onClick={() => photoInput.current?.click()}>Photo</button>
          <button role="menuitem" onClick={() => videoInput.current?.click()}>Video</button>
          {!viewOnce && <button role="menuitem" onClick={() => fileInput.current?.click()}>File or document</button>}
        </div>
      )}

      {recording ? (
        <VoiceRecorder onSend={onVoice} onCancel={() => setRecording(false)} onError={(msg) => { setRecording(false); setToast(msg); }} />
      ) : (
        <form className="composer" onSubmit={send}>
          <button type="button" className="icon-btn" onClick={() => setAttachOpen((o) => !o)} aria-expanded={attachOpen} aria-label="Attach" disabled={!partner}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 6.5v10a4.5 4.5 0 0 1-9 0V5a3 3 0 0 1 6 0v10.5a1.5 1.5 0 0 1-3 0V6.5H9v9a3 3 0 0 0 6 0V5a4.5 4.5 0 0 0-9 0v11.5a6 6 0 0 0 12 0v-10z" /></svg>
          </button>
          <button type="button" className="icon-btn emoji-btn" onClick={() => setDraft((d) => d + LOVE)} aria-label="Add love">{LOVE}</button>
          <button type="button" className="icon-btn emoji-btn" onClick={() => setDraft((d) => d + ANGRY)} aria-label="Add angry">{ANGRY}</button>
          <label className="sr-only" htmlFor="draft">Message</label>
          <textarea
            id="draft"
            ref={inputRef}
            className="composer__input"
            rows={1}
            value={draft}
            placeholder={viewOnce ? "Seen once, then gone" : disappear.value ? `Disappears after ${disappear.label}` : `Message ${partnerName}`}
            onChange={(e) => setDraft(onlyLoveAndAngry(e.target.value))}
            onKeyDown={onKeyDown}
            disabled={!partner}
            maxLength={8000}
          />
          <button
            type="button"
            className={viewOnce ? "icon-btn icon-btn--on" : "icon-btn"}
            onClick={() => setViewOnce((v) => !v)}
            aria-pressed={viewOnce}
            aria-label="View once"
            title="View once"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C6.5 5 2.7 9.4 1.6 11.4a1.3 1.3 0 0 0 0 1.2C2.7 14.6 6.5 19 12 19s9.3-4.4 10.4-6.4a1.3 1.3 0 0 0 0-1.2C21.3 9.4 17.5 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" /></svg>
          </button>
          {draft.trim() ? (
            <button className="send" disabled={sending || !partner} aria-label="Send">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12 3.3 13.9z" /></svg>
            </button>
          ) : (
            <button type="button" className="send" onClick={() => setRecording(true)} disabled={!partner} aria-label="Record a voice note">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 0 0-7 0v6A3.5 3.5 0 0 0 12 15zm6-3.5a6 6 0 0 1-12 0H4.5a7.5 7.5 0 0 0 6.75 7.46V21h1.5v-2.04a7.5 7.5 0 0 0 6.75-7.46z" /></svg>
            </button>
          )}
        </form>
      )}

      <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={onPhotos} />
      <input ref={videoInput} type="file" accept="video/*" hidden onChange={onVideo} />
      <input ref={fileInput} type="file" hidden onChange={onFile} />
      <input ref={avatarInput} type="file" accept="image/*" hidden onChange={onAvatar} />
      <input ref={backgroundInput} type="file" accept="image/*" hidden onChange={onBackground} />

      {once?.kind === "text" && (
        <div className="once" role="dialog" aria-modal="true" aria-label="View once message">
          <p className="once__text">{once.text}</p>
          <button className="btn" onClick={closeOnce}>Close. It&apos;s gone after this.</button>
        </div>
      )}
      {once && once.kind !== "text" && (
        <MediaViewer kind={once.kind} url={once.url} caption={once.caption} onClose={closeOnce} closeLabel="Close. It's gone after this." />
      )}

      {hearts > 0 && (
        <div className="hearts" key={hearts} aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} style={{ left: `${(i * 7 + 4) % 96}%`, animationDelay: `${(i % 7) * 0.12}s` }}>{LOVE}</span>
          ))}
        </div>
      )}

      {streakOpen && (
        <StreakSheet current={st.current} best={st.best} todayDone={st.todayDone} iSent={iSentToday} partnerName={partnerName} onClose={() => setStreakOpen(false)} />
      )}
      {celebrate !== null && <Celebration {...celebrate} onClose={() => setCelebrate(null)} />}
      {plannerOpen && (
        <Planner
          vault={vault}
          me={{ id: me.id, name: me.name }}
          partner={partner ? { id: partner.id, name: partner.name } : null}
          today={today}
          onClose={() => setPlannerOpen(false)}
          onChanged={() => void syncNow()}
          onToast={setToast}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
