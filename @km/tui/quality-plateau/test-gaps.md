---
id: "@km/tui/quality-plateau/test-gaps"
aliases:
  - km-tui.quality-plateau.test-gaps
  - km-tui-quality-plateau-test-gaps
created_by: Bjørn Stabell
created_at: 2026-04-06T16:42:35Z
closed_at: 2026-04-09T05:34:29Z
close_reason: "70 tests added across 5 files: hidden.ts (22), invariants.ts
  (15), undo-stack.ts (17), action-handlers.ts (3), dialog-guard.ts (13). All
  819 LOC now covered. Commit 9d8b765a9."
---

# [x] Test coverage for untested critical modules (hidden, invariants, undo) @km/tui #task #P2

5 modules with no test coverage:
- hidden.ts (226 LOC) — hidden node computation, used in board rendering
- invariants.ts (347 LOC) — validation assertions, critical for correctness
- undo-stack.ts (152 LOC) — undo/redo logic
- action-handlers.ts (41 LOC) — action dispatch
- dialog-guard.ts (53 LOC) — dialog mode guard

Overall file coverage: ~48% (67 test files / 140 source files)