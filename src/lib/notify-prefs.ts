// The kinds of notifications you can choose, shared by the phone and the server.
export type NotifyKey = "messages" | "status" | "feelings" | "games" | "days" | "streak";
export const NOTIFY_CATEGORIES: { key: NotifyKey; label: string; hint?: string; tags: string[] }[] = [
  { key: "messages", label: "Messages", hint: "Never the words, just that a message came", tags: ["message", "reaction", "viewed"] },
  { key: "status", label: "Statuses", tags: ["status"] },
  { key: "feelings", label: "Feelings", tags: ["mood"] },
  { key: "games", label: "Games and live tables", tags: ["game", "live", "debt"] },
  { key: "days", label: "Special days and reminders", tags: ["care", "goal", "topic", "day", "cycle"] },
  { key: "streak", label: "Streak and missing you", tags: ["streak", "milestone", "missing"] },
];
/** These always come through, even in quiet hours: so you can always reach each other. */
export const ALWAYS_TAGS = ["nudge", "call", "notif", "joined", "settings"];
export const QUIET_FROM = 23, QUIET_TO = 7;

export function categoryOf(tag: string | undefined): NotifyKey | null {
  if (!tag) return null;
  return NOTIFY_CATEGORIES.find((c) => c.tags.includes(tag))?.key ?? null;
}
export const isNotifyKey = (k: unknown): k is NotifyKey => NOTIFY_CATEGORIES.some((c) => c.key === k);

/** No buzz for these while you're looking at the app: you see them on screen anyway. */
export const IN_APP_QUIET_TAGS = ["message", "reaction", "viewed", "status", "mood", "game", "live", "debt"];
/** The phone checks in every 2.5 s while the app is on screen (never in the background), so this means "looking at it now". */
export const IN_APP_SECONDS = 6;
