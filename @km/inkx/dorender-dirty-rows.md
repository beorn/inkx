---
id: "@km/inkx/dorender-dirty-rows"
aliases:
  - km-inkx.dorender-dirty-rows
  - km-inkx-dorender-dirty-rows
created_by: claude:536645b5
created_at: 2026-02-21T16:26:01Z
closed_at: 2026-02-21T16:26:13Z
owner: bjorn@stabell.org
---

# [x] Board freezes on cursor nav with detail pane open (doRender clone resets dirty rows) @km/inkx #bug #P1

Board visually freezes when navigating with j/k while detail pane is open. Breadcrumb, card borders, and detail pane content all fail to update.

Root cause: TerminalBuffer.clone() resets all dirty rows to 0. When multiple doRender() calls occur per event batch (from store subscriptions), doRender #2+ clones the buffer from #1 (dirty rows reset), finds no node dirty flags (cleared by #1), writes no cells, so dirty rows stay at 0. runtime.render() then diffs against this clean buffer and diffBuffers() finds no dirty rows, producing patchLen=0.

Fix: Early return in doRender() — after React reconciliation, if root has no dirty flags and we already have a buffer, skip the pipeline entirely. Avoids creating a new clone that resets dirty rows, and naturally reduces excessive doRender calls from ~7 to ~1 per keystroke.

File: vendor/beorn-inkx/src/runtime/create-app.tsx (lines 764-777)
Verified: TTY testing confirms j/k/l navigation with detail pane updates correctly.