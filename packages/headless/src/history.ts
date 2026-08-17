/**
 * @silvery/headless — HistoryState
 *
 * Pure browser-style navigation history: a list of entries and a cursor.
 * No React, no rendering, no side effects.
 *
 * Push truncates the forward branch, exactly as a browser does. Every move
 * that LEAVES an entry (push, back, forward) can amend the entry being left
 * via `departing` — a history entry records where you were, and the caller
 * only learns that (scroll position, cursor, zoom) at the moment of
 * departure, not when the entry was first pushed. Without amendment, going
 * back returns to the entry but not to the place.
 */

// =============================================================================
// State
// =============================================================================

export interface HistoryState<Entry> {
  /** Every location visited, oldest first. Never empty. */
  readonly entries: readonly Entry[]
  /** Cursor into {@link entries}; always points AT the current entry. */
  readonly index: number
}

// =============================================================================
// Actions
// =============================================================================

export type HistoryAction<Entry> =
  | {
      readonly type: "push"
      readonly entry: Entry
      /** Replacement for the entry being left, applied before the push. */
      readonly departing?: Entry
    }
  /** Replace the current entry in place — a reload, not a move. */
  | { readonly type: "replace"; readonly entry: Entry }
  | { readonly type: "back"; readonly departing?: Entry }
  | { readonly type: "forward"; readonly departing?: Entry }

// =============================================================================
// Factory
// =============================================================================

export function createHistoryState<Entry>(initial: Entry): HistoryState<Entry> {
  return { entries: [initial], index: 0 }
}

// =============================================================================
// Update
// =============================================================================

export function historyUpdate<Entry>(
  state: HistoryState<Entry>,
  action: HistoryAction<Entry>,
): HistoryState<Entry> {
  switch (action.type) {
    case "push": {
      const departing = action.departing
      const kept = state.entries
        .slice(0, state.index + 1)
        .map((entry, at) => (at === state.index && departing !== undefined ? departing : entry))
      return { entries: [...kept, action.entry], index: state.index + 1 }
    }
    case "replace":
      return {
        entries: state.entries.map((entry, at) => (at === state.index ? action.entry : entry)),
        index: state.index,
      }
    case "back":
    case "forward": {
      const index =
        action.type === "back"
          ? Math.max(0, state.index - 1)
          : Math.min(state.entries.length - 1, state.index + 1)
      const departing = action.departing
      const entries =
        departing === undefined
          ? state.entries
          : state.entries.map((entry, at) => (at === state.index ? departing : entry))
      if (index === state.index && entries === state.entries) return state
      return { entries, index }
    }
  }
}

// =============================================================================
// Derivations
// =============================================================================

export function historyCurrent<Entry>(state: HistoryState<Entry>): Entry {
  const entry = state.entries[state.index]
  if (entry === undefined) {
    throw new Error(`history index ${state.index} out of bounds (${state.entries.length} entries)`)
  }
  return entry
}

export function canGoBack(state: HistoryState<unknown>): boolean {
  return state.index > 0
}

export function canGoForward(state: HistoryState<unknown>): boolean {
  return state.index < state.entries.length - 1
}
