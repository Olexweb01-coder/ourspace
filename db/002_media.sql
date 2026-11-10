-- Phase 2: photos, voice notes, videos, files, profile pictures, themes.
-- Run once in the Neon SQL editor. Safe to run again.

create table if not exists media (
  id           uuid primary key,                     -- chosen by the phone, also the file name
  space_id     uuid not null references spaces(id) on delete cascade,
  uploader_id  uuid not null references members(id) on delete cascade,
  pathname     text not null unique,                 -- where the encrypted file lives in Blob
  purpose      text not null check (purpose in ('message','avatar','background')),
  status       text not null default 'pending' check (status in ('pending','ready')),
  size         bigint not null default 0,
  message_id   bigint references messages(id) on delete set null,
  kept_by      uuid references members(id) on delete set null,
  expires_at   timestamptz,                          -- null = kept forever
  created_at   timestamptz not null default now()
);
create index if not exists media_space_idx   on media(space_id);
create index if not exists media_message_idx on media(message_id);
create index if not exists media_expiry_idx  on media(expires_at) where expires_at is not null;

alter table messages add column if not exists media_id uuid;
alter table members  add column if not exists avatar_media_id uuid;
alter table spaces   add column if not exists theme text not null default 'candle';
alter table spaces   add column if not exists background_media_id uuid;

-- When a message disappears (view-once opened, timer ran out), its file goes with it.
create or replace function media_follow_message() returns trigger language plpgsql as $$
begin
  if new.deleted and not old.deleted then
    update media set expires_at = now() where message_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists media_follow_message on messages;
create trigger media_follow_message
  after update of deleted on messages
  for each row execute function media_follow_message();
