-- Retrying a send on a weak network never creates a duplicate: each message carries a tag from the phone.
-- Run once in the Neon SQL editor. Safe to run again.
alter table messages add column if not exists client_id uuid;
create unique index if not exists messages_client_idx on messages(sender_id, client_id) where client_id is not null;
