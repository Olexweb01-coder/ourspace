// Where each notification takes you, shared by the server (the link in the notification) and the phone (badges).
export type Section = "games" | "planner" | "status" | "mood" | "streak";

/** The part of the app a notification is about. null = the chat itself. */
export function sectionOfTag(tag: string | null | undefined): Section | null {
  if (!tag) return null;
  if (tag.startsWith("day-")) return "planner";
  switch (tag) {
    case "status": return "status";
    case "mood": return "mood";
    case "game": case "live": case "debt": return "games";
    case "goal": case "topic": case "care": case "cycle": return "planner";
    case "milestone": case "streak": case "missing": return "streak";
    default: return null;
  }
}

/** A target the app knows how to open: a section, "debts", or a live table "live:<ludo|whot>:<id>". */
export type OpenTarget = Section | "debts" | `live:${"ludo" | "whot"}:${string}`;

const LIVE_RE = /^live:(ludo|whot):[0-9a-f-]{36}$/i;
export function isOpenTarget(x: unknown): x is OpenTarget {
  return typeof x === "string" && (["games", "planner", "status", "mood", "streak", "debts"].includes(x) || LIVE_RE.test(x));
}
