---
id: "@km/silvery/proto-width-measurer"
aliases:
  - km-silvery.proto-width-measurer
  - km-silvery-proto-width-measurer
created_by: Bjørn Stabell
created_at: 2026-04-06T09:09:49Z
closed_at: 2026-04-06T09:45:16Z
close_reason: DEC 1020-1023 width detection wired into create-app.tsx startup
  pipeline. Detected emoji/CJK widths override heuristic defaults.
  widthDetection option on run/withTerminal. 22 tests. Silvery commit 289e818.
---

# [x] DEC 1020-1023 → accurate width measurement (fixes emoji/CJK bugs) @km/silvery #feature #P2

Feed DEC width detection results into createWidthMeasurer. When terminal reports emoji width = 2, silvery uses 2 instead of guessing. Fixes alignment bugs in columns with emoji/CJK.

## Why
withMeasurer() already reads caps.textEmojiWide. DEC 1022 provides the real value. Fixes a class of width bugs where silvery's wcwidth disagrees with the terminal.

## Depends on
@km/silvery/proto-startup-detect