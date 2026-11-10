-- Phase 3: daily feelings, streaks, missing-you reminders.
-- Run once in the Neon SQL editor. Safe to run again.

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
