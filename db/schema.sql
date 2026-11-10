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
