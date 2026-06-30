---
tags:
  - hackathon
  - spec
  - database
---

# DB Schema (SQL) — PinPoint

> Canonical Postgres schema (Supabase). See [[IMPLEMENTATION_SPEC]], [[User roles]], [[pinpoint_spec]].

Reflects the evolved design: **anonymous reporting**, **upvote/downvote + credibility**. All access goes through the Node API (service-role key server-side only).

```sql
-- Accounts. Anonymous reporters have NO row here (see pins.reporter_id NULL).
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,           -- bcrypt
  display_name text not null,
  lat double precision,                  -- last known location (opt-in, for alerts)
  lng double precision,
  upvotes_received integer not null default 0,    -- aggregated across this user's pins
  downvotes_received integer not null default 0,
  created_at timestamptz default now()
  -- credibility_score = upvotes_received - downvotes_received (computed on read)
);

create table pins (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references users(id),  -- NULL = anonymous report
  lat double precision not null,
  lng double precision not null,
  name text,                              -- short title for the report
  description text,
  severity text not null check (severity in ('Low','Medium','High')),  -- rank Low<Med<High
  radius_m integer not null,
  upvotes integer not null default 0,
  downvotes integer not null default 0,
  status text not null default 'active' check (status in ('active','removed')),
  expires_at timestamptz,                 -- anonymous: created_at + 1h; account: NULL (no expiry)
  created_at timestamptz default now()
);
create index pins_status_idx on pins(status);

-- One vote per ACCOUNT per pin. Anonymous users cannot vote.
create table votes (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references pins(id) on delete cascade,
  user_id uuid not null references users(id),
  vote_type text not null check (vote_type in ('up','down')),
  created_at timestamptz default now(),
  unique (pin_id, user_id)
);
create index votes_pin_idx on votes(pin_id);
```

## Notes & rules

- **Anonymous vs account pin** is decided by `reporter_id`: `NULL` → anonymous (set `expires_at = now() + interval '1 hour'`); non-null → account pin (`expires_at = NULL`, persists until owner-deleted or vote-removed). See [[User roles]].
- **`upvotes`/`downvotes` on `pins`** are denormalized counters kept in sync on each vote (and mirrored into the reporter's `users.upvotes_received` / `downvotes_received` for credibility). The `votes` table is the source of truth; counters are for fast reads.
- **Removal by ratio:** when a pin has **≥ 5 votes** and `downvotes > upvotes`, set `status = 'removed'`. Recomputed after each vote.
- **Anonymous expiry:** filter out `expires_at < now()` on reads (lazy), so expired anonymous pins drop off the map without a cron job.
- **5-minute anonymous cooldown** is enforced at the **app layer** (per device/IP), not in the schema — see [[User roles]].
- Distance is computed app-side from `lat`/`lng` (bounding-box prefilter + **Haversine**) — no PostGIS at this scale.
- **`users.lat`/`users.lng`** are an opt-in last-known location (set via `PUT /auth/me/location`). On new-pin creation, users within the pin's `radius_m` get an email hazard alert.
- **Photos** (if used) live in Supabase Storage with EXIF stripped; a `photo_url` column can be added to `pins` when that lands.

## Related

- [[IMPLEMENTATION_SPEC]]
- [[User roles]]
- [[pinpoint_spec]]
- [[Hackathon Home]]
