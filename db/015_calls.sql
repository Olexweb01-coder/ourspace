-- Voice and video calls. The call setup (offer/answer) is encrypted with the space key; the call itself is
-- encrypted end to end by WebRTC. Run once in the Neon SQL editor. Safe to run again.
create table if not exists calls (
  id           uuid primary key,
  space_id     uuid not null references spaces(id) on delete cascade,
  caller_id    uuid not null references members(id) on delete cascade,
  callee_id    uuid not null references members(id) on delete cascade,
  kind         text not null check (kind in ('voice','video')),
  status       text not null default 'ringing' check (status in ('ringing','active','ended','missed','declined','busy')),
  created_at   timestamptz not null default now(),
  answered_at  timestamptz,
  ended_at     timestamptz
);
create index if not exists calls_space_idx on calls(space_id, created_at desc);

create table if not exists call_signals (
  id          bigint generated always as identity primary key,
  call_id     uuid not null references calls(id) on delete cascade,
  from_member uuid not null references members(id) on delete cascade,
  type        text not null check (type in ('offer','answer','restart','restart-answer')),
  iv          text not null,
  ciphertext  text not null,
  created_at  timestamptz not null default now()
);
create index if not exists call_signals_call_idx on call_signals(call_id, id);
