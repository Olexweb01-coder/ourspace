-- About you (him or her) and live games (Ludo, Whot).
-- Run once in the Neon SQL editor. Safe to run again.

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
