---
id: "@km/tui/board-apply"
aliases:
  - km-tui.board-apply
  - km-tui-board-apply
created_by: Bjørn Stabell
created_at: 2026-04-01T19:43:20Z
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [ ] Extract Board.apply() — pure state reducer from board-actions.ts @km/tui #task #P2 @Bjørn Stabell

Phase 1a DONE — pure reducer exists at packages/@km/_orphan/board/src/board-reducer-new.ts with 70 tests.

BoardState: cursorNodeId, selectedNodes, foldDepths, collapsedNodes, navHistory, moveMode, maxContentLines.
Actions: SELECT, TOGGLE_FOLD, TOGGLE_COLLAPSE, ZOOM_IN, SET_ROOT, SELECT_NODE_*, MOVE_*, CURSWANT.

Remaining (Phase 1b-1c):
- Wire more handlers through the reducer (edit actions that currently go through board-actions.ts)
- Add BoardEffect discriminated union for side effects
- Repo mutations as effects instead of direct calls
- Undo integration
- Move inline edit state into BoardState