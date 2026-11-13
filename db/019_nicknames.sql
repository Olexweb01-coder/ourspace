-- What each of you calls the other. Encrypted on the phone (end-to-end), like messages; both of you see it.
-- Stored on the namer's own row: nick_* on Olex's row = what Olex calls his partner.
alter table members add column if not exists nick_iv text;
alter table members add column if not exists nick_ct text;
