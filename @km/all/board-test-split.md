---
mentions:
  - km
id: "@km/all/board-test-split"
aliases:
  - km-all.board-test-split
  - km-all-board-test-split
created_by: claude:aee18a0e
created_at: 2026-02-27T14:33:33Z
owner: bjorn@stabell.org
---

# [ ] Split board-test.ts into modules + namespace assertions @km/all #task #P3

Deferred from @km/all/test-helper-cleanup (items 7-8).

## Item 7: Split board-test.ts into modules

board-test.ts is still 1775 lines (down from 2490 after dead code removal + DRY extraction).
117 test files import from it. Split into:

- fixtures.ts — item(), board(), column(), SIMPLE_BOARD
- test-env.ts — testEnv(), testEnvWithRepo(), createTestRenderEnv()
- assertions/ — grouped assertion methods (board.node(), board.cell(), etc.)

Re-export from board-test.ts for backwards compat during migration.

## Item 8: Namespace assertion methods

26 flat assertion methods on the board object (expectVisible, expectCellChar, expectNodeColor, etc.)
should be grouped into namespaces for discoverability:

- board.node.color(), board.node.border(), board.node.gutter()
- board.cell.char(), board.cell.color()
- board.screen.row(), board.screen.text()

## Why deferred

117 files would need import changes (item 7) or API changes (item 8). Too large for a single session.

