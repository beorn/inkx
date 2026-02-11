/**
 * Toast rendering tests - acceptance level UI tests
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Toast rendering", () => {
  test("info toast appears with icon and message", () => {
    const { board, toastQueue } = testEnv(() =>
      item("board", item("col1", item("1a"))),
    )

    // Push info toast
    toastQueue.info("Test info message")

    // Re-render to pick up toast
    board.press("l") // Trigger a re-render
    board.press("h")

    // Verify toast element exists with correct level
    const toastEl = board.q("#toast")
    expect(toastEl.count()).toBe(1)
    expect(toastEl.getAttribute("data-level")).toBe("info")

    // Verify message includes info icon
    const text = toastEl.textContent()
    expect(text).toContain("ℹ")
    expect(text).toContain("Test info message")
  })

  test("success toast shows checkmark icon", () => {
    const { board, toastQueue } = testEnv(() =>
      item("board", item("col1", item("1a"))),
    )

    toastQueue.success("Operation completed")
    board.press("l")
    board.press("h")

    const toastEl = board.q("#toast")
    expect(toastEl.getAttribute("data-level")).toBe("success")

    const text = toastEl.textContent()
    expect(text).toContain("✓")
    expect(text).toContain("Operation completed")
  })

  test("warning toast shows warning icon", () => {
    const { board, toastQueue } = testEnv(() =>
      item("board", item("col1", item("1a"))),
    )

    toastQueue.warning("Something might be wrong")
    board.press("l")
    board.press("h")

    const toastEl = board.q("#toast")
    expect(toastEl.getAttribute("data-level")).toBe("warning")

    const text = toastEl.textContent()
    expect(text).toContain("⚠")
    expect(text).toContain("Something might be wrong")
  })

  test("error toast shows error icon", () => {
    const { board, toastQueue } = testEnv(() =>
      item("board", item("col1", item("1a"))),
    )

    toastQueue.error("Something went wrong")
    board.press("l")
    board.press("h")

    const toastEl = board.q("#toast")
    expect(toastEl.getAttribute("data-level")).toBe("error")

    const text = toastEl.textContent()
    expect(text).toContain("✗")
    expect(text).toContain("Something went wrong")
  })

  test("Escape dismisses toast", () => {
    const { board, toastQueue } = testEnv(() =>
      item("board", item("col1", item("1a"))),
    )

    toastQueue.info("Test message")
    board.press("l")
    board.press("h")

    // Toast should exist
    expect(board.q("#toast").count()).toBe(1)

    // Press Escape to dismiss
    board.press("\x1b") // Escape key

    // Toast should be gone
    expect(board.q("#toast").count()).toBe(0)
  })

  test("toast with description shows description on second line", () => {
    const { board, toastQueue } = testEnv(() =>
      item("board", item("col1", item("1a"))),
    )

    toastQueue.error("Failed to save", {
      description: "Network connection lost",
    })
    board.press("l")
    board.press("h")

    const toastEl = board.q("#toast")
    const text = toastEl.textContent()

    // Should contain both message and description
    expect(text).toContain("Failed to save")
    expect(text).toContain("Network connection lost")
  })

  test("toast with action shows action label and trigger", () => {
    const { board, toastQueue } = testEnv(() =>
      item("board", item("col1", item("1a"))),
    )

    toastQueue.info("File deleted", {
      action: { label: "Undo", trigger: "z" },
    })
    board.press("l")
    board.press("h")

    const toastEl = board.q("#toast")
    const text = toastEl.textContent()

    // Should show action trigger and label
    expect(text).toContain("[z]")
    expect(text).toContain("Undo")
  })

  test("batched toasts show combined count", () => {
    const { board, toastQueue } = testEnv(() =>
      item("board", item("col1", item("1a"))),
    )

    // Push multiple toasts with same batch key
    toastQueue.info("item archived", { batchKey: "archive" })
    toastQueue.info("item archived", { batchKey: "archive" })
    toastQueue.info("item archived", { batchKey: "archive" })

    board.press("l")
    board.press("h")

    const toastEl = board.q("#toast")
    const text = toastEl.textContent()

    // Should show batched count
    expect(text).toContain("3 item archived")
  })

  test("multiple toasts are stacked (shadcn/ui style)", () => {
    const { board, toastQueue } = testEnv(() =>
      item("board", item("col1", item("1a"))),
    )

    toastQueue.info("First message")
    toastQueue.info("Second message")
    toastQueue.info("Third message")

    board.press("l")
    board.press("h")

    // ToastStack shows up to 5 toasts stacked (shadcn/ui behavior)
    // Each toast gets its own #toast element
    const toastEls = board.q("#toast")
    expect(toastEls.count()).toBe(3)
  })

  test("toast does not overlap the bottom bar", () => {
    const rows = 24
    const { board, toastQueue } = testEnv(
      () => item("board", item("col1", item("1a"))),
      { rows },
    )

    toastQueue.info("Hello world")
    board.press("l")
    board.press("h")

    // Toast should exist
    const toastEl = board.q("#toast")
    expect(toastEl.count()).toBe(1)

    // Bottom bar is at the last row (row index = rows - 1 = 23)
    const bottomBarBox = board.q("#bottom-bar").boundingBox()
    const toastBox = toastEl.boundingBox()

    // Toast bottom edge must not reach the bottom bar row
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(bottomBarBox.y)
  })

  test("board content remains visible when toast appears (km-9zu9f)", () => {
    // Regression: toast appearance triggered incremental render that blanked
    // the board content. Only the toast was visible, rest of screen was blank.
    process.env.INKX_STRICT = "1"
    const { board, toastQueue } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("1a"), item("1b"), item("1c")),
          item("col2", item("2a"), item("2b")),
        ),
      { incremental: true },
    )

    // Verify board renders correctly before toast
    const textBefore = board.screenshot()
    expect(textBefore).toContain("1a")
    expect(textBefore).toContain("col1")

    // Push toast — this is the first toast, so ToastStack transitions from null to rendering
    toastQueue.info("3 log messages — press ` to see")

    // Trigger re-render (simulating consoleStats update — NOT a cursor change)
    board.press("l")
    board.press("h")

    // Toast should be visible
    expect(board.q("#toast").count()).toBe(1)

    // Board content MUST still be visible — this is the regression check
    const textAfter = board.screenshot()
    expect(textAfter).toContain("1a")
    expect(textAfter).toContain("1b")
    expect(textAfter).toContain("col1")
    expect(textAfter).toContain("col2")
    expect(textAfter).toContain("2a")
  })

  test("toast with items does not overlap the bottom bar", () => {
    const rows = 24
    const { board, toastQueue } = testEnv(
      () => item("board", item("col1", item("1a"))),
      { rows },
    )

    // Toast with items - items add extra rows
    toastQueue.info("Files synced", {
      items: ["file1.md", "file2.md"],
      itemThreshold: 3,
    })
    board.press("l")
    board.press("h")

    const toastEl = board.q("#toast")
    expect(toastEl.count()).toBe(1)

    const bottomBarBox = board.q("#bottom-bar").boundingBox()
    const toastBox = toastEl.boundingBox()

    // Toast bottom edge must be above the bottom bar
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(bottomBarBox.y)
  })
})
