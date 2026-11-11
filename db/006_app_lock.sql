-- App lock: a quick PIN, pattern or password per phone, instead of the shared password every time.
-- Run once in the Neon SQL editor. Safe to run again.
-- The server holds half of each phone's unlock secret and only releases it for the right lock, 5 tries max.
-- It never sees the PIN itself, and never sees the phone's scrambled key.

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
