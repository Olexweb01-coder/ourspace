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
