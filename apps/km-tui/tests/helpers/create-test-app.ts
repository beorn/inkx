/**
 * Unified test harness entry point for km-tui tests.
 *
 * Consolidates the three previously-overlapping helpers:
 *
 *   - `board-test.ts` → `createDriverTest()` + `item()` fixture builder
 *     (wraps silvery's `createRenderer` for driver-level/white-box tests)
 *   - `test-app.ts` → `createTestApp()` (backend-agnostic: headless/termless)
 *   - `real-board.ts` → `testBoard(vaultPath)` (loads a real vault on disk)
 *
 * All three were reinventing the same concerns: store context, focus manager,
 * fixture derivation, repo/root discovery. The three files still exist because
 * ~100 test files import from them by name, but this module is the documented
 * front door going forward.
 *
 * ## Pick by data shape
 *
 * | Your fixture is…                        | Reach for                                                                 |
 * | --------------------------------------- | ------------------------------------------------------------------------- |
 * | Inline `item()` tree                    | `createTestApp(nodes)` — backend: "renderer" (default) or "termless"      |
 * | Markdown string                         | `createTestApp.fromMarkdown(md)`                                           |
 * | Vault fixture dir (`tests/fixtures/…`)  | `createTestApp.fromVault(path)` — parses .md files, no disk-backed repo   |
 * | Real vault on disk (async repo load)    | `createTestApp.fromRealVault(absPath)` — loads via `createRepo`           |
 *
 * ## Backend selection
 *
 * The inline/markdown/vault-fixture paths accept `{ backend: "headless" | "termless" }`.
 * Default is `"headless"` (fast path, no ANSI emulator). Set `TEST_BACKEND=termless`
 * to opt every test into the real-terminal pipeline.
 *
 * Both backends return the same `TestApp` shape — tests are written once and run on
 * either backend.
 *
 * ## Lower-level driver access
 *
 * If you need the raw silvery `App` (registry, store white-box, raw ANSI),
 * `createDriverTest()` and `createDriverTestWithRepo()` remain canonical — they
 * are re-exported here for convenience. Prefer `createTestApp()` for new tests.
 *
 * ## Why three files still exist
 *
 * `board-test.ts` still owns `item()` (used in ~100 tests) and the legacy
 * `createDriverTest` driver. `test-app.ts` still owns the ~2.3k-line TestApp
 * implementation. `real-board.ts` still owns async real-vault loading. This
 * file is a thin unifier — it gives tests a single canonical entry point
 * without rewriting ~4.6k LOC of mature test infrastructure.
 */

import type { KNode } from "@km/core"
import type { TestApp, TestAppOptions } from "./test-app.ts"
import { createTestApp as createTestAppInternal, realisticBoard } from "./test-app.ts"
import { item, createDriverTest, createDriverTestWithRepo, renderBoardWithStore } from "./board-test.ts"
import { testBoard as testBoardFromRealVault, type TestBoardOptions, type TestBoardResult } from "./real-board.ts"

// =============================================================================
// Public re-exports
// =============================================================================

export { item, createDriverTest, createDriverTestWithRepo, renderBoardWithStore, realisticBoard }
export type { TestApp, TestAppOptions, TestBoardOptions, TestBoardResult, KNode }

// =============================================================================
// Unified createTestApp entry point
// =============================================================================

/**
 * Create a test app from an inline fixture.
 *
 * The default backend is `"headless"` (fast: `createRenderer` from `@silvery/test`,
 * no ANSI emulator). Set `backend: "termless"` (or `TEST_BACKEND=termless`) to
 * exercise the full ANSI pipeline via xterm.js.
 *
 * @example
 * ```typescript
 * using app = createTestApp(item("board", item("col1", item("task1"))))
 * app.press("j")
 * expect(app).toHaveCursorOn("task1")
 * ```
 *
 * @example Termless backend (full ANSI pipeline)
 * ```typescript
 * using app = createTestApp(nodes, { backend: "termless", cols: 80, rows: 24 })
 * ```
 */
export function createTestApp(nodes: KNode[] | (() => KNode[]), opts: TestAppOptions = {}): TestApp {
  return createTestAppInternal(nodes, opts)
}

/**
 * Create a test app from inline markdown.
 *
 * @example
 * ```typescript
 * using app = createTestApp.fromMarkdown("# col1\n- [ ] task1\n- [ ] task2")
 * expect(app).toContainText("task1")
 * ```
 */
createTestApp.fromMarkdown = function fromMarkdown(md: string, opts: TestAppOptions = {}): TestApp {
  return createTestAppInternal.fromMarkdown(md, opts)
}

/**
 * Create a test app from a vault fixture directory (parses all .md files).
 *
 * For a real on-disk vault that must be loaded via the full `createRepo`
 * pipeline (file watchers, SQLite state, index files), use
 * `createTestApp.fromRealVault()` instead — it returns a fluent real-vault
 * handle, not the `TestApp` API.
 *
 * @example
 * ```typescript
 * using app = createTestApp.fromVault("tests/fixtures/kanban-simple")
 * ```
 */
createTestApp.fromVault = function fromVault(vaultPath: string, opts: TestAppOptions = {}): TestApp {
  return createTestAppInternal.fromVault(vaultPath, opts)
}

/**
 * Load a real vault from disk via the full `createRepo` pipeline (async).
 *
 * Returns the legacy fluent `TestBoardResult` (not the `TestApp` shape) because
 * real-vault tests need `._repo` access for SQLite assertions. For in-memory
 * fixture tests, prefer `createTestApp(nodes)` — it returns the richer
 * `TestApp` API with typed handles, declarative state, and custom matchers.
 *
 * @example
 * ```typescript
 * const board = await createTestApp.fromRealVault("/abs/path/to/vault", { cols: 120, rows: 40 })
 * board.press("j").press("j")
 * const repo = board._repo
 * ```
 */
createTestApp.fromRealVault = function fromRealVault(
  vaultPath: string,
  opts?: TestBoardOptions,
): Promise<TestBoardResult> {
  return testBoardFromRealVault(vaultPath, opts)
}
