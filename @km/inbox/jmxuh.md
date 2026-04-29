---
id: "@km/_orphan/jmxuh"
aliases:
  - km-jmxuh
created_at: 2026-02-03T11:29:06Z
closed_at: 2026-02-04T11:23:52Z
assignee: claude:227cdc41
---

# [x] inkx: output-phase ANSI diff leaves stale colored backgrounds @km/_orphan #bug #P1 @claude:227cdc41

Output-phase (Phase 4) doesn't clear stale backgrounds from columns/board titles when cursor moves. Tests pass because they read buffer state (Phase 3) which is correct, but ANSI diff output has bugs in cellEquals/changesToAnsi/styleToAnsi. Need ANSI-level tests and fixes.