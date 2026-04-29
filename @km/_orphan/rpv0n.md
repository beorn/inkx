---
id: "@km/_orphan/rpv0n"
aliases:
  - km-rpv0n
created_by: claude:656602a3
created_at: 2026-03-16T20:44:01Z
closed_at: 2026-03-18T19:32:05Z
close_reason: "Fixed: added scrollOffsetChanged check to canSkipEntireSubtree in
  content-phase.ts. 6 STRICT tests added."
---

# [x] Scroll offset change not dirtying content phase @km/_orphan #bug #P0 @claude:d29abbfa

P0: When scrollTo prop changes on a scroll container but layout rect stays the same, all dirty flags remain false and canSkipEntireSubtree skips re-rendering. Borders overwrite content. Triggered by theme explorer smoke test. Fix: check scroll offset in fast-path skip logic in content-phase.ts.