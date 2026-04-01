/**
 * History Plugin — withHistory wrapper for Board.apply()
 *
 * Wraps a reducer to add undo/redo capability following the TEA plugin pattern
 * from docs/design/tea-state-machines.md.
 *
 * Design principles:
 * - Plugin extends the state type via intersection (HistoryState)
 * - Each edit operation records before/after state for reversal
 * - Navigation-only ops are excluded from history (cursor moves are not undoable)
 * - Rapid edits within a time window are grouped into a single undo step
 * - The plugin is pure: it wraps .apply() and returns extended state + effects
 *
 * Usage:
 *   const apply = withHistory(applyBoard)
 *   const [state, effects] = apply(state, op)
 *   // state now includes state.history with undo/redo stacks
 *
 * See docs/design/tea-state-machines.md for the full TEA vision.
 */

import type { BoardNavState, BoardOp, BoardEditOp, ApplyResult } from "./board-reducer.ts"

// =============================================================================
// History State
// =============================================================================

/** A single history entry — records the operation and a state snapshot for reversal. */
export interface HistoryEntry {
  /** The operation that was applied */
  op: BoardEditOp
  /** Cursor position before the operation (for restoration on undo) */
  cursorBefore: string | null
  /** Cursor position after the operation */
  cursorAfter: string | null
  /** Timestamp when the entry was recorded (for grouping rapid edits) */
  timestamp: number
}

/** History state — maintained by the withHistory plugin. */
export interface HistoryState {
  /** Stack of undoable operations (most recent at end) */
  undos: HistoryEntry[]
  /** Stack of redoable operations (most recent at end) */
  redos: HistoryEntry[]
}

/** Extended board state with history fields. */
export type BoardStateWithHistory = BoardNavState & { history: HistoryState }

// =============================================================================
// Configuration
// =============================================================================

/**
 * Time window (ms) for grouping rapid edits into a single undo step.
 * Edits within this window of each other are merged.
 */
export const HISTORY_GROUP_WINDOW_MS = 300

/**
 * Maximum number of undo entries to retain.
 * Oldest entries are dropped when exceeded.
 */
export const HISTORY_MAX_UNDOS = 100

// =============================================================================
// Type Guards
// =============================================================================

/** Operation types that are excluded from history (navigation-only, no repo mutations). */
const NAV_ONLY_TYPES = new Set([
  "BLOCK_NAV",
  "OUTLINE_NAV",
  "SELECT",
  "PAGE_JUMP",
  "FOLD_LEVEL",
  "UNFOLD_LEVEL",
  "TOGGLE_FOLD",
  "FOLD_NODE",
  "UNFOLD_NODE",
  "UNFOLD_RECURSIVE",
])

/** Returns true if the operation should be recorded in history. */
function isHistoryWorthy(op: BoardOp): op is BoardEditOp {
  return !NAV_ONLY_TYPES.has(op.type)
}

/**
 * Returns true if two operations should be grouped into a single undo step.
 * Same operation type within the time window are grouped.
 */
function shouldGroup(prev: HistoryEntry, op: BoardEditOp, timestamp: number): boolean {
  if (timestamp - prev.timestamp > HISTORY_GROUP_WINDOW_MS) return false
  // Only group same-type operations (e.g., consecutive status toggles)
  return prev.op.type === op.type
}

// =============================================================================
// Plugin
// =============================================================================

/** The apply function signature that withHistory wraps. */
export type ApplyFn = (state: BoardNavState, op: BoardOp) => ApplyResult

/** Create an empty history state. */
export function createHistoryState(): HistoryState {
  return { undos: [], redos: [] }
}

/**
 * Create a BoardStateWithHistory from a BoardNavState.
 */
export function createBoardStateWithHistory(base: BoardNavState, history?: HistoryState): BoardStateWithHistory {
  return { ...base, history: history ?? createHistoryState() }
}

/**
 * withHistory — wraps a Board.apply() function to add undo/redo tracking.
 *
 * Following the TEA plugin pattern: plugins extend state via type intersection
 * and wrap the apply function via composition.
 *
 * ```ts
 * const apply = withHistory(applyBoard)
 * const result = apply(stateWithHistory, op)
 * // result.state.history.undos now contains the operation
 * ```
 *
 * @param inner - The inner apply function to wrap
 * @param now - Optional time provider for testing (defaults to Date.now)
 * @returns A wrapped apply function that tracks history
 */
export function withHistory(
  inner: ApplyFn,
  now: () => number = Date.now,
): (state: BoardStateWithHistory, op: BoardOp) => { state: BoardStateWithHistory; effects: ApplyResult["effects"] } {
  return (state: BoardStateWithHistory, op: BoardOp) => {
    // Apply the inner reducer
    const result = inner(state, op)

    // If the operation is navigation-only, pass through without recording
    if (!isHistoryWorthy(op)) {
      return {
        state: { ...result.state, history: state.history },
        effects: result.effects,
      }
    }

    // Record the edit operation in history
    const timestamp = now()
    const entry: HistoryEntry = {
      op,
      cursorBefore: state.cursorNodeId,
      cursorAfter: result.state.cursorNodeId,
      timestamp,
    }

    let undos = [...state.history.undos]

    // Check if we should group with the previous entry
    const lastUndo = undos[undos.length - 1]
    if (lastUndo && shouldGroup(lastUndo, op, timestamp)) {
      // Merge: update the last entry's cursor and timestamp, keep the original cursorBefore
      undos[undos.length - 1] = {
        ...entry,
        cursorBefore: lastUndo.cursorBefore,
      }
    } else {
      undos.push(entry)
    }

    // Enforce max undo capacity
    if (undos.length > HISTORY_MAX_UNDOS) {
      undos = undos.slice(undos.length - HISTORY_MAX_UNDOS)
    }

    // New edit clears the redo stack (standard undo/redo behavior)
    const history: HistoryState = { undos, redos: [] }

    return {
      state: { ...result.state, history },
      effects: result.effects,
    }
  }
}

// =============================================================================
// Undo / Redo Operations
// =============================================================================

/**
 * Operation to trigger undo — pops from undos, pushes to redos.
 * Returns the entry to undo (the runtime replays its inverse effects)
 * and the updated history state.
 *
 * This is a pure function — the runtime is responsible for actually
 * reversing the repo mutations.
 */
export function undoOp(history: HistoryState): {
  entry: HistoryEntry | null
  history: HistoryState
} {
  if (history.undos.length === 0) {
    return { entry: null, history }
  }

  const undos = [...history.undos]
  const entry = undos.pop()!
  const redos = [...history.redos, entry]

  return {
    entry,
    history: { undos, redos },
  }
}

/**
 * Operation to trigger redo — pops from redos, pushes to undos.
 * Returns the entry to redo and the updated history state.
 */
export function redoOp(history: HistoryState): {
  entry: HistoryEntry | null
  history: HistoryState
} {
  if (history.redos.length === 0) {
    return { entry: null, history }
  }

  const redos = [...history.redos]
  const entry = redos.pop()!
  const undos = [...history.undos, entry]

  return {
    entry,
    history: { undos, redos },
  }
}

/**
 * Check if undo is available.
 */
export function canUndo(history: HistoryState): boolean {
  return history.undos.length > 0
}

/**
 * Check if redo is available.
 */
export function canRedo(history: HistoryState): boolean {
  return history.redos.length > 0
}
