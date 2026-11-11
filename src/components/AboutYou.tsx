"use client";
import { useState } from "react";
import { api, ApiError } from "@/lib/api";
import { encryptJSON } from "@/lib/crypto-client";
import { plannerAad } from "@/lib/planner";
import type { Gender } from "@/lib/pronouns";
import type { Vault } from "@/lib/vault";

type Existing = { id: string; month: number; day: number; startYear: number | null } | null;
type Props = { vault: Vault; me: { id: string; name: string }; gender: Gender; birthday: Existing; partnerName: string; onDone: () => void; onLater: () => void; onToast: (m: string) => void };

// Once each: who you are (for "him" and "her") and your birthday, which then fills in for both of you.
export default function AboutYou({ vault, me, gender, birthday, partnerName, onDone, onLater, onToast }: Props) {
  const [g, setG] = useState<Gender>(gender);
  const [date, setDate] = useState(birthday?.startYear
    ? `${birthday.startYear}-${String(birthday.month).padStart(2, "0")}-${String(birthday.day).padStart(2, "0")}` : "");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      if (g !== gender) await api("/api/profile", { body: { gender: g } });
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const id = birthday?.id ?? crypto.randomUUID();
        const { iv, ct } = await encryptJSON(vault.encKey, { title: `${me.name}'s birthday`, note: "" }, plannerAad("day", vault.spaceId, id));
        await api("/api/planner", { body: {
          action: "saveDay", id, kind: "birthday", aboutMember: me.id,
          month: Number(date.slice(5, 7)), day: Number(date.slice(8, 10)), startYear: Number(date.slice(0, 4)), iv, ct,
        } });
      }
      onToast("Saved");
      onDone();
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : "Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="about">
      <p className="mood-card__title">About you</p>
      <p className="hint">Two quick things, so the app talks about you two the right way.</p>
      <p className="label">I&apos;m a</p>
      <div className="chips chips--left">
        <button type="button" className={g === "woman" ? "chip chip--on" : "chip"} onClick={() => setG("woman")}>Woman</button>
        <button type="button" className={g === "man" ? "chip chip--on" : "chip"} onClick={() => setG("man")}>Man</button>
      </div>
      <label className="label" htmlFor="bday">My birthday</label>
      <input id="bday" className="field" type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
      <p className="hint">It goes into your plans for both of you, with your age worked out automatically. {partnerName} won&apos;t have to type it.</p>
      <div className="row">
        <button type="button" className="btn" onClick={save} disabled={busy || (!g && !date)}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="btn btn--ghost" onClick={onLater}>Later</button>
      </div>
    </div>
  );
}
