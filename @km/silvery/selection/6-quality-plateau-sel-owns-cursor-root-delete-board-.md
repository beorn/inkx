---
id: "@km/silvery/selection/6-quality-plateau-sel-owns-cursor-root-delete-board-"
aliases:
  - km-silvery.selection.6
  - km-silvery-selection-6
  - "@km/silvery/selection/6"
created_by: Bjørn Stabell
created_at: 2026-04-05T04:29:41Z
closed_at: 2026-04-05T06:05:59Z
---

# [x] Quality plateau: sel owns cursor + root, delete board-reducer cursor path, fix init race @km/silvery #task #P1 @Bjørn Stabell

## Quality plateau: sel owns cursor — cursor-always-visible

### Key question: ANSWERED
Can sel represent cursor intent when the target is temporarily not in walk order?
**YES — and we eliminate the scenario entirely.** New invariant: cursor is ALWAYS on a visible node.
- Fold (manual action): nudge cursor UP to the card being folded
- Navigation (J/K/block-nav): auto-unfold to reveal target (ensureCursorVisible already does this)
- Boot: pass initialCursor to createSelection factory
- Tree mutation: transformSelection handles inline (atomic)
- Zoom: sel.node.select([target]) after root change

No 'intent' gap. No fallback chain. No desiredCursor concept needed.

### Plan (break-then-fix, per refactoring lessons)

**Phase 1: Preparatory (no breakage)**
1a. Fold cursor-nudge: handleToggleFold + FOLD_NODE/UNFOLD_NODE → if cursor is inside folded subtree, sel.node.select([card.id]) BEFORE fold
1b. createSelection gets initialCursor option: `createSelection(app, { initialCursor, initialRoot })`
1c. Wire initialCursor in board-app-store pane init (replaces pane.cursorNodeId hydration)

**Phase 2: Break intentionally**
2a. Delete cursorNodeId from BoardPaneState, BoardNavState, BoardState types
2b. Delete SELECT case from board-reducer-new.ts
2c. Delete cursorNodeId from ZOOM_IN, SET_ROOT, ENTER_MOVE_MODE, CANCEL_MOVE reducer ops
2d. Delete the fallback chain in buildOpCtx (board-app.ts:237)
2e. Delete the sync bridge in board-app-store.ts (pane.cursorNodeId = sel.node.cursor())

**Phase 3: Fix all tsc errors (~296 refs, 33 files)**
3a. All writes (75): replace with sel.node.select([id]) 
3b. All reads (201): replace with sel.node.cursor() (via ctx.cursor shorthand or direct)
3c. NavHistory entries: keep cursor snapshot as plain string field (renamed, not cursorNodeId)
3d. Types (18): field removed in Phase 2
3e. Undo entries: snapshot sel.snapshot() for restore

### /complete criteria
```
grep -r 'cursorNodeId' apps/km-tui/src/ --include='*.ts' --include='*.tsx' → 0 hits
grep -r 'cursorNodeId' packages/km-board/src/ --include='*.ts' → 0 hits
bun run test:fast → all pass
bun fix → pass
```