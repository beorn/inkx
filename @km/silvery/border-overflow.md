---
id: "@km/silvery/border-overflow"
aliases:
  - km-silvery.border-overflow
  - km-silvery-border-overflow
created_by: claude:474834b0
created_at: 2026-03-09T21:49:50Z
closed_at: 2026-03-09T23:48:50Z
close_reason: "Already fixed: padCenter returns empty for width<=0, truncates
  when text>width. renderScrollIndicators bounds writes to content area. 4 tests
  pass."
owner: bjorn@stabell.org
---

# [x] Fix border text overflow bug @km/silvery #bug #P3

Border text can overflow its container. Needs clipping or truncation.