"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import AboutYou from "@/components/AboutYou";
import CallScreen from "@/components/call/CallScreen";
import { loadCache, saveCache } from "@/lib/chat-cache";
import { NotifPrompt, NotifySettings } from "@/components/Notifications";
import SpaceSwitcher from "@/components/SpaceSwitcher";
import BondMark from "@/components/BondMark";

import { pron, type Gender } from "@/lib/pronouns";
import Composer from "@/components/chat/Composer";
import Drawer, { DrawerItem } from "@/components/chat/Drawer";
import Header from "@/components/chat/Header";
import MessageRow, { MessageMenu, type ReplyRef } from "@/components/chat/MessageRow";
import StatusComposer from "@/components/status/StatusComposer";
import StatusViewer from "@/components/status/StatusViewer";
import { statusAad, type StatusItem, type StatusPayload } from "@/lib/status";
import Celebration, { streakLine } from "@/components/Celebration";
import InviteBox from "@/components/InviteBox";
import MediaBubble, { type MediaState } from "@/components/MediaBubble";
import MediaViewer from "@/components/MediaViewer";
import Games from "@/components/Games";
import HostPasswordForm from "@/components/HostPasswordForm";
import LockSetup from "@/components/LockSetup";
import MoodCard from "@/components/MoodCard";
import Planner from "@/components/Planner";
import { useUpdateReady, useWhatsNew, WhatsNew } from "@/components/UpdateNotice";
import StreakSheet from "@/components/StreakSheet";
import VoiceRecorder from "@/components/VoiceRecorder";
import { api, ApiError } from "@/lib/api";
import { getLock, LOCK_LABEL, removeLock, type LockKind } from "@/lib/applock";
import { APP_NAME } from "@/lib/brand";
import { decryptJSON, encryptJSON, keysFromMaster, messageAad } from "@/lib/crypto-client";
import { ANGRY, LOVE, onlyLoveAndAngry } from "@/lib/emoji";
import { dayLabel, initial, isOnline, sinceLabel, timeOf } from "@/lib/format";
import { personalizeInstall } from "@/lib/install";
import {
  compressImage, forgetAllMediaUrls, forgetMediaUrl, formatBytes, mediaUrl, uploadEncrypted, type MediaPayload,
  videoPreview,
} from "@/lib/media-client";
import { MAX_BYTES, type Theme } from "@/lib/media-limits";
import { ageOn, countdownLabel, daysBetween, EMPTY_CYCLE, nextOccurrence, plannerAad, predictCycle, type CycleData, type DayKind } from "@/lib/planner";
import { guessMoods, isMilestone, localDay, moodAad, moodOf, type MoodKey } from "@/lib/rituals";
import { enableNotifications, clearSpaceNotifications, isIOS, isStandalone, pushSupported, reportNotificationState } from "@/lib/push-client";
import { clearVault, getVault, savedSpaces, type Vault } from "@/lib/vault";

type Reaction = string;   // "love", "angry", or any single emoji
type Member = {
  id: string; role: "host" | "partner"; name: string; banned: boolean;
  notifications: "on" | "off" | "unknown"; lastSeenAt: string | null; lastNudgeAt: string | null;
  avatarMediaId: string | null;
  typing?: boolean;
  gender?: Gender;
  notifyOff?: string[];
  notifyQuiet?: boolean;
};
type Msg = {
  id: string; senderId: string; kind: string; viewOnce: boolean; viewedAt: string | null; deleted: boolean;
  reactions: Record<string, Reaction>; expiresAt: string | null; createdAt: string; editedAt?: string | null; iv: string | null; ct: string | null;
  deletedReason?: string | null; hidden?: boolean; clientId?: string | null;
  media: MediaState;
};
type Space = { label: string; disappearSeconds: number | null; theme: Theme; backgroundMediaId: string | null };
type MoodRow = { memberId: string; day: string; iv: string; ct: string; updatedAt: string };
type Mood = { memberId: string; day: string; key: MoodKey; updatedAt: string };
type Streak = { today: string; current: number; best: number; todayDone: boolean; sentToday: string[] };
type SpecialRow = { id: string; kind: DayKind; aboutMember: string | null; month: number; day: number; startYear: number | null; iv: string; ct: string };
type Special = Omit<SpecialRow, "iv" | "ct"> & { title: string };
type CycleRow = { memberId: string; iv: string; ct: string };
type WaitingGame = { id: string; kind: "wyr" | "tot" | "know"; createdBy: string };
type StatusRow = { id: string; memberId: string; mediaId: string | null; iv: string; ct: string; createdAt: string; expiresAt: string; seenAt: string | null };
type CallRow = { id: string; callerId: string; calleeId: string; kind: "voice" | "video"; status: string; createdAt: string; answeredAt: string | null; endedAt: string | null };
type SyncResponse = {
  now: string;
  calls?: CallRow[];
  gamesWaiting: WaitingGame[];
  statuses: StatusRow[];
  live: { id: string; kind: "ludo" | "whot"; status: "lobby" | "playing"; createdBy: string; partnerHere: boolean } | null;
  specialDays: SpecialRow[];
  cycles: CycleRow[];
  streak: Streak;
  moods: MoodRow[];
  me: { id: string; role: "host" | "partner"; name: string; spaceId: string };
  members: Member[];
  space: Space;
  messages: Msg[];
};
type Info = Omit<SyncResponse, "messages" | "now" | "moods" | "specialDays" | "cycles" | "statuses" | "calls">;
type TextPayload = { t: "text"; body: string };
type Payload = (TextPayload | MediaPayload) & { reply?: ReplyRef };
type Usage = { spaceBytes: number; keptBytes: number; totalBytes: number; limitBytes: number; uploadsThisMonth: number; uploadLimit: number };
type Upload = { id: string; label: string; pct: number };
type OnceView = { kind: "text"; text: string } | { kind: "photo" | "video" | "voice"; url: string; mediaId: string; caption?: string };

// The game tables (and the 3D library) load only when you open a game.
const LiveGame = dynamic(() => import("@/components/live/LiveGame"), { ssr: false });

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
  const payloadIv = useRef(new Map<string, string>());   // which encrypted version each message was decrypted from
  const EDIT_MS = 15 * 60 * 1000;
  const [, bump] = useReducer((x: number) => x + 1, 0);

  const cursor = useRef<string | null>(null);
  const cacheReady = useRef<Promise<void> | null>(null);   // the on-phone copy loads before the first fetch
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
  const [gamesOpen, setGamesOpen] = useState(false);
  const [lockKind, setLockKind] = useState<LockKind | null>(null);
  const [lockSetupOpen, setLockSetupOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reply, setReply] = useState<ReplyRef | null>(null);
  const [editing, setEditing] = useState<string | null>(null);   // id of the message being edited
  const [menuFor, setMenuFor] = useState<{ m: Msg; rect: DOMRect } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<StatusItem[]>([]);
  const statusCache = useRef(new Map<string, StatusPayload | null>());
  const [statusView, setStatusView] = useState<"mine" | "theirs" | null>(null);
  const [statusCompose, setStatusCompose] = useState(false);
  const [atBottomUI, setAtBottomUI] = useState(true);
  const [newBelow, setNewBelow] = useState(0);
  const prevLastId = useRef<string | null>(null);
  const lastTypingPing = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [topH, setTopH] = useState(120);
  const [bottomH, setBottomH] = useState(72);
  const [liveOpen, setLiveOpen] = useState<{ kind: "ludo" | "whot"; id?: string } | null>(null);
  // One page at a time: opening one closes the others (on a computer the side panel stays open, so this matters).
  const openOnly = (page: "mood" | "planner" | "games" | "streak" | "about" | "settings") => {
    setMoodOpen(page === "mood"); setPlannerOpen(page === "planner"); setGamesOpen(page === "games");
    setStreakOpen(page === "streak"); setAboutOpen(page === "about"); setMenuOpen(page === "settings"); setDrawerOpen(false);
  };
  const [aboutOpen, setAboutOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [arrived, setArrived] = useState(false);
  const wasOnline = useRef<boolean | null>(null);
  const [loadTrouble, setLoadTrouble] = useState<{ count: number; server: boolean }>({ count: 0, server: false });
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [activeCall, setActiveCall] = useState<{ id: string; role: "caller" | "callee"; kind: "voice" | "video" } | null>(null);
  const handledCalls = useRef(new Set<string>());
  const [notifPrompt, setNotifPrompt] = useState(false);
  const notifAsked = useRef(false);
  const [canSwitch, setCanSwitch] = useState(false);
  const aboutAsked = useRef(false);
  const prevDone = useRef<boolean | null>(null);
  const updateReady = useUpdateReady();
  const [whatsNew, closeWhatsNew] = useWhatsNew();

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
    // Show the chat from this phone's encrypted copy straight away; then fetch only what's new.
    cacheReady.current = (async () => {
      const c = await loadCache<{ cursor: string; info: Info; messages: Msg[]; calls: CallRow[] }>(v);
      if (!c || !c.info || !Array.isArray(c.messages)) return;
      cursor.current = c.cursor;
      setInfo((cur) => cur ?? c.info);
      setCalls((cur) => (cur.length ? cur : c.calls ?? []));
      setMsgs((prev) => { const next = new Map(c.messages.map((m) => [m.id, m] as const)); prev.forEach((m, id) => next.set(id, m)); return next; });
      await decryptList(c.messages);
    })();
    setReady(true);
    setLockKind(getLock(v.spaceId)?.kind ?? null);
    setCanSwitch(savedSpaces().length > 1);
    // Messages that hadn't gone out yet (app closed, no network): show them and send them now.
    const waiting = readOutbox(v.spaceId);
    if (waiting.length) {
      setMsgs((prev) => {
        const next = new Map(prev);
        for (const o of waiting) next.set(o.tmp, { id: o.tmp, senderId: v.memberId, kind: o.kind, viewOnce: o.viewOnce, viewedAt: null, deleted: false, reactions: {}, expiresAt: null, createdAt: o.createdAt, iv: o.iv, ct: o.ct, media: null });
        return next;
      });
      void (async () => { await decryptList(waiting.map((o) => ({ id: o.tmp, senderId: v.memberId, kind: o.kind, viewOnce: o.viewOnce, viewedAt: null, deleted: false, reactions: {}, expiresAt: null, createdAt: o.createdAt, iv: o.iv, ct: o.ct, media: null }))); waiting.forEach((o) => void deliver(o)); })();
    }
    void clearSpaceNotifications(v.spaceId);
    void reportNotificationState().then(setNotif);
  }, [router]);

  // Signs in again in the background using the unlocked key; only if that fails do we ask for the password.
  const reconnecting = useRef<Promise<"ok" | "later" | "locked"> | null>(null);
  const reconnect = useCallback(async (): Promise<"ok" | "later" | "locked"> => {
    const v = vaultRef.current;
    if (!v) return "locked";
    if (!reconnecting.current) {
      reconnecting.current = (async () => {
        try {
          const keys = await keysFromMaster(v.master);
          await api("/api/auth/login", { body: { spaceId: v.spaceId, memberId: v.memberId, authToken: keys.authToken, tz: Intl.DateTimeFormat().resolvedOptions().timeZone } });
          return "ok";
        } catch (err) {
          // Weak or no network: try again at the next regular check. A real refusal: ask for the password.
          return err instanceof ApiError && (err.status === 401 || err.status === 403 || err.status === 404) ? "locked" : "later";
        } finally {
          reconnecting.current = null;
        }
      })();
    }
    return reconnecting.current;
  }, []);

  // ---------- decryption ----------
  const decryptList = useCallback(async (list: Msg[]) => {
    const v = vaultRef.current;
    if (!v) return;
    // Decrypt new messages, and again whenever a message's encrypted words change (an edit).
    const todo = list.filter((m) => !m.deleted && !m.viewOnce && m.iv && m.ct && payloadIv.current.get(m.id) !== m.iv);
    if (todo.length === 0) return;
    await Promise.all(todo.map(async (m) => {
      try {
        const p = await decryptJSON<Payload>(v.encKey, m.iv as string, m.ct as string, messageAad(v.spaceId, m.senderId));
        payloads.current.set(m.id, p && typeof p === "object" && "t" in p ? p : null);
      } catch {
        payloads.current.set(m.id, null);
      }
      payloadIv.current.set(m.id, m.iv as string);
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

  const decryptStatuses = useCallback(async (rows: StatusRow[]) => {
    const v = vaultRef.current;
    if (!v) return;
    const out: StatusItem[] = [];
    for (const r of rows) {
      const k = `${r.id}:${r.iv}`;
      if (!statusCache.current.has(k)) {
        try { statusCache.current.set(k, await decryptJSON<StatusPayload>(v.encKey, r.iv, r.ct, statusAad(v.spaceId, r.id))); }
        catch { statusCache.current.set(k, null); }
      }
      out.push({ id: r.id, memberId: r.memberId, mediaId: r.mediaId, createdAt: r.createdAt, expiresAt: r.expiresAt, seenAt: r.seenAt, payload: statusCache.current.get(k) ?? null });
    }
    setStatuses((prev) => (JSON.stringify(prev) === JSON.stringify(out) ? prev : out));
  }, []);

  // ---------- sync ----------
  const syncNow = useCallback(async () => {
    if (!vaultRef.current) return;
    if (syncing.current) { syncAgain.current = true; return; }
    syncing.current = true;
    try {
      if (cacheReady.current) { await cacheReady.current.catch(() => {}); cacheReady.current = null; }
      const q = cursor.current ? `?since=${encodeURIComponent(cursor.current)}` : "";
      const data = await api<SyncResponse>(`/api/sync${q}`);
      cursor.current = data.now;
      setInfo({ me: data.me, members: data.members, space: data.space, streak: data.streak, gamesWaiting: data.gamesWaiting ?? [], live: data.live ?? null });
      setLoadTrouble((t) => (t.count ? { count: 0, server: false } : t));
      if (data.calls) {
        setCalls((prev) => (JSON.stringify(prev) === JSON.stringify(data.calls) ? prev : data.calls!));
        // Someone is calling you: ring (each call only once on this phone).
        const ringing = data.calls.find((c) => c.status === "ringing" && c.calleeId === data.me.id && !handledCalls.current.has(c.id)
          && Date.now() - new Date(c.createdAt).getTime() < 45_000);
        if (ringing) { handledCalls.current.add(ringing.id); setActiveCall((cur) => cur ?? { id: ringing.id, role: "callee", kind: ringing.kind }); }
      }
      void decryptMoods(data.moods ?? []);
      void decryptPlans(data.specialDays ?? [], data.cycles ?? []);
      void decryptStatuses(data.statuses ?? []);
      if (data.messages.length) {
        setMsgs((prev) => {
          const next = new Map(prev);
          for (const m of data.messages) {
            if (m.hidden) { next.delete(m.id); continue; }
            if (m.clientId && next.has(`tmp-${m.clientId}`)) {
              const tmp = `tmp-${m.clientId}`;
              const p = payloads.current.get(tmp);
              if (p !== undefined) { payloads.current.set(m.id, p); payloadIv.current.set(m.id, m.iv as string); }
              next.delete(tmp);
            }
            next.set(m.id, m);
          }
          return next;
        });
        await decryptList(data.messages);
      }
    } catch (err) {
      // Keep trying quietly; after a few misses, say what's going on instead of showing a blank screen.
      if (!(err instanceof ApiError && err.status === 401)) {
        setLoadTrouble((t) => ({ count: t.count + 1, server: err instanceof ApiError && err.status >= 500 }));
      }
      if (err instanceof ApiError && err.status === 401) {
        // The server connection expired (or "Lock now" was used): renew it quietly with the key already in memory.
        const r = await reconnect();
        if (r === "ok") syncAgain.current = true; else if (r === "locked") lockOut();   // "later": the next check retries
      }
    } finally {
      syncing.current = false;
      if (syncAgain.current) { syncAgain.current = false; void syncNow(); }
    }
  }, [decryptList, decryptMoods, decryptPlans, decryptStatuses, lockOut, reconnect]);

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
        if (vaultRef.current) void clearSpaceNotifications(vaultRef.current.spaceId);   // back in the chat: its notifications go
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

  const callsShown = useMemo(() => calls.filter((c) => c.status !== "ringing" && c.status !== "active"), [calls]);
  const visible = useMemo(() => {
    const now = Date.now();
    return Array.from(msgs.values())
      // Show live messages, plus opened view-once markers. Hide anything past its disappear time.
      .filter((m) => (!m.deleted || (m.viewOnce && !!m.viewedAt) || m.deletedReason === "removed") && !(m.expiresAt && !m.deleted && new Date(m.expiresAt).getTime() < now))
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

  // ---------- sending instantly: on screen now, delivered in the background, never twice ----------
  type Outgoing = { tmp: string; clientId: string; iv: string; ct: string; kind: string; viewOnce: boolean; createdAt: string };
  const [unsent, setUnsent] = useState<Set<string>>(new Set());   // couldn't be delivered (yet)
  const delivering = useRef(new Set<string>());
  const outboxKey = (spaceId: string) => `ourspace:outbox:${spaceId}`;
  function readOutbox(spaceId: string): Outgoing[] { try { return JSON.parse(localStorage.getItem(outboxKey(spaceId)) || "[]"); } catch { return []; } }
  function writeOutbox(spaceId: string, list: Outgoing[]) { try { localStorage.setItem(outboxKey(spaceId), JSON.stringify(list)); } catch { /* full */ } }

  /** The server has it: swap the temporary bubble for the real message. */
  function delivered(tmp: string, real: { id: string; createdAt: string; expiresAt: string | null }) {
    const p = payloads.current.get(tmp), piv = payloadIv.current.get(tmp);
    if (p !== undefined) payloads.current.set(real.id, p);
    if (piv) payloadIv.current.set(real.id, piv);
    payloads.current.delete(tmp); payloadIv.current.delete(tmp);
    setMsgs((prev) => {
      const next = new Map(prev);
      const m = next.get(tmp);
      next.delete(tmp);
      if (m && !next.has(real.id)) next.set(real.id, { ...m, id: real.id, createdAt: real.createdAt, expiresAt: real.expiresAt });
      return next;
    });
    setUnsent((u) => { if (!u.has(tmp)) return u; const n = new Set(u); n.delete(tmp); return n; });
  }

  async function deliver(o: Outgoing) {
    const v = vaultRef.current;
    if (!v || delivering.current.has(o.tmp)) return;
    delivering.current.add(o.tmp);
    setUnsent((u) => { if (!u.has(o.tmp)) return u; const n = new Set(u); n.delete(o.tmp); return n; });
    const waits = [0, 1000, 2000, 4000, 8000, 15000];
    try {
      for (const wait of waits) {
        if (wait) await new Promise((r) => setTimeout(r, wait));
        try {
          const res = await api<{ id: string; createdAt: string; expiresAt: string | null }>("/api/messages", {
            body: { iv: o.iv, ct: o.ct, viewOnce: o.viewOnce, kind: o.kind, clientId: o.clientId },
          });
          writeOutbox(v.spaceId, readOutbox(v.spaceId).filter((x) => x.tmp !== o.tmp));
          delivered(o.tmp, res);
          return;
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) { if ((await reconnect()) === "locked") return lockOut(); continue; }
          if (err instanceof ApiError && err.status < 500 && err.status !== 408 && err.status !== 429) {
            writeOutbox(v.spaceId, readOutbox(v.spaceId).filter((x) => x.tmp !== o.tmp));   // refused for good
            setToast(err.message);
            break;
          }
          // weak or no network: wait and try again
        }
      }
      setUnsent((u) => new Set(u).add(o.tmp));
    } finally {
      delivering.current.delete(o.tmp);
    }
  }

  /** Text and cards: shown at once and delivered in the background. Media: uploaded first (with a progress bar). */
  async function postMessage(base: Payload, mediaId?: string, once: boolean = viewOnce) {
    const v = vaultRef.current;
    if (!v) throw new Error("locked");
    const payload: Payload = reply ? { ...base, reply } : base;
    const sentOnce = once;
    const { iv, ct } = await encryptJSON(v.encKey, payload, messageAad(v.spaceId, v.memberId));
    if (!mediaId) {
      const clientId = crypto.randomUUID();
      const o: Outgoing = { tmp: `tmp-${clientId}`, clientId, iv, ct, kind: payload.t, viewOnce: sentOnce, createdAt: new Date().toISOString() };
      payloads.current.set(o.tmp, payload);
      payloadIv.current.set(o.tmp, iv);
      addLocal(v, o.tmp, payload.t, { createdAt: o.createdAt, expiresAt: null }, iv, ct, sentOnce);
      writeOutbox(v.spaceId, [...readOutbox(v.spaceId), o]);
      setViewOnce(false);
      setReply(null);
      void deliver(o);
      return;
    }
    const res = await api<{ id: string; createdAt: string; expiresAt: string | null; mediaExpiresAt: string | null }>("/api/messages", {
      body: { iv, ct, viewOnce: sentOnce, kind: payload.t, mediaId },
    });
    payloads.current.set(res.id, payload);
    payloadIv.current.set(res.id, iv);
    addLocal(v, res.id, payload.t, res, iv, ct, sentOnce, mediaId);
    setViewOnce(false);
    setReply(null);
    void syncNow();
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = onlyLoveAndAngry(draft).trim();
    if (!vaultRef.current || !body || sending) return;
    setSending(true);
    try {
      if (editing) { await saveEdit(editing, body); return; }
      setDraft("");
      await postMessage({ t: "text", body });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return lockOut();
      setToast(err instanceof ApiError ? err.message : "Not sent. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  /** Encrypts, uploads with a progress bar, then sends the message that points to it. */
  async function sendMedia(label: string, bytes: ArrayBuffer, build: (mediaId: string, caption?: string) => MediaPayload,
                           opts?: { caption?: string; once?: boolean }) {
    const v = vaultRef.current;
    if (!v) return;
    const fromPreview = opts !== undefined;
    const caption = (fromPreview ? opts!.caption ?? "" : onlyLoveAndAngry(draft)).trim() || undefined;
    const job: Upload = { id: crypto.randomUUID(), label, pct: 0 };
    setUploads((u) => [...u, job]);
    atBottom.current = true;
    try {
      const mediaId = await uploadEncrypted(v, bytes, "message", (pct) =>
        setUploads((u) => u.map((x) => (x.id === job.id ? { ...x, pct } : x))));
      await postMessage(build(mediaId, caption), mediaId, fromPreview ? !!opts!.once : viewOnce);
      if (caption && !fromPreview) setDraft("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return lockOut();
      setToast((err as Error).message || `${label} didn't send. Try again.`);
    } finally {
      setUploads((u) => u.filter((x) => x.id !== job.id));
    }
  }

  // ---------- the send preview: caption and view once before a photo or video goes ----------
  const [pending, setPending] = useState<{ kind: "photo" | "video"; files: File[]; urls: string[] } | null>(null);
  const [pendingCaption, setPendingCaption] = useState("");
  const [pendingOnce, setPendingOnce] = useState(false);
  function openPreview(kind: "photo" | "video", files: File[]) {
    if (files.length === 0) return;
    setPending({ kind, files, urls: files.map((f) => URL.createObjectURL(f)) });
    setPendingCaption(onlyLoveAndAngry(draft));
    setPendingOnce(viewOnce);
  }
  function closePreview() {
    pending?.urls.forEach((u) => URL.revokeObjectURL(u));
    setPending(null);
  }
  async function sendPreview() {
    if (!pending) return;
    const { kind, files } = pending;
    const opts = { caption: pendingCaption, once: pendingOnce };
    closePreview();
    if (pendingCaption.trim() && pendingCaption === onlyLoveAndAngry(draft)) setDraft("");
    setViewOnce(false);
    if (kind === "photo") await sendPhotos(files, opts); else await sendVideo(files[0], opts);
  }

  async function onPhotos(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 10);
    e.target.value = "";
    setAttachOpen(false);
    openPreview("photo", files);
  }

  async function sendPhotos(files: File[], opts: { caption?: string; once?: boolean }) {
    for (const [i, file] of files.entries()) {
      const o = { ...opts, caption: i === 0 ? opts.caption : undefined };   // the caption goes with the first photo
      try {
        if (file.type === "image/gif" && file.size <= 8 * 1024 * 1024) {
          const bmp = await createImageBitmap(file);
          const dims = { w: bmp.width, h: bmp.height };
          bmp.close();
          await sendMedia("Photo", await file.arrayBuffer(), (mediaId, caption) =>
            ({ t: "photo", mediaId, mime: "image/gif", ...dims, size: file.size, caption }), o);
          continue;
        }
        const img = await compressImage(file, 1600);
        await sendMedia("Photo", img.bytes, (mediaId, caption) =>
          ({ t: "photo", mediaId, mime: "image/jpeg", w: img.w, h: img.h, thumb: img.thumb, size: img.bytes.byteLength, caption }), o);
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
    openPreview("video", [file]);
  }
  async function sendVideo(file: File, opts: { caption?: string; once?: boolean }) {
    const prev = await videoPreview(file);   // shows on her phone before the video downloads
    await sendMedia("Video", await file.arrayBuffer(), (mediaId, caption) =>
      ({ t: "video", mediaId, mime: file.type || "video/mp4", name: file.name || "video.mp4", size: file.size, caption, ...(prev ?? {}) }), opts);
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

  async function onVoice(bytes: ArrayBuffer, mime: string, seconds: number, wave: number[]) {
    setRecording(false);
    await sendMedia("Voice note", bytes, (mediaId) =>
      ({ t: "voice", mediaId, mime, duration: Math.round(seconds), size: bytes.byteLength, ...(wave.length ? { wave } : {}) }));
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
      e.preventDefault();
      void send();
    }
  }

  async function sendCard(text: string): Promise<boolean> {
    try {
      await postMessage({ t: "text", body: text }, undefined, false);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) { lockOut(); return false; }
      setToast(err instanceof ApiError ? err.message : "Not sent. Check your connection.");
      return false;
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
    setMenuFor(null);
    try {
      await api(`/api/messages/${m.id}/react`, { body: { reaction: next } });
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Couldn't react. Try again.");
      void syncNow();
    }
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
      setToast(`${partner?.name ?? info?.space.label ?? "Your partner"} will see you feel ${moodOf(key)?.label.toLowerCase()} today`);
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
    // Each step says what went wrong, so a failure on one phone can be traced.
    let step: "read" | "upload" | "save" = "read";
    try {
      const img = await compressImage(file, 512, 0.85);
      step = "upload";
      const mediaId = await uploadEncrypted(v, img.bytes, "avatar");
      step = "save";
      await api("/api/profile", { body: { avatarMediaId: mediaId } });
      await syncNow();
      setToast("Your photo is in the circles now");
    } catch (err) {
      const why = (err as Error)?.message;
      setToast(
        step === "read" ? `This phone couldn't open that photo${/heic|heif/i.test(file.type + file.name) ? " (HEIC format)" : ""}. Try a screenshot of it, or another photo.`
        : step === "upload" ? `The photo didn't upload${why ? `: ${why}` : ""}. Check your connection and try again.`
        : `The photo uploaded but didn't save${why ? `: ${why}` : ""}. Try again.`);
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
    api<Usage>("/api/media/usage")
      .then((u) => { if (typeof u?.limitBytes === "number" && typeof u?.uploadLimit === "number") setUsage(u); })
      .catch(() => {});
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

  // Locks this phone. Opening again needs your lock or the shared password; nothing can be read without it.
  function lockNow() {
    lockOut();
  }

  // ---------- layout helpers ----------
  // The glass header and composer float over the messages; the list is padded by their real height.
  const hasInfo = !!info;
  useEffect(() => {
    if (!hasInfo) return;
    const measure = () => {
      if (topRef.current) setTopH(topRef.current.offsetHeight);
      if (bottomRef.current) setBottomH(bottomRef.current.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (topRef.current) ro.observe(topRef.current);
    if (bottomRef.current) ro.observe(bottomRef.current);
    return () => ro.disconnect();
  }, [hasInfo, recording]);

  // "About you": asked once on this phone when it's missing (Later remembers for a week).
  const myGender = info?.members.find((m) => m.id === info.me.id)?.gender ?? null;
  const hasPartner = !!info?.members.some((m) => m.id !== info.me.id);
  useEffect(() => {
    if (!info || aboutAsked.current || myGender || !hasPartner) return;
    aboutAsked.current = true;
    try {
      const later = Number(localStorage.getItem(`ourspace:about-later:${info.me.spaceId}`) || 0);
      if (Date.now() - later > 7 * 86_400_000) setAboutOpen(true);
    } catch { setAboutOpen(true); }
  }, [info, myGender, hasPartner]);

  // Ask to turn on notifications each time the app opens while they're off: straight away, before you start anything.
  // If you've already started typing or tapping, it never jumps in front of you; it waits for the next open.
  const interacted = useRef(false);
  useEffect(() => {
    const mark = () => { interacted.current = true; };
    window.addEventListener("pointerdown", mark, { once: true, capture: true });
    window.addEventListener("keydown", mark, { once: true, capture: true });
    return () => { window.removeEventListener("pointerdown", mark, true); window.removeEventListener("keydown", mark, true); };
  }, []);
  useEffect(() => {
    if (notifAsked.current || notif === "on" || !hasPartner || aboutOpen) return;
    notifAsked.current = true;
    if (!interacted.current && !draft) setNotifPrompt(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notif, hasPartner, aboutOpen]);

  // Keep the on-phone copy fresh: a moment after the chat changes, save it (encrypted).
  useEffect(() => {
    const v = vaultRef.current;
    if (!v || !info || !cursor.current) return;
    const t = setTimeout(() => {
      const keep = Array.from(msgs.values()).filter((m) => !m.id.startsWith("tmp-")).sort((a, b) => Number(a.id) - Number(b.id)).slice(-300);
      void saveCache(v, { cursor: cursor.current, info, messages: keep, calls });
    }, 1500);
    return () => clearTimeout(t);
  }, [info, msgs, calls]);

  // ---------- back gestures (iPhone swipe, Android back): stay in the app ----------
  // Close whatever is on top; with nothing open, the side panel opens. Never back to the passcode screen.
  const backRef = useRef<() => void>(() => {});
  backRef.current = () => {
    const ev = new CustomEvent("ourspace-back", { cancelable: true });
    window.dispatchEvent(ev);                       // a photo or video viewer closes itself
    if (ev.defaultPrevented) return;
    if (activeCall) return;                         // a back swipe never hangs up a call
    if (menuFor) return setMenuFor(null);
    if (deleting) return setDeleting(null);
    if (pending) return closePreview();
    if (photoOpen) return setPhotoOpen(false);
    if (statusView) return setStatusView(null);
    if (statusCompose) return setStatusCompose(false);
    if (switchOpen) return setSwitchOpen(false);
    if (notifPrompt) return setNotifPrompt(false);
    if (lockSetupOpen) return setLockSetupOpen(false);
    if (aboutOpen) return setAboutOpen(false);
    if (liveOpen) return setLiveOpen(null);
    if (moodOpen) return setMoodOpen(false);
    if (streakOpen) return setStreakOpen(false);
    if (plannerOpen) return setPlannerOpen(false);
    if (gamesOpen) return setGamesOpen(false);
    if (menuOpen) return setMenuOpen(false);
    if (attachOpen) return setAttachOpen(false);
    setDrawerOpen((o) => !o);
  };
  useEffect(() => {
    history.pushState({ ourspace: true }, "");
    const onPop = () => { backRef.current(); history.pushState({ ourspace: true }, ""); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // A swipe in from the left edge opens the side panel.
  const edge = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const start = (e: TouchEvent) => { const t = e.touches[0]; edge.current = t.clientX < 28 ? { x: t.clientX, y: t.clientY } : null; };
    const move = (e: TouchEvent) => {
      const s0 = edge.current, t = e.touches[0];
      if (!s0) return;
      if (t.clientX - s0.x > 60 && Math.abs(t.clientY - s0.y) < 50) { edge.current = null; setDrawerOpen(true); }
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    return () => { window.removeEventListener("touchstart", start); window.removeEventListener("touchmove", move); };
  }, []);

  // She just came online: a small moment (not on first load).
  const onlineNow = isOnline(info?.members.find((m) => m.id !== info.me.id)?.lastSeenAt ?? null);
  useEffect(() => {
    if (wasOnline.current === false && onlineNow) {
      setArrived(true);
      const t = setTimeout(() => setArrived(false), 3200);
      wasOnline.current = onlineNow;
      return () => clearTimeout(t);
    }
    if (info) wasOnline.current = onlineNow;
  }, [onlineNow, info]);

  // The network came back: anything waiting goes out right away.
  useEffect(() => {
    const onOnline = () => {
      const v = vaultRef.current;
      if (!v) return;
      readOutbox(v.spaceId).forEach((o) => void deliver(o));
      void syncNow();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Count new messages from them that arrive while you're scrolled up.
  useEffect(() => {
    const last = visible[visible.length - 1];
    if (!last) return;
    if (prevLastId.current && last.id !== prevLastId.current && !atBottom.current && last.senderId !== vaultRef.current?.memberId) {
      setNewBelow((n) => n + 1);
    }
    prevLastId.current = last.id;
  }, [visible]);

  function scrollToBottom() {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setNewBelow(0);
  }

  function onDraftChange(value: string) {
    setDraft(onlyLoveAndAngry(value));
    const now = Date.now();
    if (value && now - lastTypingPing.current > 4000) {
      lastTypingPing.current = now;
      api("/api/typing", { method: "POST" }).catch(() => {});
    }
  }

  function previewOf(m: Msg): string {
    if (m.viewOnce) return "View once";
    const p = payloads.current.get(m.id);
    if (!p) return "Message";
    if (p.t === "text") return p.body.length > 90 ? `${p.body.slice(0, 90)}…` : p.body;
    const cap = "caption" in p && p.caption ? `: ${p.caption.slice(0, 60)}` : "";
    return `${NOUN[p.t]}${cap}`;
  }

  const canEdit = (m: Msg) =>
    !!me && m.senderId === me.id && m.kind === "text" && !m.viewOnce && !m.deleted &&
    payloads.current.get(m.id)?.t === "text" && Date.now() - new Date(m.createdAt).getTime() < EDIT_MS;

  function startEdit(m: Msg) {
    const p = payloads.current.get(m.id);
    setMenuFor(null);
    if (!p || p.t !== "text") return;
    setReply(null);
    setEditing(m.id);
    setDraft(p.body);
    setTimeout(() => { const el = inputRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 50);
  }
  function cancelEdit() { setEditing(null); setDraft(""); }

  async function saveEdit(id: string, body: string) {
    const v = vaultRef.current;
    const m = msgs.get(id);
    const old = payloads.current.get(id);
    if (!v || !m || !old || old.t !== "text") return cancelEdit();
    if (old.body === body) return cancelEdit();
    const payload: Payload = { ...old, body };
    const { iv, ct } = await encryptJSON(v.encKey, payload, messageAad(v.spaceId, v.memberId));
    const res = await api<{ editedAt: string }>(`/api/messages/${id}/edit`, { body: { iv, ct } });
    payloads.current.set(id, payload);
    payloadIv.current.set(id, iv);
    setMsgs((prev) => { const next = new Map(prev); const cur = next.get(id); if (cur) next.set(id, { ...cur, iv, ct, editedAt: res.editedAt }); return next; });
    setEditing(null);
    setDraft("");
    void syncNow();
  }

  // ---------- deleting ----------
  const [deleting, setDeleting] = useState<Msg | null>(null);
  async function deleteMessage(m: Msg, who: "me" | "everyone") {
    setDeleting(null);
    setMenuFor(null);
    const before = msgs.get(m.id);
    // On screen right away; the server catches up (and is retried by the next sync if the network is weak).
    setMsgs((prev) => {
      const next = new Map(prev);
      if (who === "me") next.delete(m.id);
      else next.set(m.id, { ...m, deleted: true, deletedReason: "removed", iv: "", ct: "", reactions: {}, media: null });
      return next;
    });
    if (who === "everyone") { payloads.current.delete(m.id); payloadIv.current.delete(m.id); }
    try {
      await api(`/api/messages/${m.id}/delete`, { body: { for: who } });
    } catch (err) {
      if (before) setMsgs((prev) => new Map(prev).set(m.id, before));
      if (err instanceof ApiError && err.status === 401) return lockOut();
      setToast(err instanceof ApiError ? err.message : "Couldn't delete that. Check your connection and try again.");
    }
  }

  // ---------- calls ----------
  async function startCall(kind: "voice" | "video") {
    if (activeCall || !partner) return;
    try {
      const { id } = await api<{ id: string }>("/api/call", { body: { kind } });
      handledCalls.current.add(id);
      setActiveCall({ id, role: "caller", kind });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return lockOut();
      setToast(err instanceof ApiError ? err.message : "Couldn't start the call. Check your connection.");
    }
  }

  function startReply(m: Msg) {
    if (editing) cancelEdit();
    setReply({ id: m.id, from: m.senderId, preview: previewOf(m) });
    setMenuFor(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function jumpTo(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return setToast("That message is too far back to jump to.");
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1600);
  }

  async function copyMessage(m: Msg) {
    const p = payloads.current.get(m.id);
    setMenuFor(null);
    if (p?.t !== "text") return;
    try { await navigator.clipboard.writeText(p.body); setToast("Copied"); } catch { setToast("Couldn't copy that."); }
  }

  function markStatusSeen(id: string) {
    setStatuses((list) => list.map((x) => (x.id === id ? { ...x, seenAt: new Date().toISOString() } : x)));
    api("/api/status", { body: { action: "seen", id } }).catch(() => {});
  }

  function deleteStatus(id: string) {
    setStatuses((list) => list.filter((x) => x.id !== id));
    api("/api/status", { body: { action: "delete", id } }).catch(() => setToast("Couldn't delete it."));
  }

  // ---------- render ----------
  if (!ready || !info || !me) {
    return (
      <main className="gate" aria-busy="true">
        <span className="live__pulse" aria-hidden="true" />
        {loadTrouble.count >= 3 && (
          <>
            <p className="gate__lead">{loadTrouble.server ? "Our Space can't load right now. Still trying…" : "Waiting for the network. Still trying…"}</p>
            <p className="hint">{loadTrouble.server
              ? "The server had a problem. If it keeps happening, its database may need the latest update."
              : "Check your connection. Your messages will appear as soon as it's back."}</p>
            <button type="button" className="btn btn--ghost" onClick={() => { setLoadTrouble({ count: 0, server: false }); void syncNow(); }}>Try again</button>
          </>
        )}
      </main>
    );
  }
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
  const theirCycle = partner && partner.gender !== "man" ? cycleMap[partner.id] : undefined;
  const careP = theirCycle?.share ? predictCycle(theirCycle, today) : null;
  const careText = careP && partner
    ? careP.inPeriod ? `Day ${careP.periodDay} of ${partner.name}'s period. A little extra care goes a long way.`
      : careP.daysUntilNext >= 0 && careP.daysUntilNext <= 2 ? `${partner.name}'s period may start ${countdownLabel(careP.daysUntilNext)}. Be extra gentle.`
      : null
    : null;

  const myStatuses = statuses.filter((x) => x.memberId === me.id);
  const theirStatuses = partner ? statuses.filter((x) => x.memberId === partner.id) : [];
  const theirUnseen = theirStatuses.some((x) => !x.seenAt);
  const typing = !!partner?.typing;
  const nameOf = (id: string) => (id === me.id ? "You" : info.members.find((m) => m.id === id)?.name ?? partnerName);
  const gamesWaiting = info.gamesWaiting?.length > 0 && info.gamesWaiting.some((g) => g.createdBy !== me.id);

  const p = pron(partner?.gender ?? null);
  const birthdayOf = (id: string | undefined) => specials.find((d) => d.kind === "birthday" && d.aboutMember === id) ?? null;
  const ageOf = (id: string | undefined) => { const b = birthdayOf(id); return b?.startYear ? ageOn(b.startYear, b.month, b.day, today) : null; };
  const live = info.live;

  // Small glass notices under the header, instead of big banners.
  type Notice = { key: string; text: string; tone?: "gold" | "care" | "warm" | "warn"; onClick?: () => void };
  const notices: Notice[] = [];
  if (updateReady) notices.push({ key: "upd", text: "A new version is ready. Tap to update", tone: "gold", onClick: () => window.location.reload() });
  if (partnerMood && partner) notices.push({ key: "pm", text: `${partner.name} feels ${partnerMood.label.toLowerCase()}. ${partnerMood.hint(partner.name)}`, tone: "warm" });
  if (partner && !myMood) notices.push({ key: "mm", text: "How are you feeling today?", tone: "gold", onClick: () => openOnly("mood") });
  if (streakAtRisk) notices.push({ key: "sr", text: iSentToday ? `Waiting on ${partnerName}. ${st.current}-day streak ends at midnight.` : `Your ${st.current}-day streak ends at midnight.`, tone: "warn", onClick: () => openOnly("streak") });
  if (gamesWaiting && partner) notices.push({ key: "gw", text: `${partner.name} started a game. Your turn.`, tone: "gold", onClick: () => openOnly("games") });
  if (upcomingText) notices.push({ key: "up", text: upcomingText, tone: "gold", onClick: () => openOnly("planner") });
  if (live && !liveOpen) {
    if (live.status === "lobby" && live.createdBy !== me.id) notices.push({ key: "live", text: `${partnerName} is waiting at the ${live.kind === "ludo" ? "Ludo" : "Whot"} table. Join now`, tone: "gold", onClick: () => setLiveOpen({ kind: live.kind, id: live.id }) });
    else if (live.status === "playing") notices.push({ key: "live", text: `Your ${live.kind === "ludo" ? "Ludo" : "Whot"} game is waiting. Back to the table`, tone: "gold", onClick: () => setLiveOpen({ kind: live.kind, id: live.id }) });
  }
  if (partner && partner.notifications !== "off" && partner.notifyOff?.includes("messages")) {
    notices.push({ key: "pmute", text: `${partner.name}'s notifications are off for messages. Your words will wait for ${p.obj} in the app.`, tone: "warn" });
  }
  if (careText) notices.push({ key: "care", text: careText, tone: "care" });
  if (partner && awayDays >= 1) notices.push({ key: "away", text: partner.notifications === "off" ? `${partner.name} has been away ${awayDays} ${awayDays === 1 ? "day" : "days"}, notifications off.` : `${partner.name} has been away ${awayDays} ${awayDays === 1 ? "day" : "days"}. Your messages will reach ${p.obj}.`, tone: "care" });
  if (showInstall) notices.push({ key: "inst", text: `Add ${APP_NAME} to your Home Screen: Share, then Add to Home Screen.` });
  if (showNotifAsk) notices.push({ key: "notif", text: notif === "off" ? `Notifications are off here, and ${partnerName} can see that. Turn on` : "Turn on notifications so nudges reach you.", tone: "warn", onClick: turnOnNotifications });
  if (welcome) notices.push({ key: "wel", text: "You're in. Everything here is locked with your shared password.", onClick: () => setWelcome(false) });

  const mark = (size: number) => (
    <BondMark
      size={size}
      a={initial(host?.name)}
      b={initial(guest?.name ?? info.space.label)}
      aSrc={host ? avatars[host.id] : null}
      bSrc={guest ? avatars[guest.id] : null}
      alive={online}
      title={`${me.name} and ${partnerName}`}
    />
  );

  const sub = typing ? <span className="typing">typing<i /><i /><i /></span>
    : partner ? <>{sinceLabel(partner.lastSeenAt)}{partner.notifications === "off" && <span className="pill">notifications off</span>}</>
    : "hasn't joined yet";

  let lastDay = "";
  let lastSender = "";
  let lastTime = 0;
  return (
    <main className={online ? "shell shell--together" : "shell"} data-theme={info.space.theme}>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <div className="dcard">
          <span className="dcard__mark">{mark(72)}</span>
          {canSwitch || me.role === "host" ? (
            <button type="button" className="dcard__names dcard__switch" onClick={() => { setDrawerOpen(false); setSwitchOpen(true); }} aria-label="Switch space">
              {host?.name ?? ""} <span>&amp;</span> {guest?.name ?? info.space.label}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5z" /></svg>
            </button>
          ) : (
            <p className="dcard__names">{host?.name ?? ""} <span>&amp;</span> {guest?.name ?? info.space.label}</p>
          )}
          {(ageOf(host?.id) !== null || ageOf(guest?.id) !== null) && (
            <p className="dcard__ages">
              {[host, guest].filter(Boolean).map((m) => ageOf(m!.id) !== null ? `${m!.name}, ${ageOf(m!.id)}` : null).filter(Boolean).join("  ·  ")}
            </p>
          )}
          <p className="dcard__line">
            {st.current > 0 ? `${st.current} ${st.current === 1 ? "day" : "days"} in a row` : "Start your streak today"}
            {myMood ? ` · you feel ${moodOf(myMood)?.label.toLowerCase()}` : ""}
          </p>
        </div>

        <div className="dsec">
          <p className="dsec__title">Status</p>
          <div className="srow">
            <button type="button" className="sbubble" onClick={() => (myStatuses.length ? setStatusView("mine") : setStatusCompose(true))}>
              <span className={myStatuses.length ? "sbubble__ring sbubble__ring--seen" : "sbubble__ring"}>
                <span className="sbubble__face">{myAvatar && avatars[me.id] ? <img src={avatars[me.id]} alt="" /> : initial(me.name)}</span>
                <span className="sbubble__plus" aria-hidden="true" onClick={(e) => { e.stopPropagation(); setStatusCompose(true); }}>+</span>
              </span>
              <span className="sbubble__label">My status<small>{myStatuses.length ? `${myStatuses.length} today` : "Tap to add"}</small></span>
            </button>
            {partner && theirStatuses.length > 0 && (
              <button type="button" className="sbubble" onClick={() => setStatusView("theirs")}>
                <span className={theirUnseen ? "sbubble__ring sbubble__ring--new" : "sbubble__ring sbubble__ring--seen"}>
                  <span className="sbubble__face">{avatars[partner.id] ? <img src={avatars[partner.id]} alt="" /> : initial(partner.name)}</span>
                </span>
                <span className="sbubble__label">{partner.name}<small>{theirUnseen ? "New" : "Seen"}</small></span>
              </button>
            )}
          </div>
          <p className="hint">Only the two of you see these. They disappear after 24 hours.</p>
        </div>

        <div className="dsec">
          <DrawerItem label="Feelings today" hint={myMood ? `You: ${moodOf(myMood)?.label}` : "Share how you feel"} onClick={() => openOnly("mood")}
            icon={<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-3.5 7a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM12 18a5.5 5.5 0 0 1-5-3.2h10A5.5 5.5 0 0 1 12 18z" /></svg>} />
          <DrawerItem label="Us, planned" hint={myGender === "man" ? "Special days, care, goals, talk" : "Special days, cycle, goals, talk"} onClick={() => openOnly("planner")}
            icon={<svg viewBox="0 0 24 24"><path d="M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2zm12 7H5v10h14zm-7 2.2c.7-.8 2.6-.9 2.9.8.3 1.6-1.6 2.9-2.9 3.9-1.3-1-3.2-2.3-2.9-3.9.3-1.7 2.2-1.6 2.9-.8z" /></svg>} />
          <DrawerItem label="Play together" hint={gamesWaiting ? "A game is waiting for you" : "Games and cards"} badge={gamesWaiting} onClick={() => openOnly("games")}
            icon={<svg viewBox="0 0 24 24"><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm2.5 3A1.5 1.5 0 1 0 9 7.5 1.5 1.5 0 0 0 7.5 6zm9 0A1.5 1.5 0 1 0 18 7.5 1.5 1.5 0 0 0 16.5 6zM12 10.5A1.5 1.5 0 1 0 13.5 12 1.5 1.5 0 0 0 12 10.5zM7.5 15A1.5 1.5 0 1 0 9 16.5 1.5 1.5 0 0 0 7.5 15zm9 0a1.5 1.5 0 1 0 1.5 1.5 1.5 1.5 0 0 0-1.5-1.5z" /></svg>} />
          <DrawerItem label="Our streak" hint={`${st.current} now · longest ${st.best}`} onClick={() => openOnly("streak")}
            icon={<svg viewBox="0 0 24 24"><path d="M12 20.5c-.4 0-.7-.1-1-.4C6.3 16 3 13.1 3 9.4 3 6.6 5.2 4.5 7.9 4.5c1.6 0 3.1.8 4.1 2.1 1-1.3 2.5-2.1 4.1-2.1 2.7 0 4.9 2.1 4.9 4.9 0 3.7-3.3 6.6-8 10.7-.3.3-.6.4-1 .4z" /></svg>} />
          <DrawerItem label="Settings" hint="Photo, theme, lock, storage and more" onClick={() => openOnly("settings")}
            icon={<svg viewBox="0 0 24 24"><path d="M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7.6 7.6 0 0 0-1.7-1L15 3.3h-4l-.4 2.7a7.6 7.6 0 0 0-1.7 1l-2.5-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1a7.6 7.6 0 0 0 1.7 1l.4 2.7h4l.4-2.7a7.6 7.6 0 0 0 1.7-1l2.5 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)" /></svg>} />
        </div>

        <div className="dsec dsec--foot">
          <button className="btn btn--ghost btn--wide" onClick={lockNow}>Lock now</button>
        </div>
      </Drawer>

      <section className="pane">
        <div className="pane__bg" style={backgroundUrl ? { backgroundImage: `url(${backgroundUrl})` } : undefined} aria-hidden="true" />

        <div className="pane__top" ref={topRef}>
          <Header
            mark={mark(40)}
            name={partnerName}
            sub={sub}
            live={online}
            statusRing={theirStatuses.length === 0 ? "none" : theirUnseen ? "new" : "seen"}
            streak={partner ? { count: st.current, done: st.todayDone } : null}
            onMenu={() => setDrawerOpen(true)}
            onWho={() => (theirUnseen ? setStatusView("theirs") : setDrawerOpen(true))}
            onPhoto={() => (theirUnseen ? setStatusView("theirs") : partner && avatars[partner.id] ? setPhotoOpen(true) : setToast(`${partnerName} hasn't added a photo yet.`))}
            onStreak={() => openOnly("streak")}
            onNudge={partner ? nudge : null}
            nudgeLabel={`Nudge ${partnerName}`}
            onCall={partner ? (k) => void startCall(k) : null}
          />
          {notices.length > 0 && (
            <div className="notices" role="list">
              {notices.map((n) => (
                n.onClick
                  ? <button key={n.key} type="button" role="listitem" className={`notice glass${n.tone ? ` notice--${n.tone}` : ""}`} onClick={n.onClick}>{n.text}</button>
                  : <p key={n.key} role="listitem" className={`notice glass${n.tone ? ` notice--${n.tone}` : ""}`}>{n.text}</p>
              ))}
            </div>
          )}
        </div>

        <div
          className="list"
          ref={listRef}
          style={{ paddingTop: topH + 8, paddingBottom: bottomH + 12 }}
          onScroll={(e) => {
            const el = e.currentTarget;
            const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            atBottom.current = bottom;
            if (bottom !== atBottomUI) setAtBottomUI(bottom);
            if (bottom && newBelow) setNewBelow(0);
          }}
        >
          <p className="e2e-note glass">Messages, photos and voice notes here are end-to-end encrypted. Only the two of you can read them.</p>

          {visible.length === 0 && uploads.length === 0 && (
            <div className="empty">
              {partner ? <p>Nothing here yet. Say the first thing.</p> : (
                <>
                  <p>{info.space.label} hasn&apos;t joined yet. Send {p.obj} the invite link.</p>
                  {me.role === "host" && !invite && <button className="btn" onClick={makeInvite}>Make an invite link</button>}
                  {invite && <InviteBox url={invite.inviteUrl} expiresAt={invite.expiresAt} />}
                </>
              )}
            </div>
          )}

          {[...visible.map((m) => ({ at: m.createdAt, m, c: null as CallRow | null })), ...callsShown.map((c) => ({ at: c.createdAt, m: null as Msg | null, c }))]
            .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
            .map(({ m: maybe, c }) => {
            if (c) {
              const day = dayLabel(c.createdAt);
              const showDay = day !== lastDay;
              lastDay = day; lastSender = ""; lastTime = 0;
              const mineCall = c.callerId === me.id;
              const missed = c.status === "missed" || c.status === "declined" || c.status === "busy";
              const mins = c.answeredAt && c.endedAt ? Math.max(1, Math.round((new Date(c.endedAt).getTime() - new Date(c.answeredAt).getTime()) / 60000)) : 0;
              const what = c.kind === "video" ? "Video call" : "Voice call";
              const text = missed
                ? (mineCall ? `${what} · ${c.status === "declined" ? "declined" : "no answer"}` : `Missed ${c.kind} call`)
                : `${what}${mins ? ` · ${mins} min` : ""}`;
              return (
                <div key={`call-${c.id}`}>
                  {showDay && <p className="daypill glass">{day}</p>}
                  <div className={mineCall ? "callrow callrow--mine" : "callrow"}>
                    <button type="button" className={missed && !mineCall ? "callrow__b callrow__b--missed" : "callrow__b"} onClick={() => void startCall(c.kind)}
                      aria-label={`${text}. Call back`}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">{c.kind === "video"
                        ? <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z" />
                        : <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" />}</svg>
                      <span><strong>{text}</strong><small>{timeOf(c.createdAt)}{missed && !mineCall ? " · Tap to call back" : ""}</small></span>
                    </button>
                  </div>
                </div>
              );
            }
            const m = maybe!;
            const mine = m.senderId === me.id;
            const day = dayLabel(m.createdAt);
            const showDay = day !== lastDay;
            const t = new Date(m.createdAt).getTime();
            const groupStart = showDay || lastSender !== m.senderId || t - lastTime > 5 * 60_000;
            lastDay = day; lastSender = m.senderId; lastTime = t;
            const payload = payloads.current.get(m.id);
            const noun = NOUN[m.kind] ?? "Message";
            const seen = !!partner?.lastSeenAt && new Date(partner.lastSeenAt).getTime() >= t;
            const isMedia = !!payload && payload.t !== "text" && !m.viewOnce;
            return (
              <div key={m.id}>
                {showDay && <p className="daypill glass">{day}</p>}
                <MessageRow
                  id={m.id}
                  mine={mine}
                  groupStart={groupStart}
                  time={timeOf(m.createdAt)}
                  edited={!!m.editedAt}
                  disappears={!!m.expiresAt}
                  ticks={!mine ? "none" : unsent.has(m.id) ? "failed" : m.id.startsWith("tmp-") ? "pending" : m.viewOnce ? "none" : seen ? "seen" : "sent"}
                  onRetry={() => { const o = vault && readOutbox(vault.spaceId).find((x) => x.tmp === m.id); if (o) void deliver(o); }}
                  reply={payload && "reply" in payload && payload.reply ? payload.reply : null}
                  replyName={nameOf}
                  reactions={Object.values(m.reactions)}
                  highlighted={flash === m.id}
                  wide={isMedia}
                  canReply={!m.viewOnce && !!partner && m.deletedReason !== "removed" && !m.id.startsWith("tmp-")}
                  onReply={() => startReply(m)}
                  onMenu={(rect) => setMenuFor({ m, rect })}
                  onLove={() => { if (!m.viewOnce && m.deletedReason !== "removed" && !m.id.startsWith("tmp-")) void react(m, "love"); }}
                  onJump={jumpTo}
                >
                  {m.deletedReason === "removed" ? (
                    <span className="b__deleted">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM4 12a8 8 0 0 1 12.9-6.3L5.7 16.9A7.96 7.96 0 0 1 4 12zm8 8a7.96 7.96 0 0 1-4.9-1.7L18.3 7.1A8 8 0 0 1 12 20z" /></svg>
                      {mine ? "You deleted this message" : "This message was deleted"}
                    </span>
                  ) : m.viewOnce ? (
                    mine ? <span className="b__once">{m.deleted || m.viewedAt ? "Opened" : `${noun}, view once`}</span>
                      : m.deleted || m.viewedAt ? <span className="b__once">Viewed</span>
                      : <button type="button" className="b__sealed" onClick={() => openOnce(m)}>{noun} to see once. Tap to open.</button>
                  ) : isMedia ? (
                    <MediaBubble
                      payload={payload as MediaPayload}
                      media={m.media}
                      vault={vault}
                      partnerName={partnerName}
                      meId={me.id}
                      onKeep={(k) => keep(m, k)}
                      onReact={() => { const el = document.getElementById(`msg-${m.id}`); if (el) setMenuFor({ m, rect: el.getBoundingClientRect() }); }}
                      onToast={setToast}
                    />
                  ) : (
                    <span className="b__text">
                      {payload === undefined ? <span className="muted">Unlocking…</span>
                        : payload === null ? <span className="muted">Couldn&apos;t unlock this message</span>
                        : payload.t === "text" ? payload.body : null}
                    </span>
                  )}
                </MessageRow>
              </div>
            );
          })}

          {uploads.map((u) => (
            <div key={u.id} className="row row--mine row--start">
              <div className="b b--mine b--tail uploading">
                Sending {u.label.toLowerCase()}… {u.pct}%
                <span className="meter"><span style={{ width: `${u.pct}%` }} /></span>
              </div>
            </div>
          ))}
          {partner?.typing && (
            <div className="row row--start typing-row" aria-live="polite" aria-label={`${partner.name} is typing`}>
              <div className="b b--tail typing-b"><span /><span /><span /></div>
            </div>
          )}
        </div>

        {!atBottomUI && (
          <button type="button" className="fab glass" style={{ bottom: bottomH + 14 }} onClick={scrollToBottom} aria-label="Jump to the latest messages">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16.5 5 9.5l1.4-1.4 5.6 5.6 5.6-5.6L19 9.5z" /></svg>
            {newBelow > 0 && <span className="fab__count">{newBelow}</span>}
          </button>
        )}

        <div className="pane__bottom" ref={bottomRef}>
          {attachOpen && (
            <div className="attach2 glass" role="menu">
              <button role="menuitem" onClick={() => photoInput.current?.click()}><span className="attach2__dot attach2__dot--photo" />Photos</button>
              <button role="menuitem" onClick={() => videoInput.current?.click()}><span className="attach2__dot attach2__dot--video" />Video</button>
              {!viewOnce && <button role="menuitem" onClick={() => fileInput.current?.click()}><span className="attach2__dot attach2__dot--file" />Document</button>}
              <button role="menuitem" onClick={() => { setAttachOpen(false); setStatusCompose(true); }}><span className="attach2__dot attach2__dot--status" />Status</button>
            </div>
          )}
          {recording ? (
            <VoiceRecorder onSend={onVoice} onCancel={() => setRecording(false)} onError={(msg) => { setRecording(false); setToast(msg); }} />
          ) : (
            <Composer
              inputRef={inputRef}
              draft={draft}
              onDraft={onDraftChange}
              onSubmit={send}
              onKeyDown={onKeyDown}
              placeholder={viewOnce ? "Seen once, then gone" : disappear.value ? `Disappears after ${disappear.label}` : "Message"}
              disabled={!partner}
              sending={sending}
              viewOnce={viewOnce}
              onToggleOnce={() => setViewOnce((v) => !v)}
              onAttach={() => setAttachOpen((o) => !o)}
              attachOpen={attachOpen}
              onCamera={() => cameraInput.current?.click()}
              onRecord={() => setRecording(true)}
              onEmoji={(e) => setDraft((d) => d + e)}
              editing={editing ? { preview: (() => { const p = payloads.current.get(editing); return p && p.t === "text" ? p.body : ""; })() } : null}
              onCancelEdit={cancelEdit}
              reply={reply ? { name: nameOf(reply.from) === "You" ? "yourself" : nameOf(reply.from), preview: reply.preview } : null}
              onCancelReply={() => setReply(null)}
            />
          )}
        </div>
      </section>

      <input ref={photoInput} type="file" accept="image/*" multiple hidden onChange={onPhotos} />
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onPhotos} />
      <input ref={videoInput} type="file" accept="video/*" hidden onChange={onVideo} />
      <input ref={fileInput} type="file" hidden onChange={onFile} />
      <input ref={avatarInput} type="file" accept="image/*" hidden onChange={onAvatar} />
      <input ref={backgroundInput} type="file" accept="image/*" hidden onChange={onBackground} />

      {menuFor && (
        <MessageMenu
          rect={menuFor.rect}
          mine={menuFor.m.senderId === me.id}
          canReact={!menuFor.m.viewOnce && menuFor.m.deletedReason !== "removed" && !menuFor.m.id.startsWith("tmp-")}
          canCopy={payloads.current.get(menuFor.m.id)?.t === "text" && !menuFor.m.viewOnce}
          myReaction={menuFor.m.reactions[me.id] ?? null}
          onReact={(r) => react(menuFor.m, r)}
          onReply={() => startReply(menuFor.m)}
          onCopy={() => copyMessage(menuFor.m)}
          canEdit={canEdit(menuFor.m) && !menuFor.m.id.startsWith("tmp-")}
          onEdit={() => startEdit(menuFor.m)}
          onDelete={menuFor.m.id.startsWith("tmp-") ? undefined : () => { setDeleting(menuFor.m); setMenuFor(null); }}
          onClose={() => setMenuFor(null)}
        />
      )}

      {moodOpen && partner && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="How you feel" onClick={() => setMoodOpen(false)}>
          <div className="sheet-up glass" onClick={(e) => e.stopPropagation()}>
            <MoodCard myName={me.name} partnerName={partnerName} guesses={guesses} current={myMood} onPick={pickMood}
              onLater={() => { setMoodLater(true); setMoodOpen(false); }} />
          </div>
        </div>
      )}

      {statusCompose && (
        <StatusComposer vault={vault} partnerName={partnerName} onClose={() => setStatusCompose(false)} onPosted={() => void syncNow()} onToast={setToast} />
      )}
      {statusView === "mine" && myStatuses.length > 0 && (
        <StatusViewer items={myStatuses} ownerName={me.name} mine partnerName={partnerName} vault={vault}
          onSeen={() => {}} onDelete={deleteStatus} onClose={() => setStatusView(null)} />
      )}
      {statusView === "theirs" && partner && theirStatuses.length > 0 && (
        <StatusViewer items={theirStatuses} ownerName={partner.name} mine={false} partnerName={partnerName} vault={vault}
          onSeen={markStatusSeen} onDelete={() => {}} onClose={() => setStatusView(null)} />
      )}

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
      {lockSetupOpen && (
        <div className="modal modal--center" role="dialog" aria-modal="true" aria-label="App lock">
          <div className="lock-modal">
            <p className="sheet__title">{lockKind ? "Change your app lock" : "Set your app lock"}</p>
            <LockSetup vault={vault} partnerName={partner?.name} partnerPos={p.pos}
              onDone={(k) => { setLockKind(k); setLockSetupOpen(false); setToast(`${LOCK_LABEL[k]} set. Use it next time you open the app.`); }}
              onSkip={() => setLockSetupOpen(false)} skipLabel="Cancel" />
          </div>
        </div>
      )}
      {gamesOpen && (
        <Games vault={vault} me={{ id: me.id, name: me.name }} partner={partner ? { id: partner.id, name: partner.name } : null}
          onClose={() => setGamesOpen(false)} onToast={setToast} onSendText={sendCard} onChanged={() => void syncNow()}
          partnerLabel={partnerName}
          onLive={(kind) => { setGamesOpen(false); setLiveOpen({ kind, id: live && live.kind === kind ? live.id : undefined }); }} />
      )}
      {plannerOpen && (
        <Planner vault={vault} me={{ id: me.id, name: me.name }} partner={partner ? { id: partner.id, name: partner.name } : null} myGender={myGender}
          today={today} onClose={() => setPlannerOpen(false)} onChanged={() => void syncNow()} onToast={setToast} />
      )}

      {menuOpen && (
        <div className="planner settings-page" role="dialog" aria-modal="true" aria-label="Settings">
          <header className="planner__head">
            <h2 className="planner__title">Settings</h2>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setMenuOpen(false)}>Done</button>
          </header>
          <div className="planner__body">
            <section className="dsettings" aria-label="Settings">
            <div className="sheet__group">
              <p className="sheet__title">About you</p>
              <p className="hint">{myGender ? `${myGender === "woman" ? "Woman" : "Man"}` : "Not set"}{birthdayOf(me.id) ? ` · birthday ${birthdayOf(me.id)!.day}/${birthdayOf(me.id)!.month}` : ""}</p>
              <button className="btn btn--ghost" onClick={() => setAboutOpen(true)}>Edit</button>
            </div>
            <div className="sheet__group">
              <p className="sheet__title">Your photo</p>
              <div className="row">
                <button className="btn btn--ghost" onClick={() => avatarInput.current?.click()} disabled={busySetting === "avatar"}>
                  {busySetting === "avatar" ? "Uploading…" : myAvatar ? "Change photo" : "Add a photo"}
                </button>
                {myAvatar && <button className="btn btn--ghost" onClick={removeAvatar}>Remove</button>}
              </div>
            </div>
            <div className="sheet__group">
              <p className="sheet__title">Theme</p>
              <div className="chips chips--left">
                {THEME_OPTIONS.map((t) => (
                  <button key={t.value} className={t.value === info.space.theme ? "chip chip--on" : "chip"} onClick={() => saveSettings({ theme: t.value }, `${t.label} theme on`)}>{t.label}</button>
                ))}
              </div>
            </div>
            <div className="sheet__group">
              <p className="sheet__title">Chat background</p>
              <div className="row">
                <button className="btn btn--ghost" onClick={() => backgroundInput.current?.click()} disabled={busySetting === "background"}>
                  {busySetting === "background" ? "Uploading…" : info.space.backgroundMediaId ? "Change background" : "Choose a photo"}
                </button>
                {info.space.backgroundMediaId && <button className="btn btn--ghost" onClick={() => saveSettings({ backgroundMediaId: null }, "Background removed")}>Remove</button>}
              </div>
            </div>
            <div className="sheet__group">
              <p className="sheet__title">Disappearing messages</p>
              <div className="chips chips--left">
                {DISAPPEAR_OPTIONS.map((o) => (
                  <button key={o.label} className={o.value === disappear.value ? "chip chip--on" : "chip"}
                    onClick={() => saveSettings({ disappearSeconds: o.value }, o.value === null ? "Messages stay" : "New messages will disappear")}>{o.label}</button>
                ))}
              </div>
            </div>
            <div className="sheet__group">
              <p className="sheet__title">Storage</p>
              {usage ? (
                <>
                  <div className="meter" role="img" aria-label={`${usedPct}% of storage used`}><span style={{ width: `${usedPct}%` }} /></div>
                  <p className="hint">{formatBytes(usage.totalBytes)} of {formatBytes(usage.limitBytes)} used, {formatBytes(usage.keptBytes)} kept. Uploads this month: {usage.uploadsThisMonth} of {usage.uploadLimit.toLocaleString()}.</p>
                </>
              ) : <p className="hint">Checking…</p>}
            </div>
            <div className="sheet__group">
              <p className="sheet__title">App lock on this phone</p>
              <p className="hint">{lockKind ? `Opens with your ${LOCK_LABEL[lockKind].toLowerCase()}.` : "Off. You type the shared password each time."}</p>
              <div className="row">
                <button className="btn btn--ghost" onClick={() => { setDrawerOpen(false); setLockSetupOpen(true); }}>{lockKind ? "Change" : "Set a PIN, pattern or password"}</button>
                {lockKind && <button className="btn btn--ghost" onClick={async () => { await removeLock(vault.spaceId); setLockKind(null); setToast("App lock turned off on this phone"); }}>Turn off</button>}
              </div>
            </div>
            <div className="sheet__group">
              <p className="sheet__title">Notifications</p>
              <NotifySettings state={notif} off={info.members.find((m) => m.id === me.id)?.notifyOff ?? []}
                quiet={info.members.find((m) => m.id === me.id)?.notifyQuiet ?? false} partnerName={partnerName}
                onTurnOn={turnOnNotifications} onToast={setToast} />
            </div>
            {me.role === "host" && (
              <>
                <div className="sheet__group">
                  <p className="sheet__title">Invite link</p>
                  {invite ? <InviteBox url={invite.inviteUrl} expiresAt={invite.expiresAt} />
                    : <button className="btn btn--ghost" onClick={makeInvite}>{partner ? `Make a link for ${partner.name}'s new phone` : "Make an invite link"}</button>}
                </div>
                <div className="sheet__group">
                  <p className="sheet__title">Another space</p>
                  <button className="btn btn--ghost" onClick={() => router.push("/setup")}>Start a space with someone new</button>
                </div>
                <div className="sheet__group">
                  <p className="sheet__title">Host password</p>
                  <HostPasswordForm onToast={setToast} />
                </div>
              </>
            )}
          </section>
          </div>
        </div>
      )}

      {liveOpen && (
        <LiveGame vault={vault} kind={liveOpen.kind} gameId={liveOpen.id} meId={me.id} partnerPronoun={p.sub.charAt(0).toUpperCase() + p.sub.slice(1)} onClose={() => { setLiveOpen(null); void syncNow(); }} onToast={setToast} />
      )}
      {notifPrompt && notif !== "on" && (
        <NotifPrompt partnerName={partnerName} partnerPossessive={p.pos} needsHomeScreen={isIOS() && !isStandalone()}
          onTurnOn={async () => { await turnOnNotifications(); setNotifPrompt(false); }}
          onNotNow={() => { setNotifPrompt(false); void api("/api/push/status", { body: { state: "off" } }).catch(() => {}); }} />
      )}
      {pending && (
        <div className="sendprev" role="dialog" aria-modal="true" aria-label={pending.kind === "photo" ? "Send photo" : "Send video"}>
          <header className="sendprev__top">
            <button type="button" className="icon-btn" onClick={closePreview} aria-label="Cancel">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z" /></svg>
            </button>
            <span>{pending.files.length > 1 ? `${pending.files.length} photos` : pending.kind === "photo" ? "Photo" : "Video"} for {partnerName}</span>
            <span style={{ width: 40 }} />
          </header>
          <div className="sendprev__media">
            {pending.kind === "photo"
              ? <img src={pending.urls[0]} alt="Photo to send" />
              : <video src={pending.urls[0]} controls playsInline />}
          </div>
          {pending.files.length > 1 && (
            <div className="sendprev__thumbs">
              {pending.urls.map((u, i) => <img key={u} src={u} alt={`Photo ${i + 1}`} />)}
            </div>
          )}
          <div className="sendprev__bar">
            <button type="button" className={pendingOnce ? "sendprev__once sendprev__once--on" : "sendprev__once"} onClick={() => setPendingOnce((o) => !o)}
              aria-pressed={pendingOnce} aria-label={pendingOnce ? "View once is on" : "Turn on view once"}>1</button>
            <input className="field" value={pendingCaption} maxLength={1000} placeholder="Add a caption" onChange={(e) => setPendingCaption(e.target.value)} />
            <button type="button" className="send" onClick={sendPreview} aria-label="Send">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.3 10l12.6 2-12.6 2z" /></svg>
            </button>
          </div>
          {pendingOnce && <p className="sendprev__hint">View once: {partnerName} can open it one time, then it&apos;s deleted for good.</p>}
        </div>
      )}
      {deleting && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Delete message" onClick={() => setDeleting(null)}>
          <div className="sheet-up glass delsheet" onClick={(e) => e.stopPropagation()}>
            <p className="sheet__title">Delete message?</p>
            {deleting.senderId === me.id && deleting.deletedReason !== "removed" && (
              <button type="button" className="btn btn--danger btn--wide" onClick={() => deleteMessage(deleting, "everyone")}>Delete for everyone</button>
            )}
            <button type="button" className="btn btn--ghost btn--wide" onClick={() => deleteMessage(deleting, "me")}>Delete for me</button>
            <button type="button" className="link-btn link-btn--quiet" onClick={() => setDeleting(null)}>Cancel</button>
            {deleting.senderId === me.id && deleting.deletedReason !== "removed" && (
              <p className="hint">Delete for everyone removes it from both phones{deleting.media ? ", and the file from storage" : ""}. {partnerName} will see &quot;This message was deleted&quot;.</p>
            )}
          </div>
        </div>
      )}
      {activeCall && (
        <CallScreen vault={vault} callId={activeCall.id} role={activeCall.role} kind={activeCall.kind} partnerName={partnerName}
          partnerAvatar={partner ? avatars[partner.id] ?? null : null}
          onClose={({ reason }) => { setActiveCall(null); if (reason === "no-media") setToast("Allow the microphone for Our Space in your browser settings, then call again."); void syncNow(); }} />
      )}
      {whatsNew && !updateReady && <WhatsNew entry={whatsNew} onClose={closeWhatsNew} />}
      {arrived && partner && <div className="arrival" role="status">{partner.name} is here <span aria-hidden="true">♥</span></div>}
      {photoOpen && partner && avatars[partner.id] && (
        <MediaViewer kind="photo" url={avatars[partner.id]} caption={partner.name} onClose={() => setPhotoOpen(false)} />
      )}
      {switchOpen && <SpaceSwitcher currentSpaceId={me.spaceId} isHost={me.role === "host"} onClose={() => setSwitchOpen(false)} />}
      {aboutOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="About you" onClick={() => setAboutOpen(false)}>
          <div className="sheet-up glass" onClick={(e) => e.stopPropagation()}>
            <AboutYou vault={vault} me={{ id: me.id, name: me.name }} gender={myGender} partnerName={partnerName}
              birthday={(() => { const b = birthdayOf(me.id); return b ? { id: b.id, month: b.month, day: b.day, startYear: b.startYear } : null; })()}
              onDone={() => { setAboutOpen(false); void syncNow(); }}
              onLater={() => { try { localStorage.setItem(`ourspace:about-later:${me.spaceId}`, String(Date.now())); } catch { /* ignore */ } setAboutOpen(false); }}
              onToast={setToast} />
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
