-- Delete for me / delete for everyone.
-- Run once in the Neon SQL editor. Safe to run again.
alter table messages add column if not exists deleted_reason text;   -- 'removed' = deleted for everyone by the sender
create table if not exists hidden_messages (                          -- "delete for me"
  member_id   uuid   not null references members(id) on delete cascade,
  message_id  bigint not null references messages(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (member_id, message_id)
);
