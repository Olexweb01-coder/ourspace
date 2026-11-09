export function initial(name?: string | null): string {
  const n = (name || "").trim();
  return n ? Array.from(n)[0].toUpperCase() : "";
}

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

export function sinceLabel(iso: string | null): string {
  if (!iso) return "hasn't opened the app yet";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "here with you";
  if (mins < 60) return `here ${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `here ${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  return `away ${days} day${days === 1 ? "" : "s"}, missing you`;
}

export function isOnline(iso: string | null): boolean {
  return !!iso && Date.now() - new Date(iso).getTime() < 20_000;
}
