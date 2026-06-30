# PinPoint — Build Progress Log

> Running changelog of work completed by AI agents on the PinPoint ("Waze for Pedestrians") hackathon project.
> **Read this first** before making changes so you can see what already exists and avoid duplicating work.
> Append a new dated entry at the top of the "Changelog" section for every meaningful change.

## How to use this file

- Newest entries go at the **top** of the Changelog.
- Keep entries short: what changed, where, and anything other agents need to know (new env vars, contracts, follow-ups).
- Reference files with relative paths so they're easy to open.

## Project at a glance

- **App:** PinPoint — live crowd-sourced pedestrian hazard map.
- **Stack:** React + Leaflet (client) · Node + Express + TypeScript (server) · Supabase (Postgres/Storage) · JWT auth · SMTP email (Nodemailer).
- **Spec:** see [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md) and [docs/pinpoint_spec.md](docs/pinpoint_spec.md).
- **Layout:** `server/` (API) · `client/` (SPA) · `docs/` (specs).

## Current status

| Area                               | State                                 |
| ---------------------------------- | ------------------------------------- |
| Notification module (email)        | ✅ Implemented (typed)                |
| Repo / monorepo scaffold           | ✅ Implemented                        |
| Server app skeleton + middleware   | ✅ Scaffolded (routes are stubs)      |
| DB schema (`server/db/schema.sql`) | ✅ Written (run against Supabase)     |
| Auth routes                        | 🟦 Stub — Team Member #2              |
| Pins routes                        | 🟦 Stub — Team Member #3              |
| Votes routes                       | 🟦 Stub — Team Member #4              |
| Client (Vite + React)              | ✅ Scaffolded (map + pages are stubs) |

---

## Changelog

### 2026-06-30 — Dropped PostGIS; pins use plain lat/lng

- Removed PostGIS. `pins` now stores `lat double precision` + `lng double precision` instead of `geom geography(Point,4326)`; dropped the `create extension postgis` and the GiST index.
- Proximity ("pins near me" + vote gate) becomes an app-side **bounding-box prefilter + Haversine** in the (still-stubbed) pins/votes routes — no `ST_DWithin`.
- The `Pin` TypeScript types already used `lat`/`lng`, so no code changes were needed; updated [server/db/schema.sql](../server/db/schema.sql) and the docs.
- **Live DB migration** (run in Supabase SQL editor — empty table, safe):
  ```sql
  alter table pins drop column if exists geom;
  alter table pins add column if not exists lat double precision not null;
  alter table pins add column if not exists lng double precision not null;
  drop extension if exists postgis cascade;  -- also removes spatial_ref_sys
  ```

### 2026-06-30 — Email provider: Resend → SMTP (Nodemailer)

- Resend (and Mailgun sandbox) can't send to arbitrary recipients without a verified domain. Switched the email helper to **SMTP via Nodemailer** so it can email anyone with no domain (e.g. Gmail App Password).
- Rewrote [server/src/notifications/email.ts](../server/src/notifications/email.ts); same `sendEmail(email, message, options?)` signature, now returns the SMTP `messageId`.
- Swapped deps: removed `resend`, added `nodemailer` + `@types/nodemailer`.
- New env vars in `server/.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (replaced `RESEND_API_KEY`/`ALERTS_FROM_EMAIL`). Updated `server/src/config/env.ts`.
- Test with: `npm run email:test --workspace server -- you@example.com`.
- **Gmail setup:** enable 2-Step Verification → create an App Password → use it as `SMTP_PASS`.

### 2026-06-30 — Synced IMPLEMENTATION_SPEC with current code

- Updated [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md) to match the code: removed all **watch areas** content (table, `/watch-areas` endpoints, email-alert match logic, "Manage Alerts" UI, "Ring ring" stretch goal) and reflected **email-only** notifications.
- Replaced the "Email Alert Logic" section with a short "Notifications (email-only)" note describing the generic `sendEmail` helper; trimmed the affected work-division, data-security, and verification items.

### 2026-06-30 — Removed SMS notifications (email-only)

- Notifications are now **email-only**. Dropped the SMS/Twilio system entirely.
- Deleted `server/src/notifications/sms.ts`; removed its export from `notifications/index.ts`.
- Removed Twilio env vars from `server/src/config/env.ts` and `server/.env`, and the `twilio` dependency from `server/package.json` (uninstalled).

### 2026-06-30 — Switched map library Mapbox → Leaflet

- Mapbox requires billing, so the client now uses **Leaflet + OpenStreetMap** tiles (free, no API key).
- Swapped deps in `client/package.json` (`leaflet` + `@types/leaflet`, removed `mapbox-gl`).
- Removed `VITE_MAPBOX_TOKEN` from `client/.env` and `client/src/vite-env.d.ts`.
- Added `client/src/components/Map.tsx` (base map with OSM tile layer) and wired it into `App.tsx`; added `.map` styling in `index.css`.
- Team Member #5: add hazard pins (severity markers + radius circles) + fetch-on-`moveend` to the new Map component.

### 2026-06-30 — Removed WatchAreas (email-alert / "Ring ring" bonus)

- Dropped the watch-areas feature from the codebase per product decision.
- Deleted `server/src/routes/watchAreas.ts`; unmounted its router in `server/src/app.ts`.
- Removed `watchAreaLimiter` (`server/src/middleware/rateLimit.ts`), the `WatchArea` type (`server/src/types/index.ts`), and the `watch_areas` table + index (`server/db/schema.sql`).
- Cleaned up watch-area mentions in comments (`routes/pins.ts`, `middleware/auth.ts`, `client/src/api/client.ts`).
- Note: the design docs (`docs/IMPLEMENTATION_SPEC.md`, `docs/DB_schema (SQL).md`) still describe watch areas — left untouched; update if the spec should reflect the removal.

### 2026-06-30 — Port change (client 3000, server 8080)

- Server now runs on **8080**, client on **3000** (previously 4000 / 5173).
- Updated defaults in `server/src/config/env.ts` (`PORT`, `CLIENT_ORIGIN`), `client/vite.config.ts` (dev port), and the API fallback in `client/src/api/client.ts`.
- Updated `server/.env` (`PORT=8080`, `CLIENT_ORIGIN=http://localhost:3000`) and `client/.env` (`VITE_API_BASE_URL=http://localhost:8080`).

### 2026-06-30 — Full project scaffold

- Created monorepo structure: root `package.json` (npm workspaces), `.gitignore`, this `PROGRESS.md`.
- **Server** (`server/`):
  - `package.json`, `tsconfig.json`, `.env.example` (NodeNext ESM + tsx dev runner).
  - Entry/app: `src/index.ts`, `src/app.ts` (Express, CORS, JSON, error handler, `/health`).
  - Config: `src/config/env.ts` (centralized env access).
  - Lib: `src/lib/supabase.ts` (service-role client, server-only).
  - Middleware: `src/middleware/auth.ts` (`verifyJwt` + `optionalJwt`), `errorHandler.ts`, `rateLimit.ts`.
  - Routes (mounted, stubbed with TODOs + owners): `src/routes/auth.ts`, `pins.ts`, `votes.ts`, `watchAreas.ts`.
  - Types: `src/types/index.ts` (User, Pin, Vote, WatchArea, severity helpers).
  - DB: `server/db/schema.sql` (PostGIS + tables + indexes from the spec).
- **Client** (`client/`):
  - Vite + React + TypeScript: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `.env.example`.
  - App shell: `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`.
  - API client: `src/api/client.ts` (typed fetch wrapper with JWT header).
- Routes/pages/components beyond the shell are intentionally left as TODO stubs for the owning team members.

### 2026-06-30 — Notification module

- Added typed notification module under `server/src/notifications/`:
  - `email.ts` — `sendEmail(email, message, options?)` via **Resend** (free tier 3,000/mo).
  - `sms.ts` — `sendSms(phoneNumber, message)` via **Twilio** (free trial credit).
  - `index.ts` — barrel export.
- New env vars required: `RESEND_API_KEY`, `ALERTS_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`.
