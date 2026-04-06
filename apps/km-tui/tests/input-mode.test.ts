/**
 * Input Mode Stack Tests
 *
 * Tests for createModeStack() — push/pop/current semantics,
 * empty stack defaults, nesting, isDialog(), and clear().
 */

import { describe, test, expect, beforeEach } from "vitest"
import { createModeStack, type InputMode } from "../src/input-mode.ts"
import { PaneUI, createInitialPaneUI } from "../src/state/ui-reducer.ts"
import { testEnv, item } from "./helpers/board-test.ts"

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
      "dialog:picker",
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

// =============================================================================
// PaneUI.editMode — mode derivation (absorbed from edit-mode.test.ts)
// =============================================================================

describe("PaneUI.editMode", () => {
  const base = createInitialPaneUI("cards", [], { columns: 80, rows: 24 })

  test("returns 'node' for default state", () => {
    expect(PaneUI.editMode(base)).toBe("node")
  })

  test("returns 'text' when text editing is active", () => {
    expect(PaneUI.editMode(base, true)).toBe("text")
  })

  test("returns 'dialog' when search dialog is open", () => {
    expect(PaneUI.editMode({ ...base, showSearchDialog: true })).toBe("dialog")
  })

  test("returns 'dialog' when new item dialog is open", () => {
    expect(PaneUI.editMode({ ...base, showNewItemDialog: true })).toBe("dialog")
  })

  test("returns 'dialog' when item picker is open", () => {
    expect(PaneUI.editMode({ ...base, activePicker: { type: "project" } })).toBe("dialog")
  })

  test("returns 'dialog' when date prompt is active", () => {
    expect(PaneUI.editMode({ ...base, datePrompt: { field: "due_at", nodeIds: ["n1"], currentValue: "" } })).toBe(
      "dialog",
    )
  })

  test("returns 'dialog' when filter dialog is open", () => {
    expect(PaneUI.editMode({ ...base, showFilterDialog: true })).toBe("dialog")
  })

  test("returns 'dialog' when delete confirm is active", () => {
    expect(
      PaneUI.editMode({ ...base, deleteConfirm: { nodeIds: ["n1"], title: "t", childCount: 0, backlinkCount: 0 } }),
    ).toBe("dialog")
  })

  test("text mode takes precedence over dialog", () => {
    // If both inline edit and dialog are somehow active, text mode wins
    expect(PaneUI.editMode({ ...base, showSearchDialog: true }, true)).toBe("text")
  })
})

// =============================================================================
// Command dispatch — board.command() parity with keypresses
// =============================================================================

describe("board.command()", () => {
  test("cursor_down moves cursor same as press j", () => {
    const { board: b1 } = testEnv(() => item("board", item("col", item("A"), item("B"), item("C"))))
    const { board: b2 } = testEnv(() => item("board", item("col", item("A"), item("B"), item("C"))))

    b1.press("j")
    b2.command("cursor_down")

    // Both should have cursor on B
    b1.expect("#B[data-cursor]").toExist()
    b2.expect("#B[data-cursor]").toExist()
  })

  test("fold_node folds same as press H", () => {
    const { board: b1 } = testEnv(() => item("board", item("col", item("parent", item("child")))))
    const { board: b2 } = testEnv(() => item("board", item("col", item("parent", item("child")))))

    b1.press("H")
    b2.command("fold_more")

    b1.expect("#child").not.toExist()
    b2.expect("#child").not.toExist()
  })

  test("chord command toggle_collapse works", () => {
    const { board: b1 } = testEnv(() => item("board", item("col1", item("A")), item("col2", item("B"))))
    const { board: b2 } = testEnv(() => item("board", item("col1", item("A")), item("col2", item("B"))))

    b1.press("v").press("c")
    b2.command("toggle_collapse")

    // Both should collapse col1
    b1.expect("#A").not.toExist()
    b2.expect("#A").not.toExist()
  })
})

// =============================================================================
// Modifier key indicators — useModifierKeys integration in bottom bar
// =============================================================================

describe("modifier key indicators in bottom bar", () => {
  test("Super+j shows ⌘ in bottom bar modifier indicator", () => {
    const { board } = testEnv(() => item("board", item("Todo", item("Task 1"))))

    // Before pressing modifier, no indicator should be present
    board.expect("#modifier-keys").not.toExist()

    // Super+j: keyToAnsi delegates to keyToKittyAnsi for Super modifier,
    // producing CSI 106;9u (j with super bit). This goes through
    // originalPress → inputEmitter → RuntimeContext → useModifierKeys.
    board.press("Super+j")

    // Bottom bar should show ⌘ indicator
    board.expect("#modifier-keys").toExist()
    const text = board.screenshot()
    expect(text).toContain("⌘")
  })

  test("regular key clears modifier indicator", () => {
    const { board } = testEnv(() => item("board", item("Todo", item("Task 1"))))

    // Press Super+j to set modifier
    board.press("Super+j")
    board.expect("#modifier-keys").toExist()

    // Press a regular key (no modifiers)
    board.press("j")

    // Modifier indicator should be cleared
    board.expect("#modifier-keys").not.toExist()
  })
})
