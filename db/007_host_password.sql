-- Host password: a short password you choose, needed only to start a new space when you're not signed in.
-- Run once in the Neon SQL editor. Safe to run again.
create table if not exists host_settings (
  id             int primary key default 1 check (id = 1),   -- exactly one row
  password_hash  text,                                        -- scrypt, never the password itself
  failed         int not null default 0,
  locked_until   timestamptz,
  updated_at     timestamptz not null default now()
);
insert into host_settings (id) values (1) on conflict (id) do nothing;
