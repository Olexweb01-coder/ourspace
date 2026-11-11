-- Phase 5: games. Free, built in, no AI.
-- Run once in the Neon SQL editor. Safe to run again.

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
