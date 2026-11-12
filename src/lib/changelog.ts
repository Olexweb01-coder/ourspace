// What's new, newest first. For every update, add one entry at the TOP with a new id.
// Each phone shows the newest entry once, after it updates.
export type ChangeEntry = { id: string; title: string; items: string[] };

export const CHANGELOG: ChangeEntry[] = [
  {
    id: "2026-11-12-smooth-voice",
    title: "Lighter, smoother, and better voice notes",
    items: [
      "The same glow, hearts and glass, drawn with far less work, so your phone stays cooler.",
      "Long chats stay smooth: the latest messages show first, and Show earlier messages brings back the rest.",
      "Voice notes: a moving line shows where you are, the time counts up, and you can tap or drag to skip.",
      "You see “recording audio…” while the other is recording a voice note, just like typing.",
      "New: Battery saver in Settings, under Chat, if you ever want it even lighter.",
    ],
  },
  {
    id: "2026-11-12",
    title: "A big update for the two of you",
    items: [
      "Photos, videos and voice notes appear the moment you send them, and upload in the background.",
      "When you're both online, the whole app glows a little warmer.",
      "Game invites, wins, losses and debts now arrive as cards in the chat. Tap one to open it.",
      "Tapping a notification opens exactly what it's about, and red badges show what still needs you.",
      "Settings are redesigned, with a new Disguise section to change the app's name and icon.",
      "For him: the Cycle tab is now Care, with ways to look after her.",
      "The app now tells you when a new version is ready.",
    ],
  },
];

const BUILD = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
export const thisBuild = () => BUILD;
