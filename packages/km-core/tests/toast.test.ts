/**
 * Toast System Tests
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest"
import {
  toast,
  toastQueue,
  createToastQueue,
  type ToastQueue,
} from "../src/toast.ts"

describe("ToastQueue", () => {
  let queue: ToastQueue

  beforeEach(() => {
    queue = createToastQueue()
  })

  test("push adds toast to queue", () => {
    const id = queue.push("info", "Test message")

    expect(id).toMatch(/^toast-\d+$/)
    expect(queue.getAll()).toHaveLength(1)

    const toast = queue.getLatest()
    expect(toast?.message).toBe("Test message")
    expect(toast?.level).toBe("info")
  })

  test("push with options", () => {
    queue.push("success", "Saved", {
      description: "File saved successfully",
      duration: 5000,
      action: { label: "Undo", trigger: "u" },
    })

    const toast = queue.getLatest()
    expect(toast?.description).toBe("File saved successfully")
    expect(toast?.duration).toBe(5000)
    expect(toast?.action?.label).toBe("Undo")
    expect(toast?.action?.trigger).toBe("u")
  })

  test("dismiss removes toast by ID", () => {
    const id1 = queue.push("info", "First")
    const id2 = queue.push("info", "Second")

    expect(queue.getAll()).toHaveLength(2)

    queue.dismiss(id1)
    expect(queue.getAll()).toHaveLength(1)
    expect(queue.getLatest()?.message).toBe("Second")

    queue.dismiss(id2)
    expect(queue.getAll()).toHaveLength(0)
  })

  test("dismissAll clears all toasts", () => {
    queue.push("info", "First")
    queue.push("info", "Second")
    queue.push("info", "Third")

    expect(queue.getAll()).toHaveLength(3)

    queue.dismissAll()
    expect(queue.getAll()).toHaveLength(0)
    expect(queue.getLatest()).toBeNull()
  })

  test("batching combines similar toasts", async () => {
    // Push multiple toasts with same batch key
    queue.push("success", "item archived", { batchKey: "archive" })
    queue.push("success", "item archived", { batchKey: "archive" })
    queue.push("success", "item archived", { batchKey: "archive" })

    // Should have only one toast
    expect(queue.getAll()).toHaveLength(1)
    const toast = queue.getLatest()
    expect(toast?.message).toBe("3 item archived")
  })

  test("batching with different keys creates separate toasts", () => {
    queue.push("success", "item archived", { batchKey: "archive" })
    queue.push("success", "item deleted", { batchKey: "delete" })

    expect(queue.getAll()).toHaveLength(2)
  })

  test("getLatest returns most recent toast", () => {
    queue.push("info", "First")
    queue.push("info", "Second")
    queue.push("info", "Third")

    const latest = queue.getLatest()
    expect(latest?.message).toBe("Third")
  })

  test("getLatest returns null when empty", () => {
    expect(queue.getLatest()).toBeNull()
  })
})

describe("toast API", () => {
  beforeEach(() => {
    toastQueue.dismissAll()
  })

  afterEach(() => {
    toastQueue.dismissAll()
  })

  test("toast() creates info toast", () => {
    const id = toast("Test message")

    expect(id).toMatch(/^toast-\d+$/)
    const latest = toastQueue.getLatest()
    expect(latest?.level).toBe("info")
    expect(latest?.message).toBe("Test message")
  })

  test("toast.success()", () => {
    toast.success("Success message")

    const latest = toastQueue.getLatest()
    expect(latest?.level).toBe("success")
    expect(latest?.message).toBe("Success message")
  })

  test("toast.error()", () => {
    toast.error("Error message")

    const latest = toastQueue.getLatest()
    expect(latest?.level).toBe("error")
    expect(latest?.message).toBe("Error message")
  })

  test("toast.warning()", () => {
    toast.warning("Warning message")

    const latest = toastQueue.getLatest()
    expect(latest?.level).toBe("warning")
    expect(latest?.message).toBe("Warning message")
  })

  test("toast.info()", () => {
    toast.info("Info message")

    const latest = toastQueue.getLatest()
    expect(latest?.level).toBe("info")
    expect(latest?.message).toBe("Info message")
  })

  test("toast.dismiss(id) removes specific toast", () => {
    const id1 = toast("First")
    const id2 = toast("Second")

    expect(toastQueue.getAll()).toHaveLength(2)

    toast.dismiss(id1)
    expect(toastQueue.getAll()).toHaveLength(1)
    expect(toastQueue.getLatest()?.message).toBe("Second")

    toast.dismiss(id2)
    expect(toastQueue.getAll()).toHaveLength(0)
  })

  test("toast.dismiss() without ID clears all toasts", () => {
    toast("First")
    toast("Second")
    toast("Third")

    expect(toastQueue.getAll()).toHaveLength(3)

    toast.dismiss()
    expect(toastQueue.getAll()).toHaveLength(0)
  })

  test("toast with action", () => {
    toast("File deleted", {
      action: { label: "Undo", trigger: "z" },
    })

    const latest = toastQueue.getLatest()
    expect(latest?.action?.label).toBe("Undo")
    expect(latest?.action?.trigger).toBe("z")
  })

  test("toast with description", () => {
    toast.error("Failed to save", {
      description: "Network connection lost",
    })

    const latest = toastQueue.getLatest()
    expect(latest?.message).toBe("Failed to save")
    expect(latest?.description).toBe("Network connection lost")
  })
})
