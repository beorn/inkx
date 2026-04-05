/**
 * Undo Stack — Records reversible operations for undo/redo.
 *
 * Each UndoEntry captures enough information to reverse a mutation:
 * - A human-readable label (for UI display/logging)
 * - An `undo` function that reverses the mutation
 * - An `redo` function that re-applies it
 *
 * The stack is a simple array with a cursor index. Undo pops backward,
 * redo moves forward. New entries truncate any redo history.
 *
 * ## Capacity
 *
 * Default max 100 entries. Oldest entries are dropped when exceeded.
 */

import { createLogger } from "loggily"

const log = createLogger("km:tui:undo")

/**
 * Create a deep copy of fold state for snapshotting.
 * Maps and Sets are serialized to JSON then deserialized to avoid references.
 */
export function copyFoldState(state: FoldState): FoldState {
  return {
    foldDepths: new Map(state.foldDepths),
    collapsedNodes: new Set(state.collapsedNodes),
  }
}

export interface FoldState {
  /** Map of nodeId → fold depth (0 means collapsed outline) */
  foldDepths: Map<string, number>
  /** Set of nodeId → collapsed list/task items */
  collapsedNodes: Set<string>
}

export interface UndoEntry {
  /** Human-readable description (e.g., "Duplicate node") */
  label: string
  /** Reverse the mutation */
  undo: () => void
  /** Re-apply the mutation */
  redo: () => void
  /** Cursor node to restore on undo (position before the operation) */
  cursor?: string | null
  /** Optional fold state snapshot to restore on undo */
  foldStateBefore?: FoldState
  /** Optional fold state snapshot to restore on redo */
  foldStateAfter?: FoldState
}

export interface UndoResult {
  /** Whether an operation was undone/redone */
  ok: boolean
  /** Cursor node to restore (null = no cursor preference) */
  cursor?: string | null
  /** Human-readable label of the operation (e.g., "Delete", "Move cards") */
  label?: string
  /** Fold state to restore (to be applied by the caller) */
  foldState?: FoldState
}

export interface UndoStack {
  /** Push a new undo entry. Truncates any redo history. */
  push(entry: UndoEntry): void
  /** Undo the last operation. Returns result with cursor to restore. */
  undo(): UndoResult
  /** Redo the last undone operation. Returns result with cursor to restore. */
  redo(): UndoResult
  /** Whether undo is available */
  canUndo(): boolean
  /** Whether redo is available */
  canRedo(): boolean
  /** Clear all history */
  clear(): void
  /** Number of entries in the stack */
  readonly size: number
}

export function createUndoStack(maxSize = 100): UndoStack {
  const entries: UndoEntry[] = []
  // cursor points to the next entry index (entries[cursor-1] is the last applied)
  let cursor = 0

  return {
    push(entry: UndoEntry) {
      // Truncate any redo history
      entries.length = cursor
      entries.push(entry)
      cursor = entries.length

      // Drop oldest if over capacity
      if (entries.length > maxSize) {
        const overflow = entries.length - maxSize
        entries.splice(0, overflow)
        cursor -= overflow
      }

      log.debug?.(`push: "${entry.label}" (stack size=${entries.length}, cursor=${cursor})`)
    },

    undo(): UndoResult {
      if (cursor <= 0) return { ok: false }
      cursor--
      const entry = entries[cursor]
      if (!entry) return { ok: false }

      log.info?.(`undo: "${entry.label}"`)
      entry.undo()
      return {
        ok: true,
        cursor: entry.cursor,
        label: entry.label,
        foldState: entry.foldStateBefore,
      }
    },

    redo(): UndoResult {
      if (cursor >= entries.length) return { ok: false }
      const entry = entries[cursor]
      if (!entry) return { ok: false }

      log.info?.(`redo: "${entry.label}"`)
      entry.redo()
      cursor++
      return {
        ok: true,
        label: entry.label,
        foldState: entry.foldStateAfter,
      }
    },

    canUndo(): boolean {
      return cursor > 0
    },

    canRedo(): boolean {
      return cursor < entries.length
    },

    clear() {
      entries.length = 0
      cursor = 0
    },

    get size() {
      return entries.length
    },
  }
}
