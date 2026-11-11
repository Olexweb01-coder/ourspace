-- Live Ludo and Whot, plus "About you" (man or woman, for him/her wording).
-- Run once in the Neon SQL editor. Safe to run again.

alter table members add column if not exists gender text check (gender in ('man','woman'));

create table if not exists live_games (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references spaces(id) on delete cascade,
  kind        text not null check (kind in ('ludo','whot')),
  status      text not null default 'lobby' check (status in ('lobby','playing','done')),
  state       jsonb,                 -- the board; not encrypted (it's a game), hands only ever sent to their owner
  version     int not null default 0,
  created_by  uuid references members(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists live_games_space_idx on live_games(space_id, status);

-- Who has the game open right now. A game only moves while both are here.
create table if not exists live_presence (
  game_id    uuid not null references live_games(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  pinged_at  timestamptz not null default now(),
  primary key (game_id, member_id)
);
