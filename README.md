# Our Space — a private space for two

End-to-end encrypted PWA. Next.js 15 on Vercel, Neon Postgres. Built by olexweb.

## How the lock works
- The shared password never leaves either phone. Each phone turns it into two keys (PBKDF2, 600k rounds → HKDF):
  an **encryption key** that stays in memory, and an **auth token** that proves the password to the server.
- The server stores only `sha256(auth token)` and ciphertext. It cannot read messages, and push notifications never contain text.
- The app asks for the password every time it opens and locks itself after 2 minutes in the background.
- 10 wrong passwords lock the space for 15 minutes.
- **There is no password reset.** Lose it and the messages are gone for good. That's the point.

## Setup (once)
1. **Neon**: create a project, open the SQL editor, run `db/schema.sql`. Copy the **pooled** connection string.
2. `npm install`, then `npm run vapid` and keep both keys.
3. Push to GitHub, import the repo in Vercel, add every variable from `.env.example`, deploy.
   Use a real HTTPS domain for `APP_URL`, e.g. `https://love.olexweb.com`.
4. Open `APP_URL/setup` on **your** phone, enter `HOST_SETUP_KEY`, your name, her name and the password.
5. Send her the invite link. Tell her the password in person or on a call.

### What she does
1. Opens the link (Safari on iPhone, Chrome on Android), types her name and the password.
2. Adds Our Space to her Home Screen (iPhone: Share → Add to Home Screen).
3. Opens it from the Home Screen, unlocks, taps **Turn on notifications**.
   On iPhone, notifications only work from the Home Screen app (iOS 16.4+).

Do the same yourself: after setup, add the app to your Home Screen from the chat screen.

## Photos, voice notes, videos and files (Phase 2)
- Files are encrypted on the phone before upload and stored in a **private** Vercel Blob store (`ourspace-media`).
  The server only ever holds scrambled bytes and streams them back to an unlocked member.
- Photos are shrunk to about 300 KB, voice notes are about 0.5 MB a minute, and videos and files can be up to 50 MB.
- Everything disappears after **30 days** unless either of you taps **Keep**. View-once files are deleted as soon as they're opened.
- **Save to phone** puts the unlocked file in your gallery or files.
- A daily clean-up job removes expired files from storage. The storage meter is in settings.
- Free Hobby limits are shared by all your spaces: 1 GB stored and about 2,000 uploads a month.

Setup: run `db/002_media.sql` once in Neon. For local testing, copy `BLOB_READ_WRITE_TOKEN` from
Vercel → Settings → Environment Variables into `.env.local`.

## Daily rituals (Phase 3)
- **Feelings:** once a day each of you picks how you feel. The app puts its best guess first, worked out on the phone
  from recent feelings, the time, time apart and recent 😠 reactions. No AI. Feelings are encrypted, and the
  notification never says which one.
- **Streaks:** a day counts when you both send something, even if the message later disappears. Days follow the
  host's time zone. Celebrations come at 3, 7, 14, 30, 50, 100, 150, 200 and 365 days, then every 100.
- **Evening job** (`/api/cron/daily`, 19:00 UTC = 20:00 Lagos): warns whoever hasn't sent anything when a streak
  of 2+ days would break at midnight, sends "misses you" on days 1, 2, 3, 5 and 7 away (then weekly),
  and cleans up expired files. On the free plan Vercel may run it at any minute within that hour.

Setup: run `db/003_rituals.sql` once in Neon.

## Never forget (Phase 4)
Open the calendar button in the chat header ("Us, planned"):
- **Days:** birthdays, your anniversary and custom days. Reminders 7 days before and the day before (the birthday
  person gets no spoilers), and a full-screen celebration on the day. 29 February birthdays are celebrated on the 28th in other years.
- **Cycle:** log period starts; predictions come from your own history. Sharing is optional. Reminders only say
  "a gentle heads-up". Estimates only, not for birth control.
- **Goals** and **Things to talk about**, with optional reminders for one or both of you.

Privacy: names, notes, goals, topics and cycle dates are encrypted. To remind you on time the server knows special-day
dates and reminder times, never what they're for.

Timely reminders (optional): Vercel's free plan runs the daily job at 20:00 Lagos only. To get morning-of reminders,
create a free job on cron-job.org that calls `https://YOUR-APP/api/cron/reminders?key=YOUR_CRON_SECRET` every 15 minutes.
It never sends anything twice.

Setup: run `db/004_planner.sql` once in Neon.

## Games (Phase 5): free, built in, no AI
Open the dice button in the chat header.
- **Would you rather**, **This or that** and **How well do you know me**: each of you answers privately, then
  you see each other's picks and a score. Answers are encrypted and final, and the server won't send your
  partner's answers until you've submitted yours, so nobody can peek.
- **Cards:** Truth, Dare and Deep talk. Draw one and send it into the chat.
- 205 hand-written questions and cards, plus generated ones built on the phone from hand-picked lists
  (foods, date ideas, places, music, gifts, films): 823 possible This or that, 1,144 Would you rather.
- Nothing repeats: each phone remembers every question either of you has played, and every card drawn.
  A deck only starts over after every card has been seen.
- All of it lives in `src/lib/games-bank.ts`. Add items to the END of any list to grow it.

Setup: run `db/005_games.sql` once in Neon.

## Admin API (for the olexweb admin app)
Call these **from your olexweb server only** with `Authorization: Bearer <ADMIN_API_KEY>`. Never put the key in browser code.

| Method | Path | Body | Does |
|---|---|---|---|
| GET | `/api/admin/spaces` | – | Lists every space (max 5), both people, last seen, notification state |
| POST | `/api/admin/spaces/:id/invite` | `{ "role": "partner" }` | New 7-day link (new partner, or her new phone) |
| PATCH | `/api/admin/spaces/:id` | `{ "action": "ban" \| "unban" }` | Ban signs her out on every device instantly |
| DELETE | `/api/admin/spaces/:id` | `{ "confirm": "DELETE <label>" }` | Permanent erase. Call once with no body to see what will be lost and the exact phrase |

New spaces are created at `/setup` on your phone, not from the admin, so the password never touches olexweb.

```ts
// olexweb admin – server side
const res = await fetch(`${process.env.US_APP_URL}/api/admin/spaces`, {
  headers: { Authorization: `Bearer ${process.env.US_ADMIN_API_KEY}` },
  cache: "no-store",
});
```

## Honest limits
- Anyone with the password and an unlocked phone can read everything. Pick a long password.
- A web app can't block screenshots, including of view-once messages.
- The server sees metadata: who sent something and when, never what.
- New messages arrive by checking every 2.5 s while the app is open, plus a push when it's closed.
