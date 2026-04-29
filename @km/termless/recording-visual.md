---
id: "@km/termless/recording-visual"
aliases:
  - km-termless.recording-visual
  - km-termless-recording-visual
created_by: claude:f8196c1c
created_at: 2026-03-18T19:00:25Z
closed_at: 2026-03-23T14:44:06Z
close_reason: Added snapshotVisualState() to @termless/core — captures full cell
  grid, cursor, modes, title. CLI record.ts now uses it for frame detection. 17
  tests.
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Recording drops non-text visual changes @km/termless #bug #P2 @claude:4929065a

Deferred P2 from pro-review-2 (2026-03-13). Termless recording captures text changes but drops non-text visual changes (cursor style, colors, etc.). Found during GPT 5.4 Pro review of termless.