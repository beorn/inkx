/**
 * Toast rendering tests - acceptance level UI tests
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { toast, toastQueue } from "@km/core"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Toast rendering", () => {
  beforeEach(() => {
    toastQueue.dismissAll()
  })

  afterEach(() => {
    toastQueue.dismissAll()
  })

  test("info toast appears with icon and message", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))

    // Push info toast
    toast.info("Test info message")

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
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))

    toast.success("Operation completed")
    board.press("l")
    board.press("h")

    const toastEl = board.q("#toast")
    expect(toastEl.getAttribute("data-level")).toBe("success")

    const text = toastEl.textContent()
    expect(text).toContain("✓")
    expect(text).toContain("Operation completed")
  })

  test("warning toast shows warning icon", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))

    toast.warning("Something might be wrong")
    board.press("l")
    board.press("h")

    const toastEl = board.q("#toast")
    expect(toastEl.getAttribute("data-level")).toBe("warning")

    const text = toastEl.textContent()
    expect(text).toContain("⚠")
    expect(text).toContain("Something might be wrong")
  })

  test("error toast shows error icon", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))

    toast.error("Something went wrong")
    board.press("l")
    board.press("h")

    const toastEl = board.q("#toast")
    expect(toastEl.getAttribute("data-level")).toBe("error")

    const text = toastEl.textContent()
    expect(text).toContain("✗")
    expect(text).toContain("Something went wrong")
  })

  test("Escape dismisses toast", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))

    toast("Test message")
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
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))

    toast.error("Failed to save", {
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
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))

    toast("File deleted", {
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
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))

    // Push multiple toasts with same batch key
    toast("item archived", { batchKey: "archive" })
    toast("item archived", { batchKey: "archive" })
    toast("item archived", { batchKey: "archive" })

    board.press("l")
    board.press("h")

    const toastEl = board.q("#toast")
    const text = toastEl.textContent()

    // Should show batched count
    expect(text).toContain("3 item archived")
  })

  test("only latest toast is displayed when multiple exist", () => {
    const { board } = testEnv(() => item("board", item("col1", item("1a"))))

    toast("First message")
    toast("Second message")
    toast("Third message")

    board.press("l")
    board.press("h")

    // Should only have one toast element (the latest)
    const toastEls = board.q("#toast")
    expect(toastEls.count()).toBe(1)

    // Should show the latest message
    const text = toastEls.textContent()
    expect(text).toContain("Third message")
    expect(text).not.toContain("First message")
    expect(text).not.toContain("Second message")
  })
})
