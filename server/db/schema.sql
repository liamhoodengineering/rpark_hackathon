-- PinPoint database schema (Supabase / Postgres)
-- Run this in the Supabase SQL editor (or via migration) once per project.
-- Canonical source: IMPLEMENTATION_SPEC.md §"Data Model".

-- Accounts. Anonymous reporters have NO row here.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,           -- bcrypt
  display_name text not null,
  lat double precision,                  -- last known location (opt-in, for alerts)
  lng double precision,
  alerts_enabled boolean not null default false,   -- receive nearby-hazard alerts + live-track location
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

create or replace function list_active_pins(
  p_lng double precision,
  p_lat double precision,
  p_radius_m integer
)
returns table (
  id uuid,
  reporter_id uuid,
  lng double precision,
  lat double precision,
  name text,
  description text,
  severity text,
  radius_m integer,
  upvotes integer,
  downvotes integer,
  status text,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
stable
as $$
  select
    p.id,
    p.reporter_id,
    st_x(p.geom::geometry) as lng,
    st_y(p.geom::geometry) as lat,
    p.name,
    p.description,
    p.severity,
    p.radius_m,
    p.upvotes,
    p.downvotes,
    p.status,
    p.expires_at,
    p.created_at
  from pins p
  where p.status = 'active'
    and (p.expires_at is null or p.expires_at > now())
    and st_dwithin(
      p.geom,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      p_radius_m
    )
  order by p.created_at desc;
$$;

create or replace function get_pin_by_id(p_pin_id uuid)
returns table (
  id uuid,
  reporter_id uuid,
  lng double precision,
  lat double precision,
  name text,
  description text,
  severity text,
  radius_m integer,
  upvotes integer,
  downvotes integer,
  status text,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
stable
as $$
  select
    p.id,
    p.reporter_id,
    st_x(p.geom::geometry) as lng,
    st_y(p.geom::geometry) as lat,
    p.name,
    p.description,
    p.severity,
    p.radius_m,
    p.upvotes,
    p.downvotes,
    p.status,
    p.expires_at,
    p.created_at
  from pins p
  where p.id = p_pin_id;
$$;

create or replace function create_pin(
  p_reporter_id uuid,
  p_lng double precision,
  p_lat double precision,
  p_name text,
  p_description text,
  p_severity text,
  p_radius_m integer,
  p_expires_at timestamptz
)
returns table (
  id uuid,
  reporter_id uuid,
  lng double precision,
  lat double precision,
  name text,
  description text,
  severity text,
  radius_m integer,
  upvotes integer,
  downvotes integer,
  status text,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
volatile
as $$
  with inserted as (
    insert into pins (
      reporter_id,
      geom,
      name,
      description,
      severity,
      radius_m,
      expires_at
    )
    values (
      p_reporter_id,
      st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      nullif(p_name, ''),
      nullif(p_description, ''),
      p_severity,
      p_radius_m,
      p_expires_at
    )
    returning *
  )
  select
    p.id,
    p.reporter_id,
    st_x(p.geom::geometry) as lng,
    st_y(p.geom::geometry) as lat,
    p.name,
    p.description,
    p.severity,
    p.radius_m,
    p.upvotes,
    p.downvotes,
    p.status,
    p.expires_at,
    p.created_at
  from inserted p;
$$;

create or replace function update_pin(
  p_pin_id uuid,
  p_lng double precision,
  p_lat double precision,
  p_name text,
  p_description text,
  p_severity text,
  p_radius_m integer,
  p_status text
)
returns table (
  id uuid,
  reporter_id uuid,
  lng double precision,
  lat double precision,
  name text,
  description text,
  severity text,
  radius_m integer,
  upvotes integer,
  downvotes integer,
  status text,
  expires_at timestamptz,
  created_at timestamptz
)
language sql
volatile
as $$
  with updated as (
    update pins
    set geom = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
        name = nullif(p_name, ''),
        description = nullif(p_description, ''),
        severity = p_severity,
        radius_m = p_radius_m,
        status = p_status
    where id = p_pin_id
    returning *
  )
  select
    p.id,
    p.reporter_id,
    st_x(p.geom::geometry) as lng,
    st_y(p.geom::geometry) as lat,
    p.name,
    p.description,
    p.severity,
    p.radius_m,
    p.upvotes,
    p.downvotes,
    p.status,
    p.expires_at,
    p.created_at
  from updated p;
$$;

create or replace function delete_pin(p_pin_id uuid)
returns boolean
language plpgsql
volatile
as $$
begin
  delete from pins where id = p_pin_id;
  return found;
end;
$$;
