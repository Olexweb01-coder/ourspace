-- Phase 4: special days, cycle, goals, things to talk about.
-- Run once in the Neon SQL editor. Safe to run again.
-- Titles, notes and cycle dates are encrypted. Only what's needed to send reminders on time is plain.

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
