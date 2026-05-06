---
mentions:
  - km
id: "@km/inbox/pqwr"
aliases:
  - km-pqwr
  - "@km/_orphan/pqwr"
created_at: 2026-01-22T11:53:43Z
closed_at: 2026-01-26T16:35:26Z
---

# [x] Rename cardIndex/colIndex to view-mode neutral names @km/_orphan #task #P3

The TUI uses legacy names like `cardIndex` and `colIndex` which assume the columns view mode. The underlying @km/board model uses `TPath` which is view-mode neutral.

Current state:

- 307 occurrences across 20 files
- Names imply columns/cards but the data model is just tree paths

Proposed changes:

- Rename to `rowIndex` / `columnIndex` or keep `path[0]` / `path[1]` semantics explicit
- The names should be view-mode agnostic

This affects: state.ts, tui-context.ts, board-adapter.ts, ui-reducer.ts, keyboard-*.ts, board-actions.ts, types.ts, all view files

