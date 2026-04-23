/**
 * Unit tests for the unified `create-test-app.ts` entry point.
 *
 * The module is mostly re-exports, so these are smoke tests: every public
 * surface is callable and returns the documented shape. Guards against
 * accidental export drift when the underlying helpers are renamed/refactored.
 */

import { describe, test, expect } from "vitest"
import {
  createTestApp,
  createDriverTest,
  createDriverTestWithRepo,
  item,
  realisticBoard,
  renderBoardWithStore,
} from "./create-test-app.ts"

describe("create-test-app unified entry point", () => {
  test("createTestApp(nodes) returns a disposable TestApp with the documented surface", () => {
    using app = createTestApp(item("board", item("col1", item("task1"))))
    expect(typeof app.press).toBe("function")
    expect(typeof app.command).toBe("function")
    expect(typeof app.locator).toBe("function")
    expect(typeof app.state).toBe("object")
    // Inline fixture with id "task1" is visible in the default cards view
    expect(app.node("task1").exists).toBe(true)
  })

  test("createTestApp.fromMarkdown parses inline markdown into a TestApp", () => {
    using app = createTestApp.fromMarkdown("# Todo\n- [ ] buy milk\n- [ ] fix plumbing")
    expect(app.text).toContain("buy milk")
  })

  test("item() re-export builds the expected tree shape", () => {
    const nodes = item("board", item("col1", item("task1"), item("task2")))
    // item() returns a flat array: [root, col1, task1, task2]
    expect(nodes).toHaveLength(4)
    expect(nodes[0]?.id).toBe("board")
    expect(nodes[1]?.parent_id).toBe("board")
    expect(nodes[2]?.parent_id).toBe("col1")
  })

  test("realisticBoard() returns a multi-column fixture", () => {
    const nodes = realisticBoard()
    expect(nodes.length).toBeGreaterThan(5)
    expect(nodes[0]?.id).toBe("board")
  })

  test("createDriverTest is re-exported and still usable", () => {
    const { board, repo } = createDriverTest(() => item("board", item("col1", item("task1"))))
    expect(typeof board.press).toBe("function")
    expect(repo.getNode("task1")).toBeDefined()
  })

  test("createDriverTestWithRepo is re-exported", () => {
    expect(typeof createDriverTestWithRepo).toBe("function")
  })

  test("renderBoardWithStore is re-exported", () => {
    expect(typeof renderBoardWithStore).toBe("function")
  })

  test("createTestApp.fromRealVault is exposed (lazy — not invoked here)", () => {
    expect(typeof createTestApp.fromRealVault).toBe("function")
  })
})
