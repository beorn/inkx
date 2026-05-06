---
mentions:
  - km
id: "@km/silvery/stale-formulas"
aliases:
  - km-silvery.stale-formulas
  - km-silvery-stale-formulas
created_by: claude:c9beade3
created_at: 2026-03-13T04:35:58Z
closed_at: 2026-03-13T04:41:38Z
close_reason: "Updated all 5 critical formulas in CLAUDE.md to match current
  code: added textPaintDirty to contentAreaAffected, added subtreeDirtyWithBg to
  skipBgFill and parentRegionChanged"
owner: bjorn@stabell.org
---

# [x] 3 of 5 critical formulas in pipeline/CLAUDE.md are stale @km/silvery #bug #P2

GPT 5.4 pro found that formulas 2 (contentAreaAffected), 4 (skipBgFill), and 5 (parentRegionChanged) in pipeline/CLAUDE.md don't match content-phase.ts. Missing: textPaintDirty in formula 2, subtreeDirtyWithBg in formulas 4 and 5. Since these are labeled 'critical formulas', they must be exact.

