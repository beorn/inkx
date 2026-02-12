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

import { createLogger } from "@beorn/logger"

const log = createLogger("km:tui:undo")

export interface UndoEntry {
  /** Human-readable description (e.g., "Duplicate node") */
  label: string
  /** Reverse the mutation */
  undo: () => void
  /** Re-apply the mutation */
  redo: () => void
}

export interface UndoStack {
  /** Push a new undo entry. Truncates any redo history. */
  push(entry: UndoEntry): void
  /** Undo the last operation. Returns true if something was undone. */
  undo(): boolean
  /** Redo the last undone operation. Returns true if something was redone. */
  redo(): boolean
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

    undo(): boolean {
      if (cursor <= 0) return false
      cursor--
      const entry = entries[cursor]
      if (!entry) return false

      log.info?.(`undo: "${entry.label}"`)
      entry.undo()
      return true
    },

    redo(): boolean {
      if (cursor >= entries.length) return false
      const entry = entries[cursor]
      if (!entry) return false

      log.info?.(`redo: "${entry.label}"`)
      entry.redo()
      cursor++
      return true
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
