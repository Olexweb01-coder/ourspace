"use client";
import { useState } from "react";
import { cleanNick } from "@/lib/nickname";
import { SRow } from "./Rows";

// What you call your partner (both of you see it), and what they call you.
export default function NicknameSettings({ realName, current, theirs, onSave }: {
  realName: string; current: string; theirs: string | null; onSave: (name: string | null) => Promise<void>;
}) {
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const clean = cleanNick(value);
  const save = async (name: string | null) => { setBusy(true); await onSave(name); setBusy(false); if (name === null) setValue(""); };
  return (
    <>
      <div className="srow srow--block">
        <span className="srow__text">
          <strong>What you call {realName}</strong>
          <small>Shows everywhere on your phone. {realName} sees it too. Change it whenever you like.</small>
        </span>
        <div className="row disguise__name">
          <input className="field field--inline" value={value} maxLength={30} placeholder={`e.g. My Queen`} aria-label={`What you call ${realName}`}
            onChange={(e) => setValue(e.target.value)} />
          <button type="button" className="btn btn--small" disabled={busy || !clean || clean === current} onClick={() => void save(clean)}>Save</button>
        </div>
        {current && <button type="button" className="link-btn link-btn--quiet" disabled={busy} onClick={() => void save(null)}>Use {realName}&apos;s real name</button>}
      </div>
      <SRow label={`What ${realName} calls you`} hint={theirs ? `“${theirs}”` : `${realName} hasn't given you a name yet`} />
    </>
  );
}
