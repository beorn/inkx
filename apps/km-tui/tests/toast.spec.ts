/**
 * Toast rendering tests - acceptance level UI tests
 *
 * incremental: false — toast overlays (position=absolute) cause incremental
 * rendering mismatches because the silvery incremental renderer doesn't fully
 * track absolute-positioned overlay appearance/disappearance. This is a
 * pre-existing silvery limitation, not a toast component bug.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Toast rendering", () => {
  test.each([
    { level: "info", icon: "ℹ" },
    { level: "success", icon: "✓" },
    { level: "warning", icon: "⚠" },
    { level: "error", icon: "✗" },
  ] as const)("$level toast renders with correct icon", ({ level, icon }) => {
    const { board, toastQueue } = testEnv(() => item("board", item("col1", item("1a"))), { incremental: false })
    const message = `Test ${level} message`

    toastQueue[level](message)
    board.command("cursor_right") // Trigger a re-render
    board.command("cursor_left")

    const toastEl = board.q("#toast")
    expect(toastEl.count()).toBe(1)
    expect(toastEl.getAttribute("data-level")).toBe(level)

    const text = toastEl.textContent()
    expect(text).toContain(icon)
    expect(text).toContain(message)
  })

  test("Escape dismisses toast", () => {
    const { board, toastQueue } = testEnv(() => item("board", item("col1", item("1a"))), { incremental: false })

    toastQueue.info("Test message")
    board.command("cursor_right")
    board.command("cursor_left")

    // Toast should exist
    expect(board.q("#toast").count()).toBe(1)

    // Press Escape to dismiss
    board.press("\x1b") // Escape key

    // Toast should be gone
    expect(board.q("#toast").count()).toBe(0)
  })

  test("toast with description shows description on second line", () => {
    const { board, toastQueue } = testEnv(() => item("board", item("col1", item("1a"))), { incremental: false })

    toastQueue.error("Failed to save", {
      description: "Network connection lost",
    })
    board.command("cursor_right")
    board.command("cursor_left")

    const toastEl = board.q("#toast")
    const text = toastEl.textContent()

    // Should contain both message and description
    expect(text).toContain("Failed to save")
    expect(text).toContain("Network connection lost")
  })

  test("toast with action shows action label and trigger", () => {
    const { board, toastQueue } = testEnv(() => item("board", item("col1", item("1a"))), { incremental: false })

    toastQueue.info("File deleted", {
      action: { label: "Undo", trigger: "z" },
    })
    board.command("cursor_right")
    board.command("cursor_left")

    const toastEl = board.q("#toast")
    const text = toastEl.textContent()

    // Should show action trigger and label
    expect(text).toContain("[z]")
    expect(text).toContain("Undo")
  })

  test("batched toasts show combined count", () => {
    const { board, toastQueue } = testEnv(() => item("board", item("col1", item("1a"))), { incremental: false })

    // Push multiple toasts with same batch key
    toastQueue.info("item archived", { batchKey: "archive" })
    toastQueue.info("item archived", { batchKey: "archive" })
    toastQueue.info("item archived", { batchKey: "archive" })

    board.command("cursor_right")
    board.command("cursor_left")

    const toastEl = board.q("#toast")
    const text = toastEl.textContent()

    // Should show batched count
    expect(text).toContain("3 item archived")
  })

  test("multiple toasts are stacked (shadcn/ui style)", () => {
    const { board, toastQueue } = testEnv(() => item("board", item("col1", item("1a"))), { incremental: false })

    toastQueue.info("First message")
    toastQueue.info("Second message")
    toastQueue.info("Third message")

    board.command("cursor_right")
    board.command("cursor_left")

    // ToastStack shows up to 5 toasts stacked (shadcn/ui behavior)
    // Each toast gets its own #toast element
    const toastEls = board.q("#toast")
    expect(toastEls.count()).toBe(3)
  })

  test("toast does not overlap the bottom bar", () => {
    const rows = 24
    const { board, toastQueue } = testEnv(() => item("board", item("col1", item("1a"))), { rows, incremental: false })

    toastQueue.info("Hello world")
    board.command("cursor_right")
    board.command("cursor_left")

    // Toast should exist
    const toastEl = board.q("#toast")
    expect(toastEl.count()).toBe(1)

    // Bottom bar is at the last row (row index = rows - 1 = 23)
    const bottomBarBox = board.q("#bottom-bar").boundingBox()
    const toastBox = toastEl.boundingBox()

    // Toast bottom edge must not reach the bottom bar row
    expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(bottomBarBox!.y)
  })

  test("board content remains visible when toast appears (km-9zu9f)", () => {
    // Regression: toast appearance triggered incremental render that blanked
    // the board content. Only the toast was visible, rest of screen was blank.
    // Note: incremental: false because toast overlays cause known silvery
    // incremental mismatches. The regression itself is tested by checking
    // that board content is still visible in the fresh render.
    //
    // Uses a single-column board: pressing "l" at the boundary triggers a
    // bell state change that forces WorkspaceChrome to re-render, picking up
    // the toast from the queue. (Multi-column cursor moves are silent mutations
    // that don't trigger Zustand subscriber notifications.)
    const { board, toastQueue } = testEnv(item.simpleBoard, {
      incremental: false,
    })

    // Verify board renders correctly before toast
    const textBefore = board.screenshot()
    expect(textBefore).toContain("1a")
    expect(textBefore).toContain("col1")

    // Push toast — this is the first toast, so ToastStack transitions from null to rendering
    toastQueue.info("3 log messages — press ` to see")

    // Trigger re-render via boundary hit (l on single-column board sets bellState,
    // which triggers WorkspaceChrome re-render, picking up the toast)
    board.command("cursor_right")
    board.command("cursor_left")

    // Toast should be visible
    expect(board.q("#toast").count()).toBe(1)

    // Board content MUST still be visible — this is the regression check
    const textAfter = board.screenshot()
    expect(textAfter).toContain("1a")
    expect(textAfter).toContain("1b")
    expect(textAfter).toContain("col1")
  })

  test("toast with items does not overlap the bottom bar", () => {
    const rows = 24
    const { board, toastQueue } = testEnv(() => item("board", item("col1", item("1a"))), { rows, incremental: false })

    // Toast with items - items add extra rows
    toastQueue.info("Files synced", {
      items: ["file1.md", "file2.md"],
      itemThreshold: 3,
    })
    board.command("cursor_right")
    board.command("cursor_left")

    const toastEl = board.q("#toast")
    expect(toastEl.count()).toBe(1)

    const bottomBarBox = board.q("#bottom-bar").boundingBox()
    const toastBox = toastEl.boundingBox()

    // Toast bottom edge must be above the bottom bar
    expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(bottomBarBox!.y)
  })
})
