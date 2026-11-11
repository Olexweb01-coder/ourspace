-- Editing a message within 15 minutes of sending it.
-- Run once in the Neon SQL editor. Safe to run again.
alter table messages add column if not exists edited_at timestamptz;
