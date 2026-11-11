// Every emoji is welcome. Reactions: a quick row, plus any emoji you like.
export const LOVE = "\u2764\uFE0F"; // ❤️
export const ANGRY = "\u{1F620}";   // 😠

// One picture, optionally with a skin tone or style mark, joined to others only by the invisible joiner (as in 👩‍❤️‍👨); or a flag.
const PART = "\\p{Extended_Pictographic}\\uFE0F?\\p{Emoji_Modifier}?";
const ONE_EMOJI_RE = new RegExp(`^(?:${PART}(?:\\u200D${PART})*|[\\u{1F1E6}-\\u{1F1FF}]{2})$`, "u");

/** Text exactly as typed (all emoji kept). The name stays for older call sites. */
export function onlyLoveAndAngry(input: string): string { return input; }
export const cleanText = onlyLoveAndAngry;

/** One single emoji (including skin tones, flags and joined emoji like 👩‍❤️‍👨). */
export function isOneEmoji(s: unknown): s is string {
  return typeof s === "string" && s.length > 0 && s.length <= 16 && ONE_EMOJI_RE.test(s);
}

/** Stored as "love" and "angry" for ❤️ and 😠 (older messages and features use those words); any other emoji as itself. */
export type Reaction = string;
export const toReaction = (emoji: string): Reaction => (emoji === LOVE ? "love" : emoji === ANGRY ? "angry" : emoji);
export const glyphOf = (r: Reaction): string => (r === "love" ? LOVE : r === "angry" ? ANGRY : r);

export const QUICK_REACTIONS = [LOVE, "😂", "😮", "😢", "🙏", ANGRY];
export const MORE_EMOJI = [
  "😍", "🥰", "😘", "😚", "🤗", "😊", "☺️", "🥹", "😁", "😆", "🤣", "😅", "😉", "😌", "😇", "🙂",
  "🤭", "🫣", "😳", "🥺", "😭", "😩", "😤", "😡", "🤬", "😒", "🙄", "😴", "🤤", "😋", "😛", "😜",
  "🤪", "😎", "🤩", "🥳", "😏", "🤔", "🫡", "🤫", "😬", "😱", "🤯", "😵", "🥴", "🤒", "🤧", "😷",
  "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💌", "💋", "💯", "🔥", "✨", "🌹", "🌸", "🌺", "💐",
  "👍", "👎", "👏", "🙌", "🫶", "👌", "✌️", "🤞", "💪", "🤝", "👀", "🙈", "🙊", "💃", "🕺", "👑",
  "🎉", "🎂", "🎁", "🍾", "🥂", "☕", "🍕", "🍫", "🌙", "☀️", "🌈", "⭐", "🏆", "💤", "📞", "🫂",
];
