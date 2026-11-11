-- Statuses (24 hours, just the two of you) and "typing…".
-- Run once in the Neon SQL editor. Safe to run again.

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
