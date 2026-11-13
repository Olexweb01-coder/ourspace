// What each of you calls the other: chosen on the phone, encrypted end-to-end, seen by both of you.
export const nickAad = (spaceId: string, memberId: string) => `nick:${spaceId}:${memberId}`;
export const cleanNick = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 30);
