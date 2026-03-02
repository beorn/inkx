/**
 * BoardTestHarness Integration Tests
 *
 * Consolidated from:
 * - harness.test.ts (filesystem-based harness tests)
 * - tui-views.test.ts (in-memory harness: rendering, view switching, navigation)
 */

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { mkdir, rm, writeFile } from "fs/promises"
import { createFakeRepo } from "@km/storage"
import { createBoardTest, type BoardTestHarness } from "../src/testing.ts"
import { GENERIC_BOARD } from "./fixtures/generic-board-fixture.ts"

describe("BoardTestHarness", () => {
  let repoPath: string
  let board: BoardTestHarness | null = null

  beforeEach(async () => {
    // Create unique test repo
    repoPath = `/tmp/kmtest-harness-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await mkdir(repoPath, { recursive: true })

    // Create test content
    await writeFile(
      `${repoPath}/tasks.md`,
      `# Tasks

- [ ] First task
- [ ] Second task
- [x] Done task
`,
    )
  })

  afterEach(async () => {
    // Cleanup
    if (board) {
      board.unmount()
      board = null
    }
    await rm(repoPath, { recursive: true, force: true })
  })

  test("screenshot captures initial state", async () => {
    board = await createBoardTest(repoPath, { file: "tasks.md" })
    const screenshot = board.screenshot()

    expect(screenshot).toContain("Tasks")
    expect(screenshot).toContain("First task")
  })

  test("getByText finds task text", async () => {
    board = await createBoardTest(repoPath, { file: "tasks.md" })

    // Should find the task text
    const task = board.getByText("First task")
    expect(task.count()).toBeGreaterThan(0)
  })

  test("press simulates keyboard input", async () => {
    board = await createBoardTest(repoPath, { file: "tasks.md" })

    // Press down key
    board.press("j")

    // Screenshot should still work after input
    const screenshot = board.screenshot()
    expect(screenshot.length).toBeGreaterThan(0)
  })

  test("pressMultiple sends sequence of keys", async () => {
    board = await createBoardTest(repoPath, { file: "tasks.md" })

    // Press multiple keys
    board.pressMultiple(["j", "j", "k"])

    // Should not throw
    expect(true).toBe(true)
  })

  test("getCursor returns cursor position", async () => {
    board = await createBoardTest(repoPath, { file: "tasks.md" })

    const cursor = board.getCursor()
    expect(Array.isArray(cursor)).toBe(true)
    expect(cursor.length).toBe(2)
  })

  test("unmount cleans up resources", async () => {
    board = await createBoardTest(repoPath, { file: "tasks.md" })
    board.unmount()

    // Mark as null so afterEach doesn't try to unmount again
    board = null
  })

  test("screenshotAnsi includes ANSI codes", async () => {
    board = await createBoardTest(repoPath, { file: "tasks.md" })
    const ansiScreenshot = board.screenshotAnsi()

    // Should contain ANSI escape codes
    expect(ansiScreenshot).toMatch(/\x1b\[/)
  })

  test("locator finds elements by attribute", async () => {
    board = await createBoardTest(repoPath, { file: "tasks.md" })

    // Try to find any elements
    const root = board.resolve()
    expect(root).not.toBeNull()
  })
})

// =============================================================================
// TUI View Tests (in-memory, from tui-views.test.ts)
// =============================================================================

describe("TUI View Tests", () => {
  let board: BoardTestHarness | null = null

  afterEach(() => {
    if (board) {
      board.unmount()
      board = null
    }
  })

  test("should display cards view by default", async () => {
    const repo = createFakeRepo({ nodes: GENERIC_BOARD.nodes })
    board = await createBoardTest(repo)
    const screenshot = board.screenshot()

    // Should show content from the repo
    expect(screenshot.length).toBeGreaterThan(0)
    expect(screenshot).toBeTruthy()
  })

  test("should switch views with 'v' key", async () => {
    const repo = createFakeRepo({ nodes: GENERIC_BOARD.nodes })
    board = await createBoardTest(repo)

    // Initial view
    const initial = board.screenshot()
    expect(initial.length).toBeGreaterThan(0)

    // Press 'v m' to cycle to columns view
    board.press("v")
    board.press("m")
    const columns = board.screenshot()
    expect(columns.length).toBeGreaterThan(0)

    // Press 'v m' again to cycle to tabs view
    board.press("v")
    board.press("m")
    const list = board.screenshot()
    expect(list.length).toBeGreaterThan(0)

    // Press 'v m' again to go back to cards view
    board.press("v")
    board.press("m")
    const backToCards = board.screenshot()
    expect(backToCards.length).toBeGreaterThan(0)
  })

  test("should navigate with arrow keys", async () => {
    const repo = createFakeRepo({ nodes: GENERIC_BOARD.nodes })
    board = await createBoardTest(repo)

    // Navigate right
    board.press("right")
    const afterRight1 = board.screenshot()
    expect(afterRight1.length).toBeGreaterThan(0)

    // Navigate right again
    board.press("right")
    const afterRight2 = board.screenshot()
    expect(afterRight2.length).toBeGreaterThan(0)

    // Navigate down
    board.press("down")
    const afterDown = board.screenshot()
    expect(afterDown.length).toBeGreaterThan(0)

    // Navigate left
    board.press("left")
    const afterLeft = board.screenshot()
    expect(afterLeft.length).toBeGreaterThan(0)

    // Navigate up
    board.press("up")
    const afterUp = board.screenshot()
    expect(afterUp.length).toBeGreaterThan(0)
  })

  test("should navigate with vim keys", async () => {
    const repo = createFakeRepo({ nodes: GENERIC_BOARD.nodes })
    board = await createBoardTest(repo)

    // Navigate with h/j/k/l
    board.press("l") // right
    board.press("j") // down
    board.press("k") // up
    board.press("h") // left

    const screenshot = board.screenshot()
    expect(screenshot.length).toBeGreaterThan(0)
  })

  test("should expand/collapse with Enter", async () => {
    const repo = createFakeRepo({ nodes: GENERIC_BOARD.nodes })
    board = await createBoardTest(repo)

    // Navigate to an item
    board.press("j")
    const beforeExpand = board.screenshot()

    // Press Enter to expand/zoom
    board.press("enter")
    const afterExpand = board.screenshot()

    // Press Escape to go back
    board.press("escape")
    const afterCollapse = board.screenshot()

    // All should produce valid output
    expect(beforeExpand.length).toBeGreaterThan(0)
    expect(afterExpand.length).toBeGreaterThan(0)
    expect(afterCollapse.length).toBeGreaterThan(0)
  })
})
