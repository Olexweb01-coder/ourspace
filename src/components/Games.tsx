"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { decryptJSON, encryptJSON } from "@/lib/crypto-client";
import { LOVE } from "@/lib/emoji";
import {
  DECKS, drawCard, GAME_INFO, matchLine, pickQuestions, questionById,
  type DeckKind, type GameKind,
} from "@/lib/games-bank";
import type { Vault } from "@/lib/vault";
import { betAad } from "@/lib/live/bets";

type DebtRow = { id: string; gameId: string; kind: string; owedBy: string; owedTo: string; iv: string; ct: string; createdAt: string; paidAt: string | null };
type Debt = DebtRow & { text: string };

type Person = { id: string; name: string };
type Props = {
  vault: Vault;
  me: Person;
  partner: Person | null;
  onClose: () => void;
  onToast: (m: string) => void;
  onSendText: (text: string) => Promise<boolean>;
  onChanged: () => void;
  onLive: (kind: "ludo" | "whot") => void;
  partnerLabel: string;   // what you call them; used before they've joined
  focus?: "debts" | null;  // opened from a notification or a card about a debt
  openGame?: string | null; // opened from a card about one quiz
};

type Row = {
  id: string; kind: GameKind; createdBy: string; subject: string | null; iv: string; ct: string;
  createdAt: string; finishedAt: string | null;
  mine: { iv: string; ct: string } | null;
  partnerAnswered: boolean;
  theirs: { memberId: string; iv: string; ct: string } | null;
};
type Game = Omit<Row, "iv" | "ct" | "mine" | "theirs"> & { questions: string[]; mine: number[] | null; theirs: number[] | null };
type View = { screen: "home" } | { screen: "play"; id: string } | { screen: "results"; id: string } | { screen: "deck"; deck: DeckKind };

const setupAad = (spaceId: string, id: string) => `game:${spaceId}:${id}`;

// Every question either of you has played, remembered on this phone so nothing repeats.
const playedKey = (spaceId: string) => `ourspace:played:${spaceId}`;
function readPlayed(spaceId: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(playedKey(spaceId)) || "[]") as string[]); } catch { return new Set(); }
}
function savePlayed(spaceId: string, ids: Iterable<string>) {
  try {
    const all = Array.from(new Set([...readPlayed(spaceId), ...ids]));
    localStorage.setItem(playedKey(spaceId), JSON.stringify(all.slice(-5000)));
  } catch { /* private mode: games still work, just with less memory */ }
}
const answerAad = (spaceId: string, id: string, memberId: string) => `answer:${spaceId}:${id}:${memberId}`;

export default function Games({ vault, me, partner: joined, partnerLabel, onClose, onToast, onSendText, onChanged, onLive, focus = null, openGame = null }: Props) {
  // Before they join, speak of them by name anyway; buttons that need them stay off (see `joined`).
  const partner = joined ?? null;
  const theirName = joined?.name ?? partnerLabel;
  const [games, setGames] = useState<Game[] | null>(null);
  const [view, setView] = useState<View>({ screen: "home" });
  const [busy, setBusy] = useState(false);
  const [debts, setDebts] = useState<Debt[]>([]);

  const loadDebts = useCallback(async () => {
    try {
      const { debts: rows } = await api<{ debts: DebtRow[] }>("/api/live/debts");
      setDebts(await Promise.all(rows.map(async (r) => {
        try { return { ...r, text: (await decryptJSON<{ text: string }>(vault.encKey, r.iv, r.ct, betAad(vault.spaceId, r.gameId, r.owedTo))).text }; }
        catch { return { ...r, text: "(couldn't unlock)" }; }
      })));
    } catch { /* not critical */ }
  }, [vault]);
  useEffect(() => { void loadDebts(); }, [loadDebts]);
  // Opened from a debt notification or card: scroll to Love debts once they're there.
  useEffect(() => {
    if (focus !== "debts" || debts.length === 0) return;
    const t = setTimeout(() => document.getElementById("love-debts")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    return () => clearTimeout(t);
  }, [focus, debts.length]);

  async function settle(d: Debt, action: "paid" | "forgive") {
    try { await api("/api/live/debts", { body: { action, id: d.id } }); await loadDebts(); onToast(action === "paid" ? "Paid with love" : "Let go, with love"); }
    catch (err) { onToast(err instanceof ApiError ? err.message : "Couldn't update that."); }
  }

  const load = useCallback(async () => {
    try {
      const { games: rows } = await api<{ games: Row[] }>("/api/games");
      const out: Game[] = [];
      for (const r of rows) {
        try {
          const setup = await decryptJSON<{ questions: string[] }>(vault.encKey, r.iv, r.ct, setupAad(vault.spaceId, r.id));
          const mine = r.mine ? (await decryptJSON<{ picks: number[] }>(vault.encKey, r.mine.iv, r.mine.ct, answerAad(vault.spaceId, r.id, me.id))).picks : null;
          const theirs = r.theirs ? (await decryptJSON<{ picks: number[] }>(vault.encKey, r.theirs.iv, r.theirs.ct, answerAad(vault.spaceId, r.id, r.theirs.memberId))).picks : null;
          out.push({ id: r.id, kind: r.kind, createdBy: r.createdBy, subject: r.subject, createdAt: r.createdAt, finishedAt: r.finishedAt, partnerAnswered: r.partnerAnswered, questions: setup.questions, mine, theirs });
        } catch { /* skip anything that won't unlock */ }
      }
      savePlayed(vault.spaceId, out.flatMap((g) => g.questions));
      setGames(out);
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : "Couldn't open games. Check your connection.");
    }
  }, [vault, me.id, onToast]);

  useEffect(() => { void load(); }, [load]);

  async function start(kind: GameKind) {
    if (!partner) return onToast("Games need two players. Invite your partner first.");
    setBusy(true);
    try {
      const played = new Set([...readPlayed(vault.spaceId), ...(games ?? []).flatMap((g) => g.questions)]);
      const questions = pickQuestions(kind, played);
      savePlayed(vault.spaceId, questions);
      const id = crypto.randomUUID();
      const { iv, ct } = await encryptJSON(vault.encKey, { questions }, setupAad(vault.spaceId, id));
      await api("/api/games", { body: { action: "start", id, kind, iv, ct } });
      await load();
      onChanged();
      setView({ screen: "play", id });
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : "Couldn't start the game. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(game: Game, picks: number[]) {
    setBusy(true);
    try {
      const { iv, ct } = await encryptJSON(vault.encKey, { picks }, answerAad(vault.spaceId, game.id, me.id));
      await api("/api/games", { body: { action: "answer", id: game.id, iv, ct } });
      await load();
      onChanged();
      setView(game.partnerAnswered ? { screen: "results", id: game.id } : { screen: "home" });
      if (!game.partnerAnswered) onToast(`Sent. ${theirName} will be told it's their turn.`);
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : "Couldn't send your answers. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(game: Game) {
    if (!confirm("Remove this game for both of you?")) return;
    try {
      await api("/api/games", { body: { action: "delete", id: game.id } });
      await load();
      onChanged();
      setView({ screen: "home" });
    } catch {
      onToast("Couldn't remove it. Try again.");
    }
  }

  const find = (id: string) => games?.find((g) => g.id === id) ?? null;
  // Opened from a quiz card: go straight to that quiz (to answer it, or to see the results).
  const openedGame = useRef<string | null>(null);
  useEffect(() => {
    if (!openGame || !games || openedGame.current === openGame) return;
    openedGame.current = openGame;
    const g = games.find((x) => x.id === openGame);
    if (!g) { onToast("That game has finished."); return; }
    setView(g.mine ? (g.theirs ? { screen: "results", id: g.id } : { screen: "home" }) : { screen: "play", id: g.id });
  }, [openGame, games, onToast]);
  const nameOf = (id: string | null) => (id === me.id ? me.name : theirName);
  const title = view.screen === "deck" ? DECKS[view.deck].title
    : view.screen === "home" ? "Play together"
    : GAME_INFO[find(view.id)?.kind ?? "wyr"].title;

  return (
    <div className="planner games" role="dialog" aria-modal="true" aria-label="Games">
      <header className="planner__head">
        {view.screen === "home"
          ? <h2 className="planner__title">{title}</h2>
          : <button type="button" className="link-btn back-btn" onClick={() => setView({ screen: "home" })}>‹ Games</button>}
        <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>Done</button>
      </header>
      <div className="planner__body">
        {!games ? <p className="hint">Setting up the games…</p>
          : view.screen === "home" ? <Home games={games} me={me} partner={partner} theirName={theirName} busy={busy} start={start} onLive={onLive} debts={debts} settle={settle} open={(g) => setView(g.mine ? (g.theirs ? { screen: "results", id: g.id } : { screen: "home" }) : { screen: "play", id: g.id })} deck={(d) => setView({ screen: "deck", deck: d })} nameOf={nameOf} />
          : view.screen === "play" && find(view.id) ? <Play key={view.id} game={find(view.id)!} me={me} partner={partner} busy={busy} submit={submit} nameOf={nameOf} />
          : view.screen === "results" && find(view.id) ? <Results game={find(view.id)!} me={me} partner={partner} nameOf={nameOf} remove={remove} />
          : view.screen === "deck" ? <Deck deck={view.deck} spaceId={vault.spaceId} partner={partner} onSendText={onSendText} onToast={onToast} />
          : <p className="hint">That game is gone.</p>}
      </div>
    </div>
  );
}

function scoreOf(g: Game): number {
  if (!g.mine || !g.theirs) return 0;
  return g.questions.reduce((n, _, i) => n + (g.mine![i] === g.theirs![i] ? 1 : 0), 0);
}

function Home({ games, me, partner, theirName, busy, start, open, deck, nameOf, onLive, debts, settle }: {
  games: Game[]; me: Person; partner: Person | null; theirName: string; busy: boolean; onLive: (k: "ludo" | "whot") => void;
  debts: Debt[]; settle: (d: Debt, a: "paid" | "forgive") => void;
  start: (k: GameKind) => void; open: (g: Game) => void; deck: (d: DeckKind) => void; nameOf: (id: string | null) => string;
}) {
  const yourTurn = games.filter((g) => !g.mine);
  const waiting = games.filter((g) => g.mine && !g.partnerAnswered && !g.finishedAt);
  const done = games.filter((g) => g.mine && g.theirs).slice(0, 12);
  const pname = theirName;
  return (
    <>
      {yourTurn.length > 0 && (
        <section className="gsec">
          <p className="sheet__title">Your turn</p>
          {yourTurn.map((g) => (
            <button key={g.id} type="button" className="gtile gtile--turn" onClick={() => open(g)}>
              <strong>{GAME_INFO[g.kind].title}</strong>
              <span className="hint">{g.kind === "know" && g.subject !== me.id ? `Guess ${nameOf(g.subject)}'s answers` : g.createdBy === me.id ? "You started this. Answer first." : `${nameOf(g.createdBy)} is waiting for you`}</span>
            </button>
          ))}
        </section>
      )}
      {waiting.length > 0 && (
        <section className="gsec">
          <p className="sheet__title">Waiting for {pname}</p>
          {waiting.map((g) => (
            <div key={g.id} className="gtile gtile--wait">
              <strong>{GAME_INFO[g.kind].title}</strong>
              <span className="hint">Your answers are in. Results appear when {pname} has played.</span>
            </div>
          ))}
        </section>
      )}

      <section className="gsec">
        <p className="sheet__title">Play live</p>
        <div className="deck-row deck-row--two">
          <button type="button" className="deck-tile deck-tile--ludo" disabled={!partner} onClick={() => onLive("ludo")}>
            <strong>Ludo</strong><span>Real board, real dice</span>
          </button>
          <button type="button" className="deck-tile deck-tile--whot" disabled={!partner} onClick={() => onLive("whot")}>
            <strong>Whot</strong><span>Naija rules</span>
          </button>
        </div>
        <p className="hint">{partner ? `Live games only move while you're both here. ${partner.name} gets a notification to join.` : `These open once ${theirName} joins. Send the invite link from Settings.`}</p>
      </section>

      {debts.length > 0 && (
        <section className="gsec" id="love-debts">
          <p className="sheet__title">Love debts</p>
          {debts.slice(0, 12).map((d) => {
            const owedToMe = d.owedTo === me.id;
            return (
              <div key={d.id} className={d.paidAt ? "debt debt--paid" : owedToMe ? "debt debt--mine" : "debt"}>
                <span className="debt__text">
                  <small>{owedToMe ? `${theirName} owes you` : `You owe ${theirName}`} · {d.kind === "ludo" ? "Ludo" : "Whot"}</small>
                  <strong>{d.text}</strong>
                </span>
                {d.paidAt ? <span className="debt__paid">Paid</span>
                  : owedToMe ? (
                    <span className="debt__actions">
                      <button type="button" className="btn btn--small" onClick={() => settle(d, "paid")}>Paid</button>
                      <button type="button" className="link-btn link-btn--quiet" onClick={() => settle(d, "forgive")}>Let go</button>
                    </span>
                  ) : <span className="debt__paid debt__paid--due">Due</span>}
              </div>
            );
          })}
        </section>
      )}

      <section className="gsec">
        <p className="sheet__title">New game</p>
        {(Object.keys(GAME_INFO) as GameKind[]).map((k) => (
          <button key={k} type="button" className="gtile" disabled={busy || !partner} onClick={() => start(k)}>
            <strong>{GAME_INFO[k].title}</strong>
            <span className="hint">{k === "know" ? `You answer about yourself. ${pname} guesses.` : GAME_INFO[k].lead}</span>
          </button>
        ))}
        {!partner && <p className="hint">Games need two players. Invite your partner first.</p>}
      </section>

      <section className="gsec">
        <p className="sheet__title">Cards</p>
        <div className="deck-row">
          {(Object.keys(DECKS) as DeckKind[]).map((d) => (
            <button key={d} type="button" className={`deck-tile deck-tile--${d}`} onClick={() => deck(d)}>
              <strong>{DECKS[d].title}</strong>
              <span>{DECKS[d].cards.length} cards</span>
            </button>
          ))}
        </div>
      </section>

      {done.length > 0 && (
        <section className="gsec">
          <p className="sheet__title">Results</p>
          {done.map((g) => (
            <button key={g.id} type="button" className="gtile gtile--row" onClick={() => open(g)}>
              <span><strong>{GAME_INFO[g.kind].title}</strong><span className="hint">{new Date(g.finishedAt ?? g.createdAt).toLocaleDateString([], { day: "numeric", month: "short" })}</span></span>
              <span className="score-chip">{scoreOf(g)}/{g.questions.length}</span>
            </button>
          ))}
        </section>
      )}
    </>
  );
}

function Play({ game, me, busy, submit, nameOf }: {
  game: Game; me: Person; partner: Person | null; busy: boolean;
  submit: (g: Game, picks: number[]) => void; nameOf: (id: string | null) => string;
}) {
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<number[]>([]);
  const total = game.questions.length;
  const q = questionById(game.questions[Math.min(i, total - 1)]);
  const aboutMe = game.kind === "know" && game.subject === me.id;
  const guessing = game.kind === "know" && game.subject !== me.id;
  const finished = picks.length === total;

  if (!q) return <p className="hint">This game uses questions this version doesn&apos;t have. Remove it and start a new one.</p>;

  return (
    <div className="play">
      <div className="play__progress" aria-label={`Question ${Math.min(i + 1, total)} of ${total}`}>
        {game.questions.map((_, n) => <span key={n} className={n < picks.length ? "on" : n === i ? "now" : ""} />)}
      </div>
      {!finished ? (
        <>
          <p className="play__kicker">{aboutMe ? "Answer about yourself" : guessing ? `What would ${nameOf(game.subject)} pick?` : `${i + 1} of ${total}`}</p>
          <p className="play__q">{game.kind === "know" ? q.q : game.kind === "wyr" ? "Would you rather…" : "This or that?"}</p>
          <div className={q.options.length === 2 ? "opts opts--two" : "opts"}>
            {q.options.map((o, n) => (
              <button key={n} type="button" className={picks[i] === n ? "opt opt--on" : "opt"}
                onClick={() => { const next = [...picks.slice(0, i), n]; setPicks(next); setI(Math.min(i + 1, total)); }}>
                {o}
              </button>
            ))}
          </div>
          {i > 0 && <button type="button" className="link-btn link-btn--quiet" onClick={() => { setI(i - 1); setPicks(picks.slice(0, i - 1)); }}>Back</button>}
        </>
      ) : (
        <div className="play__done">
          <p className="play__q">All answered.</p>
          <p className="hint">Once you send, your answers are locked in. The results appear when you&apos;ve both played.</p>
          <button type="button" className="btn btn--wide" disabled={busy} onClick={() => submit(game, picks)}>{busy ? "Sending…" : "Send my answers"}</button>
          <button type="button" className="link-btn link-btn--quiet" onClick={() => { setI(total - 1); setPicks(picks.slice(0, total - 1)); }}>Change the last one</button>
        </div>
      )}
    </div>
  );
}

function Results({ game, me, partner, nameOf, remove }: {
  game: Game; me: Person; partner: Person | null; nameOf: (id: string | null) => string; remove: (g: Game) => void;
}) {
  const score = scoreOf(game);
  const total = game.questions.length;
  const subjectName = nameOf(game.subject);
  const iAmSubject = game.subject === me.id;
  const pname = partner?.name ?? "Your partner";
  const headline = game.kind === "know"
    ? iAmSubject ? `${pname} knows you ${score} of ${total}` : `You know ${subjectName} ${score} of ${total}`
    : `You matched ${score} of ${total}`;
  return (
    <div className="results">
      <p className="results__score">{score}<span>/{total}</span></p>
      <p className="results__head">{headline}</p>
      <p className="hint">{matchLine(score, total, game.kind, subjectName, iAmSubject ? pname : undefined)}</p>
      <ul className="plist">
        {game.questions.map((qid, n) => {
          const q = questionById(qid);
          if (!q || !game.mine || !game.theirs) return null;
          const same = game.mine[n] === game.theirs[n];
          const mineLabel = game.kind === "know" ? (iAmSubject ? "Your answer" : "Your guess") : "You";
          const theirLabel = game.kind === "know" ? (iAmSubject ? `${pname}'s guess` : `${subjectName}'s answer`) : pname;
          return (
            <li key={qid} className={same ? "pitem ritem ritem--same" : "pitem ritem"}>
              <div className="pitem__main">
                <span className="hint">{game.kind === "know" ? q.q : q.q}</span>
                <span><strong>{mineLabel}:</strong> {q.options[game.mine[n]] ?? "?"}</span>
                <span><strong>{theirLabel}:</strong> {q.options[game.theirs[n]] ?? "?"}</span>
              </div>
              {same && <span className="ritem__heart" aria-label="Match">{LOVE}</span>}
            </li>
          );
        })}
      </ul>
      <button type="button" className="link-btn link-btn--quiet" onClick={() => remove(game)}>Remove this game</button>
    </div>
  );
}

function Deck({ deck, spaceId, partner, onSendText, onToast }: {
  deck: DeckKind; spaceId: string; partner: Person | null; onSendText: (t: string) => Promise<boolean>; onToast: (m: string) => void;
}) {
  const d = DECKS[deck];
  const key = `ourspace:cards:${spaceId}:${deck}`;
  // Cards you've drawn are remembered, so the deck only starts over once you've seen every card.
  const [seen, setSeen] = useState<Set<number>>(() => {
    try {
      const s = new Set<number>(JSON.parse(localStorage.getItem(key) || "[]") as number[]);
      return s.size >= d.cards.length ? new Set() : s;
    } catch { return new Set(); }
  });
  const [card, setCard] = useState<number>(() => drawCard(deck, seen));
  const [sending, setSending] = useState(false);
  useEffect(() => {
    setSeen((prev) => {
      const next = new Set(prev).add(card);
      const toSave = next.size >= d.cards.length ? new Set<number>([card]) : next;
      try { localStorage.setItem(key, JSON.stringify(Array.from(toSave))); } catch { /* ignore */ }
      return toSave;
    });
  }, [card, key, d.cards.length]);

  async function send() {
    if (!partner) return onToast("Invite your partner first.");
    setSending(true);
    const ok = await onSendText(`${d.prefix}: ${d.cards[card]}`);
    setSending(false);
    if (ok) { onToast(`Sent to ${partner.name}`); setCard(drawCard(deck, seen)); }
  }

  return (
    <div className="deck">
      <p className="hint">{d.lead}</p>
      <div className={`card card--${deck}`} key={card}>
        <p className="card__kicker">{d.title}</p>
        <p className="card__text">{d.cards[card]}</p>
      </div>
      <div className="row row--center">
        <button type="button" className="btn" disabled={sending || !partner} onClick={send}>{sending ? "Sending…" : `Send to ${partner?.name ?? "your partner"}`}</button>
        <button type="button" className="btn btn--ghost" onClick={() => setCard(drawCard(deck, seen))}>Another one</button>
      </div>
      <p className="hint">{seen.size} of {d.cards.length} seen</p>
    </div>
  );
}
