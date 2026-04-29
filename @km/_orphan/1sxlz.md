---
id: "@km/_orphan/1sxlz"
aliases:
  - km-1sxlz
created_by: claude:7e146296
created_at: 2026-03-10T21:47:45Z
closed_at: 2026-03-10T22:02:03Z
close_reason: "Implemented: run() now auto-detects terminal caps and enables
  kitty (from caps), mouse (true), focusReporting (true), textSizing ('auto') by
  default. Apps opt out instead of opt in. Updated RunOptions docs,
  getting-started, runtime-getting-started, and terminal-capabilities reference.
  Also added textSizing:'auto' to km's tui.tsx (which uses createApp directly).
  All 4221 tests pass."
---

# [x] run() should auto-enable terminal features by default @km/_orphan #feature #P2

run() currently defaults kitty/mouse/focusReporting/textSizing to false, forcing every app to duplicate the same caps-wiring boilerplate. The Silvery Way: framework does the right thing by default. Auto-detect and enable features in run(), let apps opt out. Also update docs to mention defaults and that mouse:false restores native copy/paste.