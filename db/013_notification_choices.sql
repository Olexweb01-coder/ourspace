-- Which notifications each person receives, and quiet hours (11 pm to 7 am in their own time zone).
-- Run once in the Neon SQL editor. Safe to run again.
alter table members add column if not exists notify_off text[] not null default '{}';
alter table members add column if not exists notify_quiet boolean not null default false;
