# Lessons Learned: Quality Plateau Refactoring (tree-lenses)

**Session**: 2026-04-06, tree-lenses epic (14 beads) + InitialBoardData deletion
**Scope**: Replace dual-type system (ViewNode/ColumnSnapshot) with single TreeLens pipeline
**Result**: ~1600 lines deleted, all live code paths on one pipeline

## Was "quality plateau" useful as a concept?

**Yes, extremely.** It gave us a concrete stopping criterion that isn't "zero legacy code" (which is infinite work) or "tests pass" (which is too low a bar). The quality plateau is: **the live pipeline uses one concept, not two.** 

The key insight: the plateau is about the LIVE code path (every keypress, every render), not the TOTAL codebase. Test fixtures can still use the old shape — they run once at test setup, not on every frame. This distinction prevented us from spending another session rewriting 15 test files for diminishing returns.

## What worked

1. **Inside-out migration order**: Action handlers first (most call sites), then Board.tsx rendering, then buildOpCtx, then initialization, then tests. Each step was independently committable and testable. We never had a broken main.

2. **String IDs as the interface boundary**: The key architectural decision was `ctx.columnId: string` (not a materialized column object). Once the interface is a string, the implementation behind it is free to change. Components that take string IDs and self-resolve via `useNode(id)` are completely decoupled from how the tree is built.

3. **Lens as the single source of truth**: ViewLens → VisibleLens → ViewTreeProjection. One pipeline that handles fold, hidden, body, embed, collapse, task-status-filter. No parallel code path that might diverge.

4. **Keeping detail mode as a known debt**: Instead of trying to make the lens handle virtual metadata nodes (which would require a new abstraction), we deferred detail mode to a separate bead with a better design (spatial navigation). This kept the current session focused.

5. **Aggressive dead code deletion**: render.ts (280 lines), useColumns hook (50 lines), InitialBoardData type — each deletion was validated by grep showing zero callers. Dead code that compiles is invisible to the type checker.

## What didn't work

1. **InitialBoardData lingered too long**: The type existed because initialization predated the lens. We should have questioned "does this type need to exist?" earlier — the answer was no, since the lens can compute everything the type pre-computed.

2. **Two createVirtualBodyNode functions**: state.ts and use-columns.ts both had one. When you see the same factory in two files, the abstraction is missing. The lens should own virtual node creation.

3. **Tests referencing internal shapes**: Tests that assert `state.columns[0].cardNodes.length === 2` are testing an implementation detail. Better: test the lens output directly, or test the screen output via testEnv. We kept these tests (renamed type) but they're tech debt.

## Principles for next time

- **Name the plateau before starting**: "When X uses Y exclusively, we're done." This prevents scope creep.
- **Migrate the hottest path first**: Action handlers run on every keypress. Board.tsx renders every frame. Tests run once. Prioritize by frequency.
- **String IDs are the universal interface**: When two subsystems need to agree on identity, a string ID is sufficient. No wrapper types needed.
- **Question every pre-computation**: If the lens can derive it, don't pre-compute it into a type. Pre-computation creates a parallel truth.
- **Delete dead code immediately**: Don't leave it "for reference." Git has history. Dead code that compiles misleads future readers.
