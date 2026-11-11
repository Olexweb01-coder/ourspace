-- Guards the front-door sign-in against guessing (it doesn't know which space is being tried).
-- Run once in the Neon SQL editor. Safe to run again.
create table if not exists auth_throttle (
  key           text primary key,              -- a one-way hash of the network address, never the address itself
  failures      int not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);
