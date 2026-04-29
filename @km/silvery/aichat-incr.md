---
id: "@km/silvery/aichat-incr"
aliases:
  - km-silvery.aichat-incr
  - km-silvery-aichat-incr
created_by: claude:73d7a332
created_at: 2026-03-12T21:30:57Z
closed_at: 2026-03-12T22:20:57Z
close_reason: "Fixed IncrementalRenderMismatchError caused by descendant
  overflow clearing. Root cause: when a TextInput node's content shrank (width
  91→2, overflowing parent hierarchy), clearExcessArea clipped to the immediate
  parent's content area, leaving stale pixels in ancestor border/padding areas.
  Fix: recursive hasDescendantOverflowChanged() detects overflow at the correct
  ancestor level (the bordered box), so the ancestor clears its own region
  (restoring borders) and clears overflow beyond its rect via
  clearDescendantOverflowRegions(). Also cleaned up cell debug instrumentation
  (SILVERY_CELL_DEBUG=x,y env var). All 22 ai-chat-bugs tests pass with
  SILVERY_STRICT=1. Test: status-bar-stale-text.test.tsx (3 tests)."
---

# [x] IncrementalRenderMismatchError in ai-chat-bugs.test.tsx status bar @km/silvery #bug #P2 @claude:73d7a332

SILVERY_STRICT mismatch at (77,85) on render #14 in 'bug 5: status bar with frozen items at narrow width' test (cols:80, rows:25). Incremental render has stale char='e' dim=true, fresh render has char=' '. WRITE TRAP: NO WRITES to (77,85) — nothing wrote to that cell during incremental pass. Content phase stats: only 16 nodes visited/9 rendered vs 277/147 in fresh. The cascade shows silvery-box@7[L:1ch] silvery-text@8[PChL:3ch]. Likely cause: status bar text changes length (cost/context percentage) but the old trailing characters aren't cleared because region clearing is skipped when only text content changed within a fixed-size container.