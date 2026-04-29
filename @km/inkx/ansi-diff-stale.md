---
id: "@km/inkx/ansi-diff-stale"
aliases:
  - km-inkx.ansi-diff-stale
  - km-inkx-ansi-diff-stale
created_at: 2026-02-04T11:23:52Z
closed_at: 2026-02-04T12:37:21Z
assignee: claude:27f1a547
---

# [x] inkx: output-phase ANSI diff leaves stale colored backgrounds @km/inkx #bug #P1 @claude:27f1a547

Output-phase (Phase 4) doesn't clear stale backgrounds from columns/board titles when cursor moves. Tests pass because they read buffer state (Phase 3) which is correct, but ANSI diff output has bugs in cellEquals/changesToAnsi/styleToAnsi. Need ANSI-level tests and fixes.