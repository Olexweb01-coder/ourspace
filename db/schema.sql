-- Our Space schema v1  (run once in the Neon SQL editor)
-- The server only ever stores ciphertext. It cannot read messages.

create table if not exists spaces (
  id               uuid primary key default gen_random_uuid(),
  label            text not null,                      -- what you call her, e.g. "Babe"
  kdf_salt         text not null,                      -- public PBKDF2 salt (base64)
  kdf_iterations   int  not null,
  auth_hash        text not null,                      -- sha256 of the derived auth token (never the password)
  disappear_seconds int,                               -- null = messages stay
  failed_logins    int  not null default 0,
  locked_until     timestamptz,
  created_at       timestamptz not null default now()
);

create table if not exists members (
  id              uuid primary key default gen_random_uuid(),
  space_id        uuid not null references spaces(id) on delete cascade,
  role            text not null check (role in ('host','partner')),
  display_name    text not null,
  banned          boolean not null default false,
  notifications   text not null default 'unknown' check (notifications in ('on','off','unknown')),
  last_seen_at    timestamptz,
  last_nudge_at   timestamptz,
  created_at      timestamptz not null default now(),
  unique (space_id, role)
);

create table if not exists invites (
  token_hash  text primary key,
  space_id    uuid not null references spaces(id) on delete cascade,
  role        text not null check (role in ('host','partner')),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists sessions (
  token_hash  text primary key,
  member_id   uuid not null references members(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists sessions_member_idx on sessions(member_id);

create table if not exists messages (
  id          bigint generated always as identity primary key,
  space_id    uuid not null references spaces(id) on delete cascade,
  sender_id   uuid not null references members(id) on delete cascade,
  kind        text not null default 'text',
  iv          text not null,
  ciphertext  text not null,
  view_once   boolean not null default false,
  viewed_at   timestamptz,
  deleted     boolean not null default false,
  reactions   jsonb not null default '{}'::jsonb,    -- { memberId: "love" | "angry" }
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists messages_space_id_idx      on messages(space_id, id);
create index if not exists messages_space_updated_idx on messages(space_id, updated_at);
create index if not exists messages_expiry_idx        on messages(expires_at) where expires_at is not null and deleted = false;

create table if not exists push_subscriptions (
  endpoint    text primary key,
  member_id   uuid not null references members(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists push_member_idx on push_subscriptions(member_id);

-- ===== Phase 2 (same as db/002_media.sql) =====

create table if not exists media (
  id           uuid primary key,                     -- chosen by the phone, also the file name
  space_id     uuid not null references spaces(id) on delete cascade,
  uploader_id  uuid not null references members(id) on delete cascade,
  pathname     text not null unique,                 -- where the encrypted file lives in Blob
  purpose      text not null check (purpose in ('message','avatar','background')),
  status       text not null default 'pending' check (status in ('pending','ready')),
  size         bigint not null default 0,
  message_id   bigint references messages(id) on delete set null,
  kept_by      uuid references members(id) on delete set null,
  expires_at   timestamptz,                          -- null = kept forever
  created_at   timestamptz not null default now()
);
create index if not exists media_space_idx   on media(space_id);
create index if not exists media_message_idx on media(message_id);
create index if not exists media_expiry_idx  on media(expires_at) where expires_at is not null;

alter table messages add column if not exists media_id uuid;
alter table members  add column if not exists avatar_media_id uuid;
alter table spaces   add column if not exists theme text not null default 'candle';
alter table spaces   add column if not exists background_media_id uuid;

-- When a message disappears (view-once opened, timer ran out), its file goes with it.
create or replace function media_follow_message() returns trigger language plpgsql as $$
begin
  if new.deleted and not old.deleted then
    update media set expires_at = now() where message_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists media_follow_message on messages;
create trigger media_follow_message
  after update of deleted on messages
  for each row execute function media_follow_message();

-- ===== Phase 3 (same as db/003_rituals.sql) =====

-- How each of you feels each day. Encrypted: the server can't tell which feeling it is.
create table if not exists moods (
  space_id    uuid not null references spaces(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  day         date not null,                -- the sender's own calendar day
  iv          text not null,
  ciphertext  text not null,
  updated_at  timestamptz not null default now(),
  primary key (member_id, day)
);
create index if not exists moods_space_day_idx on moods(space_id, day);

-- Days each of you sent something. Kept even when messages disappear, so streaks stay honest.
create table if not exists activity_days (
  space_id   uuid not null references spaces(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  day        date not null,                 -- in the host's time zone
  primary key (member_id, day)
);
create index if not exists activity_space_day_idx on activity_days(space_id, day);

alter table members add column if not exists timezone text not null default 'Africa/Lagos';
alter table members add column if not exists last_missing_push_at timestamptz;
alter table spaces  add column if not exists best_streak int not null default 0;

-- ===== Phase 4 (same as db/004_planner.sql) =====

create table if not exists special_days (
  id            uuid primary key,
  space_id      uuid not null references spaces(id) on delete cascade,
  created_by    uuid references members(id) on delete set null,
  kind          text not null check (kind in ('birthday','anniversary','special')),
  about_member  uuid references members(id) on delete cascade,   -- whose birthday
  month         int  not null check (month between 1 and 12),
  day           int  not null check (day between 1 and 31),
  start_year    int  check (start_year between 1900 and 2200),    -- for ages and "years together"
  iv            text not null,
  ciphertext    text not null,                                     -- { title, note }
  updated_at    timestamptz not null default now()
);
create index if not exists special_days_space_idx on special_days(space_id);

create table if not exists goals (
  id          uuid primary key,
  space_id    uuid not null references spaces(id) on delete cascade,
  created_by  uuid references members(id) on delete set null,
  due_on      date,
  done_at     timestamptz,
  done_by     uuid references members(id) on delete set null,
  iv          text not null,
  ciphertext  text not null,                                       -- { title }
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists goals_space_idx on goals(space_id);

create table if not exists topics (
  id             uuid primary key,
  space_id       uuid not null references spaces(id) on delete cascade,
  created_by     uuid references members(id) on delete set null,
  remind_at      timestamptz,
  remind_both    boolean not null default false,
  reminded_at    timestamptz,
  discussed_at   timestamptz,
  iv             text not null,
  ciphertext     text not null,                                    -- { text }
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists topics_space_idx on topics(space_id);
create index if not exists topics_due_idx on topics(remind_at) where reminded_at is null and discussed_at is null;

-- One encrypted record per person: period start dates, length, sharing choice.
create table if not exists cycles (
  member_id   uuid primary key references members(id) on delete cascade,
  space_id    uuid not null references spaces(id) on delete cascade,
  iv          text not null,
  ciphertext  text not null,
  updated_at  timestamptz not null default now()
);

-- "Send a care reminder to this person at this time." Deliberately says nothing about why.
create table if not exists care_reminders (
  id          bigint generated always as identity primary key,
  space_id    uuid not null references spaces(id) on delete cascade,
  owner_id    uuid not null references members(id) on delete cascade,  -- whose data created it
  recipient   uuid not null references members(id) on delete cascade,
  notify_at   timestamptz not null,
  sent_at     timestamptz
);
create index if not exists care_due_idx on care_reminders(notify_at) where sent_at is null;

-- Reminders already sent, so nothing is ever sent twice.
create table if not exists sent_reminders (
  key      text primary key,
  sent_at  timestamptz not null default now()
);

-- ===== Phase 5 (same as db/005_games.sql) =====
create table if not exists games (
  id           uuid primary key,
  space_id     uuid not null references spaces(id) on delete cascade,
  kind         text not null check (kind in ('wyr','tot','know')),
  created_by   uuid references members(id) on delete set null,
  subject      uuid references members(id) on delete set null,   -- "How well do you know me": whose answers are the truth
  iv           text not null,
  ciphertext   text not null,                                     -- { questions: [...] }
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);
create index if not exists games_space_idx on games(space_id, created_at desc);

-- Each person's encrypted picks. Never changed once submitted; the partner's are only served after yours.
create table if not exists game_answers (
  game_id       uuid not null references games(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  iv            text not null,
  ciphertext    text not null,
  submitted_at  timestamptz not null default now(),
  primary key (game_id, member_id)
);

-- ===== App lock (same as db/006_app_lock.sql) =====

create table if not exists device_locks (
  id             uuid primary key,                 -- the phone's random id
  member_id      uuid not null references members(id) on delete cascade,
  token_hash     text not null,                    -- proves it's the same phone
  lock_verifier  text not null,                    -- sha256 of a value derived from the lock (not the lock)
  server_half    text not null,                    -- released only after the right lock
  kind           text not null check (kind in ('pin','pattern','password')),
  failed         int  not null default 0,
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);
create index if not exists device_locks_member_idx on device_locks(member_id);

-- ===== Host password (same as db/007_host_password.sql) =====
create table if not exists host_settings (
  id             int primary key default 1 check (id = 1),   -- exactly one row
  password_hash  text,                                        -- scrypt, never the password itself
  failed         int not null default 0,
  locked_until   timestamptz,
  updated_at     timestamptz not null default now()
);
insert into host_settings (id) values (1) on conflict (id) do nothing;

-- ===== Status + typing (same as db/008_status_typing.sql) =====
create table if not exists statuses (
  id          uuid primary key,
  space_id    uuid not null references spaces(id) on delete cascade,
  member_id   uuid not null references members(id) on delete cascade,
  media_id    uuid,                                   -- photo statuses; the file expires with it
  iv          text not null,
  ciphertext  text not null,                          -- encrypted: text + colour, or photo details
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '24 hours',
  seen_at     timestamptz                             -- when the other person viewed it
);
create index if not exists statuses_space_idx on statuses(space_id, expires_at);

alter table members add column if not exists typing_until timestamptz;

alter table media drop constraint if exists media_purpose_check;
alter table media add constraint media_purpose_check check (purpose in ('message','avatar','background','status'));

-- ===== Live games + About you (same as db/009_live_and_about.sql) =====
alter table members add column if not exists gender text check (gender in ('man','woman'));

create table if not exists live_games (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references spaces(id) on delete cascade,
  kind        text not null check (kind in ('ludo','whot')),
  status      text not null default 'lobby' check (status in ('lobby','playing','done')),
  state       jsonb,                 -- the board; not encrypted (it's a game), hands only ever sent to their owner
  version     int not null default 0,
  created_by  uuid references members(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists live_games_space_idx on live_games(space_id, status);

-- Who has the game open right now. A game only moves while both are here.
create table if not exists live_presence (
  game_id    uuid not null references live_games(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  pinged_at  timestamptz not null default now(),
  primary key (game_id, member_id)
);

-- ===== About you + live games (same as db/009_about_live.sql) =====
alter table members add column if not exists gender text check (gender in ('man','woman'));

-- A live game table. The board isn't secret, so it's stored as plain game state (your chats stay encrypted).
create table if not exists live_games (
  id          uuid primary key,
  space_id    uuid not null references spaces(id) on delete cascade,
  kind        text not null check (kind in ('ludo','whot')),
  status      text not null default 'lobby' check (status in ('lobby','playing','done')),
  created_by  uuid references members(id) on delete set null,
  state       jsonb,
  version     int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists live_games_space_idx on live_games(space_id, status);

-- Who is at the table right now. A game only moves while both of you are here.
create table if not exists live_presence (
  game_id    uuid not null references live_games(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  pinged_at  timestamptz not null default now(),
  primary key (game_id, member_id)
);

-- ===== Game settings + bets (same as db/010_game_settings_bets.sql) =====
alter table live_games add column if not exists settings jsonb not null default '{}'::jsonb;
alter table live_games add column if not exists bets jsonb not null default '{}'::jsonb;     -- encrypted, per person
alter table live_games add column if not exists ready text[] not null default '{}';

-- What the loser owes the winner. The bet's words stay encrypted.
create table if not exists love_debts (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references spaces(id) on delete cascade,
  game_id     uuid not null,
  kind        text not null,
  owed_by     uuid not null references members(id) on delete cascade,
  owed_to     uuid not null references members(id) on delete cascade,
  iv          text not null,
  ciphertext  text not null,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);
create index if not exists love_debts_space_idx on love_debts(space_id, created_at desc);

-- ===== Sign-in guard (same as db/011_sign_in_guard.sql) =====
create table if not exists auth_throttle (
  key           text primary key,              -- a one-way hash of the network address, never the address itself
  failures      int not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);

-- ===== Editing messages (same as db/012_edit_messages.sql) =====
alter table messages add column if not exists edited_at timestamptz;

-- ===== Notification choices (same as db/013_notification_choices.sql) =====
alter table members add column if not exists notify_off text[] not null default '{}';
alter table members add column if not exists notify_quiet boolean not null default false;

-- ===== Deleting messages (same as db/014_delete_messages.sql) =====
alter table messages add column if not exists deleted_reason text;   -- 'removed' = deleted for everyone by the sender
create table if not exists hidden_messages (                          -- "delete for me"
  member_id   uuid   not null references members(id) on delete cascade,
  message_id  bigint not null references messages(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (member_id, message_id)
);

-- ===== Calls (same as db/015_calls.sql) =====
  id           uuid primary key,
  space_id     uuid not null references spaces(id) on delete cascade,
  caller_id    uuid not null references members(id) on delete cascade,
  callee_id    uuid not null references members(id) on delete cascade,
  kind         text not null check (kind in ('voice','video')),
  status       text not null default 'ringing' check (status in ('ringing','active','ended','missed','declined','busy')),
  created_at   timestamptz not null default now(),
  answered_at  timestamptz,
  ended_at     timestamptz
);
create index if not exists calls_space_idx on calls(space_id, created_at desc);

create table if not exists call_signals (
  id          bigint generated always as identity primary key,
  call_id     uuid not null references calls(id) on delete cascade,
  from_member uuid not null references members(id) on delete cascade,
  type        text not null check (type in ('offer','answer','restart','restart-answer')),
  iv          text not null,
  ciphertext  text not null,
  created_at  timestamptz not null default now()
);
create index if not exists call_signals_call_idx on call_signals(call_id, id);

-- ===== Send once (same as db/016_send_once.sql) =====
alter table messages add column if not exists client_id uuid;
create unique index if not exists messages_client_idx on messages(sender_id, client_id) where client_id is not null;

-- ===== Disguise (same as db/017_app_icon.sql) =====
create table if not exists app_icons (
  member_id   uuid primary key references members(id) on delete cascade,
  png192      text not null,
  png512      text not null,
  updated_at  timestamptz not null default now()
);

-- ===== Recording indicator (same as db/018_recording.sql) =====
alter table members add column if not exists typing_kind text;
