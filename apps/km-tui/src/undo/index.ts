/**
 * Undo System — Operation-based undo/redo for km-tui
 *
 * Wraps Repo mutations to automatically record reversible operations.
 * Supports batching for multi-mutation actions and cursor state tracking.
 */

export { type TreeOp, type HistoryEntry, invertTreeOp, invertTreeOps } from "./operations.ts"
export { createUndoableRepo, type UndoableRepoHandle, type UndoResult } from "./undoable-repo.ts"
