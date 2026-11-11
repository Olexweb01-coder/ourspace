-- Game settings, "Ready", bets of love and love debts.
-- Run once in the Neon SQL editor. Safe to run again.

alter table live_games add column if not exists settings jsonb not null default '{}'::jsonb;
alter table live_games add column if not exists bets jsonb not null default '{}'::jsonb;     -- encrypted, per person
alter table live_games add column if not exists ready text[] not null default '{}';

-- What the loser owes the winner. The bet's words stay encrypted.
create table if not exists love_debts (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references spaces(id) on delete cascade,
  game_id     uuid not null,
  kind        text not null,
  owed_by     uuid not null references members(id) on delete cascade,
  owed_to     uuid not null references members(id) on delete cascade,
  iv          text not null,
  ciphertext  text not null,
  created_at  timestamptz not null default now(),
  paid_at     timestamptz
);
create index if not exists love_debts_space_idx on love_debts(space_id, created_at desc);
