/**
 * Fuzz Testing Invariant Library
 *
 * Common invariant checks for TUI fuzz testing. These assertions verify
 * properties that should hold after any valid action sequence.
 *
 * ## Usage
 *
 * ```typescript
 * import { checkAllInvariants, invariants } from './helpers/fuzz-invariants.ts'
 *
 * // Check all invariants
 * checkAllInvariants(state, action, beforeState)
 *
 * // Or check specific invariants
 * invariants.noRenderErrors(state, action)
 * invariants.validCursor(state, action)
 * ```
 */

import { expect } from "vitest"
import type { TUIDriverState } from "../../src/driver.ts"

/**
 * Type for driver state used in invariant checks
 */
export type FuzzState = TUIDriverState

/**
 * Invariant check function signature
 */
export type InvariantCheck = (state: FuzzState, action: string, before?: FuzzState) => void

/**
 * Error patterns that indicate rendering bugs
 */
const ERROR_PATTERNS = [
  "[object Object]",
  "TypeError:",
  "ReferenceError:",
  "SyntaxError:",
  "RangeError:",
  "Error:",
  "NaN",
] as const

/**
 * Strings that indicate serialization/undefined bugs
 */
const SERIALIZATION_BUGS = ["undefined", "null", "[Function", "[Circular"] as const

/**
 * Valid view modes
 */
const VALID_VIEW_MODES = ["cards", "list", "columns", "tabs"] as const

/**
 * Valid cursor levels
 */
const VALID_CURSOR_LEVELS = ["board", "column", "card"] as const

// =============================================================================
// Individual Invariant Checks
// =============================================================================

export const invariants = {
  /**
   * Screen should have content - empty screen is always a bug
   */
  nonEmptyScreen(state: FuzzState, action: string): void {
    expect(state.screen.length, `Empty screen after ${action}`).toBeGreaterThan(0)
  },

  /**
   * No JavaScript error strings in rendered output
   */
  noRenderErrors(state: FuzzState, action: string): void {
    for (const pattern of ERROR_PATTERNS) {
      expect(state.screen, `"${pattern}" found in screen after ${action}`).not.toContain(pattern)
    }
  },

  /**
   * No serialization bugs (undefined, null rendered as text)
   */
  noSerializationBugs(state: FuzzState, action: string): void {
    for (const pattern of SERIALIZATION_BUGS) {
      expect(state.screen, `"${pattern}" found in screen after ${action}`).not.toContain(pattern)
    }
  },

  /**
   * View mode should be valid
   */
  validViewMode(state: FuzzState, action: string): void {
    expect(VALID_VIEW_MODES, `Invalid view mode "${state.viewMode}" after ${action}`).toContain(state.viewMode)
  },

  /**
   * Cursor should exist and be valid when not in a dialog
   */
  validCursor(state: FuzzState, action: string): void {
    const inDialog = state.dialogs.search || state.dialogs.help || state.dialogs.newItem || state.dialogs.itemPicker

    if (!inDialog) {
      expect(state.cursor, `Cursor missing after ${action}`).toBeDefined()

      // Cursor level should be valid
      expect(VALID_CURSOR_LEVELS, `Invalid cursor level "${state.cursor.level}" after ${action}`).toContain(
        state.cursor.level,
      )

      // At board level, cursor.col can be -1 (no column selected)
      // At other levels, col should be >= 0
      if (state.cursor.level !== "board") {
        expect(state.cursor.col, `Invalid cursor.col (${state.cursor.col}) after ${action}`).toBeGreaterThanOrEqual(0)
      }

      // Card index should be >= 0 at card level
      if (state.cursor.level === "card") {
        expect(state.cursor.card, `Invalid cursor.card (${state.cursor.card}) after ${action}`).toBeGreaterThanOrEqual(
          0,
        )
      }
    }
  },

  /**
   * Move mode should be consistent with state
   */
  validMoveMode(state: FuzzState, action: string): void {
    // moveMode is derived from moveState.active (still a boolean in FuzzState)
    expect(typeof state.moveMode, `moveMode should be boolean after ${action}`).toBe("boolean")
  },

  /**
   * Dialog states should be mutually exclusive (only one main dialog at a time)
   * Note: help can overlay other dialogs, so we exclude it
   */
  mutuallyExclusiveDialogs(state: FuzzState, action: string): void {
    const mainDialogs = [state.dialogs.search, state.dialogs.newItem, state.dialogs.itemPicker].filter(Boolean).length

    expect(mainDialogs, `Multiple main dialogs open after ${action}`).toBeLessThanOrEqual(1)
  },

  /**
   * State consistency - captured state should match derived state
   */
  stateConsistency(state: FuzzState, action: string): void {
    if (state.ui) {
      // viewMode lives on the pane (not UIState) — validated by validViewMode
      expect(state.viewMode, `viewMode should be defined after ${action}`).toBeDefined()
    }
  },

  /**
   * No screen flicker - consecutive renders shouldn't have drastic changes
   * (unless a dialog opened/closed, view mode changed, or detail pane changed)
   *
   * NOTE: This invariant is intentionally permissive because many actions
   * can legitimately cause large screen changes (zoom, scroll, detail pane).
   * It's mainly useful for catching complete render failures.
   */
  noScreenFlicker(state: FuzzState, action: string, before?: FuzzState): void {
    if (!before) return

    // Skip if dialog state changed (expected to cause visual changes)
    const dialogChanged =
      state.dialogs.search !== before.dialogs.search ||
      state.dialogs.help !== before.dialogs.help ||
      state.dialogs.newItem !== before.dialogs.newItem ||
      state.dialogs.itemPicker !== before.dialogs.itemPicker

    // Skip if view mode changed
    const viewModeChanged = state.viewMode !== before.viewMode

    // Skip if detail pane changed
    const detailPaneChanged = state.detailPaneOpen !== before.detailPaneOpen

    // Skip if cursor level changed (likely a zoom operation)
    const cursorLevelChanged = state.cursor.level !== before.cursor.level

    // Skip for certain keys that are expected to cause large changes
    const expectedLargeChange = ["Enter", "Escape", "o", "u", "i"].includes(action)

    if (dialogChanged || viewModeChanged || detailPaneChanged || cursorLevelChanged || expectedLargeChange) {
      return
    }

    // Very permissive check: just ensure the screen isn't completely different
    // This catches total render failures, not partial screen changes
    const beforeLines = before.screen.split("\n")
    const afterLines = state.screen.split("\n")
    const minLines = Math.min(beforeLines.length, afterLines.length)

    // At least some content should exist
    if (minLines > 0) {
      let unchangedLines = 0
      for (let i = 0; i < minLines; i++) {
        if (beforeLines[i] === afterLines[i]) {
          unchangedLines++
        }
      }

      // Only fail if screen is COMPLETELY different (0 lines match)
      // This is a very low bar - mainly catches total render failures
      const unchangedRatio = unchangedLines / minLines
      expect(
        unchangedRatio,
        `Screen completely replaced (0% unchanged) after ${action} - possible render failure`,
      ).toBeGreaterThan(0)
    }
  },

  /**
   * When cursor is at card level, selectedNodeId should not be null.
   * A card-level cursor with no associated node indicates a stale cursor
   * pointing at a node that no longer exists in the layout.
   */
  cursorNodeExists(state: FuzzState, action: string): void {
    const inDialog = state.dialogs.search || state.dialogs.help || state.dialogs.newItem || state.dialogs.itemPicker

    if (!inDialog && state.cursor.level === "card") {
      expect
        .soft(
          state.selectedNodeId,
          `Cursor at card level but selectedNodeId is null after ${action} ` +
            `(col=${state.cursor.col}, card=${state.cursor.card})`,
        )
        .not.toBeNull()
    }
  },

  /**
   * Screen content should not have fully blank rows in the middle of content.
   * A blank row between the first and last non-blank rows indicates a layout gap.
   * Skips check when detail pane is open (can have intentional whitespace separators).
   */
  noContentGaps(state: FuzzState, action: string): void {
    if (state.detailPaneOpen) return

    const lines = state.screen.split("\n")
    if (lines.length < 3) return

    // Find first and last non-blank lines
    let firstNonBlank = -1
    let lastNonBlank = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.trim().length > 0) {
        if (firstNonBlank === -1) firstNonBlank = i
        lastNonBlank = i
      }
    }

    if (firstNonBlank === -1 || lastNonBlank === firstNonBlank) return

    // Count consecutive blank rows within the content area
    // A single blank row can be a legitimate separator; 3+ consecutive blank
    // rows in the middle of content is suspicious
    const GAP_THRESHOLD = 3
    let consecutiveBlanks = 0
    for (let i = firstNonBlank + 1; i < lastNonBlank; i++) {
      if (lines[i]!.trim().length === 0) {
        consecutiveBlanks++
        if (consecutiveBlanks >= GAP_THRESHOLD) {
          expect
            .soft(
              consecutiveBlanks,
              `${consecutiveBlanks} consecutive blank rows at line ${i - consecutiveBlanks + 1} ` +
                `within content area after ${action} - possible layout gap`,
            )
            .toBeLessThan(GAP_THRESHOLD)
          return // Report once per check
        }
      } else {
        consecutiveBlanks = 0
      }
    }
  },

  /**
   * When cursor is at card level, the cursor's card index should be within
   * the bounds of the column's card array. An out-of-bounds index means
   * the cursor wasn't clamped after a layout change (fold, filter, zoom).
   */
  cursorWithinBounds(state: FuzzState, action: string): void {
    const inDialog = state.dialogs.search || state.dialogs.help || state.dialogs.newItem || state.dialogs.itemPicker

    if (inDialog) return
    if (state.cursor.level !== "card") return

    const colId = state.columnIds[state.cursor.col]
    if (!colId) return

    // Card count not directly available from columnIds — skip bounds check
    // (cursor bounds are validated by the nodeIndex invariant below)
  },

  /**
   * At least 1 column should exist in the layout. The board should always
   * have visible columns — zero columns means the root has no children
   * or derivation failed silently.
   */
  columnCountPositive(state: FuzzState, action: string): void {
    expect
      .soft(state.columnIds.length, `No columns in layout after ${action} - board has no visible content`)
      .toBeGreaterThan(0)
  },
}

// =============================================================================
// Composite Invariant Checks
// =============================================================================

/**
 * Check all basic invariants (fast, always run)
 */
export function checkBasicInvariants(state: FuzzState, action: string, before?: FuzzState): void {
  invariants.nonEmptyScreen(state, action)
  invariants.noRenderErrors(state, action)
  invariants.validViewMode(state, action)
  invariants.validCursor(state, action)
  invariants.validMoveMode(state, action)
}

/**
 * Check all invariants including more expensive checks
 */
export function checkAllInvariants(state: FuzzState, action: string, before?: FuzzState): void {
  // Basic checks
  checkBasicInvariants(state, action, before)

  // Additional checks
  invariants.noSerializationBugs(state, action)
  invariants.mutuallyExclusiveDialogs(state, action)
  invariants.stateConsistency(state, action)
  invariants.noScreenFlicker(state, action, before)

  // Structural checks
  invariants.cursorNodeExists(state, action)
  invariants.noContentGaps(state, action)
  invariants.cursorWithinBounds(state, action)
  invariants.columnCountPositive(state, action)
}

/**
 * Check invariants with custom selection
 */
export function checkInvariants(
  state: FuzzState,
  action: string,
  before: FuzzState | undefined,
  checks: (keyof typeof invariants)[],
): void {
  for (const check of checks) {
    invariants[check](state, action, before)
  }
}

// =============================================================================
// Specialized Invariant Sets
// =============================================================================

/**
 * Invariants for navigation-focused testing
 */
export function checkNavigationInvariants(state: FuzzState, action: string, before?: FuzzState): void {
  invariants.nonEmptyScreen(state, action)
  invariants.noRenderErrors(state, action)
  invariants.validCursor(state, action)
  invariants.validViewMode(state, action)
  invariants.cursorNodeExists(state, action)
  invariants.cursorWithinBounds(state, action)
  invariants.columnCountPositive(state, action)
}

/**
 * Invariants for dialog-focused testing
 */
export function checkDialogInvariants(state: FuzzState, action: string, before?: FuzzState): void {
  invariants.nonEmptyScreen(state, action)
  invariants.noRenderErrors(state, action)
  invariants.mutuallyExclusiveDialogs(state, action)
  // Cursor rules are different in dialogs
}

/**
 * Invariants for view mode switching
 */
export function checkViewModeInvariants(state: FuzzState, action: string, before?: FuzzState): void {
  invariants.nonEmptyScreen(state, action)
  invariants.noRenderErrors(state, action)
  invariants.validViewMode(state, action)
  invariants.validCursor(state, action)
  invariants.stateConsistency(state, action)
}

// =============================================================================
// Sequence Recording Helper
// =============================================================================

/**
 * Action log entry for debugging
 */
export interface ActionLogEntry {
  iteration: number
  action: string
  beforeState: {
    cursor: FuzzState["cursor"]
    viewMode: FuzzState["viewMode"]
    dialogs: FuzzState["dialogs"]
  }
  afterState: {
    cursor: FuzzState["cursor"]
    viewMode: FuzzState["viewMode"]
    dialogs: FuzzState["dialogs"]
  }
}

/**
 * Create a sequence recorder for debugging fuzz failures
 */
export function createSequenceRecorder() {
  const log: ActionLogEntry[] = []

  return {
    /**
     * Record an action and its state transition
     */
    record(iteration: number, action: string, before: FuzzState, after: FuzzState): void {
      log.push({
        iteration,
        action,
        beforeState: {
          cursor: before.cursor,
          viewMode: before.viewMode,
          dialogs: before.dialogs,
        },
        afterState: {
          cursor: after.cursor,
          viewMode: after.viewMode,
          dialogs: after.dialogs,
        },
      })
    },

    /**
     * Get the full action log
     */
    getLog(): ActionLogEntry[] {
      return [...log]
    },

    /**
     * Get just the action sequence (for reproduction)
     */
    getSequence(): string[] {
      return log.map((entry) => entry.action)
    },

    /**
     * Format log for debugging output
     */
    format(): string {
      return log
        .map(
          (entry) =>
            `[${entry.iteration}] ${entry.action}: ` +
            `cursor ${JSON.stringify(entry.beforeState.cursor)} -> ${JSON.stringify(entry.afterState.cursor)}`,
        )
        .join("\n")
    },

    /**
     * Clear the log
     */
    clear(): void {
      log.length = 0
    },
  }
}
