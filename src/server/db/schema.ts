// Keep in sync with migrations/0001_init.sql
export const SCHEMA_SQL = `
create table if not exists sessions (
  id           text primary key,
  title        text not null,
  brief        text not null,            -- JSON
  plan         text,                     -- JSON | null
  bio_plan     text,                     -- JSON | null
  category     text,
  video_model  text not null,
  created_at   text not null,            -- ISO 8601
  updated_at   text not null
);

create table if not exists clips (
  id           text primary key,
  session_id   text not null references sessions(id) on delete cascade,
  scene_id     text not null,
  title        text not null,
  speakers     text not null default '[]',  -- JSON string[]
  prompt       text not null default '',
  status       text not null default 'pending',
  phase        text,
  request_id   text,
  request_endpoint text,
  image_key    text,
  video_key    text,
  duration_sec integer,
  error        text,
  created_at   text not null
);
create index if not exists clips_session_id_idx on clips(session_id);

create table if not exists character_library (
  id           text primary key,
  name         text not null,
  name_normalized text generated always as (lower(name)) stored,
  image_key    text not null,
  source       text not null default 'minted',
  request_id   text,
  status       text not null default 'done',
  created_at   text not null
);
create unique index if not exists character_library_name_normalized_key on character_library(name_normalized);
`;
