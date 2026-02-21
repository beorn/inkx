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
  isChordPrefix,
  resolveChord,
  getChordSuffixes,
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
  super?: boolean
}

/** Create minimal TNode for context */
function createNode(id: string, opts?: Partial<TNode>): TNode {
  return {
    id,
    type: "oi",
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
function createContext(overrides?: Partial<KeybindingContext>): KeybindingContext {
  return {
    mode: "normal",
    hasMultiSelection: false,
    isInDetailPane: false,
    isInOutlineMode: false,
    isInlineEditing: false,
    currentNode: null,
    textInputFocused: false,
    searchDialogOpen: false,
    projectPickerOpen: false,
    newItemDialogOpen: false,
    datePromptOpen: false,
    filterDialogOpen: false,
    helpOverlayOpen: false,
    deleteConfirmOpen: false,
    consoleOpen: false,
    hasActiveToast: false,
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
      expect(resolveKeybinding("z", { ctrl: true, shift: true }, ctx)).toBe("redo")
      expect(resolveKeybinding("z", { ctrl: true }, ctx)).toBeNull()
      expect(resolveKeybinding("z", { shift: true }, ctx)).toBeNull()
    })

    it("requires exact modifier match (no extra modifiers)", () => {
      registerKeybinding({ key: "z", ctrl: true, commandId: "undo" })

      const ctx = createContext()
      // Extra shift modifier should not match
      expect(resolveKeybinding("z", { ctrl: true, shift: true }, ctx)).toBeNull()
    })

    it("treats undefined and false modifiers the same", () => {
      registerKeybinding({ key: "a", commandId: "cmd_a" })

      const ctx = createContext()
      expect(resolveKeybinding("a", {}, ctx)).toBe("cmd_a")
      expect(resolveKeybinding("a", { ctrl: false, shift: false }, ctx)).toBe("cmd_a")
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

      expect(resolveKeybinding("j", {}, createContext({ mode: "normal" }))).toBe("cursor_next")
      expect(resolveKeybinding("j", {}, createContext({ mode: "move" }))).toBe("cursor_next")
    })

    it("matches any mode when modes is undefined", () => {
      registerKeybinding({
        key: "j",
        commandId: "cursor_next",
      })

      expect(resolveKeybinding("j", {}, createContext({ mode: "normal" }))).toBe("cursor_next")
      expect(resolveKeybinding("j", {}, createContext({ mode: "move" }))).toBe("cursor_next")
      expect(resolveKeybinding("j", {}, createContext({ mode: "search" }))).toBe("cursor_next")
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
        when: (ctx) => ctx.hasMultiSelection,
      })

      const ctx = createContext({ hasMultiSelection: true })
      expect(resolveKeybinding("d", {}, ctx)).toBe("delete_selection")
    })

    it("returns null when condition returns false", () => {
      registerKeybinding({
        key: "d",
        commandId: "delete_selection",
        when: (ctx) => ctx.hasMultiSelection,
      })

      const ctx = createContext({ hasMultiSelection: false })
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
        hasMultiSelection: true,
        isInDetailPane: true,
        isInOutlineMode: false,
        currentNode: testNode,
      })

      resolveKeybinding("x", {}, ctx)

      expect(receivedCtx).not.toBeNull()
      expect(receivedCtx!.mode).toBe("normal")
      expect(receivedCtx!.hasMultiSelection).toBe(true)
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
      expect(resolveKeybinding("Enter", {}, createContext({ mode: "normal", currentNode: node }))).toBe("zoom_in")

      // Mode match + condition fail
      expect(resolveKeybinding("Enter", {}, createContext({ mode: "normal", currentNode: null }))).toBeNull()

      // Mode fail + condition match
      expect(resolveKeybinding("Enter", {}, createContext({ mode: "move", currentNode: node }))).toBeNull()
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
    // TUI: 'v' enters visual mode
    ["v", {}, "visual_mode_enter"],
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
    // v2: 'i' starts inline edit, 'o' inserts below, 'e' archives
    ["e", {}, "normal", "archive"],
    ["o", {}, "normal", "insert_below"],
    ["i", {}, "normal", "enter_inline_edit"],
    // TUI: Escape is close_or_quit (contextual) in normal mode
    ["Escape", {}, "normal", "close_or_quit"],
    // In move mode, Escape cancels move (mode-specific binding takes precedence)
    ["Escape", {}, "move", "cancel_move"],
  ] as const)("mode-specific: %s in %s mode resolves to %s", (key, mods, mode, commandId) => {
    initDefaultKeybindings()
    expectKey(key, commandId, mods, createContext({ mode }))
  })

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
    // Ctrl+Y is now text.yank (when textInputFocused), not redo
    // Redo only via Ctrl+Shift+Z
  ] as const)("undo/redo: ctrl+%s resolves to %s", (key, mods, commandId) => {
    initDefaultKeybindings()
    expectKey(key, commandId, mods)
  })

  it.each([
    // Page jump keybindings (Ctrl+D/U)
    ["d", { ctrl: true }, "page_down"],
    ["u", { ctrl: true }, "page_up"],
    // Sibling board navigation (Ctrl+J)
    ["j", { ctrl: true }, "sibling_board_next"],
    // Ctrl+K → command_palette (global layer 2, higher priority than sibling_board_prev)
    ["k", { ctrl: true }, "command_palette"],
    // v2: z = zoom_in (focus cursor node as root)
    ["z", {}, "zoom_in"],
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

describe("wildcard keybindings", () => {
  beforeEach(() => {
    clearKeybindings()
  })

  it("wildcard matches any key when condition is met", () => {
    registerKeybinding({
      key: "*",
      wildcard: true,
      commandId: "catch_all",
      when: (ctx) => ctx.helpOverlayOpen,
    })

    const helpOpen = createContext({ helpOverlayOpen: true })
    const helpClosed = createContext({ helpOverlayOpen: false })

    expect(resolveKeybinding("j", {}, helpOpen)).toBe("catch_all")
    expect(resolveKeybinding("x", {}, helpOpen)).toBe("catch_all")
    expect(resolveKeybinding("j", {}, helpClosed)).toBeNull()
  })

  it("specific key takes priority over wildcard when registered earlier", () => {
    // Specific key registered first (lower _order)
    registerKeybinding({
      key: "?",
      commandId: "dismiss_help",
      when: (ctx) => ctx.helpOverlayOpen,
    })
    // Wildcard registered second (higher _order)
    registerKeybinding({
      key: "*",
      wildcard: true,
      commandId: "noop",
      when: (ctx) => ctx.helpOverlayOpen,
    })

    const helpOpen = createContext({ helpOverlayOpen: true })

    // ? should match dismiss_help (registered first), not noop
    expect(resolveKeybinding("?", {}, helpOpen)).toBe("dismiss_help")
    // j should match noop (wildcard fallback)
    expect(resolveKeybinding("j", {}, helpOpen)).toBe("noop")
  })

  it("wildcard takes priority over later-registered specific keys", () => {
    // Wildcard registered first (for modal blocking)
    registerKeybinding({
      key: "*",
      wildcard: true,
      commandId: "noop",
      when: (ctx) => ctx.helpOverlayOpen,
    })
    // Normal binding registered later
    registerKeybinding({ key: "j", commandId: "cursor_down" })

    const helpOpen = createContext({ helpOverlayOpen: true })
    const helpClosed = createContext({ helpOverlayOpen: false })

    // When help is open: wildcard catches j before cursor_down
    expect(resolveKeybinding("j", {}, helpOpen)).toBe("noop")
    // When help is closed: wildcard doesn't match, cursor_down matches
    expect(resolveKeybinding("j", {}, helpClosed)).toBe("cursor_down")
  })

  it("literal * key (column_8) is not treated as wildcard", () => {
    // Normal binding for literal * key (Shift+8)
    registerKeybinding({ key: "*", commandId: "column_8" })

    const ctx = createContext()

    // Literal * matches
    expect(resolveKeybinding("*", {}, ctx)).toBe("column_8")
    // Other keys don't match (it's not a wildcard)
    expect(resolveKeybinding("j", {}, ctx)).toBeNull()
  })
})

describe("modal keybindings (initDefaultKeybindings)", () => {
  beforeEach(() => {
    clearKeybindings()
    initDefaultKeybindings()
  })

  it("help overlay: ? dismisses help", () => {
    const ctx = createContext({ helpOverlayOpen: true })
    expect(resolveKeybinding("?", {}, ctx)).toBe("help.dismiss")
  })

  it("help overlay: Escape dismisses help", () => {
    const ctx = createContext({ helpOverlayOpen: true })
    expect(resolveKeybinding("Escape", {}, ctx)).toBe("help.dismiss")
  })

  it("help overlay: q dismisses help", () => {
    const ctx = createContext({ helpOverlayOpen: true })
    expect(resolveKeybinding("q", {}, ctx)).toBe("help.dismiss")
  })

  it("help overlay: j scrolls down", () => {
    const ctx = createContext({ helpOverlayOpen: true })
    expect(resolveKeybinding("j", {}, ctx)).toBe("help.scroll_down")
  })

  it("help overlay: k scrolls up", () => {
    const ctx = createContext({ helpOverlayOpen: true })
    expect(resolveKeybinding("k", {}, ctx)).toBe("help.scroll_up")
  })

  it("help overlay: other keys are absorbed (noop)", () => {
    const ctx = createContext({ helpOverlayOpen: true })
    expect(resolveKeybinding("a", {}, ctx)).toBe("noop")
    expect(resolveKeybinding("x", {}, ctx)).toBe("noop")
  })

  it("delete confirm: Enter confirms", () => {
    const ctx = createContext({ deleteConfirmOpen: true })
    expect(resolveKeybinding("Enter", {}, ctx)).toBe("delete_confirm.confirm")
  })

  it("delete confirm: any other key cancels", () => {
    const ctx = createContext({ deleteConfirmOpen: true })
    expect(resolveKeybinding("j", {}, ctx)).toBe("delete_confirm.cancel")
    expect(resolveKeybinding("Escape", {}, ctx)).toBe("delete_confirm.cancel")
  })

  it("console: Escape closes", () => {
    const ctx = createContext({ consoleOpen: true })
    expect(resolveKeybinding("Escape", {}, ctx)).toBe("console.close")
  })

  it("console: backtick closes", () => {
    const ctx = createContext({ consoleOpen: true })
    expect(resolveKeybinding("`", {}, ctx)).toBe("console.close")
  })

  it("console: q quits", () => {
    const ctx = createContext({ consoleOpen: true })
    expect(resolveKeybinding("q", {}, ctx)).toBe("quit")
  })

  it("console: j is absorbed (noop)", () => {
    const ctx = createContext({ consoleOpen: true })
    expect(resolveKeybinding("j", {}, ctx)).toBe("noop")
  })

  it("toast: Escape dismisses when toast active", () => {
    const ctx = createContext({ hasActiveToast: true })
    expect(resolveKeybinding("Escape", {}, ctx)).toBe("toast.dismiss")
  })

  it("toast: Escape does NOT dismiss during inline edit", () => {
    const ctx = createContext({ hasActiveToast: true, isInlineEditing: true })
    // Should fall through to text.exit_edit (textInputFocused must be true too)
    expect(resolveKeybinding("Escape", {}, ctx)).not.toBe("toast.dismiss")
  })

  it("backtick toggles console when not in modal", () => {
    const ctx = createContext()
    expect(resolveKeybinding("`", {}, ctx)).toBe("console.toggle")
  })

  it("Ctrl+T fires dev toast", () => {
    const ctx = createContext()
    expect(resolveKeybinding("t", { ctrl: true }, ctx)).toBe("dev.test_toast")
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

    // Task (v2: x = toggle_task_done, X = cycle_task_status)
    expect(commandIds).toContain("toggle_task_done")
    expect(commandIds).toContain("cycle_task_status")

    // Fold (v2: </> = fold/unfold all)
    expect(commandIds).toContain("fold_all")
    expect(commandIds).toContain("fold_node")
    expect(commandIds).toContain("unfold_node")

    // View
    expect(commandIds).toContain("visual_mode_enter")
    expect(commandIds).toContain("show_help")
    expect(commandIds).toContain("increase_content_lines")

    // Page navigation and board navigation
    expect(commandIds).toContain("page_down")
    expect(commandIds).toContain("page_up")
    expect(commandIds).toContain("sibling_board_next")
    expect(commandIds).toContain("sibling_board_prev")
  })
})

describe("chord keybindings", () => {
  beforeEach(() => {
    clearKeybindings()
    initDefaultKeybindings()
  })

  it("registers chord prefixes from default keybindings", () => {
    // v2: z is no longer a chord prefix (z = zoom_in, not fold chord)
    // s-prefix removed (task properties now under t-prefix)
    expect(isChordPrefix("g")).toBe(true)
    expect(isChordPrefix("m")).toBe(true)
    expect(isChordPrefix("a")).toBe(true)
    expect(isChordPrefix("t")).toBe(true)
    // Not chord prefixes
    expect(isChordPrefix("z")).toBe(false)
    expect(isChordPrefix("s")).toBe(false)
    expect(isChordPrefix("j")).toBe(false)
    expect(isChordPrefix("k")).toBe(false)
  })

  it.each([
    // v2: z-prefix chords removed (z = zoom_in standalone)
    // g-prefix chords (go-to)
    ["g", "g", "cursor_first"],
    ["g", "o", "open_in_system"],
    ["g", "O", "open_in_terminal"],
    ["g", "p", "project_picker"],
    ["g", "n", "new_item"],
    ["g", "i", "goto_inbox"],
    ["g", "j", "goto_journal"],
    ["g", "h", "goto_home"],
    ["g", "e", "goto_archive"],
    // m-prefix chords (move to board)
    ["m", "m", "enter_move_mode"],
    ["m", "i", "move_to_inbox"],
    ["m", "j", "move_to_journal"],
    ["m", "h", "move_to_home"],
    ["m", "p", "reparent_picker"],
    // a-prefix chords (add operations)
    ["a", "#", "add_tag"],
    ["a", "@", "add_assignee"],
    ["a", "+", "add_project"],
    ["a", "[", "add_backlink"],
    ["a", "i", "insert_child"],
    ["a", "j", "add_sibling_below"],
    ["a", "h", "insert_at_parent"],
    // t-prefix chords (task properties)
    ["t", "d", "set_due_date"],
    ["t", "s", "set_start_date"],
    ["t", "o", "set_assignee"],
    ["t", "l", "set_label"],
  ] as const)("chord %s%s resolves to %s", (prefix, key, commandId) => {
    const ctx = createContext()
    expect(resolveChord(prefix, key, {}, ctx)).toBe(commandId)
  })

  it("resolveChord returns null for unregistered chord", () => {
    const ctx = createContext()
    expect(resolveChord("z", "q", {}, ctx)).toBeNull()
    expect(resolveChord("g", "x", {}, ctx)).toBeNull()
  })

  it("clearKeybindings clears chord state", () => {
    expect(isChordPrefix("g")).toBe(true)
    clearKeybindings()
    expect(isChordPrefix("g")).toBe(false)
    expect(resolveChord("g", "i", {}, createContext())).toBeNull()
  })

  it("getAllKeybindings includes chord bindings", () => {
    const all = getAllKeybindings()
    const chordBindings = all.filter((b) => b.chord)
    expect(chordBindings.length).toBe(33) // 12 g + 5 m + 7 a + 9 t
  })

  it("getChordSuffixes returns a-prefix hints", () => {
    const suffixes = getChordSuffixes("a")
    const suffixMap = Object.fromEntries(suffixes.map((s) => [s.key, s.commandId]))
    expect(suffixMap).toEqual({
      "#": "add_tag",
      "@": "add_assignee",
      "+": "add_project",
      "[": "add_backlink",
      i: "insert_child",
      j: "add_sibling_below",
      h: "insert_at_parent",
    })
  })

  it("getChordSuffixes returns g-prefix hints", () => {
    const suffixes = getChordSuffixes("g")
    const keys = suffixes.map((s) => s.key).sort()
    expect(keys).toEqual(["C", "O", "c", "e", "g", "h", "i", "j", "n", "o", "p", "v"])
  })

  it("getChordSuffixes returns empty for non-chord prefix", () => {
    expect(getChordSuffixes("z")).toEqual([])
    expect(getChordSuffixes("x")).toEqual([])
  })

  it("v2 key remappings work", () => {
    const ctx = createContext()
    // v2: x → toggle_task_done, X → cycle_task_status
    expect(resolveKeybinding("x", {}, ctx)).toBe("toggle_task_done")
    expect(resolveKeybinding("X", {}, ctx)).toBe("cycle_task_status")
    // v2: d → clipboard_cut, y → clipboard_copy, p → clipboard_paste
    expect(resolveKeybinding("d", {}, ctx)).toBe("clipboard_cut")
    expect(resolveKeybinding("y", {}, ctx)).toBe("clipboard_copy")
    expect(resolveKeybinding("p", {}, ctx)).toBe("clipboard_paste")
    // v2: o → insert_below, O → insert_above
    expect(resolveKeybinding("o", {}, ctx)).toBe("insert_below")
    expect(resolveKeybinding("O", {}, ctx)).toBe("insert_above")
    // v2: u → undo, U → redo
    expect(resolveKeybinding("u", {}, ctx)).toBe("undo")
    expect(resolveKeybinding("U", {}, ctx)).toBe("redo")
    // v2: z → zoom_in (focus cursor node as root), Z → zoom_outwards
    expect(resolveKeybinding("z", {}, ctx)).toBe("zoom_in")
    expect(resolveKeybinding("Z", {}, ctx)).toBe("zoom_outwards")
    // v2: e → archive, c → capture_inbox, C → capture_dialog, P → toggle_detail_pane (Smart-P)
    expect(resolveKeybinding("e", {}, ctx)).toBe("archive")
    expect(resolveKeybinding("c", {}, ctx)).toBe("capture_inbox")
    expect(resolveKeybinding("C", {}, ctx)).toBe("capture_dialog")
    expect(resolveKeybinding("P", {}, ctx)).toBe("toggle_detail_pane")
    // v2: Space → select_toggle
    expect(resolveKeybinding(" ", {}, ctx)).toBe("select_toggle")
    // v2: H → fold_node, L → unfold_node
    expect(resolveKeybinding("H", {}, ctx)).toBe("fold_node")
    expect(resolveKeybinding("L", {}, ctx)).toBe("unfold_node")
    // v2: < → fold_all, > → unfold_all
    expect(resolveKeybinding("<", {}, ctx)).toBe("fold_all")
    expect(resolveKeybinding(">", {}, ctx)).toBe("unfold_all")
    // Tab → indent_node (structural indent)
    expect(resolveKeybinding("Tab", {}, ctx)).toBe("indent_node")
    // v2: : → command_palette, , → settings
    expect(resolveKeybinding(":", {}, ctx)).toBe("command_palette")
    expect(resolveKeybinding(",", {}, ctx)).toBe("settings")
    // Ctrl+/ → filter
    expect(resolveKeybinding("/", { ctrl: true }, ctx)).toBe("filter")
  })

  it("D no longer maps to delete_node (v2: D is free)", () => {
    const ctx = createContext()
    // D was removed — should NOT resolve to delete_node
    expect(resolveKeybinding("D", { shift: true }, ctx)).not.toBe("delete_node")
  })

  it("Smart-P: P key maps to toggle_detail_pane", () => {
    const ctx = createContext()
    expect(resolveKeybinding("P", {}, ctx)).toBe("toggle_detail_pane")
  })

  it("Escape in detail pane unfocuses (detail_pane.close)", () => {
    const ctx = createContext({ isInDetailPane: true })
    expect(resolveKeybinding("Escape", {}, ctx)).toBe("detail_pane.close")
  })

  it("Escape without detail pane focused falls through to close_or_quit", () => {
    const ctx = createContext({ isInDetailPane: false })
    expect(resolveKeybinding("Escape", {}, ctx)).toBe("close_or_quit")
  })

  it("a is a chord prefix for add operations", () => {
    expect(isChordPrefix("a")).toBe(true)
  })

  it("a-prefix chords resolve correctly", () => {
    const ctx = createContext()
    expect(resolveChord("a", "#", {}, ctx)).toBe("add_tag")
    expect(resolveChord("a", "@", {}, ctx)).toBe("add_assignee")
    expect(resolveChord("a", "+", {}, ctx)).toBe("add_project")
    expect(resolveChord("a", "[", {}, ctx)).toBe("add_backlink")
    expect(resolveChord("a", "i", {}, ctx)).toBe("insert_child")
    expect(resolveChord("a", "j", {}, ctx)).toBe("add_sibling_below")
    expect(resolveChord("a", "h", {}, ctx)).toBe("insert_at_parent")
  })

  it("a standalone (chord timeout) resolves to noop", () => {
    const ctx = createContext()
    expect(resolveKeybinding("a", {}, ctx)).toBe("noop")
  })

  describe("bare symbol shortcuts (convenience aliases)", () => {
    it("@ in node mode → add_assignee (same as a@)", () => {
      const ctx = createContext()
      expect(resolveKeybinding("@", {}, ctx)).toBe("add_assignee")
      expect(resolveChord("a", "@", {}, ctx)).toBe("add_assignee")
    })

    it("# in node mode → add_tag (same as a#)", () => {
      const ctx = createContext()
      expect(resolveKeybinding("#", {}, ctx)).toBe("add_tag")
      expect(resolveChord("a", "#", {}, ctx)).toBe("add_tag")
    })

    it("+ in node mode → add_project (same as a+)", () => {
      const ctx = createContext()
      expect(resolveKeybinding("+", {}, ctx)).toBe("add_project")
      expect(resolveChord("a", "+", {}, ctx)).toBe("add_project")
    })

    it("[ in node mode → add_backlink (same as a[)", () => {
      const ctx = createContext()
      expect(resolveKeybinding("[", {}, ctx)).toBe("add_backlink")
      expect(resolveChord("a", "[", {}, ctx)).toBe("add_backlink")
    })

    it("bare symbols are blocked during text input", () => {
      const ctx = createContext({ textInputFocused: true, isInlineEditing: true })
      // All should resolve to noop (wildcard catch-all in inline-edit-barrier)
      expect(resolveKeybinding("@", {}, ctx)).toBe("noop")
      expect(resolveKeybinding("#", {}, ctx)).toBe("noop")
      expect(resolveKeybinding("+", {}, ctx)).toBe("noop")
      expect(resolveKeybinding("[", {}, ctx)).toBe("noop")
    })

    it("bare symbols are blocked when dialog is open", () => {
      const ctx = createContext({ searchDialogOpen: true })
      // Should not resolve to the shortcut commands
      expect(resolveKeybinding("@", {}, ctx)).not.toBe("add_assignee")
      expect(resolveKeybinding("#", {}, ctx)).not.toBe("add_tag")
      expect(resolveKeybinding("+", {}, ctx)).not.toBe("add_project")
      expect(resolveKeybinding("[", {}, ctx)).not.toBe("add_backlink")
    })
  })
})

describe("text mode keybinding separation", () => {
  const inlineCtx = createContext({ isInlineEditing: true, textInputFocused: true })
  const nodeCtx = createContext()

  beforeEach(() => {
    clearKeybindings()
    initDefaultKeybindings()
  })

  describe("node-mode commands are blocked during inline editing", () => {
    // Navigation keys that should NOT fire in text mode
    it.each([
      ["Tab", {}, "indent_node"],
      ["Tab", { shift: true }, "outdent"],
      ["m", {}, "enter_move_mode"],
      ["q", {}, "quit"],
      ["v", {}, "visual_mode_enter"],
      ["/", {}, "local_find"],
      ["?", {}, "show_help"],
      // v2 rebindings
      ["x", {}, "toggle_task_done"],
      [" ", {}, "select_toggle"],
      ["e", {}, "archive"],
      ["u", {}, "undo"],
      ["o", {}, "insert_below"],
      ["p", {}, "clipboard_paste"],
      ["d", {}, "clipboard_cut"],
      ["y", {}, "clipboard_copy"],
      ["c", {}, "capture_inbox"],
      ["z", {}, "zoom_in"],
    ])("%s (normally %s) is blocked in text mode", (key, mods, normalCmd) => {
      // Verify it works in node mode
      expect(resolveKeybinding(key, mods, nodeCtx)).toBe(normalCmd)
      // In text mode, it should resolve to noop (wildcard catch-all)
      expect(resolveKeybinding(key, mods, inlineCtx)).toBe("noop")
    })
  })

  describe("text-editing keys still work during inline editing", () => {
    it("Escape → text.exit_edit", () => {
      expect(resolveKeybinding("Escape", {}, inlineCtx)).toBe("text.exit_edit")
    })

    it("Enter → text.confirm", () => {
      expect(resolveKeybinding("Enter", {}, inlineCtx)).toBe("text.confirm")
    })

    it("Backspace → text.delete_backward", () => {
      expect(resolveKeybinding("Backspace", {}, inlineCtx)).toBe("text.delete_backward")
    })

    it("Delete → text.delete_forward", () => {
      expect(resolveKeybinding("Delete", {}, inlineCtx)).toBe("text.delete_forward")
    })

    it("ArrowLeft → text.cursor_left", () => {
      expect(resolveKeybinding("ArrowLeft", {}, inlineCtx)).toBe("text.cursor_left")
    })

    it("ArrowRight → text.cursor_right", () => {
      expect(resolveKeybinding("ArrowRight", {}, inlineCtx)).toBe("text.cursor_right")
    })

    it("ArrowUp → text.cursor_up", () => {
      expect(resolveKeybinding("ArrowUp", {}, inlineCtx)).toBe("text.cursor_up")
    })

    it("ArrowDown → text.cursor_down", () => {
      expect(resolveKeybinding("ArrowDown", {}, inlineCtx)).toBe("text.cursor_down")
    })

    it("Ctrl+a → text.cursor_start", () => {
      expect(resolveKeybinding("a", { ctrl: true }, inlineCtx)).toBe("text.cursor_start")
    })

    it("Ctrl+e → text.cursor_end", () => {
      expect(resolveKeybinding("e", { ctrl: true }, inlineCtx)).toBe("text.cursor_end")
    })

    it("Ctrl+w → text.delete_word", () => {
      expect(resolveKeybinding("w", { ctrl: true }, inlineCtx)).toBe("text.delete_word")
    })

    it("Ctrl+u → text.delete_to_start", () => {
      expect(resolveKeybinding("u", { ctrl: true }, inlineCtx)).toBe("text.delete_to_start")
    })

    it("Ctrl+k → text.delete_to_end", () => {
      expect(resolveKeybinding("k", { ctrl: true }, inlineCtx)).toBe("text.delete_to_end")
    })
  })

  describe("undo/redo work during inline editing", () => {
    it("Ctrl+z → undo", () => {
      expect(resolveKeybinding("z", { ctrl: true }, inlineCtx)).toBe("undo")
    })

    it("Ctrl+Shift+z → redo", () => {
      expect(resolveKeybinding("z", { ctrl: true, shift: true }, inlineCtx)).toBe("redo")
    })

    it("Ctrl+y → text.yank", () => {
      expect(resolveKeybinding("y", { ctrl: true }, inlineCtx)).toBe("text.yank")
    })
  })

  describe("Ctrl combos from node-mode are blocked during inline editing", () => {
    it("Ctrl+d (page down) is blocked", () => {
      expect(resolveKeybinding("d", { ctrl: true }, nodeCtx)).toBe("page_down")
      expect(resolveKeybinding("d", { ctrl: true }, inlineCtx)).toBe("noop")
    })

    it("Ctrl+j (sibling board next) is blocked", () => {
      expect(resolveKeybinding("j", { ctrl: true }, nodeCtx)).toBe("sibling_board_next")
      expect(resolveKeybinding("j", { ctrl: true }, inlineCtx)).toBe("noop")
    })

    it("Ctrl+i (open detail pane) is blocked", () => {
      expect(resolveKeybinding("i", { ctrl: true }, nodeCtx)).toBe("open_detail_pane")
      expect(resolveKeybinding("i", { ctrl: true }, inlineCtx)).toBe("noop")
    })
  })

  describe("Meta+direction keys are blocked during inline editing", () => {
    it("Meta+ArrowUp (shift up) is blocked", () => {
      expect(resolveKeybinding("ArrowUp", { meta: true }, nodeCtx)).toBe("shift_up")
      expect(resolveKeybinding("ArrowUp", { meta: true }, inlineCtx)).toBe("noop")
    })

    it("Meta+ArrowDown (shift down) is blocked", () => {
      expect(resolveKeybinding("ArrowDown", { meta: true }, nodeCtx)).toBe("shift_down")
      expect(resolveKeybinding("ArrowDown", { meta: true }, inlineCtx)).toBe("noop")
    })
  })
})

describe("Cmd shortcuts (kitty protocol, super modifier)", () => {
  beforeEach(() => {
    clearKeybindings()
    initDefaultKeybindings()
  })

  // Helper for super modifier
  const sup = { super: true }

  describe("already-wired Cmd shortcuts", () => {
    it("Cmd+z → undo", () => {
      expectKey("z", "undo", sup)
    })

    it("Cmd+Shift+z → redo", () => {
      expectKey("z", "redo", { super: true, shift: true })
    })

    it("Cmd+w → close_detail_pane", () => {
      expectKey("w", "close_detail_pane", sup)
    })

    it("Cmd+c/x/v → clipboard (in node mode)", () => {
      expectKey("c", "clipboard_copy", sup)
      expectKey("x", "clipboard_cut", sup)
      expectKey("v", "clipboard_paste", sup)
    })

    it("Cmd+d → duplicate_node", () => {
      expectKey("d", "duplicate_node", sup)
    })

    it("Cmd+f → search_replace (search/replace dialog)", () => {
      expectKey("f", "search_replace", sup)
    })
  })

  describe("newly-wired Cmd shortcuts", () => {
    it("Cmd+a → select_all", () => {
      expectKey("a", "select_all", sup)
    })

    it("Cmd+o → open_in_system (smart open)", () => {
      expectKey("o", "open_in_system", sup)
    })

    it("Cmd+Shift+o → open_in_terminal (alt open / dev)", () => {
      expectKey("o", "open_in_terminal", { super: true, shift: true })
    })

    it("Cmd+n → capture_inbox (capture new)", () => {
      expectKey("n", "capture_inbox", sup)
    })

    it("Cmd+k → command_palette (omnibox)", () => {
      expectKey("k", "command_palette", sup)
    })

    it("Cmd+h → focus_board", () => {
      expectKey("h", "focus_board", sup)
    })

    it("Cmd+l → focus_detail", () => {
      expectKey("l", "focus_detail", sup)
    })

    it("Cmd+[ → nav_back (history)", () => {
      expectKey("[", "nav_back", sup)
    })

    it("Cmd+] → nav_forward (history)", () => {
      expectKey("]", "nav_forward", sup)
    })

    it("Cmd+, → settings", () => {
      expectKey(",", "settings", sup)
    })

    it("Cmd+t → task_dialog", () => {
      expectKey("t", "task_dialog", sup)
    })

    it("Cmd+g → filter", () => {
      expectKey("g", "filter", sup)
    })

    it("Cmd+p → toggle_detail_pane", () => {
      expectKey("p", "toggle_detail_pane", sup)
    })
  })

  describe("Cmd+b/i (bold/italic) in text edit mode only", () => {
    it("Cmd+b → text.bold during inline editing", () => {
      const ctx = createContext({ isInlineEditing: true, textInputFocused: true })
      expect(resolveKeybinding("b", sup, ctx)).toBe("text.bold")
    })

    it("Cmd+i → text.italic during inline editing", () => {
      const ctx = createContext({ isInlineEditing: true, textInputFocused: true })
      expect(resolveKeybinding("i", sup, ctx)).toBe("text.italic")
    })

    it("Cmd+b is not text.bold in node mode (no isInlineEditing)", () => {
      const ctx = createContext()
      expect(resolveKeybinding("b", sup, ctx)).not.toBe("text.bold")
    })

    it("Cmd+i is not text.italic in node mode (no isInlineEditing)", () => {
      const ctx = createContext()
      expect(resolveKeybinding("i", sup, ctx)).not.toBe("text.italic")
    })
  })

  describe("Cmd+h/l no longer shift nodes (reserved for focus)", () => {
    it("Cmd+h is focus_board, not shift_left", () => {
      expectKey("h", "focus_board", sup)
    })

    it("Cmd+l is focus_detail, not shift_right", () => {
      expectKey("l", "focus_detail", sup)
    })

    it("Cmd+j still shifts down (no conflict)", () => {
      expectKey("j", "shift_down", sup)
    })

    it("Cmd+k still shifts up (no conflict — global Cmd+k command_palette is higher priority)", () => {
      // Cmd+k resolves to command_palette because global layer is higher priority
      expectKey("k", "command_palette", sup)
    })

    it("Meta+h/l still shift nodes (Alt fallback)", () => {
      expectKey("h", "shift_left", { meta: true })
      expectKey("l", "shift_right", { meta: true })
    })
  })
})
