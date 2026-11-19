-- IS 403 is deliberately isolated from Beanos' existing public/Auth tables.
-- Run as the Supabase database owner. No existing data is modified.
begin;
create schema if not exists ganderson;
revoke all on schema ganderson from public, anon, authenticated;

create table if not exists ganderson.users (
  user_id bigint generated always as identity primary key,
  user_name text not null check (length(user_name) between 1 and 100),
  user_email text not null unique check (user_email = lower(user_email)),
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists ganderson.records (
  record_id bigint generated always as identity primary key,
  title text not null check (length(title) between 1 and 120),
  description text not null check (length(description) between 1 and 2000),
  lesson_topic text not null check (lesson_topic in ('Confidence','Texting','Rejection','Personal style','Invitations','Good dates')),
  difficulty text not null check (difficulty in ('Easy','Medium','Challenging')),
  estimated_minutes integer not null check (estimated_minutes between 1 and 180),
  created_at timestamptz not null default now()
);
-- Sessions and rate limits are internal security data, never CRUD content.
create table if not exists ganderson.sessions (
  token_hash text primary key,
  user_id bigint not null references ganderson.users(user_id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists sessions_user_idx on ganderson.sessions(user_id);
create table if not exists ganderson.login_limits (
  bucket text primary key,
  attempts integer not null,
  expires_at timestamptz not null
);
-- The module uses a server-side DB connection. No browser/API role gets access.
alter table ganderson.users enable row level security;
alter table ganderson.records enable row level security;
alter table ganderson.sessions enable row level security;
alter table ganderson.login_limits enable row level security;
revoke all on all tables in schema ganderson from public, anon, authenticated;
revoke all on all sequences in schema ganderson from public, anon, authenticated;
commit;
