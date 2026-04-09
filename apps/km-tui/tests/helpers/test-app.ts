/**
 * TestApp — Unified test driver abstraction for km board tests.
 *
 * Wraps createBoardDriver + withDiagnostics behind a simple API:
 *   press(key), type(text), text, expectScreen(text), expectNoScreen(text),
 *   cell(col, row), screenshot(path?), [Symbol.dispose]()
 *
 * Phase 1: headless backend only (createBoardDriver + withDiagnostics).
 * Phase 2 will add termless backend (real ANSI through xterm.js emulator).
 *
 * @example
 * ```typescript
 * using app = createTestApp(realisticBoard(), { cols: 120, rows: 30 })
 * await app.press("j")
 * app.expectScreen("Buy groceries")
 * app.expectNoScreen("nonexistent")
 * ```
 */

import { expect } from "vitest"
import { withDiagnostics } from "@silvery/ag-react"
import { createBoardDriver, type BoardDriver } from "../../src/driver.ts"
import { createFakeRepo } from "@km/storage"
import type { KNode } from "@km/core"
import type { FrameCell } from "@silvery/ag"
import { item } from "./board-test.ts"

// =============================================================================
// Types
// =============================================================================

export interface TestApp {
  /** Send a keypress (e.g. "j", "Enter", "Control+d") */
  press(key: string): Promise<void>
  /** Type a sequence of characters (each character sent as a keypress) */
  type(text: string): Promise<void>
  /** Current screen content as plain text */
  readonly text: string
  /** Assert that the screen contains the given text */
  expectScreen(text: string): void
  /** Assert that the screen does NOT contain the given text */
  expectNoScreen(text: string): void
  /** Get cell info at the given column and row */
  cell(col: number, row: number): CellInfo
  /** Capture a screenshot (requires Playwright) */
  screenshot(path?: string): Promise<Buffer>
  /** Access the underlying BoardDriver for advanced use */
  readonly driver: BoardDriver
  /** Dispose the test app */
  [Symbol.dispose](): void
}

export interface CellInfo {
  char: string
  fg: { r: number; g: number; b: number } | null
  bg: { r: number; g: number; b: number } | null
  bold: boolean
  dim: boolean
  italic: boolean
}

export interface TestAppOptions {
  /** Terminal width (default: 120) */
  cols?: number
  /** Terminal height (default: 30) */
  rows?: number
  /** Backend type (default: env TEST_BACKEND or "headless") */
  backend?: "headless" | "termless"
}

// =============================================================================
// Fixtures
// =============================================================================

/** Create a realistic board fixture with varied content (multi-column, tasks, dates, sections). */
export function realisticBoard(): KNode[] {
  return item(
    "board",
    item(
      "Next",
      item.task("Buy groceries"),
      item.task("Fix plumbing — call 2024-01-16"),
      item("+Taxes — reply to @Shubam", item("(1) confirm Q1 figures"), item("(2) send W-2 copies")),
      item.task("Schedule dentist"),
    ),
    item("Waiting", item.task("@JoseChu — file US Form 4868 extension"), item.task("Insurance claim #4421")),
    item(
      "Inbox",
      item("2025 Tax Document.pdf"),
      item("Meeting notes from Monday"),
      item("Project Alpha kickoff"),
      item("Review **bold text** and `code blocks`"),
    ),
    item("Done", item.task("Set up direct deposit"), item.task("File Q4 report")),
    item("Archived", item("Old project notes")),
  )
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a test app from a fixture node array.
 *
 * The headless backend wraps createBoardDriver + withDiagnostics with
 * incremental + stability checks enabled and breadcrumb/status bar lines skipped.
 *
 * @param nodes - Node array from item() or realisticBoard()
 * @param opts - Terminal dimensions and backend selection
 */
export function createTestApp(nodes: KNode[], opts: TestAppOptions = {}): TestApp {
  const { cols = 120, rows = 30, backend } = opts
  const resolvedBackend = backend ?? process.env.TEST_BACKEND ?? "headless"

  if (resolvedBackend === "termless") {
    throw new Error("termless backend not yet implemented — coming in Phase 2")
  }

  const boardRootId = nodes[0]!.id
  const repo = createFakeRepo({ nodes })

  const driver = withDiagnostics(createBoardDriver(repo, boardRootId, { columns: cols, rows }), {
    checkIncremental: true,
    checkStability: true,
    skipLines: [0, -1], // breadcrumb and status bar may have timing diffs
  })

  return {
    async press(key: string): Promise<void> {
      await driver.press(key)
    },

    async type(text: string): Promise<void> {
      await driver.type(text)
    },

    get text(): string {
      return driver.text
    },

    expectScreen(text: string): void {
      expect(driver.containsText(text)).toBe(true)
    },

    expectNoScreen(text: string): void {
      expect(driver.containsText(text)).toBe(false)
    },

    cell(col: number, row: number): CellInfo {
      const fc: FrameCell = driver.cell(col, row)
      return {
        char: fc.char,
        fg: fc.fg,
        bg: fc.bg,
        bold: fc.bold,
        dim: fc.dim,
        italic: fc.italic,
      }
    },

    async screenshot(path?: string): Promise<Buffer> {
      return driver.screenshot(path)
    },

    get driver(): BoardDriver {
      return driver
    },

    [Symbol.dispose](): void {
      // BoardDriver (App) has unmount for cleanup
      if ("unmount" in driver && typeof driver.unmount === "function") {
        driver.unmount()
      }
    },
  }
}
