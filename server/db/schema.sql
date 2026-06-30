-- PinPoint database schema (Supabase / Postgres)
-- Run this in the Supabase SQL editor (or via migration) once per project.
-- Canonical source: IMPLEMENTATION_SPEC.md §"Data Model".

-- Accounts. Anonymous reporters have NO row here.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,           -- bcrypt
  display_name text not null,
  upvotes_received integer not null default 0,    -- credibility inputs
  downvotes_received integer not null default 0,
  created_at timestamptz default now()
  -- credibility_score = upvotes_received - downvotes_received (computed on read)
);

create table if not exists pins (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references users(id),  -- NULL = anonymous report
  lat double precision not null,
  lng double precision not null,
  name text,
  description text,
  severity text not null check (severity in ('Low','Medium','High')),
  radius_m integer not null,
  upvotes integer not null default 0,
  downvotes integer not null default 0,
  status text not null default 'active' check (status in ('active','removed')),
  expires_at timestamptz,                 -- anonymous: created_at + 1h; account: NULL
  created_at timestamptz default now()
);

-- One vote per ACCOUNT per pin. Anonymous users cannot vote.
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references pins(id) on delete cascade,
  user_id uuid not null references users(id),
  vote_type text not null check (vote_type in ('up','down')),
  created_at timestamptz default now(),
  unique (pin_id, user_id)
);
create index if not exists votes_pin_idx on votes(pin_id);
