"use client";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import BondMark from "@/components/BondMark";
import InviteBox from "@/components/InviteBox";
import { api, ApiError } from "@/lib/api";
import { APP_NAME } from "@/lib/brand";
import { decryptJSON, encryptJSON, messageAad } from "@/lib/crypto-client";
import { ANGRY, LOVE, onlyLoveAndAngry } from "@/lib/emoji";
import { dayLabel, initial, isOnline, sinceLabel, timeOf } from "@/lib/format";
import { personalizeInstall } from "@/lib/install";
import { enableNotifications, isIOS, isStandalone, pushSupported, reportNotificationState } from "@/lib/push-client";
import { clearVault, getVault, type Vault } from "@/lib/vault";

type Reaction = "love" | "angry";
type Member = {
  id: string; role: "host" | "partner"; name: string; banned: boolean;
  notifications: "on" | "off" | "unknown"; lastSeenAt: string | null; lastNudgeAt: string | null;
};
type Msg = {
  id: string; senderId: string; kind: string; viewOnce: boolean; viewedAt: string | null; deleted: boolean;
  reactions: Record<string, Reaction>; expiresAt: string | null; createdAt: string; iv: string | null; ct: string | null;
};
type SyncResponse = {
  now: string;
  me: { id: string; role: "host" | "partner"; name: string; spaceId: string };
  members: Member[];
  space: { label: string; disappearSeconds: number | null };
  messages: Msg[];
};
type Info = Omit<SyncResponse, "messages" | "now">;
type Payload = { t: "text"; body: string };

const POLL_MS = 2500;
const LOCK_AFTER_MS = 2 * 60 * 1000;
const DISAPPEAR_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Off" },
  { value: 3600, label: "1 hour" },
  { value: 86400, label: "24 hours" },
  { value: 604800, label: "7 days" },
];

export default function ChatPage() {
  const router = useRouter();
  const vaultRef = useRef<Vault | null>(null);
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [msgs, setMsgs] = useState<Map<string, Msg>>(() => new Map());
  const textCache = useRef(new Map<string, string | null>());
  const [, bump] = useReducer((x: number) => x + 1, 0);

  const cursor = useRef<string | null>(null);
  const syncing = useRef(false);
  const syncAgain = useRef(false);
  const hiddenAt = useRef<number | null>(null);
  const seenNudge = useRef<string | null | undefined>(undefined);

  const [draft, setDraft] = useState("");
  const [viewOnce, setViewOnce] = useState(false);
  const [sending, setSending] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [onceText, setOnceText] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [invite, setInvite] = useState<{ inviteUrl: string; expiresAt: string } | null>(null);
  const [notif, setNotif] = useState<"on" | "off" | "unknown">("unknown");
  const [toast, setToast] = useState<string | null>(null);
  const [hearts, setHearts] = useState(0);
  const [welcome, setWelcome] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const atBottom = useRef(true);
  const lastTap = useRef<{ id: string; at: number } | null>(null);

  const lockOut = useCallback(() => {
    clearVault();
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
    const todo = list.filter((m) => !m.deleted && !m.viewOnce && m.iv && m.ct && !textCache.current.has(m.id));
    if (todo.length === 0) return;
    await Promise.all(todo.map(async (m) => {
      try {
        const p = await decryptJSON<Payload>(v.encKey, m.iv as string, m.ct as string, messageAad(v.spaceId, m.senderId));
        textCache.current.set(m.id, typeof p.body === "string" ? p.body : null);
      } catch {
        textCache.current.set(m.id, null);
      }
    }));
    bump();
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
      setInfo({ me: data.me, members: data.members, space: data.space });
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
  }, [decryptList, lockOut]);

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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const visible = useMemo(() => {
    const now = Date.now();
    return Array.from(msgs.values())
      // Show live messages, plus opened view-once markers. Hide anything past its disappear time.
      .filter((m) => (!m.deleted || (m.viewOnce && !!m.viewedAt)) && !(m.expiresAt && !m.deleted && new Date(m.expiresAt).getTime() < now))
      .sort((a, b) => Number(a.id) - Number(b.id));
  }, [msgs]);

  // Stick to the bottom when new messages come in, unless you scrolled up to read.
  useEffect(() => {
    const el = listRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [visible.length, ready]);

  // Grow the message box with what you type (Safari doesn't support field-sizing yet).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft]);

  // ---------- actions ----------
  async function send(e?: FormEvent) {
    e?.preventDefault();
    const v = vaultRef.current;
    const body = onlyLoveAndAngry(draft).trim();
    if (!v || !body || sending) return;
    setSending(true);
    try {
      const { iv, ct } = await encryptJSON(v.encKey, { t: "text", body } satisfies Payload, messageAad(v.spaceId, v.memberId));
      const res = await api<{ id: string; createdAt: string; expiresAt: string | null }>("/api/messages", { body: { iv, ct, viewOnce } });
      textCache.current.set(res.id, body);
      setMsgs((prev) => {
        const next = new Map(prev);
        next.set(res.id, {
          id: res.id, senderId: v.memberId, kind: "text", viewOnce, viewedAt: null, deleted: false,
          reactions: {}, expiresAt: res.expiresAt, createdAt: res.createdAt, iv, ct,
        });
        return next;
      });
      atBottom.current = true;
      setDraft("");
      setViewOnce(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return lockOut();
      setToast(err instanceof ApiError ? err.message : "Not sent. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
      e.preventDefault();
      void send();
    }
  }

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

  async function openOnce(m: Msg) {
    const v = vaultRef.current;
    if (!v || !m.iv || !m.ct) return;
    try {
      const p = await decryptJSON<Payload>(v.encKey, m.iv, m.ct, messageAad(v.spaceId, m.senderId));
      setOnceText(p.body);
    } catch {
      setToast("This message couldn't be opened.");
      return;
    }
    setMsgs((prev) => {
      const copy = new Map(prev);
      copy.set(m.id, { ...m, deleted: true, viewedAt: new Date().toISOString(), iv: null, ct: null });
      return copy;
    });
    api(`/api/messages/${m.id}/viewed`, { method: "POST" }).catch(() => {});
  }

  async function nudge() {
    try {
      await api("/api/nudge", { method: "POST" });
      setToast(`Nudge sent ${LOVE}`);
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Couldn't nudge. Try again.");
    }
  }

  async function setDisappear(value: number | null) {
    try {
      await api("/api/space/settings", { body: { disappearSeconds: value } });
      setInfo((i) => (i ? { ...i, space: { ...i.space, disappearSeconds: value } } : i));
      setToast(value === null ? "Messages stay" : "New messages will disappear");
    } catch (err) {
      setToast(err instanceof ApiError ? err.message : "Couldn't change that. Try again.");
    }
  }

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

  const online = isOnline(partner?.lastSeenAt ?? null);
  const partnerName = partner?.name ?? info.space.label;
  const showInstall = isIOS() && !isStandalone();
  const showNotifAsk = !showInstall && pushSupported() && notif !== "on";
  const disappear = DISAPPEAR_OPTIONS.find((o) => o.value === info.space.disappearSeconds) ?? DISAPPEAR_OPTIONS[0];

  let lastDay = "";
  return (
    <main className="chat">
      <header className="chat__head">
        <BondMark
          size={40}
          a={initial(me.role === "host" ? me.name : partnerName)}
          b={initial(me.role === "host" ? partnerName : me.name)}
          alive={online}
          title={`${me.name} and ${partnerName}`}
        />
        <div className="chat__who">
          <h1 className="chat__name">{partnerName}</h1>
          <p className={online ? "chat__status chat__status--live" : "chat__status"}>
            {partner ? sinceLabel(partner.lastSeenAt) : "hasn't joined yet"}
            {partner?.notifications === "off" && <span className="pill">notifications off</span>}
          </p>
        </div>
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
            <p className="sheet__title">Disappearing messages</p>
            <div className="chips">
              {DISAPPEAR_OPTIONS.map((o) => (
                <button key={o.label} className={o.value === disappear.value ? "chip chip--on" : "chip"} onClick={() => setDisappear(o.value)}>
                  {o.label}
                </button>
              ))}
            </div>
            <p className="hint">Either of you can change this. It applies to new messages.</p>
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
        {visible.length === 0 && (
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
          const text = textCache.current.get(m.id);
          const reactions = Object.values(m.reactions);
          return (
            <div key={m.id} className="msg-wrap">
              {showDay && <p className="day">{day}</p>}
              <div className={mine ? "msg msg--mine" : "msg"}>
                {m.viewOnce ? (
                  mine ? (
                    <div className="bubble bubble--once">
                      {m.deleted || m.viewedAt ? "Opened" : "View once, sent"}
                    </div>
                  ) : m.deleted || m.viewedAt ? (
                    <div className="bubble bubble--once">Viewed</div>
                  ) : (
                    <button className="bubble bubble--once bubble--sealed" onClick={() => openOnce(m)}>
                      Tap to open. You can see this once.
                    </button>
                  )
                ) : (
                  <button className="bubble" onClick={() => tapBubble(m)} aria-label="Message. Tap to react, double tap to love.">
                    {text === undefined ? <span className="muted">Unlocking…</span>
                      : text === null ? <span className="muted">Couldn&apos;t unlock this message</span>
                      : text}
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
      </div>

      <form className="composer" onSubmit={send}>
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
        <button className="send" disabled={!draft.trim() || sending || !partner} aria-label="Send">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6l-.1 6.5L15 12 3.3 13.9z" /></svg>
        </button>
      </form>

      {onceText !== null && (
        <div className="once" role="dialog" aria-modal="true" aria-label="View once message">
          <p className="once__text">{onceText}</p>
          <button className="btn" onClick={() => setOnceText(null)}>Close. It&apos;s gone after this.</button>
        </div>
      )}

      {hearts > 0 && (
        <div className="hearts" key={hearts} aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} style={{ left: `${(i * 7 + 4) % 96}%`, animationDelay: `${(i % 7) * 0.12}s` }}>{LOVE}</span>
          ))}
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
