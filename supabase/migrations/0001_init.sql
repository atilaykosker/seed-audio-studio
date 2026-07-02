-- supabase/migrations/0001_init.sql
-- Bookticle Studio — initial schema (single shared workspace, no per-user rows).

create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  brief        jsonb not null,
  plan         jsonb,
  bio_plan     jsonb,
  category     text,
  video_model  text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists clips (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  scene_id     text not null,
  title        text not null,
  speakers     jsonb not null default '[]'::jsonb,
  prompt       text not null default '',
  status       text not null default 'pending',
  phase        text,
  request_id   text,
  image_key    text,
  video_key    text,
  duration_sec numeric,
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists clips_session_id_idx on clips(session_id);

create table if not exists character_library (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  image_key    text not null,
  source       text not null default 'minted',
  request_id   text,
  status       text not null default 'done',
  created_at   timestamptz not null default now()
);
-- Case-insensitive reuse key (matches the store's lowercased name lookup).
create unique index if not exists character_library_name_key on character_library(lower(name));
