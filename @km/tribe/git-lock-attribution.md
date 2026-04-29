---
id: "@km/tribe/git-lock-attribution"
aliases:
  - km-tribe.git-lock-attribution
  - km-tribe-git-lock-attribution
created_by: Bjørn Stabell
created_at: 2026-04-09T15:10:45Z
closed_at: 2026-04-18T17:57:58Z
close_reason: "Shipped in bearly a77d619 (km bump 8641be2c9). Tribe daemon
  reloaded and migration verified: legacy .beads/tribe.db moved to
  ~/.local/share/tribe/tribe.db, breadcrumb .beads/tribe.db.moved left in place.
  Git lock messages now include session+PID. Broadcast self-filter verified
  already in place at DB query level, added verbatim-query regression tests (317
  bearly tests pass)."
---

# [x] Git lock warnings should attribute to tribe member, not just PID @km/tribe #feature #P3

blocks:: [[@km/tribe]]

## Symptom

Tribe daemon git lock warnings currently only show PID:

> git lock: .git/index.lock held by PID 37772 for 0s

This is unhelpful — PIDs are anonymous. The useful info is WHICH tribe member holds the lock.

## Desired

> git lock: .git/index.lock held by tree (PID 37772) for 0s

## How

The tribe daemon already tracks session PIDs (via tribe_sessions output). When detecting a lock, look up the PID in the session registry and include the session name. Fall back to "(PID 37772)" if no match (external git client).

## Acceptance Criteria

- [ ] Lock warnings include tribe member name when PID matches a registered session
- [ ] Falls back to "PID N" format when no match
- [ ] Same enhancement for git-lock:warning AND git-lock:error event types