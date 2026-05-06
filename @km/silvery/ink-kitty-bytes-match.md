---
mentions:
  - km
id: "@km/silvery/ink-kitty-bytes-match"
aliases:
  - km-silvery.ink-kitty-bytes-match
  - km-silvery-ink-kitty-bytes-match
created_by: Bjørn Stabell
created_at: 2026-04-09T20:12:23Z
closed_at: 2026-04-09T23:34:24Z
owner: bjorn@stabell.org
---

# [x] Match Ink's kitty protocol negotiation byte sequence @km/silvery #feature #P2

Ink sends a specific byte sequence to query kitty keyboard protocol support. Silvery sends a slightly different one. Both work functionally but tests compare bytes exactly.

## Fix

Match Ink's query bytes exactly in silvery's kitty negotiation code.

## Impact

Closes 3 Ink 7.0 compat failures.

## Parent

@km/silvery/positioning

