---
id: "@km/tui/delete-initial-board-data"
aliases:
  - km-tui.delete-initial-board-data
  - km-tui-delete-initial-board-data
created_by: Bjørn Stabell
created_at: 2026-04-06T09:25:31Z
closed_at: 2026-04-06T10:10:21Z
close_reason: Complete. InitialBoardData deleted from types.ts. render.ts
  deleted (280 lines dead code). renderCard tests deleted (dead code). Type
  renamed to BoardStateResult in state.ts for test fixtures. runBoard takes
  (rootId, options) directly. testing.ts + driver.ts + screenshot.ts all derive
  from lens. 600 lines removed.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Delete InitialBoardData — runBoard takes (repo, rootId) directly @km/tui #task #P2 @Bjørn Stabell

Delete the InitialBoardData type and all functions that produce it.
runBoard takes (repo, rootId?, options?) directly. The store creates
PaneSignals → lens → tree. Everything is derived.

## What to delete
- InitialBoardData type (types.ts)
- buildBoardState, buildBoardStateGenerator (state.ts)
- initBoardState, initBoardStateGenerator (state.ts)
- createEmptyState (state.ts)
- computeInitialCursor (tui.tsx) — derive from lens
- ColumnView import chain in state.ts

## What to change
- runBoard(state, options) → runBoard(repo, rootId, options)
- Store init derives collapsedNodeIds from lens (rules.collapse + data.collapsed)
- Initial cursor from lens: tree.children(rootId)[0] → tree.children(colId)[0]
- screenshot command: use lens for column structure
- Test helpers: buildBoardState → createBoardAppStore(repo, rootId)
- driver.ts: adapt to new initialization
- testing.ts: adapt to new initialization

## Acceptance
- grep InitialBoardData apps/@km/tui/src/ = 0
- grep buildBoardState apps/@km/tui/src/ = 0 (excluding tests)
- grep ColumnView apps/@km/tui/src/state.ts = 0
- grep ColumnView apps/@km/tui/src/types.ts = 0