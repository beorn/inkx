/**
 * TUI Navigation Fuzz Tests
 *
 * AI-driven exploration tests using vimonkey's fuzz infrastructure.
 * These tests exercise the TUI with random actions and check invariants.
 *
 * ## Running
 *
 * ```bash
 * # Run fuzz tests
 * bun vitest run apps/km-tui/tests/navigation-fuzz.fuzz.ts
 *
 * # With specific seed for reproducibility
 * FUZZ_SEED=12345 bun vitest run apps/km-tui/tests/navigation-fuzz.fuzz.ts
 *
 * # Run with watch mode
 * bun vitest run apps/km-tui/tests/navigation-fuzz.fuzz.ts --watch
 * ```
 *
 * ## Philosophy: Tests vs Diagnostics
 *
 * These fuzz tests are **automated diagnostics** that:
 * - Can use fixtures, real vaults, or custom state
 * - Introspect state, execute random actions, check invariants
 * - On failure: shrink to minimal sequence, save to __fuzz_cases__/
 *
 * When a fuzz test finds a bug, convert the minimal failing sequence
 * into a deterministic test in board.spec.ts.
 *
 * ## Invariant Library
 *
 * See ./helpers/fuzz-invariants.ts for the invariant checking library.
 * It provides:
 * - Individual invariant checks (invariants.*)
 * - Composite checks (checkBasicInvariants, checkAllInvariants)
 * - Specialized check sets (checkNavigationInvariants, etc.)
 * - Sequence recording for debugging
 */

import { describe, expect } from "vitest"
import { test, gen, take, createSeededRandom } from "vimonkey/fuzz"
import { createBoardDriver } from "../src/driver.ts"
import { createFakeRepo } from "@km/storage"
import { item } from "./helpers/board-test.ts"
import {
  checkBasicInvariants,
  checkAllInvariants,
  checkNavigationInvariants,
  checkDialogInvariants,
  checkViewModeInvariants,
  createSequenceRecorder,
  type FuzzState,
} from "./helpers/fuzz-invariants.ts"

// =============================================================================
// Key Sets - Organized by Command Category
// =============================================================================

/**
 * Basic navigation keys (hjkl + arrows)
 */
const NAVIGATION_KEYS = ["j", "k", "h", "l", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"]

/**
 * Extended navigation keys (first/last, zoom, history)
 */
const EXTENDED_NAV_KEYS = ["g", "G", "o", "u", "i", "[", "]"]

/**
 * View and fold keys
 */
const VIEW_KEYS = ["v", "z", "Z", "Tab", "c", "<", ">", "+", "-"]

/**
 * Dialog trigger keys
 */
const DIALOG_KEYS = ["/", "?", "n", "p"]

/**
 * Selection keys
 */
const SELECTION_KEYS = ["A", "J", "K", "H", "L"]

/**
 * Action keys (Enter, Escape, Space)
 */
const ACTION_KEYS = ["Enter", "Escape", " "]

/**
 * All keys combined
 */
const ALL_KEYS = [
  ...NAVIGATION_KEYS,
  ...EXTENDED_NAV_KEYS,
  ...VIEW_KEYS,
  ...DIALOG_KEYS,
  ...SELECTION_KEYS,
  ...ACTION_KEYS,
]

/**
 * Weighted key distribution for realistic usage patterns
 */
const WEIGHTED_KEYS: [number, string][] = [
  // Navigation is most common
  [15, "j"],
  [15, "k"],
  [10, "h"],
  [10, "l"],
  // First/last used occasionally
  [3, "g"],
  [3, "G"],
  // Zoom navigation
  [5, "o"],
  [3, "u"],
  [2, "i"],
  // History navigation
  [2, "["],
  [2, "]"],
  // View mode and fold
  [5, "v"],
  [3, "z"],
  [2, "Z"],
  [3, "Tab"],
  [2, "c"],
  // Dialogs
  [4, "/"],
  [2, "?"],
  [1, "n"],
  [1, "p"],
  // Selection
  [2, "A"],
  [3, "J"],
  [3, "K"],
  [2, "H"],
  [2, "L"],
  // Actions
  [5, "Enter"],
  [8, "Escape"],
  [3, " "],
  // Content lines
  [1, "+"],
  [1, "-"],
  [1, "<"],
  [1, ">"],
]

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Standard board with multiple columns and nested items
 */
function createStandardBoard() {
  return item.root(
    "board",
    item("Inbox", item("Task 1"), item("Task 2"), item("Task 3"), item("Task 4")),
    item(
      "Projects",
      item.folder("Alpha", item("Alpha 1"), item("Alpha 2"), item("Alpha 3")),
      item.folder("Beta", item("Beta 1"), item("Beta 2")),
      item.folder("Gamma", item("Gamma 1")),
    ),
    item(
      "Areas",
      item.folder("Health", item("Exercise"), item("Diet"), item("Sleep")),
      item.folder("Work", item("Meetings"), item("Reports")),
    ),
    item("Archive", item("Old 1"), item("Old 2"), item("Old 3")),
  )
}

/**
 * Deep nested tree for zoom testing
 */
function createDeepTree() {
  return item.root(
    "vault",
    item.folder(
      "level1",
      item.folder(
        "level2",
        item.folder(
          "level3",
          item.file(
            "doc",
            item.section("section1", item.p("para1"), item.p("para2")),
            item.section("section2", item.p("para3")),
          ),
        ),
      ),
    ),
    item.folder("sibling1", item("task1"), item("task2")),
    item.folder("sibling2", item("task3")),
  )
}

/**
 * Wide board with many columns
 */
function createWideBoard() {
  return item.root(
    "board",
    item("col1", item("1a"), item("1b"), item("1c")),
    item("col2", item("2a"), item("2b")),
    item("col3", item("3a"), item("3b"), item("3c"), item("3d")),
    item("col4", item("4a")),
    item("col5", item("5a"), item("5b")),
    item("col6", item("6a"), item("6b"), item("6c")),
    item("col7", item("7a")),
  )
}

/**
 * Board with empty columns
 */
function createSparseBoard() {
  return item.root(
    "board",
    item("empty1"),
    item("full", item("task1"), item("task2")),
    item("empty2"),
    item("single", item("lonely")),
    item("empty3"),
  )
}

// =============================================================================
// Fuzz Tests
// =============================================================================

describe("TUI Fuzz Tests", () => {
  /**
   * Comprehensive navigation fuzz with all keys
   */
  test.fuzz("comprehensive navigation invariants", async () => {
    const nodes = createStandardBoard()
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board")

    for await (const key of take(gen<string>(WEIGHTED_KEYS), 200)) {
      const before = driver.getState()
      driver.press(key)
      const after = driver.getState()

      checkAllInvariants(after, key, before)
    }
  })

  /**
   * Basic navigation fuzz - exercises hjkl with fixtures
   */
  test.fuzz("basic navigation invariants", async () => {
    const nodes = createStandardBoard()
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board")

    const keys = [...NAVIGATION_KEYS, "g", "G", "Escape"]

    for await (const key of take(gen<string>(keys), 150)) {
      const before = driver.getState()
      driver.press(key)
      const after = driver.getState()

      checkNavigationInvariants(after, key, before)
    }
  })

  /**
   * Deep tree fuzz - tests zoom behavior
   */
  test.fuzz("zoom navigation invariants", async () => {
    const nodes = createDeepTree()
    const driver = createBoardDriver(createFakeRepo({ nodes }), "vault")

    // Include Enter for zoom, o/u/i for zoom in/out
    const keys = [...NAVIGATION_KEYS, "Enter", "Escape", "o", "u", "i", "[", "]"]

    for await (const key of take(gen<string>(keys), 150)) {
      const before = driver.getState()
      driver.press(key)
      const after = driver.getState()

      checkBasicInvariants(after, key, before)
    }
  })

  /**
   * View mode switching fuzz
   */
  test.fuzz("view mode switching invariants", async () => {
    const nodes = createStandardBoard()
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board")

    // Weighted towards view mode switching
    const keys: [number, string][] = [
      [15, "v"], // High weight for view mode
      [5, "j"],
      [5, "k"],
      [3, "h"],
      [3, "l"],
      [2, "g"],
      [2, "G"],
      [3, "Tab"],
      [2, "z"],
      [2, "Z"],
    ]

    for await (const key of take(gen<string>(keys), 150)) {
      const before = driver.getState()
      driver.press(key)
      const after = driver.getState()

      checkViewModeInvariants(after, key, before)

      // View mode specific: v should cycle when not in dialog
      if (
        key === "v" &&
        !before.dialogs.search &&
        !before.dialogs.help &&
        !before.dialogs.newItem
      ) {
        expect(after.viewMode, "View mode should change after v").not.toBe(before.viewMode)
      }
    }
  })

  /**
   * Search dialog fuzz
   */
  test.fuzz("search dialog invariants", async () => {
    const nodes = createStandardBoard()
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board")

    // Keys that interact with search
    const navigationKeys = ["j", "k", "ArrowUp", "ArrowDown"]
    const typeKeys = ["a", "b", "c", "t", "s", "k", "i", "n"]

    let inSearch = false

    for await (const key of take(
      gen(({ random }) => {
        if (inSearch) {
          // In search: type, navigate results, or exit
          return random.pick([...typeKeys, ...navigationKeys, "Escape", "Enter", "Backspace"])
        } else {
          // Not in search: open search or navigate
          return random.pick(["j", "k", "h", "l", "/"])
        }
      }),
      150,
    )) {
      const before = driver.getState()
      driver.press(key)
      const after = driver.getState()

      inSearch = after.dialogs.search

      checkDialogInvariants(after, key, before)
    }
  })

  /**
   * Help dialog fuzz
   */
  test.fuzz("help dialog invariants", async () => {
    const nodes = createStandardBoard()
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board")

    let inHelp = false

    for await (const key of take(
      gen(({ random }) => {
        if (inHelp) {
          // In help: scroll, search, or close
          return random.pick(["j", "k", "ArrowUp", "ArrowDown", "/", "Escape", "?", "q"])
        } else {
          // Not in help: navigate or open help
          return random.pick(["j", "k", "h", "l", "?"])
        }
      }),
      100,
    )) {
      const before = driver.getState()
      driver.press(key)
      const after = driver.getState()

      inHelp = after.dialogs.help

      checkBasicInvariants(after, key, before)
    }
  })

  /**
   * Empty and sparse board fuzz - edge cases
   */
  test.fuzz("sparse board invariants", async () => {
    const nodes = createSparseBoard()
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board")

    const keys = [...NAVIGATION_KEYS, "g", "G", "v", "Enter", "Escape", "Tab"]

    for await (const key of take(gen<string>(keys), 100)) {
      const before = driver.getState()
      driver.press(key)
      const after = driver.getState()

      checkBasicInvariants(after, key, before)
    }
  })

  /**
   * Wide board fuzz - tests horizontal navigation
   */
  test.fuzz("wide board navigation invariants", async () => {
    const nodes = createWideBoard()
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board")

    // Emphasize horizontal movement
    const keys: [number, string][] = [
      [10, "h"],
      [10, "l"],
      [5, "j"],
      [5, "k"],
      [3, "g"],
      [3, "G"],
      [2, "!"], // Jump to column 1
      [2, "@"], // Jump to column 2
      [2, "#"], // Jump to column 3
      [2, "$"], // Jump to column 4
      [2, "%"], // Jump to column 5
    ]

    for await (const key of take(gen<string>(keys), 150)) {
      const before = driver.getState()
      driver.press(key)
      const after = driver.getState()

      checkNavigationInvariants(after, key, before)
    }
  })

  /**
   * Selection mode fuzz
   */
  test.fuzz("selection mode invariants", async () => {
    const nodes = createStandardBoard()
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board")

    // Mix selection keys with navigation
    const keys: [number, string][] = [
      [5, "j"],
      [5, "k"],
      [3, "h"],
      [3, "l"],
      [8, "J"], // Extend select down
      [8, "K"], // Extend select up
      [4, "H"], // Extend select left
      [4, "L"], // Extend select right
      [3, "A"], // Select all progressive
      [5, "Escape"], // Clear selection
    ]

    for await (const key of take(gen<string>(keys), 150)) {
      const before = driver.getState()
      driver.press(key)
      const after = driver.getState()

      checkBasicInvariants(after, key, before)
    }
  })

  /**
   * Fold operations fuzz
   */
  test.fuzz("fold operations invariants", async () => {
    const nodes = createDeepTree()
    const driver = createBoardDriver(createFakeRepo({ nodes }), "vault")

    const keys: [number, string][] = [
      [5, "j"],
      [5, "k"],
      [3, "h"],
      [3, "l"],
      [8, "Tab"], // Toggle fold
      [4, "z"], // Fold all in column
      [4, "Z"], // Unfold all in column
      [3, "c"], // Toggle column collapse
      [2, "o"], // Zoom in
      [2, "u"], // Zoom out
    ]

    for await (const key of take(gen<string>(keys), 150)) {
      const before = driver.getState()
      driver.press(key)
      const after = driver.getState()

      checkBasicInvariants(after, key, before)
    }
  })

  /**
   * Task status cycling fuzz
   */
  test.fuzz("task status cycling invariants", async () => {
    const nodes = createStandardBoard()
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board")

    // Mix task status with navigation
    const keys: [number, string][] = [
      [10, "j"],
      [10, "k"],
      [5, "h"],
      [5, "l"],
      [15, " "], // Space cycles task status
      [3, "Escape"],
    ]

    for await (const key of take(gen<string>(keys), 100)) {
      const before = driver.getState()
      driver.press(key)
      const after = driver.getState()

      checkBasicInvariants(after, key, before)
    }
  })

  /**
   * Rapid key sequences - tests for race conditions
   */
  test.fuzz("rapid key sequences invariants", async () => {
    const nodes = createStandardBoard()
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board")

    // Generate bursts of similar keys
    const burstPatterns = [
      ["j", "j", "j", "j", "j"], // Rapid down
      ["k", "k", "k", "k", "k"], // Rapid up
      ["h", "h", "h", "h", "h"], // Rapid left
      ["l", "l", "l", "l", "l"], // Rapid right
      ["v", "v", "v"], // Rapid view mode
      ["/", "Escape", "/", "Escape"], // Rapid dialog toggle
    ]

    for await (const burst of take(gen(burstPatterns), 30)) {
      for (const key of burst) {
        const before = driver.getState()
        driver.press(key)
        const after = driver.getState()

        checkBasicInvariants(after, key, before)
      }
    }
  })
})

// =============================================================================
// Diagnostic Helpers
// =============================================================================

/**
 * Create a diagnostic driver for ad-hoc exploration
 *
 * @example
 * ```typescript
 * import { createDiagnosticDriver, runDiagnostic } from './navigation-fuzz.fuzz.ts'
 *
 * const driver = createDiagnosticDriver()
 * const result = await runDiagnostic(driver, 100)
 * console.log(result.issues)
 * ```
 */
export function createDiagnosticDriver(vaultPath?: string) {
  if (vaultPath) {
    throw new Error("Use createBoardDriver with createRepo for real vaults")
  }

  const nodes = createStandardBoard()
  return createBoardDriver(createFakeRepo({ nodes }), "board")
}

/**
 * Run a diagnostic session and collect issues
 */
export async function runDiagnostic(driver: ReturnType<typeof createBoardDriver>, iterations: number, seed?: number) {
  const rng = createSeededRandom(seed ?? Date.now())
  const recorder = createSequenceRecorder()
  const issues: { iteration: number; key: string; issue: string }[] = []

  for (let i = 0; i < iterations; i++) {
    const key = rng.pick(ALL_KEYS)
    const before = driver.getState()
    driver.press(key)
    const after = driver.getState()

    // Record for debugging
    recorder.record(i, key, before, after)

    // Check invariants and collect issues
    try {
      checkAllInvariants(after, key, before)
    } catch (e) {
      issues.push({ iteration: i, key, issue: String(e) })
    }
  }

  return {
    issues,
    seed,
    sequence: recorder.getSequence(),
    log: recorder.format(),
  }
}

/**
 * Replay a specific key sequence for debugging
 */
export function replaySequence(driver: ReturnType<typeof createBoardDriver>, sequence: string[]) {
  const recorder = createSequenceRecorder()
  const issues: { iteration: number; key: string; issue: string }[] = []

  for (let i = 0; i < sequence.length; i++) {
    const key = sequence[i]!
    const before = driver.getState()
    driver.press(key)
    const after = driver.getState()

    recorder.record(i, key, before, after)

    try {
      checkAllInvariants(after, key, before)
    } catch (e) {
      issues.push({ iteration: i, key, issue: String(e) })
    }
  }

  return {
    issues,
    log: recorder.format(),
  }
}
