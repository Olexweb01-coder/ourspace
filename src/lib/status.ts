// Statuses: 24 hours, only the two of you. Encrypted like everything else.
export type StatusPayload =
  | { t: "text"; text: string; bg: number }
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
];

export function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ago`;
}
