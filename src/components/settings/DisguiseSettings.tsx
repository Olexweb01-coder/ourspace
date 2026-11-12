"use client";
import { useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { cleanName, DISGUISE_ICONS, ICON_LABEL, iconUrl, loadDisguise, saveDisguise, validName, type Disguise } from "@/lib/disguise";
import { isIOS } from "@/lib/push-client";
import { SSwitch } from "./Rows";

/** A square PNG of a picture, centre-cropped, as base64. */
async function squarePng(file: File, size: number): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  canvas.getContext("2d")!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  const blob: Blob = await new Promise((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("png"))), "image/png"));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export default function DisguiseSettings({ memberId, onApply, onToast }: { memberId: string; onApply: () => void; onToast: (m: string) => void }) {
  const [d, setD] = useState<Disguise>(() => loadDisguise() ?? { on: false, name: "Notes", icon: "notes" });
  const [name, setName] = useState(d.name);
  const [busy, setBusy] = useState(false);
  const photo = useRef<HTMLInputElement>(null);

  function apply(next: Disguise, done?: string) {
    setD(next);
    saveDisguise(next.on ? next : { ...next, on: false });
    onApply();   // name, icon, title and notifications on this phone
    if (done) onToast(done);
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const [png192, png512] = await Promise.all([squarePng(file, 192), squarePng(file, 512)]);
      await api("/api/app-icon", { body: { png192, png512 } });
      apply({ ...d, on: true, icon: "custom", custom: { m: memberId, v: Date.now() } }, "Your photo is the icon now");
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : "That picture didn't work. Try another one.");
    } finally {
      setBusy(false);
    }
  }

  const cleaned = cleanName(name);
  return (
    <>
      <SSwitch label="Disguise this app" hint="Another name and icon, on this phone only. Notifications say only “You have a new notification.”"
        on={d.on} onChange={(on) => apply({ ...d, on }, on ? "Disguise on" : "Disguise off")} />
      {d.on && (
        <>
          <div className="srow srow--block">
            <span className="srow__text"><strong>Name</strong><small>Up to 24 letters or numbers</small></span>
            <div className="row disguise__name">
              <input className="field field--inline" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} aria-label="Disguise name" />
              <button type="button" className="btn btn--small" disabled={!validName(cleaned) || cleaned === d.name}
                onClick={() => { setName(cleaned); apply({ ...d, name: cleaned }, `Name set to ${cleaned}`); }}>Save</button>
            </div>
          </div>
          <div className="srow srow--block">
            <span className="srow__text"><strong>Icon</strong></span>
            <div className="disguise__icons" role="radiogroup" aria-label="Icon">
              {DISGUISE_ICONS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={d.icon === k} className={d.icon === k ? "dicon dicon--on" : "dicon"}
                  onClick={() => apply({ ...d, icon: k }, `${ICON_LABEL[k]} icon`)}>
                  <img src={`/icons/disguise/${k}-192.png`} alt="" width={56} height={56} />
                  <span>{ICON_LABEL[k]}</span>
                </button>
              ))}
              <button type="button" role="radio" aria-checked={d.icon === "custom"} className={d.icon === "custom" ? "dicon dicon--on" : "dicon"}
                disabled={busy} onClick={() => photo.current?.click()}>
                {d.icon === "custom" && d.custom
                  ? <img src={iconUrl(d, 192)} alt="" width={56} height={56} />
                  : <span className="dicon__plus" aria-hidden="true">+</span>}
                <span>{busy ? "Saving…" : "Your photo"}</span>
              </button>
            </div>
            <p className="hint">Your photo is stored without encryption, because the phone shows the icon before you unlock.</p>
            <input ref={photo} type="file" accept="image/*" hidden onChange={onPhoto} />
          </div>
          <div className="srow srow--block">
            <p className="hint disguise__how">{isIOS()
              ? "On iPhone: remove the app from your Home Screen, then add it again from Safari (Share, then Add to Home Screen) to see the new name and icon."
              : "On Android the Home Screen updates by itself, usually within a day. To see it now: remove the app and install it again from Chrome."}</p>
          </div>
        </>
      )}
    </>
  );
}
