// Feelings, streaks and milestones. Shared by the phone and the server.

export const MOODS = [
  { key: "loved",    label: "Loved",       color: "#e88aa0", hint: (n: string) => `Love ${n} out loud today.` },
  { key: "happy",    label: "Happy",       color: "#f6c97f", hint: (n: string) => `${n} is in a good place. Enjoy it together.` },
  { key: "calm",     label: "Calm",        color: "#8fc9b9", hint: (n: string) => `${n} feels settled. A quiet check-in is enough.` },
  { key: "missing",  label: "Missing you", color: "#c9a0e8", hint: (n: string) => `${n} misses you. Make some time today.` },
  { key: "tired",    label: "Tired",       color: "#9aa5c4", hint: (n: string) => `Keep it soft and easy with ${n} today.` },
  { key: "stressed", label: "Stressed",    color: "#e8a46a", hint: (n: string) => `Be extra gentle with ${n} today.` },
  { key: "sad",      label: "Sad",         color: "#7f9bd1", hint: (n: string) => `${n} might need you close today.` },
  { key: "upset",    label: "Upset",       color: "#e86a6a", hint: (n: string) => `Something hurt. Talk it through with ${n}.` },
] as const;
export type MoodKey = (typeof MOODS)[number]["key"];
export const moodOf = (key: string) => MOODS.find((m) => m.key === key) ?? null;

/**
 * The app's guess at how you feel, best first. Runs on the phone only, from things it already knows:
 * your recent feelings, the time, time apart, and whether you've been angry lately. No AI.
 */
export function guessMoods(ctx: {
  hour: number;
  recent: MoodKey[];           // your last few days, newest first
  apartDays: number;           // how long since you were both here
  angryLately: boolean;        // you reacted with 😠 in the last day
  partnerMood: MoodKey | null;
}): MoodKey[] {
  const score = Object.fromEntries(MOODS.map((m) => [m.key, 0])) as Record<MoodKey, number>;
  score.loved += 1; // a gentle default
  ctx.recent.slice(0, 5).forEach((m, i) => { score[m] += 3 - i * 0.5; });
  if (ctx.apartDays >= 1) score.missing += 3 + Math.min(ctx.apartDays, 4);
  if (ctx.angryLately) score.upset += 3.5;
  if (ctx.hour >= 22 || ctx.hour < 5) score.tired += 2;
  if (ctx.hour >= 5 && ctx.hour < 11) { score.calm += 1; score.happy += 1; }
  if (ctx.partnerMood === "loved" || ctx.partnerMood === "happy") score.loved += 1.5;
  if (ctx.partnerMood === "missing") score.missing += 1.5;
  return [...MOODS.map((m) => m.key)].sort((a, b) => score[b] - score[a]);
}

/** Today's date on this phone, as YYYY-MM-DD. */
export function localDay(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dayBefore(day: string): string {
  const t = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) - 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** A streak day is a day you both sent something. `complete` = those days, `today` in the host's time zone. */
export function computeStreak(complete: string[], today: string) {
  const set = new Set(complete);
  const todayDone = set.has(today);
  let cursor = todayDone ? today : dayBefore(today);
  let current = 0;
  while (set.has(cursor)) { current++; cursor = dayBefore(cursor); }
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of Array.from(set).sort()) {
    run = prev !== null && dayBefore(d) === prev ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return { current, todayDone, longest };
}

const MILESTONES = [3, 7, 14, 30, 50, 100, 150, 200, 365];
export function isMilestone(n: number): boolean {
  return MILESTONES.includes(n) || (n > 365 && n % 100 === 0);
}
export function nextMilestone(n: number): number {
  return MILESTONES.find((m) => m > n) ?? (Math.floor(n / 100) + 1) * 100;
}

/** Missing-you reminders go out on these days apart, then weekly. */
export function missingDay(days: number): boolean {
  return [1, 2, 3, 5, 7].includes(days) || (days > 7 && days % 7 === 0);
}

/** Binds an encrypted feeling to its space, person and day. */
export const moodAad = (spaceId: string, memberId: string, day: string) => `mood:${spaceId}:${memberId}:${day}`;
