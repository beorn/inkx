/**
 * Input Mode Stack Tests
 *
 * Tests for createModeStack() — push/pop/current semantics,
 * empty stack defaults, nesting, isDialog(), and clear().
 */

import { describe, test, expect, beforeEach } from "vitest"
import { createModeStack, type InputMode } from "../src/input-mode.ts"

describe("createModeStack", () => {
  let stack: ReturnType<typeof createModeStack>

  beforeEach(() => {
    stack = createModeStack()
  })

  test("empty stack returns 'command' as current mode", () => {
    expect(stack.current()).toBe("command")
  })

  test("empty stack has size 0", () => {
    expect(stack.size()).toBe(0)
  })

  test("push and current", () => {
    stack.push("dialog:search")
    expect(stack.current()).toBe("dialog:search")
    expect(stack.size()).toBe(1)
  })

  test("pop returns the pushed mode", () => {
    stack.push("dialog:search")
    const popped = stack.pop()
    expect(popped).toBe("dialog:search")
    expect(stack.current()).toBe("command")
    expect(stack.size()).toBe(0)
  })

  test("pop on empty stack returns undefined", () => {
    const popped = stack.pop()
    expect(popped).toBeUndefined()
    expect(stack.current()).toBe("command")
  })

  test("nested modes: command -> dialog:search -> dialog:confirm -> pop -> dialog:search", () => {
    // Start in command mode (implicit)
    expect(stack.current()).toBe("command")

    // Open search dialog
    stack.push("dialog:search")
    expect(stack.current()).toBe("dialog:search")
    expect(stack.size()).toBe(1)

    // Open confirm dialog on top of search
    stack.push("dialog:confirm")
    expect(stack.current()).toBe("dialog:confirm")
    expect(stack.size()).toBe(2)

    // Close confirm dialog -> back to search
    const popped = stack.pop()
    expect(popped).toBe("dialog:confirm")
    expect(stack.current()).toBe("dialog:search")
    expect(stack.size()).toBe(1)

    // Close search dialog -> back to command
    stack.pop()
    expect(stack.current()).toBe("command")
    expect(stack.size()).toBe(0)
  })

  test("includes checks any position in the stack", () => {
    stack.push("dialog:search")
    stack.push("dialog:confirm")

    expect(stack.includes("dialog:search")).toBe(true)
    expect(stack.includes("dialog:confirm")).toBe(true)
    expect(stack.includes("command")).toBe(false)
    expect(stack.includes("insert")).toBe(false)
  })

  test("isDialog returns true for dialog:* modes", () => {
    expect(stack.isDialog()).toBe(false)

    stack.push("dialog:search")
    expect(stack.isDialog()).toBe(true)

    stack.push("dialog:confirm")
    expect(stack.isDialog()).toBe(true)

    stack.pop()
    expect(stack.isDialog()).toBe(true) // still dialog:search

    stack.pop()
    expect(stack.isDialog()).toBe(false)
  })

  test("isDialog returns false for non-dialog modes", () => {
    stack.push("insert")
    expect(stack.isDialog()).toBe(false)

    stack.push("command")
    expect(stack.isDialog()).toBe(false)
  })

  test("clear resets to command mode", () => {
    stack.push("dialog:search")
    stack.push("dialog:confirm")
    stack.push("insert")
    expect(stack.size()).toBe(3)

    stack.clear()
    expect(stack.size()).toBe(0)
    expect(stack.current()).toBe("command")
    expect(stack.isDialog()).toBe(false)
  })

  test("all dialog modes are recognized by isDialog", () => {
    const dialogModes: InputMode[] = [
      "dialog:search",
      "dialog:rename",
      "dialog:confirm",
      "dialog:newItem",
      "dialog:projectPicker",
      "dialog:datePrompt",
      "dialog:filter",
    ]

    for (const mode of dialogModes) {
      const s = createModeStack()
      s.push(mode)
      expect(s.isDialog()).toBe(true)
      expect(s.current()).toBe(mode)
    }
  })

  test("non-dialog modes are not recognized by isDialog", () => {
    const nonDialogModes: InputMode[] = ["command", "insert"]

    for (const mode of nonDialogModes) {
      const s = createModeStack()
      s.push(mode)
      expect(s.isDialog()).toBe(false)
    }
  })
})
