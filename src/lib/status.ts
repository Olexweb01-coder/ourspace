// Statuses: 24 hours, only the two of you. Encrypted like everything else.
export type StatusPayload =
  | { t: "text"; text: string; bg: number; font?: number }
  | { t: "photo"; mediaId: string; mime: string; w: number; h: number; thumb?: string; caption?: string };

export type StatusItem = {
  id: string; memberId: string; mediaId: string | null;
  createdAt: string; expiresAt: string; seenAt: string | null;
  payload: StatusPayload | null;
};

export const statusAad = (spaceId: string, id: string) => `status:${spaceId}:${id}`;

export const STATUS_BGS = [
  "linear-gradient(150deg, #6a2242, #e88aa0)",
  "linear-gradient(150deg, #3a1e2e, #c25d7a)",
  "linear-gradient(150deg, #f6c97f, #e8a46a)",
  "linear-gradient(150deg, #2b1a4a, #c9a0e8)",
  "linear-gradient(150deg, #0e3b3a, #8fc9b9)",
  "linear-gradient(150deg, #1d0f18, #6a2242)",
  // solid colours, like WhatsApp
  "#c2416b", "#e0703c", "#d9a520", "#3f9a6e", "#2d8a9a", "#3d6fc4", "#7a52c7", "#3a3a40",
];

// Status fonts. The index is saved with the status, so both phones draw it the same way.
export const STATUS_FONTS: { name: string; family: string; weight: number; italic?: boolean; scale?: number }[] = [
  { name: "Clean", family: "var(--font-body), system-ui, sans-serif", weight: 700 },
  { name: "Serif", family: "var(--font-display), Georgia, serif", weight: 500, italic: true },
  { name: "Script", family: "var(--font-script), 'Brush Script MT', cursive", weight: 700, scale: 1.18 },
  { name: "Round", family: "var(--font-round), system-ui, sans-serif", weight: 600 },
  { name: "Typewriter", family: "var(--font-type), 'Courier New', monospace", weight: 400, scale: 0.92 },
];
export const fontStyle = (i: number | undefined) => {
  const f = STATUS_FONTS[i ?? 0] ?? STATUS_FONTS[0];
  return { fontFamily: f.family, fontWeight: f.weight, fontStyle: f.italic ? "italic" : "normal", fontSize: `${(f.scale ?? 1) * 1.6}rem` } as const;
};

export function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ago`;
}
