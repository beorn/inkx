---
mentions:
  - km
  - claude
id: "@km/terminfo/app-harness-expand"
aliases:
  - km-terminfo.app-harness-expand
  - km-terminfo-app-harness-expand
created_by: claude:f8196c1c
created_at: 2026-03-25T19:43:13Z
closed_at: 2026-03-25T20:03:52Z
close_reason: Fresh 128-probe results for iTerm2 (127/128), Terminal.app
  (120/128), Kitty (124/128), Ghostty (124/128). API now shows 136 features.
  Launched terminals via direct binary + serve daemon. Terminal detection
  misidentifies Kitty/Ghostty as cmux when launched from CLI (separate issue).
owner: bjorn@stabell.org
assignee: claude:f8196c1c
---

# [x] Expand app harness to probe all 133 features (currently only 52) @km/terminfo #task #P2 @claude:f8196c1c

The app harness (packages/cli/app-harness.ts) only tests 52 features when launched via AppleScript. The headless probes test 128, and features.json defines 133. The live site shows 111 because the app results are stale from a previous run with a different probe method.

Fix: update app-harness.ts to include all probes from the expanded feature set (input protocols, unicode, device attributes, etc.). Then re-run bun census:apps to get fresh results for iTerm2, Terminal.app, Kitty. For Ghostty/Warp (which fail AppleScript), use the serve daemon approach instead.

After: commit updated results, push, site rebuilds with full 133-feature matrix.

