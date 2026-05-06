---
mentions:
  - km
id: "@km/silvery/ink-cjk-overlay"
aliases:
  - km-silvery.ink-cjk-overlay
  - km-silvery-ink-cjk-overlay
created_by: Bjørn Stabell
created_at: 2026-04-09T20:12:24Z
closed_at: 2026-04-09T23:35:25Z
owner: bjorn@stabell.org
---

# [x] Match Ink's CJK (wide-char) overlap resolution at style boundaries @km/silvery #feature #P2

When a 2-cell CJK character overlaps a cell where style (bg/fg) changes, Ink and silvery resolve the overlap differently. 2 Ink 7.0 tests fail on this edge case.

## Fix

Investigate Ink's resolution order (which half of the wide char wins when styles disagree) and match it in silvery's render-text.

## Impact

Closes 2 Ink 7.0 compat failures.

## Parent

@km/silvery/positioning

