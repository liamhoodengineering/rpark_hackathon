---
tags:
  - hackathon
  - spec
---
# App Spec: "Waze for Pedestrians" — Working Title: PinPoint

> Built for the Research Park Hackathon. See [[Hackathon Home]], [[The Prompt]], [[Judging Criteria]].

## One-Line Pitch
A live, crowd-sourced map where pedestrians flag safety hazards — potholes, broken streetlights, unsafe areas — and the community votes to confirm or clear them in real time.

## Core Features (the 3 we're committing to)
Per [[The Prompt]], exactly three features are required for the build. We're scoping to:

1. **Plugged in** — Integrate a mapping library (**Leaflet + OpenStreetMap**, free, no API key) to render pins, radii, and the live map surface.
2. **Where are you** — Location is core to the app: pins are geo-anchored, and voting eligibility is gated by proximity to the pin.
3. **Mob mentality** — Users contribute pins and votes; the community's shared input determines what stays on the map.

### Stretch goals (build only if time allows)
- **Live updates** — push new pins/vote changes to nearby users without a manual refresh.
- **Ring ring** — push notification when a hazard appears near a user's saved routes/areas.
- **Make no mistakes (AI)** — AI-assisted severity suggestion or duplicate-pin detection.

Keep these explicitly separate in the pitch — judges should see a tight 3-feature MVP first, then "if we had more time" stretch goals second. This protects the "creativity over complexity" judging principle better than presenting all six as equally built.

---

## User Roles
- **Reporter** — any logged-in user who drops a pin.
- **Voter** — any logged-in user within the pin's radius who can confirm/dispute it.
- All users can act as both; no special account tiers needed for MVP.

## Core Flow: Reporting a Hazard
1. User taps "Report" on the map (or long-presses a location).
2. User confirms/adjusts the pin location (defaults to current GPS position).
3. User sets a **radius** in meters/feet — this radius does double duty:
   - **Danger zone**: how far the hazard's visibility/risk extends (e.g. a block-long dark stretch vs. a single pothole).
   - **Voting eligibility zone**: only users physically within this radius can vote on the pin.
4. User selects a **severity tier**: Low / Medium / High.
5. User optionally adds a short description and/or photo.
6. Pin is published to the live map immediately.

## Core Flow: Voting on a Pin
1. A logged-in user enters a pin's radius (location checked client-side via GPS).
2. The app surfaces nearby pins with a prompt: "Is this still here?"
3. User votes **Still here** or **Gone**.
4. **Vote weight & expiry:**
   - Every vote counts equally — no reputation weighting in MVP.
   - Each vote expires **24 hours** after it's cast and is removed from the tally. This keeps the score reflecting current, not historical, consensus — important since conditions (e.g. a pothole) can be fixed or a hazard cleared after the report.
5. **Removal logic:**
   - A pin needs a **minimum of 5 active (non-expired) votes** before removal is even considered.
   - Once the minimum is hit, if the majority of active votes are "Gone," the pin is removed from the map.
   - If a pin's active vote count drops back under 5 (due to 24-hour expiry) before reaching majority, it simply stays on the map — removal only triggers once threshold + majority are both met simultaneously.
6. **Reporter override:** the original poster always has a direct **Delete** button on their own pin, independent of the voting system — no minimum vote count required for self-removal.

## Data Model (high-level)

| Entity | Key fields |
|---|---|
| **User** | id, auth credentials (hashed), display name |
| **Pin** | id, reporter_id, lat/lng, radius_m, severity (Low/Med/High), description, photo_url (optional), created_at, status (active/removed) |
| **Vote** | id, pin_id, user_id, vote_type (still_here/gone), cast_at, expires_at (cast_at + 24h) |

A scheduled job (or lazy evaluation on read) should periodically prune expired votes and re-evaluate removal eligibility for affected pins.

## Data Security Considerations
Since [[Judging Criteria]] explicitly scores **data security**, build these in from the start rather than bolting them on:
- **Auth required** for both reporting and voting — no anonymous writes, which also prevents trivial vote-stuffing.
- **Location data minimization**: store only what's needed (pin lat/lng), don't log raw continuous user location history.
- **Rate limiting**: cap how many pins/votes a single account can submit in a short window, to deter abuse/spam pins.
- **One vote per user per pin**: enforce uniqueness (user_id + pin_id) so a single account can't stack votes.
- **Photo uploads (if included)**: strip EXIF/location metadata before storage to avoid leaking reporter location beyond the pin itself.

## Open Questions / Decisions Still Needed
- **Severity categories**: should Low/Medium/High map to specific hazard types (e.g. pothole = Low by default, unsafe area = High by default), or is severity always a free user choice?
- **Map API choice**: ✅ **Resolved — Leaflet + OpenStreetMap** (free, no API key or billing). Google Maps and Mapbox were considered but both add usage cost/billing friction. The client renders with Leaflet using CARTO Voyager basemap tiles (still OpenStreetMap data), since `tile.openstreetmap.org` is blocked on some networks.
- **GPS spoofing**: for MVP, trust client-reported location (acceptable for hackathon scope); note as a known limitation in the pitch rather than solving it.
- **What happens to votes when a pin is removed?** Likely just archived/discarded — confirm before building the schema.
- **Stretch goal sequencing**: if time allows, which of Live / Ring / NoMistakes gets built first? Recommend Live updates first (highest demo impact, pairs naturally with the existing map).

## Demo Script Sketch (for the 2–3 min pitch)
1. Open the live map — show a couple of existing pins with different severities.
2. Drop a new pin live during the demo (e.g. "broken streetlight," Medium severity, small radius).
3. Switch to a second device/account "nearby" — show the vote prompt appearing, cast a "Still here" vote.
4. Show the reporter's delete button as the fast removal path.
5. (If built) Show a notification firing, or the map updating live without refresh.
6. Close on the data security angle: auth-gated, rate-limited, location-minimized.

## Related
- [[Hackathon Home]]
- [[The Prompt]]
- [[Judging Criteria]]
- [[Submission Checklist]]
