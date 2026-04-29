---
id: "@km/test-simplify/1-create-board-test-ts-helper-toolbelt-for-visual-te"
aliases:
  - km-test-simplify.1
  - km-test-simplify-1
  - "@km/test-simplify/1"
created_at: 2026-01-23T22:41:07Z
closed_at: 2026-01-23T22:51:25Z
---

# [x] Create board-test.ts helper toolbelt for visual testing @km/test-simplify #task #P2

Created apps/@km/tui/tests/helpers/board-test.ts with:
- Fluent API: renderBoard(), expectVisible(), expect().toBeVisible(), screenshot()
- Fixture DSL: board(), column() for concise test data
- Position assertions via boundingBox()

LIMITATION: Uses InkBoardTestable (static) because full Board depends on @km/storage globals.
Keyboard navigation (press/moveTo) does NOT change state.

Future work: Refactor Board to accept state via props for full interactivity.