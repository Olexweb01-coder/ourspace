// Dates for special days and cycle predictions. Shared by the phone and the server.
// Days are "YYYY-MM-DD" strings; maths is done in UTC so time zones never shift a day.

export type DayKind = "birthday" | "anniversary" | "special";

const toUTC = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const fromUTC = (t: number) => new Date(t).toISOString().slice(0, 10);

export const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export function daysInMonth(month: number, year = 2024): number {
  return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
export const validMonthDay = (m: number, d: number) =>
  Number.isInteger(m) && Number.isInteger(d) && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(m, 2024);

export function addDays(day: string, n: number): string { return fromUTC(toUTC(day) + n * 86_400_000); }
export function daysBetween(from: string, to: string): number { return Math.round((toUTC(to) - toUTC(from)) / 86_400_000); }

/** The date this month/day falls on in a given year. 29 February is celebrated on the 28th in other years. */
export function occurrenceIn(year: number, month: number, day: number): string {
  const d = month === 2 && day === 29 && !isLeap(year) ? 28 : day;
  return `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Today or the next time this day comes round. */
export function nextOccurrence(month: number, day: number, today: string): string {
  const y = Number(today.slice(0, 4));
  const thisYear = occurrenceIn(y, month, day);
  return thisYear >= today ? thisYear : occurrenceIn(y + 1, month, day);
}

export function countdownLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  if (days < 14) return "in a week";
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

// ---------- cycle ----------

export type CycleData = { starts: string[]; periodLength: number; share: boolean; remind: boolean };
export const EMPTY_CYCLE: CycleData = { starts: [], periodLength: 5, share: true, remind: true };

export type CyclePrediction = {
  avgCycle: number;
  lastStart: string;
  nextStart: string;
  daysUntilNext: number;  // negative = late
  inPeriod: boolean;
  periodDay: number;      // 1-based, when inPeriod
};

/** Average of the most recent gaps between starts (ignoring odd ones), default 28 days. Estimates only. */
export function predictCycle(data: CycleData, today: string): CyclePrediction | null {
  const starts = Array.from(new Set(data.starts)).filter((s) => s <= today).sort();
  if (starts.length === 0) return null;
  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) {
    const g = daysBetween(starts[i - 1], starts[i]);
    if (g >= 15 && g <= 60) gaps.push(g);
  }
  const recent = gaps.slice(-6);
  const avgCycle = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : 28;
  const lastStart = starts[starts.length - 1];
  const nextStart = addDays(lastStart, avgCycle);
  const sinceLast = daysBetween(lastStart, today);
  const len = Math.min(Math.max(data.periodLength || 5, 2), 10);
  return {
    avgCycle,
    lastStart,
    nextStart,
    daysUntilNext: daysBetween(today, nextStart),
    inPeriod: sinceLast >= 0 && sinceLast < len,
    periodDay: sinceLast + 1,
  };
}

/** Binds each encrypted item to its space and id so it can't be swapped with another. */
export const plannerAad = (what: "day" | "goal" | "topic" | "cycle", spaceId: string, id: string) => `${what}:${spaceId}:${id}`;
