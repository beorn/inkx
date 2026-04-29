---
id: "@km/core/slate-interfaces/p5-tea-align"
aliases:
  - km-core.slate-interfaces.p5-tea-align
  - km-core-slate-interfaces-p5-tea-align
created_by: claude:ceb7c9cb
created_at: 2026-03-28T07:29:19Z
closed_at: 2026-03-28T07:39:11Z
close_reason: "SEPARATED: TEA alignment is a different kind of change
  (architectural, not organizational). Create as independent epic when
  slate-interfaces is complete. Mixing consolidation with architecture change =
  scope creep."
---

# [x] TEA alignment — Board.apply() pure state machine (separate epic, follows slate-interfaces) @km/core #task #P3

## Goal
Extract Board state management into Board.apply(state, op) → [state, effects]. Effects are DATA. Runtime executes them. This is the first TEA-aligned subsystem.

## Scope: Board state only (initially)
Board.apply handles: SELECT, ZOOM_IN, FOLD, COLLAPSE, MOVE_MODE, NAV_HISTORY, CONTENT_LINES.
Repo mutations (moveNode, deleteNode) are effects, not state transitions.
Undo stays as-is (undoable-repo) — undo redesign is a SEPARATE concern (withHistory plugin, Operation.inverse).

## Changes
1. **@km/_orphan/board/src/board.ts** — Board.apply(state, op) → [BoardState, BoardEffect[]]
2. **@km/tui/src/board/board-runtime.ts** — executes BoardEffects:
   - { type: 'repo_move', nodeId, parentId, sortOrder } → repo.moveNode
   - { type: 'select', nodeId } → dispatch SELECT
   - { type: 'toast', level, message } → toast queue
   - { type: 'dialog', picker } → setUI
3. handleCommandAction dispatches to Board.apply, runtime executes effects

## NOT in scope
- Undo redesign (separate bead — TEA undo = withHistory + Operation.inverse)
- PlainText.apply() — separate machine (see tea-state-machines.md Phase 1)
- Dialog.apply() — after Board.apply proves the pattern

## /complete
- Board.apply is pure (no repo, no side effects)
- Effects returned as serializable data
- Runtime executes effects
- All tests pass