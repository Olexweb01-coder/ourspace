"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { decryptJSON, encryptJSON } from "@/lib/crypto-client";
import {
  addDays, countdownLabel, daysBetween, EMPTY_CYCLE, nextOccurrence, plannerAad, predictCycle,
  type CycleData, type DayKind,
} from "@/lib/planner";
import type { Vault } from "@/lib/vault";

type Person = { id: string; name: string };
type Props = {
  vault: Vault;
  me: Person;
  partner: Person | null;
  today: string;
  onClose: () => void;
  onChanged: () => void;
  onToast: (m: string) => void;
};

type DayRow = { id: string; kind: DayKind; aboutMember: string | null; month: number; day: number; startYear: number | null; iv: string; ct: string };
type GoalRow = { id: string; createdBy: string; dueOn: string | null; doneAt: string | null; doneBy: string | null; iv: string; ct: string; createdAt: string };
type TopicRow = { id: string; createdBy: string; remindAt: string | null; remindBoth: boolean; remindedAt: string | null; discussedAt: string | null; iv: string; ct: string; createdAt: string };
type CycleRow = { memberId: string; iv: string; ct: string };
type Loaded = {
  days: (DayRow & { title: string; note: string })[];
  goals: (GoalRow & { title: string })[];
  topics: (TopicRow & { text: string })[];
  cycles: Record<string, CycleData>;
};

const TABS = [
  { key: "days", label: "Days" },
  { key: "cycle", label: "Cycle" },
  { key: "goals", label: "Goals" },
  { key: "talk", label: "Talk" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const prettyDate = (m: number, d: number) => `${d} ${MONTHS[m - 1]}`;
const prettyDay = (day: string) => prettyDate(Number(day.slice(5, 7)), Number(day.slice(8, 10)));
const localAt = (day: string, hour: number) => new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hour, 0).toISOString();

export default function Planner({ vault, me, partner, today, onClose, onChanged, onToast }: Props) {
  const [tab, setTab] = useState<Tab>("days");
  const [data, setData] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const raw = await api<{ specialDays: DayRow[]; goals: GoalRow[]; topics: TopicRow[]; cycles: CycleRow[] }>("/api/planner");
      const dec = async <T,>(what: "day" | "goal" | "topic" | "cycle", id: string, iv: string, ct: string): Promise<T | null> => {
        try { return await decryptJSON<T>(vault.encKey, iv, ct, plannerAad(what, vault.spaceId, id)); } catch { return null; }
      };
      const days = await Promise.all(raw.specialDays.map(async (d) => {
        const p = await dec<{ title: string; note: string }>("day", d.id, d.iv, d.ct);
        return { ...d, title: p?.title ?? "", note: p?.note ?? "" };
      }));
      const goals = await Promise.all(raw.goals.map(async (g) => ({ ...g, title: (await dec<{ title: string }>("goal", g.id, g.iv, g.ct))?.title ?? "(couldn't unlock)" })));
      const topics = await Promise.all(raw.topics.map(async (t) => ({ ...t, text: (await dec<{ text: string }>("topic", t.id, t.iv, t.ct))?.text ?? "(couldn't unlock)" })));
      const cycles: Record<string, CycleData> = {};
      for (const c of raw.cycles) {
        const p = await dec<CycleData>("cycle", c.memberId, c.iv, c.ct);
        if (p) cycles[c.memberId] = { ...EMPTY_CYCLE, ...p };
      }
      setData({ days, goals, topics, cycles });
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : "Couldn't open the planner. Check your connection.");
    }
  }, [vault, onToast]);

  useEffect(() => { void load(); }, [load]);

  async function act(body: Record<string, unknown>, done?: string) {
    setBusy(true);
    try {
      await api("/api/planner", { body });
      await load();
      onChanged();
      if (done) onToast(done);
      return true;
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : "Couldn't save that. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const seal = (what: "day" | "goal" | "topic" | "cycle", id: string, value: unknown) =>
    encryptJSON(vault.encKey, value, plannerAad(what, vault.spaceId, id));

  return (
    <div className="planner" role="dialog" aria-modal="true" aria-label="Our days and plans">
      <header className="planner__head">
        <h2 className="planner__title">Us, planned</h2>
        <button type="button" className="btn btn--ghost btn--small" onClick={onClose}>Done</button>
      </header>
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? "tab tab--on" : "tab"} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="planner__body">
        {!data ? <p className="hint">Unlocking your plans…</p>
          : tab === "days" ? <DaysTab data={data} me={me} partner={partner} today={today} busy={busy} act={act} seal={seal} />
          : tab === "cycle" ? <CycleTab data={data} me={me} partner={partner} today={today} busy={busy} act={act} seal={seal} />
          : tab === "goals" ? <GoalsTab data={data} me={me} partner={partner} today={today} busy={busy} act={act} seal={seal} />
          : <TalkTab data={data} me={me} partner={partner} today={today} busy={busy} act={act} seal={seal} />}
      </div>
    </div>
  );
}

type TabProps = {
  data: Loaded;
  me: Person;
  partner: Person | null;
  today: string;
  busy: boolean;
  act: (body: Record<string, unknown>, done?: string) => Promise<boolean>;
  seal: (what: "day" | "goal" | "topic" | "cycle", id: string, value: unknown) => Promise<{ iv: string; ct: string }>;
};

// ---------------- special days ----------------
type DayDraft = { id: string; kind: DayKind; about: string; date: string; yearKnown: boolean; title: string; note: string };

function DaysTab({ data, me, partner, today, busy, act, seal }: TabProps) {
  const [draft, setDraft] = useState<DayDraft | null>(null);
  const nameOf = (id: string | null) => (id === me.id ? me.name : id === partner?.id ? partner.name : "");

  const sorted = useMemo(() => data.days
    .map((d) => {
      const occ = nextOccurrence(d.month, d.day, today);
      return { ...d, occ, left: daysBetween(today, occ) };
    })
    .sort((a, b) => a.left - b.left), [data.days, today]);

  const has = (kind: DayKind, about?: string) => data.days.some((d) => d.kind === kind && (!about || d.aboutMember === about));
  const start = (kind: DayKind, about = "", existing?: (typeof sorted)[number]) => setDraft(existing ? {
    id: existing.id, kind: existing.kind, about: existing.aboutMember ?? "", yearKnown: !!existing.startYear,
    date: `${existing.startYear ?? today.slice(0, 4)}-${String(existing.month).padStart(2, "0")}-${String(existing.day).padStart(2, "0")}`,
    title: existing.title, note: existing.note,
  } : { id: crypto.randomUUID(), kind, about, date: "", yearKnown: kind !== "special", title: "", note: "" });

  async function save() {
    if (!draft) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return;
    const month = Number(draft.date.slice(5, 7));
    const day = Number(draft.date.slice(8, 10));
    const title = draft.title.trim() || (draft.kind === "birthday" ? `${nameOf(draft.about)}'s birthday` : draft.kind === "anniversary" ? "Our anniversary" : "");
    if (!title) return;
    const { iv, ct } = await seal("day", draft.id, { title, note: draft.note.trim() });
    const ok = await act({
      action: "saveDay", id: draft.id, kind: draft.kind, aboutMember: draft.kind === "birthday" ? draft.about : null,
      month, day, startYear: draft.yearKnown ? Number(draft.date.slice(0, 4)) : null, iv, ct,
    }, "Saved. We'll never let it slip by.");
    if (ok) setDraft(null);
  }

  if (draft) {
    return (
      <div className="pform">
        <div className="chips chips--left">
          {(["birthday", "anniversary", "special"] as const).map((k) => (
            <button key={k} type="button" className={draft.kind === k ? "chip chip--on" : "chip"} onClick={() => setDraft({ ...draft, kind: k })}>
              {k === "birthday" ? "Birthday" : k === "anniversary" ? "Anniversary" : "Special day"}
            </button>
          ))}
        </div>
        {draft.kind === "birthday" && (
          <div className="chips chips--left">
            {[me, partner].filter((p): p is Person => !!p).map((p) => (
              <button key={p.id} type="button" className={draft.about === p.id ? "chip chip--on" : "chip"} onClick={() => setDraft({ ...draft, about: p.id })}>
                {p.id === me.id ? "Mine" : `${p.name}'s`}
              </button>
            ))}
          </div>
        )}
        <label className="label" htmlFor="pd-date">Date</label>
        <input id="pd-date" className="field" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        <label className="check">
          <input type="checkbox" checked={draft.yearKnown} onChange={(e) => setDraft({ ...draft, yearKnown: e.target.checked })} />
          {draft.kind === "birthday" ? "Include the year (to show the age)" : draft.kind === "anniversary" ? "Include the year (to count the years together)" : "The year matters"}
        </label>
        <label className="label" htmlFor="pd-title">{draft.kind === "special" ? "What is it?" : "Name (optional)"}</label>
        <input id="pd-title" className="field" value={draft.title} maxLength={80}
          placeholder={draft.kind === "special" ? "The day we first met" : draft.kind === "birthday" ? `${nameOf(draft.about) || "Their"}'s birthday` : "Our anniversary"}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <label className="label" htmlFor="pd-note">A note for yourselves (optional)</label>
        <textarea id="pd-note" className="field" rows={2} maxLength={400} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        <div className="row">
          <button type="button" className="btn" onClick={save}
            disabled={busy || !draft.date || (draft.kind === "birthday" && !draft.about) || (draft.kind === "special" && !draft.title.trim())}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setDraft(null)}>Cancel</button>
        </div>
        <p className="hint">The name and note are encrypted. To remind you on time, the server knows the date.</p>
      </div>
    );
  }

  return (
    <>
      <div className="quick">
        {!has("birthday", me.id) && <button type="button" className="chip" onClick={() => start("birthday", me.id)}>+ Your birthday</button>}
        {partner && !has("birthday", partner.id) && <button type="button" className="chip" onClick={() => start("birthday", partner.id)}>+ {partner.name}&apos;s birthday</button>}
        {!has("anniversary") && <button type="button" className="chip" onClick={() => start("anniversary")}>+ Your anniversary</button>}
        <button type="button" className="chip" onClick={() => start("special")}>+ Another special day</button>
      </div>
      {sorted.length === 0 && <p className="hint">Add the days that matter. You&apos;ll both be reminded a week before, the day before, and celebrated on the day.</p>}
      <ul className="plist">
        {sorted.map((d) => {
          const years = d.startYear ? Number(d.occ.slice(0, 4)) - d.startYear : null;
          const extra = d.kind === "birthday" && years ? `turns ${years}` : d.kind === "anniversary" && years ? `${years} ${years === 1 ? "year" : "years"} together` : "";
          return (
            <li key={d.id} className={d.left === 0 ? "pitem pitem--today" : "pitem"}>
              <div className="pitem__main">
                <strong>{d.title || (d.kind === "birthday" ? `${nameOf(d.aboutMember)}'s birthday` : "Special day")}</strong>
                <span className="hint">{prettyDate(d.month, d.day)}{extra ? `, ${extra}` : ""}{d.note ? ` · ${d.note}` : ""}</span>
              </div>
              <span className="countdown">{countdownLabel(d.left)}</span>
              <div className="pitem__actions">
                <button type="button" className="link-btn" onClick={() => start(d.kind, d.aboutMember ?? "", d)}>Edit</button>
                <button type="button" className="link-btn link-btn--quiet" onClick={() => { if (confirm("Remove this day?")) void act({ action: "deleteDay", id: d.id }, "Removed"); }}>Remove</button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ---------------- cycle ----------------
function CycleTab({ data, me, partner, today, busy, act, seal }: TabProps) {
  const mine = data.cycles[me.id] ?? EMPTY_CYCLE;
  const [logDate, setLogDate] = useState(today);
  const prediction = predictCycle(mine, today);
  const theirs = partner ? data.cycles[partner.id] : undefined;
  const theirPrediction = theirs?.share ? predictCycle(theirs, today) : null;

  async function save(next: CycleData, done?: string) {
    const p = predictCycle(next, today);
    const care: { who: "self" | "partner"; at: string }[] = [];
    if (next.remind && p && p.daysUntilNext >= 0) {
      const selfDay = addDays(p.nextStart, -2);
      const partnerDay = addDays(p.nextStart, -1);
      if (selfDay >= today) care.push({ who: "self", at: localAt(selfDay, 9) });
      if (next.share && partner && partnerDay >= today) care.push({ who: "partner", at: localAt(partnerDay, 9) });
    }
    const { iv, ct } = await seal("cycle", me.id, next);
    await act({ action: "saveCycle", iv, ct, care }, done);
  }

  const summary = (p: NonNullable<ReturnType<typeof predictCycle>>, who: string) =>
    p.inPeriod ? `Day ${p.periodDay} of ${who} period.`
      : p.daysUntilNext > 0 ? `Next period expected around ${prettyDay(p.nextStart)}, ${countdownLabel(p.daysUntilNext)}.`
      : p.daysUntilNext === 0 ? "Next period expected around today."
      : `Expected around ${prettyDay(p.nextStart)}, ${-p.daysUntilNext} ${p.daysUntilNext === -1 ? "day" : "days"} ago.`;

  return (
    <>
      {theirPrediction && partner && (
        <div className="care-card">
          <p><strong>{partner.name}</strong></p>
          <p>{summary(theirPrediction, `${partner.name}'s`)}</p>
          <p className="hint">Shared by {partner.name}. Cycles average {theirPrediction.avgCycle} days.</p>
        </div>
      )}

      <div className="pform">
        <p className="sheet__title">Your cycle</p>
        <p className="hint">Only if this applies to you. Every date is encrypted on your phone.</p>
        {prediction && <div className="care-card"><p>{summary(prediction, "your")}</p><p className="hint">Your cycles average {prediction.avgCycle} days.</p></div>}

        <label className="label" htmlFor="cy-date">A period started on</label>
        <div className="row">
          <input id="cy-date" className="field field--inline" type="date" max={today} value={logDate} onChange={(e) => setLogDate(e.target.value)} />
          <button type="button" className="btn" disabled={busy || !logDate || mine.starts.includes(logDate) || logDate > today}
            onClick={() => save({ ...mine, starts: [...mine.starts, logDate].sort().slice(-24) }, "Logged")}>
            Log it
          </button>
        </div>

        {mine.starts.length > 0 && (
          <ul className="plist plist--tight">
            {[...mine.starts].sort().reverse().slice(0, 8).map((s) => (
              <li key={s} className="pitem">
                <div className="pitem__main"><span>{prettyDay(s)} {s.slice(0, 4)}</span></div>
                <button type="button" className="link-btn link-btn--quiet" onClick={() => save({ ...mine, starts: mine.starts.filter((x) => x !== s) })}>Remove</button>
              </li>
            ))}
          </ul>
        )}

        <label className="label" htmlFor="cy-len">Usually lasts</label>
        <select id="cy-len" className="field field--inline" value={mine.periodLength} onChange={(e) => save({ ...mine, periodLength: Number(e.target.value) })}>
          {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} days</option>)}
        </select>

        {partner && (
          <label className="check">
            <input type="checkbox" checked={mine.share} onChange={(e) => save({ ...mine, share: e.target.checked }, e.target.checked ? `${partner.name} can see it now` : `Hidden from ${partner.name}`)} />
            Share with {partner.name}, so they know when to be extra gentle
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={mine.remind} onChange={(e) => save({ ...mine, remind: e.target.checked })} />
          Gentle reminder 2 days before{mine.share && partner ? `, and a heads-up to ${partner.name} the day before` : ""}
        </label>
        <p className="hint">Predictions are estimates from your own history. Don&apos;t rely on them for birth control. Reminders only say &quot;a gentle heads-up&quot;, never why.</p>
      </div>
    </>
  );
}

// ---------------- goals ----------------
function GoalsTab({ data, me, partner, today, busy, act, seal }: TabProps) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const open = data.goals.filter((g) => !g.doneAt);
  const done = data.goals.filter((g) => g.doneAt);
  const nameOf = (id: string | null) => (id === me.id ? "you" : partner?.name ?? "");

  async function add() {
    const t = title.trim();
    if (!t) return;
    const id = crypto.randomUUID();
    const { iv, ct } = await seal("goal", id, { title: t });
    if (await act({ action: "saveGoal", id, dueOn: due || null, iv, ct }, "Goal added")) { setTitle(""); setDue(""); }
  }

  return (
    <>
      <div className="pform">
        <label className="label" htmlFor="g-title">A goal for the two of you</label>
        <input id="g-title" className="field" value={title} maxLength={140} placeholder="Save for our trip to Zanzibar" onChange={(e) => setTitle(e.target.value)} />
        <div className="row">
          <input className="field field--inline" type="date" min={today} value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date (optional)" />
          <button type="button" className="btn" disabled={busy || !title.trim()} onClick={add}>Add goal</button>
        </div>
      </div>
      {open.length === 0 && done.length === 0 && <p className="hint">Dreams, plans and little promises. Tick them off together.</p>}
      <ul className="plist">
        {open.map((g) => {
          const left = g.dueOn ? daysBetween(today, g.dueOn) : null;
          return (
            <li key={g.id} className="pitem">
              <label className="check check--item">
                <input type="checkbox" checked={false} onChange={() => act({ action: "toggleGoal", id: g.id, done: true }, "Done. Proud of you two.")} />
                <span className="pitem__main">
                  <strong>{g.title}</strong>
                  {g.dueOn && <span className={left !== null && left < 0 ? "hint hint--late" : "hint"}>{left !== null && left < 0 ? `Was due ${prettyDay(g.dueOn)}` : `Due ${countdownLabel(left ?? 0)}`}</span>}
                </span>
              </label>
              <button type="button" className="link-btn link-btn--quiet" onClick={() => { if (confirm("Remove this goal?")) void act({ action: "deleteGoal", id: g.id }); }}>Remove</button>
            </li>
          );
        })}
      </ul>
      {done.length > 0 && (
        <details className="done-list">
          <summary>Done together ({done.length})</summary>
          <ul className="plist">
            {done.map((g) => (
              <li key={g.id} className="pitem pitem--done">
                <label className="check check--item">
                  <input type="checkbox" checked onChange={() => act({ action: "toggleGoal", id: g.id, done: false })} />
                  <span className="pitem__main"><strong>{g.title}</strong><span className="hint">Ticked off by {nameOf(g.doneBy)}</span></span>
                </label>
                <button type="button" className="link-btn link-btn--quiet" onClick={() => act({ action: "deleteGoal", id: g.id })}>Remove</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

// ---------------- things to talk about ----------------
function TalkTab({ data, me, partner, today, busy, act, seal }: TabProps) {
  const [text, setText] = useState("");
  const [when, setWhen] = useState<"none" | "tonight" | "tomorrow" | "pick">("none");
  const [pick, setPick] = useState("");
  const [both, setBoth] = useState(true);
  const hour = new Date().getHours();
  const open = data.topics.filter((t) => !t.discussedAt);
  const talked = data.topics.filter((t) => t.discussedAt);

  function remindAt(): string | null {
    if (when === "tonight") return localAt(today, 20);
    if (when === "tomorrow") return localAt(addDays(today, 1), 20);
    if (when === "pick" && pick) return new Date(pick).toISOString();
    return null;
  }

  async function add() {
    const t = text.trim();
    if (!t) return;
    const id = crypto.randomUUID();
    const { iv, ct } = await seal("topic", id, { text: t });
    if (await act({ action: "saveTopic", id, remindAt: remindAt(), remindBoth: both && !!partner, iv, ct }, when === "none" ? "Added" : "Added. We'll remind you.")) {
      setText(""); setWhen("none"); setPick("");
    }
  }

  const whenLabel = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  };

  return (
    <>
      <div className="pform">
        <label className="label" htmlFor="t-text">Something to talk about</label>
        <textarea id="t-text" className="field" rows={2} maxLength={400} value={text} placeholder="How we'll spend Christmas" onChange={(e) => setText(e.target.value)} />
        <div className="chips chips--left">
          {hour < 20 && <button type="button" className={when === "tonight" ? "chip chip--on" : "chip"} onClick={() => setWhen("tonight")}>Remind tonight</button>}
          <button type="button" className={when === "tomorrow" ? "chip chip--on" : "chip"} onClick={() => setWhen("tomorrow")}>Tomorrow evening</button>
          <button type="button" className={when === "pick" ? "chip chip--on" : "chip"} onClick={() => setWhen("pick")}>Pick a time</button>
          <button type="button" className={when === "none" ? "chip chip--on" : "chip"} onClick={() => setWhen("none")}>No reminder</button>
        </div>
        {when === "pick" && <input className="field" type="datetime-local" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Reminder time" />}
        {when !== "none" && partner && (
          <label className="check">
            <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} />
            Remind {partner.name} too
          </label>
        )}
        <button type="button" className="btn" disabled={busy || !text.trim() || (when === "pick" && !pick)} onClick={add}>Add</button>
      </div>
      {open.length === 0 && talked.length === 0 && <p className="hint">Big or small, so nothing gets forgotten between you.</p>}
      <ul className="plist">
        {open.map((t) => (
          <li key={t.id} className="pitem">
            <label className="check check--item">
              <input type="checkbox" checked={false} onChange={() => act({ action: "toggleTopic", id: t.id, discussed: true }, "Talked about. Well done, you two.")} />
              <span className="pitem__main">
                <strong>{t.text}</strong>
                <span className="hint">
                  {t.createdBy === me.id ? "You added this" : `${partner?.name ?? "They"} added this`}
                  {t.remindAt ? ` · reminder ${t.remindedAt ? "sent" : whenLabel(t.remindAt)}${t.remindBoth ? " for both" : ""}` : ""}
                </span>
              </span>
            </label>
            <button type="button" className="link-btn link-btn--quiet" onClick={() => { if (confirm("Remove this?")) void act({ action: "deleteTopic", id: t.id }); }}>Remove</button>
          </li>
        ))}
      </ul>
      {talked.length > 0 && (
        <details className="done-list">
          <summary>Talked about ({talked.length})</summary>
          <ul className="plist">
            {talked.map((t) => (
              <li key={t.id} className="pitem pitem--done">
                <label className="check check--item">
                  <input type="checkbox" checked onChange={() => act({ action: "toggleTopic", id: t.id, discussed: false })} />
                  <span className="pitem__main"><strong>{t.text}</strong></span>
                </label>
                <button type="button" className="link-btn link-btn--quiet" onClick={() => act({ action: "deleteTopic", id: t.id })}>Remove</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
