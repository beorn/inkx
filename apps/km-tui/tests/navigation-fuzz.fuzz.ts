/**
 * TUI Navigation Fuzz Tests
 *
 * AI-driven exploration tests using vitestx's fuzz infrastructure.
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
 */

import { describe, expect } from "vitest"
import { test, gen, take, createSeededRandom } from "vitestx/fuzz"
import { createBoardDriver } from "../src/driver.ts"
import { createFakeRepo } from "@km/storage"
import { item } from "./helpers/board-test.ts"

/**
 * Common invariants that should hold after any action
 */
function checkInvariants(
  state: ReturnType<ReturnType<typeof createBoardDriver>["getState"]>,
  action: string,
  _before: ReturnType<ReturnType<typeof createBoardDriver>["getState"]>,
) {
  // Basic sanity: screen should have content
  expect(state.screen.length, `Empty screen after ${action}`).toBeGreaterThan(0)

  // No error strings in screen
  expect(
    state.screen,
    `[object Object] in screen after ${action}`,
  ).not.toContain("[object Object]")
  expect(state.screen, `TypeError in screen after ${action}`).not.toContain(
    "TypeError:",
  )
  expect(
    state.screen,
    `ReferenceError in screen after ${action}`,
  ).not.toContain("ReferenceError:")
  expect(state.screen, `undefined in screen after ${action}`).not.toContain(
    "undefined",
  )

  // Cursor should exist unless in a dialog
  if (
    !state.dialogs.search &&
    !state.dialogs.help &&
    !state.dialogs.newItem &&
    !state.dialogs.projectPicker
  ) {
    expect(state.cursor, `Cursor missing after ${action}`).toBeDefined()
    // At board level, cursor.col can be -1 (no column selected)
    if (state.cursor.level !== "board") {
      expect(
        state.cursor.col,
        `Invalid cursor.col after ${action}`,
      ).toBeGreaterThanOrEqual(0)
    }
  }

  // View mode should be valid
  expect(
    ["cards", "list", "columns", "tabs"],
    `Invalid view mode "${state.viewMode}" after ${action}`,
  ).toContain(state.viewMode)
}

describe("TUI Fuzz Tests", () => {
  /**
   * Basic navigation fuzz - exercises j/k/h/l with fixtures
   */
  test.fuzz("navigation invariants hold under random actions", async () => {
    const nodes = item.root(
      "board",
      item(
        "Inbox",
        item("Task 1"),
        item("Task 2"),
        item("Task 3"),
        item("Task 4"),
      ),
      item(
        "Projects",
        item.folder("Alpha", item("Alpha 1"), item("Alpha 2")),
        item.folder("Beta", item("Beta 1")),
      ),
      item("Areas", item.folder("Health", item("Exercise"), item("Diet"))),
      item("Archive", item("Old 1"), item("Old 2")),
    )
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board")

    // Navigation keys with some extras
    const keys = ["j", "k", "h", "l", "g", "G", "v", "z", "/", "Escape"]

    for await (const key of take(gen(keys), 100)) {
      const before = driver.getState()
      driver.press(key)
      const after = driver.getState()

      checkInvariants(after, key, before)
    }
  })

  /**
   * Deep tree fuzz - tests zoom behavior
   */
  test.fuzz("zoom navigation invariants", async () => {
    const nodes = item.root(
      "vault",
      item.folder(
        "deeply",
        item.folder(
          "nested",
          item.folder(
            "structure",
            item.file("doc", item.section("heading", item.paragraph("text"))),
          ),
        ),
      ),
      item.folder("sibling", item("task")),
    )
    const driver = createBoardDriver(createFakeRepo({ nodes }), "vault")

    // Include Enter for zoom
    const keys = ["j", "k", "h", "l", "Enter", "Escape", "o", "u", "[", "]"]

    for await (const key of take(gen(keys), 100)) {
      const before = driver.getState()
      driver.press(key)
      const after = driver.getState()

      checkInvariants(after, key, before)
    }
  })

  /**
   * View mode switching fuzz
   */
  test.fuzz("view mode switching invariants", async () => {
    const nodes = item.root(
      "board",
      item("col1", item("task1"), item("task2"), item("task3")),
      item("col2", item("taskA"), item("taskB")),
      item("col3", item("taskX")),
    )
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board")

    // Weighted towards view mode switching
    const keys = [
      [10, "v"], // High weight for view mode
      [5, "j"],
      [5, "k"],
      [3, "h"],
      [3, "l"],
      [2, "g"],
      [2, "G"],
    ] as const

    for await (const key of take(gen(keys as [number, string][]), 100)) {
      const before = driver.getState()
      driver.press(key)
      const after = driver.getState()

      checkInvariants(after, key, before)

      // View mode specific: v should cycle
      if (key === "v" && !before.dialogs.search && !before.dialogs.help) {
        expect(after.viewMode, "View mode should change after v").not.toBe(
          before.viewMode,
        )
      }
    }
  })

  /**
   * Search dialog fuzz
   */
  test.fuzz("search dialog invariants", async () => {
    const nodes = item.root(
      "board",
      item(
        "col",
        item("Alpha task"),
        item("Beta task"),
        item("Gamma task"),
        item("Delta task"),
      ),
    )
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board")

    // Keys that interact with search
    const navigationKeys = ["j", "k", "ArrowUp", "ArrowDown"]
    const typeKeys = ["a", "b", "c", "t", "a", "s", "k"]

    let inSearch = false

    for await (const key of take(
      gen(({ random }) => {
        if (inSearch) {
          // In search: type, navigate results, or exit
          return random.pick([
            ...typeKeys,
            ...navigationKeys,
            "Escape",
            "Enter",
          ])
        } else {
          // Not in search: open search or navigate
          return random.pick(["j", "k", "h", "l", "/"])
        }
      }),
      100,
    )) {
      const before = driver.getState()
      driver.press(key)
      const after = driver.getState()

      inSearch = after.dialogs.search

      checkInvariants(after, key, before)
    }
  })

  /**
   * Empty state fuzz - edge cases with minimal data
   */
  test.fuzz("empty state invariants", async () => {
    const nodes = item.root("board", item("empty-col"))
    const driver = createBoardDriver(createFakeRepo({ nodes }), "board")

    const keys = ["j", "k", "h", "l", "g", "G", "v", "Enter", "Escape"]

    for await (const key of take(gen(keys), 50)) {
      const before = driver.getState()
      driver.press(key)
      const after = driver.getState()

      checkInvariants(after, key, before)
    }
  })
})

/**
 * Diagnostic helpers for ad-hoc exploration
 *
 * These can be imported and used in scripts:
 *
 * ```typescript
 * import { createDiagnosticDriver, runDiagnostic } from './navigation-fuzz.fuzz.ts'
 *
 * const driver = createDiagnosticDriver()
 * await runDiagnostic(driver, 100)
 * ```
 */
export function createDiagnosticDriver(vaultPath?: string) {
  if (vaultPath) {
    // This would need to be async in practice
    throw new Error("Use createBoardDriver with createRepo for real vaults")
  }

  const nodes = item.root(
    "board",
    item("Inbox", item("Task 1"), item("Task 2")),
    item("Projects", item.folder("Alpha", item("Alpha 1"))),
  )
  return createBoardDriver(createFakeRepo({ nodes }), "board")
}

export async function runDiagnostic(
  driver: ReturnType<typeof createBoardDriver>,
  iterations: number,
  seed?: number,
) {
  const rng = createSeededRandom(seed ?? Date.now())
  const keys = ["j", "k", "h", "l", "g", "G", "v", "/", "Escape"]
  const issues: { iteration: number; key: string; issue: string }[] = []

  for (let i = 0; i < iterations; i++) {
    const key = rng.pick(keys)
    const before = driver.getState()
    driver.press(key)
    const after = driver.getState()

    // Check invariants and collect issues
    try {
      checkInvariants(after, key, before)
    } catch (e) {
      issues.push({ iteration: i, key, issue: String(e) })
    }
  }

  return { issues, seed }
}
