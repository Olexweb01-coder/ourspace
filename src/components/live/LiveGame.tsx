"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { legalMoves, type LudoState } from "@/lib/live/ludo";
import { canPlay as whotCanPlay, type Card } from "@/lib/live/whot";
import LudoBoard, { Die, LUDO_HEX } from "./LudoBoard";
import WhotTable, { type WhotView } from "./WhotTable";

type Kind = "ludo" | "whot";
type Person = { id: string; name: string; present: boolean };
type View = { id: string; kind: Kind; status: "lobby" | "playing" | "done"; version: number; createdBy: string; people: Person[]; state: LudoState | WhotView | null };

type Props = { kind: Kind; gameId?: string; meId: string; partnerPronoun?: string; onClose: () => void; onToast: (m: string) => void };
const NAME: Record<Kind, string> = { ludo: "Ludo", whot: "Whot" };
const POLL_MS = 1000;

// A live table: moves show on both phones within a second, and nothing moves unless you're both here.
export default function LiveGame({ kind, gameId, meId, partnerPronoun = "They", onClose, onToast }: Props) {
  const [id, setId] = useState<string | null>(gameId ?? null);
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [rolling, setRolling] = useState(false);
  const busyRef = useRef(false);

  // Open (or join) the table.
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

  // Being on this screen is "I'm here". Leaving or locking the phone pauses the game for both.
  useEffect(() => {
    if (!id) return;
    void refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, POLL_MS);
    return () => clearInterval(t);
  }, [id, refresh]);

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

  async function roll() {
    setRolling(true);
    await act({ action: "roll" });
    setTimeout(() => setRolling(false), 350);
  }

  async function end() {
    if (!id) return onClose();
    if (view?.status === "playing" && !confirm(`End this ${NAME[kind]} game for both of you?`)) return;
    await api(`/api/live/${id}`, { body: { action: "end" } }).catch(() => {});
    onClose();
  }

  const partner = view?.people.find((p) => p.id !== meId);
  const pname = partner?.name ?? "your partner";
  const bothHere = !!view?.people.every((p) => p.present);
  const s = view?.state;
  const winner = s && "winner" in s ? s.winner : null;
  const over = view?.status === "done" || !!winner || (s && "ended" in s && !!s.ended);
  const myTurn = !!s && s.turn === meId && !over;
  const canAct = myTurn && bothHere && !busy;

  let status = "";
  if (!view || view.status === "lobby") status = partner?.present ? "Starting…" : `Waiting for ${pname} to join. ${partnerPronoun === "They" ? "They've" : `${partnerPronoun}'s`} been notified.`;
  else if (over) status = winner === meId ? "You won!" : winner ? `${pname} won.` : "It's a tie.";
  else if (!bothHere) status = `Paused. Waiting for ${pname} to come back.`;
  else status = myTurn ? "Your turn" : `${pname}'s turn`;

  return (
    <div className="live" role="dialog" aria-modal="true" aria-label={`${NAME[kind]}, live`}>
      <header className="live__head">
        <button type="button" className="link-btn back-btn" onClick={onClose}>‹ Back</button>
        <h2 className="live__title">{NAME[kind]}</h2>
        <button type="button" className="btn btn--ghost btn--small" onClick={end}>{over ? "Close" : "End"}</button>
      </header>

      <div className="live__people">
        {(view?.people ?? []).map((p) => (
          <span key={p.id} className={p.present ? "lp lp--here" : "lp"}>
            {kind === "ludo" && s && "players" in s && Array.isArray(s.players) && typeof s.players[0] === "object" && (
              <span className="lp__dot" style={{ background: LUDO_HEX[(s as LudoState).players.find((x) => x.id === p.id)?.color ?? "red"] }} />
            )}
            {p.id === meId ? "You" : p.name}
            <small>{p.present ? "here" : "away"}</small>
          </span>
        ))}
      </div>

      <p className={canAct ? "live__status live__status--go" : "live__status"} aria-live="polite">{status}</p>
      {s && !over && <p className="live__last">{s.last}</p>}

      <div className="live__board">
        {s && view?.kind === "ludo" && (
          <>
            <LudoBoard state={s as LudoState} me={meId} legal={canAct ? legalMoves(s as LudoState, meId) : []}
              onMove={(token) => act({ action: "move", token })} />
            <div className="live__dice">
              <Die value={(s as LudoState).dice} rolling={rolling} />
              <button type="button" className="btn" onClick={roll} disabled={!canAct || (s as LudoState).phase !== "roll"}>
                {canAct && (s as LudoState).phase === "move" ? "Tap a token to move" : "Roll"}
              </button>
            </div>
          </>
        )}
        {s && view?.kind === "whot" && (
          <WhotTable view={s as WhotView} me={meId} partnerName={pname} canAct={canAct}
            canPlay={(c: Card) => whotCanPlay({ ...(s as WhotView), hands: {}, deck: [], moves: 0 } as never, c)}
            onPlay={(index, call) => act({ action: "play", index, call })}
            onDraw={() => act({ action: "draw" })} />
        )}
        {!s && <div className="live__lobby"><span className="live__pulse" aria-hidden="true" /><p>Keep this open. The game starts as soon as {pname} joins.</p></div>}
      </div>

      {over && s && (
        <div className="live__result">
          <p className="live__result-big">{winner === meId ? "You won" : winner ? `${pname} won` : "A tie"}</p>
          {view?.kind === "whot" && (s as WhotView).totals && (
            <p className="hint">Market finished. Hand totals: you {(s as WhotView).totals![meId]}, {pname} {partner ? (s as WhotView).totals![partner.id] : ""}.</p>
          )}
          <button type="button" className="btn" onClick={() => { setView(null); setId(null); }}>Play again</button>
        </div>
      )}
    </div>
  );
}
