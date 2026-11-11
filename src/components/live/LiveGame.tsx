"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { decryptJSON, encryptJSON } from "@/lib/crypto-client";
import { onlyLoveAndAngry } from "@/lib/emoji";
import { BET_IDEAS, betAad } from "@/lib/live/bets";
import { audio, loadPrefs, savePrefs, stopAll, TRACKS, type AudioPrefs, type Sfx } from "@/lib/live/audio";
import { DEFAULT_LUDO, legalMoves, type LudoRules, type LudoState } from "@/lib/live/ludo";
import { webglAvailable } from "@/lib/live/stage";
import { canPlay as whotCanPlay, DEFAULT_WHOT, type Card, type WhotRules } from "@/lib/live/whot";
import type { Vault } from "@/lib/vault";
import Dice3D from "./Dice3D";
import Ludo3D from "./Ludo3D";
import LudoBoard, { Die, LUDO_HEX } from "./LudoBoard";
import Whot3D from "./Whot3D";
import WhotTable, { type WhotView } from "./WhotTable";

type Kind = "ludo" | "whot";
type Person = { id: string; name: string; present: boolean };
type Sealed = { iv: string; ct: string };
type View = {
  id: string; kind: Kind; status: "lobby" | "playing" | "done"; version: number; createdBy: string; people: Person[];
  state: LudoState | WhotView | null; settings: LudoRules | WhotRules; bets: Record<string, Sealed>; ready: string[];
};
type Props = { vault: Vault; kind: Kind; gameId?: string; meId: string; partnerPronoun?: string; onClose: () => void; onToast: (m: string) => void };

const NAME: Record<Kind, string> = { ludo: "Ludo", whot: "Whot" };
const POLL_MS = 1000;
const whotCheck = (w: WhotView, c: Card) => whotCanPlay({ ...w, hands: {}, deck: [], moves: 0 } as never, c);

// A live table: rules and bets first, then the game. Nothing moves unless you're both here.
export default function LiveGame({ vault, kind, gameId, meId, partnerPronoun = "They", onClose, onToast }: Props) {
  const [id, setId] = useState<string | null>(gameId ?? null);
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [bets, setBets] = useState<Record<string, string>>({});
  const [betDraft, setBetDraft] = useState("");
  const [prefs, setPrefs] = useState<AudioPrefs>(() => loadPrefs());
  const [soundOpen, setSoundOpen] = useState(false);
  const [use3d] = useState(() => typeof window !== "undefined" && webglAvailable());
  const busyRef = useRef(false);
  const prev = useRef<View | null>(null);
  const musicStarted = useRef(false);

  const sfx = useCallback((s: Sfx) => { if (prefs.sfx && musicStarted.current) audio()?.sfx(s); }, [prefs.sfx]);

  useEffect(() => {
    if (id) return;
    api<{ id: string }>("/api/live", { body: { kind } })
      .then((r) => setId(r.id))
      .catch((err) => { onToast(err instanceof ApiError ? err.message : "Couldn't open the table."); onClose(); });
  }, [id, kind, onClose, onToast]);

  const refresh = useCallback(async () => {
    if (!id || busyRef.current) return;
    try { setView(await api<View>(`/api/live/${id}`)); }
    catch (err) { if (err instanceof ApiError && err.status === 404) { onToast("This game has ended."); onClose(); } }
  }, [id, onClose, onToast]);

  useEffect(() => {
    if (!id) return;
    void refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, POLL_MS);
    return () => clearInterval(t);
  }, [id, refresh]);

  useEffect(() => () => stopAll(), []);

  // Unlock the bets (encrypted like your messages).
  const betsKey = view ? JSON.stringify(view.bets ?? {}) + view.id : "";
  useEffect(() => {
    if (!view) return;
    const out: Record<string, string> = {};
    void Promise.all(Object.entries(view.bets ?? {}).map(async ([who, sealed]) => {
      try { out[who] = (await decryptJSON<{ text: string }>(vault.encKey, sealed.iv, sealed.ct, betAad(vault.spaceId, view.id, who))).text; }
      catch { out[who] = "(couldn't unlock)"; }
    })).then(() => setBets((b) => (JSON.stringify(b) === JSON.stringify(out) ? b : out)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [betsKey, vault]);

  // Music starts on your first tap (phones only allow sound after one).
  function firstTap() {
    if (musicStarted.current) return;
    musicStarted.current = true;
    const a = audio();
    if (a) { a.sfxOn = prefs.sfx; a.setMusicVolume(prefs.music); if (prefs.playing) a.start(prefs.track); }
  }
  function updatePrefs(p: AudioPrefs) {
    setPrefs(p); savePrefs(p);
    musicStarted.current = true;
    const a = audio();
    if (!a) return;
    a.sfxOn = p.sfx; a.setMusicVolume(p.music);
    if (p.playing) a.start(p.track); else a.stopMusic();
  }

  async function act(body: Record<string, unknown>) {
    if (!id || !view || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      setView(await api<View>(`/api/live/${id}`, { body: { ...body, version: view.version } }));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't make that move.";
      if (msg !== "stale") onToast(msg);
      busyRef.current = false;
      await refresh();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  // Sounds and "your turn", reacting to what just changed.
  useEffect(() => {
    const was = prev.current;
    prev.current = view;
    if (!view?.state || !was?.state || view.version === was.version) return;
    const s = view.state, p = was.state;
    if (view.kind === "ludo") {
      const a = s as LudoState, b = p as LudoState;
      if (a.moves !== b.moves) sfx("dice");
      const hit = a.players.some((pl) => (b.tokens[pl.id] ?? []).some((v, i) => v >= 0 && a.tokens[pl.id][i] === -1));
      if (hit) setTimeout(() => sfx("capture"), 450);
      const stepped = a.players.some((pl) => a.tokens[pl.id].some((v, i) => v > (b.tokens[pl.id]?.[i] ?? v)));
      if (stepped) for (let k = 0; k < 4; k++) setTimeout(() => sfx("hop"), k * ((a.rules ?? DEFAULT_LUDO).fast ? 90 : 170));
    } else {
      const a = s as WhotView, b = p as WhotView;
      if (a.pile.length !== b.pile.length || a.hand.length !== b.hand.length) sfx("card");
    }
    const won = (s as { winner?: string | null }).winner;
    if (won && !(p as { winner?: string | null }).winner) setTimeout(() => sfx("win"), 300);
    if (s.turn === meId && p.turn !== meId && !won) sfx("turn");
  }, [view, meId, sfx]);

  const partner = view?.people.find((p) => p.id !== meId);
  const pname = partner?.name ?? "your partner";
  const bothHere = !!view?.people.every((p) => p.present);
  const s = view?.state;
  const winner = s && "winner" in s ? s.winner : null;
  const over = view?.status === "done" || !!winner || (!!s && "ended" in s && !!s.ended);
  const myTurn = !!s && s.turn === meId && !over;
  const canAct = myTurn && bothHere && !busy;
  const rules = (s && "rules" in s && s.rules) || view?.settings;
  const fast = !!(rules as { fast?: boolean } | undefined)?.fast;

  // Fast mode: a single possible pawn moves itself; with nothing to play in Whot, go to market.
  useEffect(() => {
    if (!fast || !canAct || !s || !view) return;
    if (view.kind === "ludo") {
      const lm = legalMoves(s as LudoState, meId);
      if ((s as LudoState).phase === "move" && lm.length === 1) { const t = setTimeout(() => act({ action: "move", token: lm[0] }), 450); return () => clearTimeout(t); }
    } else if (!(s as WhotView).hand.some((c) => whotCheck(s as WhotView, c))) {
      const t = setTimeout(() => act({ action: "draw" }), 800);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.version, canAct, fast]);

  async function roll() {
    setRolling(true);
    sfx("dice");
    await act({ action: "roll" });
    setTimeout(() => setRolling(false), 250);
  }

  async function saveBet(text: string | null) {
    if (!view) return;
    try {
      if (text && text.trim()) {
        const { iv, ct } = await encryptJSON(vault.encKey, { text: onlyLoveAndAngry(text).trim().slice(0, 160) }, betAad(vault.spaceId, view.id, meId));
        await act({ action: "bet", iv, ct });
      } else await act({ action: "bet" });
      setBetDraft("");
    } catch { onToast("Couldn't save your bet."); }
  }

  async function end() {
    if (!id) return onClose();
    if (view?.status === "playing" && !over && !confirm(`End this ${NAME[kind]} game for both of you?`)) return;
    await api(`/api/live/${id}`, { body: { action: "end" } }).catch(() => {});
    onClose();
  }

  let status = "";
  if (!view) status = "Setting the table…";
  else if (view.status === "lobby") status = !partner?.present ? `Waiting for ${pname} to join. ${partnerPronoun === "They" ? "They've" : `${partnerPronoun}'s`} been notified.`
    : view.ready.includes(meId) ? (view.ready.length === 2 ? "Starting…" : `Waiting for ${pname} to be ready`) : "Choose the rules and your bet, then tap Ready";
  else if (over) status = winner === meId ? "You won!" : winner ? `${pname} won.` : "It's a tie.";
  else if (!bothHere) status = `Paused. Waiting for ${pname} to come back.`;
  else status = myTurn ? "Your turn" : `${pname}'s turn`;

  const iAmHost = view?.createdBy === meId;
  const myBet = bets[meId];
  const theirBet = partner ? bets[partner.id] : undefined;
  const ludoState = view?.kind === "ludo" && s ? (s as LudoState) : null;
  const obj = partnerPronoun === "She" ? "her" : partnerPronoun === "He" ? "him" : "them";

  return (
    <div className={`live live--${kind}`} role="dialog" aria-modal="true" aria-label={`${NAME[kind]}, live`} onPointerDown={firstTap}>
      <header className="live__head glass">
        <button type="button" className="link-btn back-btn" onClick={onClose}>‹ Back</button>
        <h2 className="live__title">{NAME[kind]}</h2>
        <div className="row">
          <button type="button" className="icon-btn" onClick={() => setSoundOpen(true)} aria-label="Music and sounds">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v10.6A4 4 0 1 0 14 17V7h4V3z" /></svg>
          </button>
          <button type="button" className="btn btn--ghost btn--small" onClick={end}>{over ? "Close" : "End"}</button>
        </div>
      </header>

      <div className="live__people">
        {(view?.people ?? []).map((p) => (
          <span key={p.id} className={p.present ? "lp lp--here" : "lp"}>
            {ludoState && <span className="lp__dot" style={{ background: LUDO_HEX[ludoState.players.find((x) => x.id === p.id)?.color ?? "red"] }} />}
            {p.id === meId ? "You" : p.name}
            <small>{view?.status === "lobby" ? (view.ready.includes(p.id) ? "ready" : p.present ? "here" : "away") : p.present ? "here" : "away"}</small>
          </span>
        ))}
      </div>
      <p className={canAct ? "live__status live__status--go" : "live__status"} aria-live="polite">{status}</p>

      {view?.status !== "lobby" && (myBet || theirBet) && (
        <p className="stakes glass">
          <span>You win: <strong>{myBet ?? "no bet"}</strong></span>
          <span>{pname} wins: <strong>{theirBet ?? "no bet"}</strong></span>
        </p>
      )}
      {s && !over && <p className="live__last">{s.last}</p>}

      {view?.status === "lobby" && (
        <div className="lobby">
          <section className="lcard glass">
            <p className="sheet__title">Rules {iAmHost ? "" : `· ${pname} sets these`}</p>
            {view.kind === "ludo"
              ? <LudoSettings value={{ ...DEFAULT_LUDO, ...(view.settings as LudoRules) }} editable={iAmHost} onChange={(v) => act({ action: "settings", settings: v })} />
              : <WhotSettings value={{ ...DEFAULT_WHOT, ...(view.settings as WhotRules) }} editable={iAmHost} onChange={(v) => act({ action: "settings", settings: v })} />}
          </section>
          <section className="lcard glass">
            <p className="sheet__title">The bet</p>
            <p className="hint">If you win, {pname} owes you:</p>
            {myBet ? (
              <div className="betline"><strong>{myBet}</strong><button type="button" className="link-btn" onClick={() => saveBet(null)}>Change</button></div>
            ) : (
              <>
                <div className="chips chips--left">
                  {BET_IDEAS.map((b) => <button key={b} type="button" className="chip" onClick={() => saveBet(b)}>{b}</button>)}
                </div>
                <div className="row">
                  <input className="field field--inline" value={betDraft} maxLength={160} placeholder="Or write your own" onChange={(e) => setBetDraft(e.target.value)} />
                  <button type="button" className="btn" disabled={!betDraft.trim()} onClick={() => saveBet(betDraft)}>Bet</button>
                </div>
              </>
            )}
            <p className="hint">{theirBet ? <>If {pname} wins, you owe {obj}: <strong>{theirBet}</strong></> : `${pname} hasn't placed a bet yet.`}</p>
          </section>
          <button type="button" className={view.ready.includes(meId) ? "btn btn--ghost btn--wide" : "btn btn--wide"}
            onClick={() => { firstTap(); void act({ action: "ready", ready: !view.ready.includes(meId) }); }} disabled={busy}>
            {view.ready.includes(meId) ? "Not ready yet" : "I'm ready"}
          </button>
          <p className="hint">Changing the rules or a bet asks you both to tap Ready again.</p>
        </div>
      )}

      {s && view && view.status !== "lobby" && (
        <div className="live__board">
          {view.kind === "ludo" ? (
            <>
              {use3d
                ? <Ludo3D state={s as LudoState} me={meId} legal={canAct ? legalMoves(s as LudoState, meId) : []} onMove={(token) => act({ action: "move", token })} />
                : <LudoBoard state={s as LudoState} me={meId} legal={canAct ? legalMoves(s as LudoState, meId) : []} onMove={(token) => act({ action: "move", token })} />}
              <div className="live__dice glass">
                {use3d ? <Dice3D value={(s as LudoState).dice} rollId={(s as LudoState).moves} spinning={rolling} /> : <Die value={(s as LudoState).dice} rolling={rolling} />}
                <button type="button" className="btn" onClick={roll} disabled={!canAct || (s as LudoState).phase !== "roll"}>
                  {canAct && (s as LudoState).phase === "move" ? "Tap a glowing pawn" : "Roll"}
                </button>
              </div>
            </>
          ) : use3d ? (
            <Whot3D view={s as WhotView} me={meId} partnerName={pname} canAct={canAct} canPlay={(c: Card) => whotCheck(s as WhotView, c)}
              onPlay={(index, call) => act({ action: "play", index, call })} onDraw={() => act({ action: "draw" })} />
          ) : (
            <WhotTable view={s as WhotView} me={meId} partnerName={pname} canAct={canAct} canPlay={(c: Card) => whotCheck(s as WhotView, c)}
              onPlay={(index, call) => act({ action: "play", index, call })} onDraw={() => act({ action: "draw" })} />
          )}
        </div>
      )}
      {!view && <div className="live__lobby"><span className="live__pulse" aria-hidden="true" /></div>}

      {over && s && (
        <div className="live__result glass">
          <p className="live__result-big">{winner === meId ? "You won" : winner ? `${pname} won` : "A tie"}</p>
          {winner === meId && myBet && <p className="live__owed">{pname} owes you: <strong>{myBet}</strong></p>}
          {winner && winner !== meId && theirBet && <p className="live__owed">You owe {obj}: <strong>{theirBet}</strong></p>}
          {view?.kind === "whot" && (s as WhotView).totals && partner && (
            <p className="hint">Market finished. Hand totals: you {(s as WhotView).totals![meId]}, {pname} {(s as WhotView).totals![partner.id]}.</p>
          )}
          {winner && (myBet || theirBet) && <p className="hint">Saved in Love debts, under Play together.</p>}
          <button type="button" className="btn" onClick={() => { prev.current = null; setView(null); setId(null); }}>Rematch</button>
        </div>
      )}

      {soundOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Music and sounds" onClick={() => setSoundOpen(false)}>
          <div className="sheet-up glass sound-sheet" onClick={(e) => e.stopPropagation()}>
            <p className="sheet__title">Music while you play</p>
            <div className="tracks">
              {TRACKS.map((t) => (
                <button key={t.id} type="button" className={prefs.playing && prefs.track === t.id ? "track track--on" : "track"}
                  onClick={() => updatePrefs({ ...prefs, track: t.id, playing: true })}>
                  <strong>{t.name}</strong><span>{t.mood}</span>
                </button>
              ))}
              <button type="button" className={!prefs.playing ? "track track--on" : "track"} onClick={() => updatePrefs({ ...prefs, playing: false })}>
                <strong>No music</strong><span>a quiet table</span>
              </button>
            </div>
            <label className="label" htmlFor="vol">Music volume</label>
            <input id="vol" type="range" min={0} max={1} step={0.05} value={prefs.music} onChange={(e) => updatePrefs({ ...prefs, music: Number(e.target.value) })} className="range" />
            <label className="check"><input type="checkbox" checked={prefs.sfx} onChange={(e) => updatePrefs({ ...prefs, sfx: e.target.checked })} /> Game sounds (dice, cards, wins)</label>
            <p className="hint">Composed live on your phone: original, free, and never quite the same twice.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ label, on, editable, onChange, a = "On", b = "Off" }: { label: string; on: boolean; editable: boolean; onChange: (v: boolean) => void; a?: string; b?: string }) {
  return (
    <div className="setrow">
      <span>{label}</span>
      <div className="seg">
        <button type="button" className={on ? "seg__on" : ""} disabled={!editable} onClick={() => onChange(true)}>{a}</button>
        <button type="button" className={!on ? "seg__on" : ""} disabled={!editable} onClick={() => onChange(false)}>{b}</button>
      </div>
    </div>
  );
}

function LudoSettings({ value, editable, onChange }: { value: LudoRules; editable: boolean; onChange: (v: LudoRules) => void }) {
  return (
    <div className="settings">
      <Toggle label="Pawns each" on={value.pawns === 2} editable={editable} a="2 · quick" b="4 · classic" onChange={(v) => onChange({ ...value, pawns: v ? 2 : 4 })} />
      <Toggle label="Come out on" on={value.outOn === "six"} editable={editable} a="6 only" b="6 or 1" onChange={(v) => onChange({ ...value, outOn: v ? "six" : "six-or-one" })} />
      <Toggle label="Safe star squares" on={value.safeStars} editable={editable} onChange={(v) => onChange({ ...value, safeStars: v })} />
      <Toggle label="Extra roll after a capture" on={value.captureBonus} editable={editable} onChange={(v) => onChange({ ...value, captureBonus: v })} />
      <Toggle label="Speed" on={value.fast} editable={editable} a="Fast" b="Normal" onChange={(v) => onChange({ ...value, fast: v })} />
      {value.fast && <p className="hint">Fast: quicker hops, and when only one pawn can move it moves itself.</p>}
    </div>
  );
}

function WhotSettings({ value, editable, onChange }: { value: WhotRules; editable: boolean; onChange: (v: WhotRules) => void }) {
  return (
    <div className="settings">
      <div className="setrow">
        <span>Cards each</span>
        <div className="seg">
          {([4, 5, 6] as const).map((n) => <button key={n} type="button" className={value.hand === n ? "seg__on" : ""} disabled={!editable} onClick={() => onChange({ ...value, hand: n })}>{n}</button>)}
        </div>
      </div>
      <Toggle label="5 = pick three" on={value.pickThree} editable={editable} onChange={(v) => onChange({ ...value, pickThree: v })} />
      <Toggle label="Defend 2s and 5s (stacking)" on={value.stack} editable={editable} onChange={(v) => onChange({ ...value, stack: v })} />
      <Toggle label="14 = general market" on={value.generalMarket} editable={editable} onChange={(v) => onChange({ ...value, generalMarket: v })} />
      <Toggle label="1 = hold on" on={value.holdOn} editable={editable} onChange={(v) => onChange({ ...value, holdOn: v })} />
      <Toggle label="8 = suspension" on={value.suspension} editable={editable} onChange={(v) => onChange({ ...value, suspension: v })} />
      <Toggle label="Speed" on={value.fast} editable={editable} a="Fast" b="Normal" onChange={(v) => onChange({ ...value, fast: v })} />
      {value.fast && <p className="hint">Fast: with nothing to play, you go to market automatically.</p>}
    </div>
  );
}
