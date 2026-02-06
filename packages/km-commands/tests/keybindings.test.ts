/**
 * Keybindings Tests
 *
 * Tests for keybinding registration, resolution, and mode-aware dispatch.
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  registerKeybinding,
  registerKeybindings,
  clearKeybindings,
  getAllKeybindings,
  resolveKeybinding,
  initDefaultKeybindings,
  defaultKeybindings,
  type Keybinding,
  type KeybindingContext,
} from "../src/keybindings.ts"
import type { TNode } from "../src/types.ts"

// --- Test Helpers ---

/** Modifier flags for key events */
type Modifiers = {
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
}

/** Create minimal TNode for context */
function createNode(id: string, opts?: Partial<TNode>): TNode {
  return {
    id,
    type: "section",
    parent_id: null,
    parent_idx: 0,
    link_to: null,
    name: id,
    title: id,
    children: [],
    childCount: 0,
    childrenLoaded: true,
    isTask: false,
    depth: 0,
    data: {},
    created_at: 0,
    updated_at: 0,
    version: "",
    ...opts,
  }
}

/** Create keybinding context with defaults */
function createContext(
  overrides?: Partial<KeybindingContext>,
): KeybindingContext {
  return {
    mode: "normal",
    hasSelection: false,
    isInDetailPane: false,
    isInOutlineMode: false,
    isInlineEditing: false,
    currentNode: null,
    textInputFocused: false,
    ...overrides,
  }
}

/** Assert that a key resolves to expected command (after initDefaultKeybindings) */
function expectKey(
  key: string,
  commandId: string,
  mods: Modifiers = {},
  ctx: KeybindingContext = createContext(),
): void {
  expect(resolveKeybinding(key, mods, ctx)).toBe(commandId)
}

describe("keybindings", () => {
  beforeEach(() => {
    clearKeybindings()
  })

  describe("registerKeybinding", () => {
    it("registers a single keybinding", () => {
      const binding: Keybinding = {
        key: "j",
        commandId: "cursor_next",
      }
      registerKeybinding(binding)

      const all = getAllKeybindings()
      expect(all).toHaveLength(1)
      expect(all[0]).toEqual(binding)
    })

    it("allows duplicate key registrations (last wins in resolve)", () => {
      registerKeybinding({ key: "j", commandId: "cmd_1" })
      registerKeybinding({ key: "j", commandId: "cmd_2" })

      const all = getAllKeybindings()
      expect(all).toHaveLength(2)
    })
  })

  describe("registerKeybindings", () => {
    it("registers multiple keybindings at once", () => {
      const bindings: Keybinding[] = [
        { key: "j", commandId: "cursor_next" },
        { key: "k", commandId: "cursor_prev" },
        { key: "h", commandId: "cursor_out" },
      ]
      registerKeybindings(bindings)

      expect(getAllKeybindings()).toHaveLength(3)
    })

    it("appends to existing keybindings", () => {
      registerKeybinding({ key: "a", commandId: "cmd_a" })
      registerKeybindings([
        { key: "b", commandId: "cmd_b" },
        { key: "c", commandId: "cmd_c" },
      ])

      expect(getAllKeybindings()).toHaveLength(3)
    })
  })

  describe("clearKeybindings", () => {
    it("removes all keybindings", () => {
      registerKeybindings([
        { key: "j", commandId: "cmd_1" },
        { key: "k", commandId: "cmd_2" },
      ])
      expect(getAllKeybindings()).toHaveLength(2)

      clearKeybindings()
      expect(getAllKeybindings()).toHaveLength(0)
    })
  })

  describe("getAllKeybindings", () => {
    it("returns copy of keybindings array", () => {
      registerKeybinding({ key: "j", commandId: "cmd" })

      const all1 = getAllKeybindings()
      const all2 = getAllKeybindings()

      expect(all1).not.toBe(all2)
      expect(all1).toEqual(all2)
    })
  })
})

describe("resolveKeybinding", () => {
  beforeEach(() => {
    clearKeybindings()
  })

  describe("basic key matching", () => {
    it("resolves simple key press", () => {
      registerKeybinding({ key: "j", commandId: "cursor_next" })

      const ctx = createContext()
      const result = resolveKeybinding("j", {}, ctx)

      expect(result).toBe("cursor_next")
    })

    it("returns null for unregistered key", () => {
      registerKeybinding({ key: "j", commandId: "cursor_next" })

      const ctx = createContext()
      const result = resolveKeybinding("x", {}, ctx)

      expect(result).toBeNull()
    })

    it("matches first registered binding for duplicate keys", () => {
      registerKeybinding({ key: "j", commandId: "first_cmd" })
      registerKeybinding({ key: "j", commandId: "second_cmd" })

      const ctx = createContext()
      const result = resolveKeybinding("j", {}, ctx)

      expect(result).toBe("first_cmd")
    })
  })

  describe("modifier matching", () => {
    it.each([
      ["ctrl", "z", { ctrl: true }, "undo"],
      ["shift", "Tab", { shift: true }, "shift_left"],
      ["alt", "ArrowUp", { alt: true }, "shift_up"],
      ["meta", "s", { meta: true }, "save"],
    ] as const)("matches %s modifier", (_name, key, mods, commandId) => {
      registerKeybinding({ key, commandId, ...mods })
      const ctx = createContext()
      expect(resolveKeybinding(key, mods, ctx)).toBe(commandId)
      expect(resolveKeybinding(key, {}, ctx)).toBeNull()
    })

    it("matches multiple modifiers", () => {
      registerKeybinding({
        key: "z",
        ctrl: true,
        shift: true,
        commandId: "redo",
      })

      const ctx = createContext()
      expect(resolveKeybinding("z", { ctrl: true, shift: true }, ctx)).toBe(
        "redo",
      )
      expect(resolveKeybinding("z", { ctrl: true }, ctx)).toBeNull()
      expect(resolveKeybinding("z", { shift: true }, ctx)).toBeNull()
    })

    it("requires exact modifier match (no extra modifiers)", () => {
      registerKeybinding({ key: "z", ctrl: true, commandId: "undo" })

      const ctx = createContext()
      // Extra shift modifier should not match
      expect(
        resolveKeybinding("z", { ctrl: true, shift: true }, ctx),
      ).toBeNull()
    })

    it("treats undefined and false modifiers the same", () => {
      registerKeybinding({ key: "a", commandId: "cmd_a" })

      const ctx = createContext()
      expect(resolveKeybinding("a", {}, ctx)).toBe("cmd_a")
      expect(resolveKeybinding("a", { ctrl: false, shift: false }, ctx)).toBe(
        "cmd_a",
      )
    })
  })

  describe("mode-aware resolution", () => {
    it("resolves keybinding in matching mode", () => {
      registerKeybinding({
        key: "Enter",
        commandId: "confirm_move",
        modes: ["move"],
      })

      const ctx = createContext({ mode: "move" })
      expect(resolveKeybinding("Enter", {}, ctx)).toBe("confirm_move")
    })

    it("returns null when mode does not match", () => {
      registerKeybinding({
        key: "Enter",
        commandId: "confirm_move",
        modes: ["move"],
      })

      const ctx = createContext({ mode: "normal" })
      expect(resolveKeybinding("Enter", {}, ctx)).toBeNull()
    })

    it("matches any mode when modes array is empty", () => {
      registerKeybinding({
        key: "j",
        commandId: "cursor_next",
        modes: [],
      })

      expect(
        resolveKeybinding("j", {}, createContext({ mode: "normal" })),
      ).toBe("cursor_next")
      expect(resolveKeybinding("j", {}, createContext({ mode: "move" }))).toBe(
        "cursor_next",
      )
    })

    it("matches any mode when modes is undefined", () => {
      registerKeybinding({
        key: "j",
        commandId: "cursor_next",
      })

      expect(
        resolveKeybinding("j", {}, createContext({ mode: "normal" })),
      ).toBe("cursor_next")
      expect(resolveKeybinding("j", {}, createContext({ mode: "move" }))).toBe(
        "cursor_next",
      )
      expect(
        resolveKeybinding("j", {}, createContext({ mode: "search" })),
      ).toBe("cursor_next")
    })

    it("supports multiple allowed modes", () => {
      registerKeybinding({
        key: "Escape",
        commandId: "cancel",
        modes: ["move", "search", "input"],
      })

      const ctx1 = createContext({ mode: "move" })
      const ctx2 = createContext({ mode: "search" })
      const ctx3 = createContext({ mode: "normal" })

      expect(resolveKeybinding("Escape", {}, ctx1)).toBe("cancel")
      expect(resolveKeybinding("Escape", {}, ctx2)).toBe("cancel")
      expect(resolveKeybinding("Escape", {}, ctx3)).toBeNull()
    })
  })

  describe("conditional keybindings (when)", () => {
    it("resolves when condition returns true", () => {
      registerKeybinding({
        key: "d",
        commandId: "delete_selection",
        when: (ctx) => ctx.hasSelection,
      })

      const ctx = createContext({ hasSelection: true })
      expect(resolveKeybinding("d", {}, ctx)).toBe("delete_selection")
    })

    it("returns null when condition returns false", () => {
      registerKeybinding({
        key: "d",
        commandId: "delete_selection",
        when: (ctx) => ctx.hasSelection,
      })

      const ctx = createContext({ hasSelection: false })
      expect(resolveKeybinding("d", {}, ctx)).toBeNull()
    })

    it("condition receives full context", () => {
      let receivedCtx: KeybindingContext | null = null

      registerKeybinding({
        key: "x",
        commandId: "test",
        when: (ctx) => {
          receivedCtx = ctx
          return true
        },
      })

      const testNode = createNode("test-node")
      const ctx = createContext({
        mode: "normal",
        hasSelection: true,
        isInDetailPane: true,
        isInOutlineMode: false,
        currentNode: testNode,
      })

      resolveKeybinding("x", {}, ctx)

      expect(receivedCtx).not.toBeNull()
      expect(receivedCtx!.mode).toBe("normal")
      expect(receivedCtx!.hasSelection).toBe(true)
      expect(receivedCtx!.isInDetailPane).toBe(true)
      expect(receivedCtx!.currentNode).toBe(testNode)
    })

    it("combines mode and when condition", () => {
      registerKeybinding({
        key: "Enter",
        commandId: "zoom_in",
        modes: ["normal"],
        when: (ctx) => ctx.currentNode !== null,
      })

      const node = createNode("test")

      // Mode match + condition match
      expect(
        resolveKeybinding(
          "Enter",
          {},
          createContext({ mode: "normal", currentNode: node }),
        ),
      ).toBe("zoom_in")

      // Mode match + condition fail
      expect(
        resolveKeybinding(
          "Enter",
          {},
          createContext({ mode: "normal", currentNode: null }),
        ),
      ).toBeNull()

      // Mode fail + condition match
      expect(
        resolveKeybinding(
          "Enter",
          {},
          createContext({ mode: "move", currentNode: node }),
        ),
      ).toBeNull()
    })
  })

  describe("priority and fallback", () => {
    it("first matching binding wins", () => {
      // More specific binding first
      registerKeybinding({
        key: "Enter",
        commandId: "confirm_move",
        modes: ["move"],
      })
      // Generic binding second
      registerKeybinding({
        key: "Enter",
        commandId: "zoom_in",
      })

      const moveCtx = createContext({ mode: "move" })
      const normalCtx = createContext({ mode: "normal" })

      // In move mode, first binding matches
      expect(resolveKeybinding("Enter", {}, moveCtx)).toBe("confirm_move")
      // In normal mode, first binding doesn't match, second does
      expect(resolveKeybinding("Enter", {}, normalCtx)).toBe("zoom_in")
    })
  })
})

describe("initDefaultKeybindings", () => {
  beforeEach(() => {
    clearKeybindings()
  })

  it("clears existing bindings and loads defaults", () => {
    registerKeybinding({ key: "custom", commandId: "custom_cmd" })
    expect(getAllKeybindings()).toHaveLength(1)

    initDefaultKeybindings()

    const all = getAllKeybindings()
    expect(all.length).toBe(defaultKeybindings.length)
    // Custom binding should be gone
    expect(all.some((b) => b.commandId === "custom_cmd")).toBe(false)
  })

  it.each([
    // hjkl navigation (visual up/down, left/right columns)
    ["j", {}, "cursor_down"],
    ["k", {}, "cursor_up"],
    ["h", {}, "cursor_left"],
    ["l", {}, "cursor_right"],
    ["g", {}, "cursor_first"],
    ["G", {}, "cursor_last"],
    ["G", { shift: true }, "cursor_last"], // Ink reports shift+G
    // Arrow key navigation (same as hjkl per docs/06-ui.md)
    ["ArrowDown", {}, "cursor_down"],
    ["ArrowUp", {}, "cursor_up"],
    ["ArrowLeft", {}, "cursor_left"],
    ["ArrowRight", {}, "cursor_right"],
  ] as const)("navigation: %s resolves to %s", (key, mods, commandId) => {
    initDefaultKeybindings()
    expectKey(key, commandId, mods)
  })

  it.each([
    // TUI: 'v' cycles view mode, not select toggle
    ["v", {}, "cycle_view_mode"],
    // Shift+A for progressive select all
    ["A", {}, "select_all_progressive"],
    // Escape is close_or_quit (contextual: clears selection, closes dialogs, or quits)
    ["Escape", {}, "close_or_quit"],
  ] as const)("selection: %s resolves to %s", (key, mods, commandId) => {
    initDefaultKeybindings()
    expectKey(key, commandId, mods)
  })

  it.each([
    // TUI: Enter in normal mode triggers inline edit
    ["Enter", {}, "normal", "enter_inline_edit"],
    // Enter in move mode = confirm_move (defined with modes: ["move"])
    ["Enter", {}, "move", "confirm_move"],
    // TUI: 'e' zooms in, 'o' opens in system, 'i' zooms inwards
    ["e", {}, "normal", "zoom_in"],
    ["o", {}, "normal", "open_in_system"],
    ["i", {}, "normal", "zoom_inwards"],
    // TUI: Escape is close_or_quit (contextual) in normal mode
    ["Escape", {}, "normal", "close_or_quit"],
    // In move mode, Escape cancels move (mode-specific binding takes precedence)
    ["Escape", {}, "move", "cancel_move"],
  ] as const)(
    "mode-specific: %s in %s mode resolves to %s",
    (key, mods, mode, commandId) => {
      initDefaultKeybindings()
      expectKey(key, commandId, mods, createContext({ mode }))
    },
  )

  it.each([
    ["ArrowUp", "shift_up"],
    ["ArrowDown", "shift_down"],
    ["ArrowLeft", "shift_left"],
    ["ArrowRight", "shift_right"],
  ] as const)("meta+%s shifts node (%s)", (key, commandId) => {
    initDefaultKeybindings()
    expectKey(key, commandId, { meta: true })
  })

  it.each([
    ["z", { ctrl: true }, "undo"],
    ["z", { ctrl: true, shift: true }, "redo"],
    ["y", { ctrl: true }, "redo"],
  ] as const)("undo/redo: ctrl+%s resolves to %s", (key, mods, commandId) => {
    initDefaultKeybindings()
    expectKey(key, commandId, mods)
  })

  it.each([
    // Page jump keybindings (Ctrl+D/U)
    ["d", { ctrl: true }, "page_down"],
    ["u", { ctrl: true }, "page_up"],
    // Sibling board navigation (Ctrl+J/K)
    ["j", { ctrl: true }, "sibling_board_next"],
    ["k", { ctrl: true }, "sibling_board_prev"],
    // Enter node keybinding
    ["i", {}, "zoom_inwards"],
  ] as const)("ctrl/misc: %s resolves to %s", (key, mods, commandId) => {
    initDefaultKeybindings()
    expectKey(key, commandId, mods)
  })

  it.each([
    ["ArrowUp", "extend_select_up"],
    ["ArrowDown", "extend_select_down"],
    ["ArrowLeft", "extend_select_left"],
    ["ArrowRight", "extend_select_right"],
  ] as const)("shift+%s extends selection (%s)", (key, commandId) => {
    initDefaultKeybindings()
    expectKey(key, commandId, { shift: true })
  })
})

describe("defaultKeybindings", () => {
  it("is an array of keybinding objects", () => {
    expect(Array.isArray(defaultKeybindings)).toBe(true)
    expect(defaultKeybindings.length).toBeGreaterThan(0)
  })

  it("all bindings have required fields", () => {
    for (const binding of defaultKeybindings) {
      expect(binding.key).toBeDefined()
      expect(typeof binding.key).toBe("string")
      expect(binding.commandId).toBeDefined()
      expect(typeof binding.commandId).toBe("string")
    }
  })

  it("covers expected command categories", () => {
    const commandIds = defaultKeybindings.map((b) => b.commandId)

    // Navigation (j/k use cursor_down/up for visual navigation)
    expect(commandIds).toContain("cursor_down")
    expect(commandIds).toContain("cursor_up")
    expect(commandIds).toContain("zoom_in")
    expect(commandIds).toContain("zoom_inwards")
    expect(commandIds).toContain("zoom_outwards")

    // Selection
    expect(commandIds).toContain("select_all_progressive")
    // Note: clear_selection is handled by close_or_quit (contextual)
    expect(commandIds).toContain("close_or_quit")

    // Edit
    expect(commandIds).toContain("enter_move_mode")
    expect(commandIds).toContain("enter_inline_edit")
    expect(commandIds).toContain("shift_up")
    expect(commandIds).toContain("delete_node")

    // Task
    expect(commandIds).toContain("cycle_task_status")

    // Fold
    expect(commandIds).toContain("fold_all")

    // View
    expect(commandIds).toContain("cycle_view_mode")
    expect(commandIds).toContain("show_help")
    expect(commandIds).toContain("increase_outline_depth")

    // Page navigation and board navigation
    expect(commandIds).toContain("page_down")
    expect(commandIds).toContain("page_up")
    expect(commandIds).toContain("sibling_board_next")
    expect(commandIds).toContain("sibling_board_prev")
    expect(commandIds).toContain("zoom_inwards")
  })
})
