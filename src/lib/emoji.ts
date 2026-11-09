// Only two emoji live here: love and angry. Everything else is quietly removed.
export const LOVE = "\u2764\uFE0F"; // ❤️
export const ANGRY = "\u{1F620}";   // 😠

const EMOJI_RE = /\p{Extended_Pictographic}(?:\uFE0F|\u200D|\p{Emoji_Modifier})*|[\u{1F1E6}-\u{1F1FF}]/gu;

export function onlyLoveAndAngry(input: string): string {
  return input.replace(EMOJI_RE, (m) => {
    if (m.startsWith("\u2764") && !m.includes("\u200D")) return LOVE;
    if (m.startsWith("\u{1F620}") && !m.includes("\u200D")) return ANGRY;
    return "";
  });
}
