---
id: "@km/all/board-test-migration"
aliases:
  - km-all.board-test-migration
  - km-all-board-test-migration
created_by: claude:8baeb5e0
created_at: 2026-03-01T22:12:36Z
owner: bjorn@stabell.org
---

# [ ] Migrate board behavior tests from km-tui to km-board @km/all #task #P3

@km/_orphan/board has only 2 test files. Many board state behaviors (fold/zoom/cursor composition, action sequences) are tested through @km/tui's testEnv() which carries ~1.8s rendering overhead per file. As TEA state machines make reducers pure (action, state) → [state, effects], these tests should migrate to @km/_orphan/board as pure reducer tests — faster, cheaper, and at the correct semantic layer.

## What to migrate
- Tests in @km/tui that only assert state shape without screen assertions
- Action composition tests (fold + zoom + cursor) that don't need rendering
- State invariant tests (cursor validity, selection consistency)

## What stays in @km/tui
- Journey tests that verify keys → screen → persistence
- Buffer assertion tests (colors, borders, layout)
- Anything that needs visual verification

## Prerequisite
TEA state machines must land first — without pure reducers, these tests need the full testEnv() stack.

## Reference
See .claude/skills/tests/test-layers.md (Layering Observations section) and packages/@km/_orphan/board/tests/CLAUDE.md.