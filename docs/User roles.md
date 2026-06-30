---
tags:
  - hackathon
  - spec
  - roles
---

# User Roles — PinPoint

> Canonical role model for the build. See [[IMPLEMENTATION_SPEC]], [[DB_schema (SQL)]], [[pinpoint_spec]].

Two roles. Both can report and (where eligible) vote — the difference is identity, persistence, and reputation.

## 🔓 Anonymous (no account)

Lowest-friction path so anyone can flag a hazard fast.

- **Can:** drop hazard pins without logging in.
- **Pin lifetime:** anonymous pins **auto-expire 1 hour** after creation (`expires_at = created_at + 1h`).
- **Cooldown:** **5-minute cooldown** between reports (per device/IP, best-effort) to deter spam.
- **Cannot:** vote, accrue credibility, or delete a pin after the fact (it just expires).
- **Known limitation (note in pitch):** device/IP dedup is best-effort and spoofable — acceptable for hackathon scope.

## 👤 Account (registered)

Persistent identity with reputation.

- **Auth:** email (required) + password (see [[DB_schema (SQL)]]).
- **Can report:** account pins **persist until** the owner deletes them **or** the community vote ratio removes them (no 1-hour expiry).
- **Can vote:** cast **one upvote or downvote per pin** (uniqueness enforced on `user_id + pin_id`); voting is **account-only** so one-vote-per-user and credibility stay enforceable.
- **Credibility:** an account accrues `upvotes_received` / `downvotes_received` across its pins → a **credibility score** (`upvotes_received − downvotes_received`) shown as a trust signal on their pins/profile.
- **Override:** owner can **delete their own pin** anytime, regardless of votes.

## Voting & Removal (summary)

- **Upvote** = "this hazard is real / still here." **Downvote** = "gone / not real."
- **Removal by ratio:** once a pin has a **minimum of 5 votes**, if **downvotes > upvotes** it is removed (`status = 'removed'`). Anonymous pins also disappear at their 1-hour expiry regardless of votes.
- Full data shapes live in [[DB_schema (SQL)]]; removal logic detail in [[IMPLEMENTATION_SPEC]].

## Why anonymous reporting is allowed

We deliberately keep **reporting** open (anonymous) to maximize hazard coverage, but gate **voting, credibility, and persistent pins** behind accounts. This preserves most of the data-security story (no anonymous _writes that affect reputation or the vote tally_) while lowering the barrier to surface a danger. Anonymous abuse is bounded by the 1-hour TTL + 5-minute cooldown.

## Related

- [[IMPLEMENTATION_SPEC]]
- [[DB_schema (SQL)]]
- [[pinpoint_spec]]
- [[Hackathon Home]]
