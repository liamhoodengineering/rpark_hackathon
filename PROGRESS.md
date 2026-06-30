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
- **Stack:** React + Mapbox GL JS (client) · Node + Express + TypeScript (server) · Supabase (Postgres/PostGIS/Storage) · JWT auth · Resend (email) · Twilio (SMS).
- **Spec:** see [IMPLEMENTATION_SPEC.md](IMPLEMENTATION_SPEC.md) and [docs/pinpoint_spec.md](docs/pinpoint_spec.md).
- **Layout:** `server/` (API) · `client/` (SPA) · `docs/` (specs).

## Current status

| Area                               | State                                 |
| ---------------------------------- | ------------------------------------- |
| Notification module (email + SMS)  | ✅ Implemented (typed)                |
| Repo / monorepo scaffold           | ✅ Implemented                        |
| Server app skeleton + middleware   | ✅ Scaffolded (routes are stubs)      |
| DB schema (`server/db/schema.sql`) | ✅ Written (run against Supabase)     |
| Auth routes                        | 🟦 Stub — Team Member #2              |
| Pins routes                        | 🟦 Stub — Team Member #3              |
| Votes routes                       | 🟦 Stub — Team Member #4              |
| Watch-areas routes                 | 🟦 Stub — Team Member #3              |
| Client (Vite + React)              | ✅ Scaffolded (map + pages are stubs) |
| Mapbox map + pin layers            | ✅ Implemented — Team Member #5       |
| Report flow UI                     | ✅ Implemented — Team Member #5       |
| Pins API client (`api/pins.ts`)    | ✅ Implemented — Team Member #5       |

---

## Changelog

### 2026-06-30 — Team Member #5: Mapbox map + report UI

- **`client/src/api/pins.ts`** — `pinsApi.list/create/uploadPhoto` (photo is multipart, fire-and-forget).
- **`client/src/components/MapView.tsx`** — Mapbox GL JS dark map; severity-colored circle markers; per-pin radius fill + line layers; watch-area dashed blue circles; `moveend` re-fetches pins; click marker → `onPinSelect`; report mode → click sets draggable blue marker → `onLocationPicked`. Exposes `MapViewHandle.refreshPins()` via `forwardRef` + `useImperativeHandle`.
- **`client/src/components/ReportForm.tsx`** — modal overlay; radius slider 10–100m step 5 default 20; severity select; name/description/photo fields; anonymous expiry hint when logged out; photo upload is fire-and-forget after pin create.
- **`client/src/App.tsx`** — replaced `MapPlaceholder` with `<MapView>`; wired `reportMode`, `onLocationPicked`, `onVoteCast`, `onPinRemoved` (`mapRef.refreshPins()`); added Report FAB + hint pill + `<ReportForm>` overlay; `<main>` wrapper for flex height so map fills viewport.
- **`client/src/index.css`** — added `.report-fab`, `.report-mode-hint`, `.report-form-overlay`, `.report-form`, `.report-select`, `.report-textarea`, `.radius-display`, `.field-optional`.
- **`client/.env.example`** — added `VITE_MAPBOX_TOKEN`. Set in Mapbox dashboard with URL restriction for security.
- **Env var needed:** `VITE_MAPBOX_TOKEN` in `client/.env`.

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
