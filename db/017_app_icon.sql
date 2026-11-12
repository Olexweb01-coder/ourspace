-- Disguise: a photo you choose as the app's icon. Stored without encryption on purpose:
-- the phone has to show the icon before the app is unlocked. One per person; deleted with the person.
create table if not exists app_icons (
  member_id   uuid primary key references members(id) on delete cascade,
  png192      text not null,   -- base64 PNG, 192 x 192
  png512      text not null,   -- base64 PNG, 512 x 512
  updated_at  timestamptz not null default now()
);
