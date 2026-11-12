// Disguise: this phone shows the app under another name and icon (Home Screen, app switcher, notifications).
// Saved on this phone only. The app lock and encryption work exactly as before.
export const DISGUISE_ICONS = ["calculator", "notes", "weather", "clock", "calendar", "files"] as const;
export type DisguiseIcon = (typeof DISGUISE_ICONS)[number];
export const ICON_LABEL: Record<DisguiseIcon, string> = {
  calculator: "Calculator", notes: "Notes", weather: "Weather", clock: "Clock", calendar: "Calendar", files: "Files",
};

export type Disguise = {
  on: boolean;
  name: string;
  icon: DisguiseIcon | "custom";
  custom?: { m: string; v: number };   // your own photo: whose it is, and which version
};

const KEY = "ourspace:disguise";
const NAME_RE = /^[\p{L}\p{N} .,'&+-]{1,24}$/u;
export const cleanName = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 24);
export const validName = (s: string) => NAME_RE.test(s);

export function loadDisguise(): Disguise | null {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || "null") as Disguise | null;
    if (!d || typeof d.on !== "boolean" || !validName(d.name)) return null;
    if (d.icon !== "custom" && !DISGUISE_ICONS.includes(d.icon)) return null;
    return d;
  } catch { return null; }
}

export function saveDisguise(d: Disguise | null) {
  try { if (d) localStorage.setItem(KEY, JSON.stringify(d)); else localStorage.removeItem(KEY); } catch { /* private mode */ }
}

/** The icon picture for a disguise, at a size. */
export function iconUrl(d: Disguise, size: 180 | 192 | 512): string {
  if (d.icon === "custom" && d.custom) return `/api/app-icon?m=${d.custom.m}&s=${size === 512 ? 512 : 192}&v=${d.custom.v}`;
  return `/icons/disguise/${d.icon === "custom" ? "notes" : d.icon}-${size}.png`;
}

/** Query string the manifest reads, so the installed app takes this name and icon. */
export function manifestParams(d: Disguise | null): string {
  if (!d?.on) return "";
  const p = new URLSearchParams({ n: d.name, i: d.icon });
  if (d.icon === "custom" && d.custom) { p.set("cm", d.custom.m); p.set("v", String(d.custom.v)); }
  return `&${p.toString()}`;
}

/** Tells the notification helper (service worker) how to show notifications on this phone. */
export async function shareWithNotifications(d: Disguise | null) {
  try {
    const cache = await caches.open("ourspace-disguise");
    if (d?.on) await cache.put("/__disguise", new Response(JSON.stringify({ name: d.name, icon: iconUrl(d, 192) }), { headers: { "Content-Type": "application/json" } }));
    else await cache.delete("/__disguise");
  } catch { /* not available here */ }
}
