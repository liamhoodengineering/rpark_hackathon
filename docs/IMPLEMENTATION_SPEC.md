---
tags:
  - hackathon
  - spec
  - implementation
---

# Implementation Spec — PinPoint ("Waze for Pedestrians")

> Buildable engineering spec derived from [[pinpoint_spec]]. Role model: [[User roles]]. Schema: [[DB_schema (SQL)]]. See also [[Hackathon Home]], [[The Prompt]], [[Judging Criteria]], [[Submission Checklist]].

## Context

This turns [[pinpoint_spec]] into a buildable plan for the Research Park Hackathon (deadline **10:00 PM**; judged on shipped app, data security, demo clarity; prizes: Most Creative / Most User Friendly). **Greenfield** build — no existing code.

**Locked decisions:**

- **Map API:** Leaflet + OpenStreetMap (free, no API key)
- **Frontend:** React
- **Backend:** Node (Express)
- **Database:** **Supabase** (managed Postgres + PostGIS + Storage)
- **Auth:** **JWT** (email + password), issued by our Node backend
- **Roles:** **Anonymous** (no login) can report; **Account** users report + vote + accrue credibility. Full breakdown in [[User roles]].
- **Scope:** **3-feature MVP + one realized stretch goal.** Core MVP: **Plugged in** (Leaflet), **Where are you** (geo-anchored pins + proximity-gated voting), **Mob mentality** (crowd pins + votes drive removal). Bonus: **Ring ring** — email alerts when a matching hazard appears in a user's watch area. **Pitch ordering:** demo the tight 3-feature MVP first, then show email alerts as the "if we had more time" bonus.

**Outcome:** a live web app where **anonymous or registered** users drop hazard pins on a Leaflet map. Account users within a pin's radius cast an **upvote** ("still here") or **downvote** ("gone"); a pin is removed once it has **≥5 votes and downvotes outweigh upvotes**. Anonymous pins also auto-expire after **1 hour**. Account reporters accrue a **credibility score** from votes on their pins. Users can also set **watch areas** with a minimum severity and receive an **email** when a qualifying new hazard is reported nearby.

---

## Architecture

```
React SPA (Vercel/Netlify)
  - Leaflet map (OpenStreetMap tiles), report/vote UI, JWT in localStorage
        │  HTTPS, Authorization: Bearer <JWT>
        ▼
Node + Express API (Render/Railway)
  - /auth, /pins, /votes, /watch-areas  • JWT verify middleware • rate limiting
  - geo queries + removal logic + email-alert matching
        │  supabase-js (service role key, server-side only)   → Resend (email alerts)
        ▼
Supabase  →  Postgres + PostGIS (pins, votes, users, watch_areas) + Storage (photos)
```

**Why:** all DB access goes **through the Node API**, never from the browser. The Supabase service-role key lives only on the server. Auth, rate limiting, and removal logic live in one trusted place — this satisfies the data-security judging criterion.

---

## Data Model (Postgres / PostGIS via Supabase)

Canonical schema lives in [[DB_schema (SQL)]] — reproduced here for convenience.

```sql
create extension if not exists postgis;

-- Accounts. Anonymous reporters have NO row here.
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  phone text,                            -- optional
  password_hash text not null,           -- bcrypt
  display_name text not null,
  upvotes_received integer not null default 0,    -- credibility inputs
  downvotes_received integer not null default 0,
  created_at timestamptz default now()
  -- credibility_score = upvotes_received - downvotes_received (computed on read)
);

create table pins (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references users(id),  -- NULL = anonymous report
  geom geography(Point, 4326) not null,   -- lng/lat
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
create index pins_geom_idx on pins using gist (geom);

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

create table watch_areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  geom geography(Point, 4326) not null,     -- center of the watch zone
  radius_m integer not null,
  min_severity text not null default 'Low'
    check (min_severity in ('Low','Medium','High')),
  email_enabled boolean not null default true,
  created_at timestamptz default now()
);
create index watch_areas_geom_idx on watch_areas using gist (geom);
```

Notes:

- `geography(Point,4326)` enables `ST_DWithin` for "pins near me", the proximity vote-gate, and email-alert matching — no app-side Haversine.
- **Anonymous vs account** is decided by `pins.reporter_id` (`NULL` → anonymous, `expires_at = now()+1h`; non-null → persists). See [[User roles]].
- **Lazy expiry:** filter `expires_at is null or expires_at > now()` on reads so expired anonymous pins drop off the map — no cron job.
- **`upvotes`/`downvotes`** are denormalized counters on `pins`, kept in sync from the `votes` table on each vote and mirrored into the reporter's `users.upvotes_received`/`downvotes_received` for credibility.
- Severity is ranked **Low(1) < Medium(2) < High(3)**. A pin matches a watch area when `pin.severity_rank >= watch.min_severity_rank` and it falls inside the watch radius.

---

## Removal Logic (single source of truth, runs after each vote)

Recompute for the affected pin after every vote:

1. Tally `votes` for the pin: `up = count(vote_type='up')`, `down = count(vote_type='down')`.
2. If `up + down >= 5` **and** `down > up` → `pins.status='removed'` (removal by ratio).
3. Otherwise pin stays `active`.
4. Sync the denormalized `pins.upvotes`/`downvotes` counters and the reporter's `users.upvotes_received`/`downvotes_received` (credibility).

**Anonymous pins** additionally disappear at their 1-hour `expires_at` regardless of votes (lazy filter on read).
**Owner override:** `DELETE /pins/:id` by the account that created it sets `status='removed'` with no vote check. (Anonymous pins have no owner to delete them — they just expire.)

---

## Email Alert Logic (runs synchronously after a successful `POST /pins`)

After the pin is inserted, find recipients and email them — **before** returning the response, but wrapped so email failure never fails the pin create:

1. Match recipients:
   ```sql
   select distinct u.id, u.email, u.display_name
   from watch_areas w join users u on u.id = w.user_id
   where w.email_enabled = true
     and severity_rank($pin_severity) >= severity_rank(w.min_severity)
     and ST_DWithin(w.geom, $pin_geom, w.radius_m)
     and ($reporter_id is null or w.user_id <> $reporter_id);  -- don't self-email an account reporter
   ```
2. For each recipient, send one email via **Resend** containing: severity, short description, a **coarse area label** (neighborhood — _not_ exact lat/lng), a link to the map, and an **unsubscribe / manage-alerts** link.
3. **Wrap the whole block in try/catch.** On any Resend failure, log and continue — the pin must still publish and `POST /pins` must still return success.

---

## API Surface (Express)

| Method | Route                     | Auth     | Purpose                                                                                                                                                                                                                                          |
| ------ | ------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/auth/register`          | –        | email, password, display_name → JWT                                                                                                                                                                                                              |
| POST   | `/auth/login`             | –        | email, password → JWT                                                                                                                                                                                                                            |
| GET    | `/auth/me`                | JWT      | current user                                                                                                                                                                                                                                     |
| GET    | `/pins?lat=&lng=&radius=` | –        | active, non-expired pins near a point (`ST_DWithin`)                                                                                                                                                                                             |
| POST   | `/pins`                   | optional | create pin. **Anonymous** (no token) → `reporter_id=NULL`, `expires_at=now()+1h`, subject to **5-min cooldown**; **account** (JWT) → persistent. On success runs email-alert matching + send (synchronous, try/catch — never fails the response) |
| DELETE | `/pins/:id`               | JWT      | owner-only delete (account pins)                                                                                                                                                                                                                 |
| POST   | `/pins/:id/photo`         | JWT      | upload photo → Supabase Storage (EXIF stripped)                                                                                                                                                                                                  |
| GET    | `/pins/:id/votes`         | –        | tally `{up, down, total}`                                                                                                                                                                                                                        |
| POST   | `/pins/:id/vote`          | JWT      | account-only; one up/down per user (`unique(pin_id,user_id)`); server verifies caller within `radius_m`; runs removal logic + credibility sync                                                                                                   |
| GET    | `/watch-areas`            | JWT      | list the caller's watch areas                                                                                                                                                                                                                    |
| POST   | `/watch-areas`            | JWT      | create a watch area (lat, lng, radius, min_severity)                                                                                                                                                                                             |
| DELETE | `/watch-areas/:id`        | JWT      | remove a watch area (owner-only)                                                                                                                                                                                                                 |

Cross-cutting: `verifyJwt` middleware (required on votes/watch-areas/delete; **optional** on `POST /pins`), `express-rate-limit` on `/pins` (plus the per-device **5-min anonymous cooldown**), `/vote`, and `/watch-areas`, zod validation, CORS locked to the frontend origin. Email alerts go through **Resend** via a server-side `sendHazardAlert(recipient, pin)` helper; `RESEND_API_KEY` and `ALERTS_FROM_EMAIL` are server-only env vars.

---

## Frontend (React + Leaflet)

- **Map view:** Leaflet + OpenStreetMap tiles, pins colored by severity (green/orange/red), radius drawn as a circle layer (`L.circle`). Re-fetch on map `moveend` using viewport center + radius.
- **Report flow:** "Report" → confirm/drag pin (defaults to `navigator.geolocation`) → radius slider → severity select → optional description/photo → `POST /pins`. **Works logged-out** (anonymous); show a hint that anonymous pins expire after 1 hour and to sign in for persistent pins + voting.
- **Vote flow (account only):** when GPS is inside a pin's radius, surface a "Is this still here?" card with **👍 Upvote / 👎 Downvote**; show live up/down tally and the reporter's credibility badge; account owner sees a **Delete** button on their own pins. Logged-out users see a "sign in to vote" prompt.
- **Auth screens:** register/login; store JWT; attach `Authorization` header; redirect unauthenticated users.
- **Geolocation:** request permission once, watch position, pass `lat/lng` to vote calls for server-side eligibility checks.
- **Manage Alerts screen:** list watch areas; add one by dropping/dragging a point on the map + radius slider + min-severity selector + email on/off toggle; delete existing ones. Render watch-area circles as a distinct (dashed/muted) layer so they read separately from hazard pins. Include an unsubscribe/manage-alerts route reachable from the email link.

---

## Data Security Checklist (judged criterion — build in from the start)

- bcrypt password hashing; JWT signed with a server secret (env var), short expiry.
- **Voting, credibility, persistent pins, and watch areas all require a valid JWT.** Only _reporting_ is open to anonymous users — and that is bounded by a **1-hour pin TTL + 5-minute per-device cooldown**, so anonymous access can't stuff votes, build reputation, or leave lasting spam. (Trade-off vs. fully-authed writes is intentional — see [[User roles]].)
- `unique(pin_id,user_id)` prevents vote stacking; anonymous users can't vote at all.
- `express-rate-limit` caps pins/votes per account per window; anonymous reports additionally gated by the 5-min cooldown.
- Store only pin lat/lng — **no** continuous user-location logging.
- Strip EXIF/GPS from uploaded photos (`sharp` re-encode drops metadata) before Storage.
- Supabase **service-role key server-side only** — never in the browser bundle. Frontend talks only to our API.
- **Email is PII** — reuse the existing `users.email`; no separate marketing list.
- **Alert emails don't leak location/identity** — describe a coarse area only, never exact pin lat/lng or the reporter's name.
- **Honor `email_enabled` / unsubscribe** on every send (no email when disabled).
- **Per-recipient alert rate limit** (e.g. cap emails per user per hour) so a spam-pin can't blast inboxes; also protects the Resend quota.
- `RESEND_API_KEY` server-side only.

---

## Work Division — 6 People

Names are **Team Member #1–#6** so all AI agents reference the same owners. First ~30 min: everyone agrees on the API contract above + shared types, then split.

### Team Member #1 — Repo & Infra Lead (Backend foundation)

- Scaffold monorepo (`/server`, `/client`), shared env config, README.
- Stand up Supabase project; enable PostGIS + run the schema migration.
- Express app skeleton, CORS, error handling, `supabase-js` wiring (service-role key).
- **Owns deployment**: backend → Render/Railway, frontend → Vercel/Netlify; wires env vars; produces the **live Website URL** deliverable.
- Unblocks everyone first, then floats to whichever side is behind.

### Team Member #2 — Auth & Security

- `/auth/register`, `/auth/login`, `/auth/me`; bcrypt + JWT issue/verify; `verifyJwt` middleware.
- `express-rate-limit` on write routes; zod validation; CORS lock-down.
- Photo upload endpoint + EXIF stripping (`sharp`) + Supabase Storage bucket.
- **Resend integration:** `sendHazardAlert(recipient, pin)` helper, env wiring, unsubscribe handling, per-recipient send rate-limit.
- Owns the **data-security talking points** for the pitch.

### Team Member #3 — Pins API (Report backend)

- `GET /pins` (`ST_DWithin` near-query), `POST /pins`, `DELETE /pins/:id` (reporter-only).
- Severity/radius validation; only return `active` pins.
- **`watch_areas` table + endpoints** (`GET/POST/DELETE /watch-areas`) and the **email-alert match query** hooked into `POST /pins` (calls #2's `sendHazardAlert`). Agree the helper signature with #2 early — this is the new cross-dependency.
- Seed script with a few demo pins for the live demo.

### Team Member #4 — Votes API (Voting backend)

- `POST /pins/:id/vote` (account-only) with server-side proximity gate (`ST_DWithin` caller vs pin), one up/down per user, `GET /pins/:id/votes` up/down tally.
- **Owns removal-by-ratio logic** (≥5 votes + `down > up`), the `upvotes`/`downvotes` counter sync, and the reporter **credibility** rollup (`users.upvotes_received`/`downvotes_received`).
- Owns the **anonymous-pin 1-hour expiry** filter on reads.
- Unit-test threshold/ratio edge cases (exactly 5 votes, tie, expiry).

### Team Member #5 — Frontend Map Lead (Plugged in + Report UI)

- Leaflet integration, severity-colored pins, radius circle layer, fetch-on-`moveend`.
- Report flow UI: place/drag pin, radius slider, severity select, description/photo, submit.
- Reporter **Delete** button on own pins.
- Owns map tile/layer setup (OpenStreetMap tiles; no API key needed).

### Team Member #6 — Frontend Voting/Auth + Glue (Where are you + Mob mentality UI)

- Auth screens (register/login), JWT storage, auth'd API client, route guards.
- Geolocation (`navigator.geolocation` watch), proximity-aware **vote card**, live tally display.
- **Manage Alerts UI** (watch-area create/list/delete + min-severity + email toggle) and the unsubscribe/manage-alerts route.
- End-to-end integration with #5; owns **Submission deliverables**: 2–3 min YouTube pitch, slideshow, final GitHub repo.

**Dependency order:** #1 unblocks all → #2/#3/#4 build API in parallel against the contract → #5/#6 build UI against mocks early, swap to real API as endpoints land → #1+#6 handle deploy + submission in the final hour.

---

## Verification (end-to-end)

1. **Local boot:** `npm run dev` in `/server` and `/client`; React loads the Leaflet map.
2. **Auth & roles:** register → JWT → `/auth/me` returns the user; `POST /pins` **without** a token succeeds as anonymous (`reporter_id=NULL`, `expires_at≈now+1h`); a second anonymous report within 5 min is rejected by cooldown; `POST /pins/:id/vote` without a token returns 401.
3. **Report:** drop a pin via UI (logged in and logged out) → appears on map → row exists in `pins` with correct `geom`/severity and the right `reporter_id`/`expires_at`.
4. **Anonymous expiry:** set an anonymous pin's `expires_at` in the past → it drops off `GET /pins`.
5. **Proximity gate:** `POST /pins/:id/vote` from _outside_ `radius_m` → rejected; from inside → accepted.
6. **Removal by ratio:** cast votes so a pin has 4 total → stays; reach 5 total with `down > up` → pin flips to `removed`, drops off `GET /pins`. Confirm the reporter's `upvotes_received`/`downvotes_received` (credibility) update.
7. **Owner delete:** account owner hits Delete → pin removed regardless of votes.
8. **Security spot-checks:** service-role key absent from browser bundle; hammer `POST /pins` to trip rate limiter; upload a geotagged photo → stored file has no EXIF GPS.
9. **Email alerts:** create a watch area for User A (radius R, `min_severity = High`). As User B: a **High** pin inside R → A gets an email; a **Low** pin inside R → **no** email (below threshold); a High pin **outside** R → no email. Reporter drops a High pin inside their **own** watch area → no self-email. Toggle `email_enabled` off → no email on a matching High pin. Confirm the email body has a coarse area (no exact lat/lng) and a working unsubscribe link. Force a Resend failure (bad key) → `POST /pins` still returns success and the pin appears on the map.
10. **Deployed smoke test:** repeat the report/vote flow against the live URL on two devices/accounts (one "nearby") for the demo.

## Submission Deliverables (owned by #1 + #6)

GitHub repo · live Website URL · 2–3 min YouTube pitch · slideshow. Demo script follows [[pinpoint_spec]] §"Demo Script Sketch."

## Related

- [[pinpoint_spec]]
- [[Hackathon Home]]
- [[The Prompt]]
- [[Judging Criteria]]
- [[Submission Checklist]]
