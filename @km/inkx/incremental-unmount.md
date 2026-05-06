---
mentions:
  - km
id: "@km/inkx/incremental-unmount"
aliases:
  - km-inkx.incremental-unmount
  - km-inkx-incremental-unmount
created_by: claude:5770ce77
created_at: 2026-02-17T16:08:19Z
closed_at: 2026-02-17T17:18:59Z
owner: bjorn@stabell.org
---

# [x] Incremental rendering: ghost pixels when components unmount/overlay @km/inkx #bug #P2

When components unmount (dialogs, toasts) or overlay existing content, the incremental rendering content phase doesn't correctly clear stale pixels from the previous buffer.

## Root cause

renderNormalChildren() iterates only current node.children — removed nodes' pixels are never cleared. Additionally, Text nodes read bg via getCellBg from the buffer, so stale background colors from previous frames leak through.

## Evidence

- INKX_CHECK_INCREMENTAL=1 crashes immediately on first keypress in km view (toast ghost at row 14)
- 4 test failures when checkIncremental enabled in testEnv: search-dialog, inline-edit, board-features, cursor-perf
- td dialog (@km/_orphan/qaco9): dialog closes in state but ghost remains on screen (production createApp path only)

## Affected tests (opted out with checkIncremental: false)

- cursor-perf.slow.test.tsx:123
- search-dialog.test.ts:184
- inline-edit.spec.ts:1107
- board-features.spec.ts:283

## Fix direction

In content-phase.ts renderNormalChildren(): when childrenDirty=true, track previously-existing children's rects and clear them. Also ensure overlay components (dialogs, toasts) properly clear underlying buffer bg on mount/unmount.

