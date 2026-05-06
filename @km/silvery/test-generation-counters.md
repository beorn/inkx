---
mentions:
  - km
id: "@km/silvery/test-generation-counters"
aliases:
  - km-silvery.test-generation-counters
  - km-silvery-test-generation-counters
created_by: claude:c9beade3
created_at: 2026-03-13T04:37:36Z
closed_at: 2026-03-13T05:22:36Z
close_reason: "Deferred: Major architectural change — replacing recursive
  dirty-flag clearing with frame-generation counters. Would change the
  fundamental incremental rendering model. Needs design doc first, not a quick
  fix."
owner: bjorn@stabell.org
---

# [x] Structural: Replace recursive dirty-flag clearing with generation counters @km/silvery #task #P2

Current model: boolean dirty flags cleared recursively after processing/skipping. Problems: expensive subtree clears, easy to miss propagation, easy to consume flag too early, bugs around multi-pass/skipped nodes. Better: monotonic generations (mutationGen, layoutGen, contentGen, paintGen, renderedGen). Node dirty if paintGen > lastRenderedPaintGen. No recursive clearing, no stale booleans, easier multi-pass reasoning. Highest-leverage structural improvement. Found by GPT 5.4 pro.

