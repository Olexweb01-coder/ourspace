-- "recording audio…" shows like "typing…": which of the two it is.
alter table members add column if not exists typing_kind text;
