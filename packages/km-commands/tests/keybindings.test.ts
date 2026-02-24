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
  opt?: boolean
  cmd?: boolean
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
  const result = resolveKeybinding(key, mods, ctx)
  expect(result).not.toBeNull()
  expect(result!.commandId).toBe(commandId)
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

      expect(result).toEqual({ commandId: "cursor_next" })
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

      expect(result).toEqual({ commandId: "first_cmd" })
    })
  })

  describe("modifier matching", () => {
    it.each([
      ["ctrl", "z", { ctrl: true }, "undo"],
      ["shift", "Tab", { shift: true }, "shift_left"],
      ["opt", "ArrowUp", { opt: true }, "shift_up"],
    ] as const)("matches %s modifier", (_name, key, mods, commandId) => {
      registerKeybinding({ key, commandId, ...mods })
      const ctx = createContext()
      expect(resolveKeybinding(key, mods, ctx)).toEqual({ commandId })
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
      expect(resolveKeybinding("z", { ctrl: true, shift: true }, ctx)).toEqual({ commandId: "redo" })
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
      expect(resolveKeybinding("a", {}, ctx)).toEqual({ commandId: "cmd_a" })
      expect(resolveKeybinding("a", { ctrl: false, shift: false }, ctx)).toEqual({ commandId: "cmd_a" })
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
      expect(resolveKeybinding("Enter", {}, ctx)).toEqual({ commandId: "confirm_move" })
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

      expect(resolveKeybinding("j", {}, createContext({ mode: "normal" }))).toEqual({ commandId: "cursor_next" })
      expect(resolveKeybinding("j", {}, createContext({ mode: "move" }))).toEqual({ commandId: "cursor_next" })
    })

    it("matches any mode when modes is undefined", () => {
      registerKeybinding({
        key: "j",
        commandId: "cursor_next",
      })

      expect(resolveKeybinding("j", {}, createContext({ mode: "normal" }))).toEqual({ commandId: "cursor_next" })
      expect(resolveKeybinding("j", {}, createContext({ mode: "move" }))).toEqual({ commandId: "cursor_next" })
      expect(resolveKeybinding("j", {}, createContext({ mode: "search" }))).toEqual({ commandId: "cursor_next" })
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

      expect(resolveKeybinding("Escape", {}, ctx1)).toEqual({ commandId: "cancel" })
      expect(resolveKeybinding("Escape", {}, ctx2)).toEqual({ commandId: "cancel" })
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
      expect(resolveKeybinding("d", {}, ctx)).toEqual({ commandId: "delete_selection" })
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
      expect(resolveKeybinding("Enter", {}, createContext({ mode: "normal", currentNode: node }))).toEqual({ commandId: "zoom_in" })

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
      expect(resolveKeybinding("Enter", {}, moveCtx)).toEqual({ commandId: "confirm_move" })
      // In normal mode, first binding doesn't match, second does
      expect(resolveKeybinding("Enter", {}, normalCtx)).toEqual({ commandId: "zoom_in" })
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
    // A reserved for Agent Dialog (removed select_all_progressive)
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
    // v2: 'i' starts inline edit, 'o' inserts below, 'e' bare removed (archive is m a)
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
  ] as const)("option+%s shifts node (%s)", (key, commandId) => {
    initDefaultKeybindings()
    expectKey(key, commandId, { opt: true })
  })

  it.each([
    ["z", { cmd: true }, "undo"],
    ["z", { cmd: true, shift: true }, "redo"],
  ] as const)("undo/redo: cmd+%s resolves to %s", (key, mods, commandId) => {
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
    // z = zoom_inwards (one level closer to cursor)
    ["z", {}, "zoom_inwards"],
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

    expect(resolveKeybinding("j", {}, helpOpen)).toEqual({ commandId: "catch_all" })
    expect(resolveKeybinding("x", {}, helpOpen)).toEqual({ commandId: "catch_all" })
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
    expect(resolveKeybinding("?", {}, helpOpen)).toEqual({ commandId: "dismiss_help" })
    // j should match noop (wildcard fallback)
    expect(resolveKeybinding("j", {}, helpOpen)).toEqual({ commandId: "noop" })
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
    expect(resolveKeybinding("j", {}, helpOpen)).toEqual({ commandId: "noop" })
    // When help is closed: wildcard doesn't match, cursor_down matches
    expect(resolveKeybinding("j", {}, helpClosed)).toEqual({ commandId: "cursor_down" })
  })

  it("literal * key (column_8) is not treated as wildcard", () => {
    // Normal binding for literal * key (Shift+8)
    registerKeybinding({ key: "*", commandId: "column_8" })

    const ctx = createContext()

    // Literal * matches
    expect(resolveKeybinding("*", {}, ctx)).toEqual({ commandId: "column_8" })
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
    expect(resolveKeybinding("?", {}, ctx)).toEqual({ commandId: "help.dismiss" })
  })

  it("help overlay: Escape dismisses help", () => {
    const ctx = createContext({ helpOverlayOpen: true })
    expect(resolveKeybinding("Escape", {}, ctx)).toEqual({ commandId: "help.dismiss" })
  })

  it("help overlay: q dismisses help", () => {
    const ctx = createContext({ helpOverlayOpen: true })
    expect(resolveKeybinding("q", {}, ctx)).toEqual({ commandId: "help.dismiss" })
  })

  it("help overlay: j scrolls down", () => {
    const ctx = createContext({ helpOverlayOpen: true })
    expect(resolveKeybinding("j", {}, ctx)).toEqual({ commandId: "help.scroll_down" })
  })

  it("help overlay: k scrolls up", () => {
    const ctx = createContext({ helpOverlayOpen: true })
    expect(resolveKeybinding("k", {}, ctx)).toEqual({ commandId: "help.scroll_up" })
  })

  it("help overlay: other keys are absorbed (noop)", () => {
    const ctx = createContext({ helpOverlayOpen: true })
    expect(resolveKeybinding("a", {}, ctx)).toEqual({ commandId: "noop" })
    expect(resolveKeybinding("x", {}, ctx)).toEqual({ commandId: "noop" })
  })

  it("delete confirm: Enter confirms", () => {
    const ctx = createContext({ deleteConfirmOpen: true })
    expect(resolveKeybinding("Enter", {}, ctx)).toEqual({ commandId: "delete_confirm.confirm" })
  })

  it("delete confirm: any other key cancels", () => {
    const ctx = createContext({ deleteConfirmOpen: true })
    expect(resolveKeybinding("j", {}, ctx)).toEqual({ commandId: "delete_confirm.cancel" })
    expect(resolveKeybinding("Escape", {}, ctx)).toEqual({ commandId: "delete_confirm.cancel" })
  })

  it("console: Escape closes", () => {
    const ctx = createContext({ consoleOpen: true })
    expect(resolveKeybinding("Escape", {}, ctx)).toEqual({ commandId: "console.close" })
  })

  it("console: backtick closes", () => {
    const ctx = createContext({ consoleOpen: true })
    expect(resolveKeybinding("`", {}, ctx)).toEqual({ commandId: "console.close" })
  })

  it("console: q quits", () => {
    const ctx = createContext({ consoleOpen: true })
    expect(resolveKeybinding("q", {}, ctx)).toEqual({ commandId: "quit" })
  })

  it("console: j is absorbed (noop)", () => {
    const ctx = createContext({ consoleOpen: true })
    expect(resolveKeybinding("j", {}, ctx)).toEqual({ commandId: "noop" })
  })

  it("toast: Escape dismisses when toast active", () => {
    const ctx = createContext({ hasActiveToast: true })
    expect(resolveKeybinding("Escape", {}, ctx)).toEqual({ commandId: "toast.dismiss" })
  })

  it("toast: Escape does NOT dismiss during inline edit", () => {
    const ctx = createContext({ hasActiveToast: true, isInlineEditing: true })
    // Should fall through to text.exit_edit (textInputFocused must be true too)
    expect(resolveKeybinding("Escape", {}, ctx)).not.toEqual({ commandId: "toast.dismiss" })
  })

  it("backtick toggles console when not in modal", () => {
    const ctx = createContext()
    expect(resolveKeybinding("`", {}, ctx)).toEqual({ commandId: "console.toggle" })
  })

  it("Ctrl+T fires task dialog", () => {
    const ctx = createContext()
    expect(resolveKeybinding("t", { ctrl: true }, ctx)).toEqual({ commandId: "task_dialog" })
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
    expect(commandIds).toContain("zoom_inwards")
    expect(commandIds).toContain("zoom_outwards")

    // Selection (A removed — reserved for Agent Dialog)
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
    // z is not a chord prefix (z = zoom_inwards standalone)
    // s-prefix removed (task properties now under t-prefix)
    expect(isChordPrefix("g")).toBe(true)
    expect(isChordPrefix("v")).toBe(true)
    expect(isChordPrefix("m")).toBe(true)
    expect(isChordPrefix("a")).toBe(true)
    expect(isChordPrefix("t")).toBe(true)
    expect(isChordPrefix("c")).toBe(true)
    expect(isChordPrefix("Ctrl+w")).toBe(true)
    // Not chord prefixes
    expect(isChordPrefix("z")).toBe(false)
    expect(isChordPrefix("s")).toBe(false)
    expect(isChordPrefix("j")).toBe(false)
    expect(isChordPrefix("k")).toBe(false)
  })

  describe("chord resolution (non-composable commands)", () => {
    it.each([
      // g-prefix chords (go-to) — non-composable
      ["g", "g", "cursor_first"],
      ["g", "o", "open_in_system"],
      ["g", "O", "open_in_terminal"],
      ["g", "p", "project_picker"],
      // v-prefix chords (view operations)
      ["v", "c", "toggle_collapse"],
      ["v", "C", "toggle_show_ignored"],
      ["v", "m", "cycle_view_mode"],
      ["v", "d", "toggle_hide_done"],
      ["v", "h", "ignore_node"],
      ["v", "i", "cycle_icon_style"],
      ["v", "-", "clear_filters"],
      // m-prefix chords (move to board)
      ["m", "a", "archive"],
      ["m", "m", "enter_move_mode"],
      ["m", "p", "reparent_picker"],
      // a-prefix chords (add operations) — non-composable
      ["a", "i", "insert_child"],
      ["a", "j", "add_sibling_below"],
      ["a", "h", "insert_at_parent"],
      // t-prefix chords (task properties)
      ["t", "t", "task_dialog"],
      ["t", "-", "clear_task"],
      ["t", "d", "set_due_date"],
      ["t", "!", "set_priority"],
      ["t", "s", "set_start_date"],
      ["t", "r", "set_recurring"],
      ["t", "o", "set_assignee"],
      ["t", "l", "set_label"],
      // c-prefix chords (capture/create)
      ["c", "c", "capture_dialog"],
      // Ctrl+W-prefix chords (pane operations)
      ["Ctrl+w", "v", "pane_split_vertical"],
      ["Ctrl+w", "s", "pane_split_horizontal"],
      ["Ctrl+w", "q", "pane_close"],
      ["Ctrl+w", "h", "pane_focus_left"],
      ["Ctrl+w", "j", "pane_focus_down"],
      ["Ctrl+w", "k", "pane_focus_up"],
      ["Ctrl+w", "l", "pane_focus_right"],
      ["Ctrl+w", "p", "pane_focus_previous"],
      ["Ctrl+w", "Tab", "pane_focus_next"],
      ["Ctrl+w", ">", "pane_resize_grow"],
      ["Ctrl+w", "<", "pane_resize_shrink"],
      ["Ctrl+w", "+", "pane_resize_grow_vertical"],
      ["Ctrl+w", "-", "pane_resize_shrink_vertical"],
      ["Ctrl+w", "=", "pane_equalize"],
      ["Ctrl+w", "z", "pane_zoom"],
      ["Ctrl+w", "o", "pane_only"],
      ["Ctrl+w", "H", "pane_swap_left"],
      ["Ctrl+w", "J", "pane_swap_down"],
      ["Ctrl+w", "K", "pane_swap_up"],
      ["Ctrl+w", "L", "pane_swap_right"],
    ] as const)("chord %s%s resolves to %s", (prefix, key, commandId) => {
      const ctx = createContext()
      expect(resolveChord(prefix, key, {}, ctx)).toEqual({ commandId })
    })
  })

  describe("chord resolution (composable commands with targetId)", () => {
    it.each([
      // g-prefix composable goto
      ["g", "i", "goto", "i"],
      ["g", "j", "goto", "j"],
      ["g", "h", "goto", "h"],
      ["g", "a", "goto", "a"],
      // m-prefix composable move
      ["m", "i", "move", "i"],
      ["m", "j", "move", "j"],
      ["m", "h", "move", "h"],
      // a-prefix composable add
      ["a", "#", "add", "#"],
      ["a", "@", "add", "@"],
      ["a", "+", "add", "+"],
      ["a", "[", "add", "["],
    ] as const)("chord %s%s resolves to %s (targetId: %s)", (prefix, key, commandId, targetId) => {
      const ctx = createContext()
      expect(resolveChord(prefix, key, {}, ctx)).toEqual({ commandId, targetId })
    })
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
    expect(chordBindings.length).toBe(81) // 22 g + 7 v + 12 m + 10 a + 8 t + 1 c + 21 Ctrl+w
  })

  it("getChordSuffixes returns a-prefix hints", () => {
    const suffixes = getChordSuffixes("a")
    // Build map of key → { commandId, targetId? }
    const suffixMap = Object.fromEntries(
      suffixes.map((s) => [s.key, s.targetId ? { commandId: s.commandId, targetId: s.targetId } : { commandId: s.commandId }]),
    )
    expect(suffixMap).toEqual({
      "#": { commandId: "add", targetId: "#" },
      "@": { commandId: "add", targetId: "@" },
      "+": { commandId: "add", targetId: "+" },
      "[": { commandId: "add", targetId: "[" },
      i: { commandId: "insert_child" },
      j: { commandId: "add_sibling_below" },
      h: { commandId: "insert_at_parent" },
      H: { commandId: "noop" },
      I: { commandId: "noop" },
      J: { commandId: "noop" },
    })
  })

  it("getChordSuffixes returns g-prefix hints", () => {
    const suffixes = getChordSuffixes("g")
    const keys = suffixes.map((s) => s.key).sort()
    // g a replaces g e (goto archive), plus digits 0-9 for favorites
    expect(keys).toEqual(["#", "+", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "@", "O", "[", "a", "g", "h", "i", "j", "o", "p"])
  })

  it("getChordSuffixes returns v-prefix hints", () => {
    const suffixes = getChordSuffixes("v")
    const keys = suffixes.map((s) => s.key).sort()
    expect(keys).toEqual(["-", "C", "c", "d", "h", "i", "m"])
  })

  it("getChordSuffixes returns Ctrl+w-prefix hints", () => {
    const suffixes = getChordSuffixes("Ctrl+w")
    const keys = suffixes.map((s) => s.key).sort()
    expect(keys).toEqual(["+", "-", "<", "=", ">", "H", "J", "K", "L", "Tab", "h", "j", "k", "l", "o", "p", "q", "s", "v", "z"])
  })

  it("Ctrl+w Shift+Tab resolves to pane_focus_prev", () => {
    const ctx = createContext()
    expect(resolveChord("Ctrl+w", "Tab", { shift: true }, ctx)).toEqual({ commandId: "pane_focus_prev" })
  })

  it("getChordSuffixes returns empty for non-chord prefix", () => {
    expect(getChordSuffixes("z")).toEqual([])
    expect(getChordSuffixes("x")).toEqual([])
  })

  it("v2 key remappings work", () => {
    const ctx = createContext()
    // v2: x → toggle_task_done, X → cycle_task_status
    expect(resolveKeybinding("x", {}, ctx)).toEqual({ commandId: "toggle_task_done" })
    expect(resolveKeybinding("X", {}, ctx)).toEqual({ commandId: "cycle_task_status" })
    // v2: d → clipboard_cut, y → clipboard_copy, p → clipboard_paste
    expect(resolveKeybinding("d", {}, ctx)).toEqual({ commandId: "clipboard_cut" })
    expect(resolveKeybinding("y", {}, ctx)).toEqual({ commandId: "clipboard_copy" })
    expect(resolveKeybinding("p", {}, ctx)).toEqual({ commandId: "clipboard_paste" })
    // v2: o → insert_below, O → insert_above
    expect(resolveKeybinding("o", {}, ctx)).toEqual({ commandId: "insert_below" })
    expect(resolveKeybinding("O", {}, ctx)).toEqual({ commandId: "insert_above" })
    // v2: u → undo, U → redo
    expect(resolveKeybinding("u", {}, ctx)).toEqual({ commandId: "undo" })
    expect(resolveKeybinding("U", {}, ctx)).toEqual({ commandId: "redo" })
    // z → zoom_inwards (one level closer to cursor), Z → zoom_outwards
    expect(resolveKeybinding("z", {}, ctx)).toEqual({ commandId: "zoom_inwards" })
    expect(resolveKeybinding("Z", {}, ctx)).toEqual({ commandId: "zoom_outwards" })
    // v2: e bare removed (archive is m a), c → capture_inbox, C → capture_dialog, D → toggle_detail_pane (Smart-D)
    expect(resolveKeybinding("c", {}, ctx)).toEqual({ commandId: "capture_inbox" })
    expect(resolveKeybinding("C", {}, ctx)).toEqual({ commandId: "capture_dialog" })
    expect(resolveKeybinding("D", {}, ctx)).toEqual({ commandId: "toggle_detail_pane" })
    // v2: Space → select_toggle
    expect(resolveKeybinding(" ", {}, ctx)).toEqual({ commandId: "select_toggle" })
    // v2: H → fold_node, L → unfold_node
    expect(resolveKeybinding("H", {}, ctx)).toEqual({ commandId: "fold_node" })
    expect(resolveKeybinding("L", {}, ctx)).toEqual({ commandId: "unfold_node" })
    // v2: < → fold_all, > → unfold_all
    expect(resolveKeybinding("<", {}, ctx)).toEqual({ commandId: "fold_all" })
    expect(resolveKeybinding(">", {}, ctx)).toEqual({ commandId: "unfold_all" })
    // Tab → indent_node (structural indent)
    expect(resolveKeybinding("Tab", {}, ctx)).toEqual({ commandId: "indent_node" })
    // v2: : → command_palette, , → settings
    expect(resolveKeybinding(":", {}, ctx)).toEqual({ commandId: "command_palette" })
    expect(resolveKeybinding(",", {}, ctx)).toEqual({ commandId: "settings" })
    // Ctrl+/ → filter
    expect(resolveKeybinding("/", { ctrl: true }, ctx)).toEqual({ commandId: "filter" })
  })

  it("Smart-D: D key maps to toggle_detail_pane", () => {
    const ctx = createContext()
    expect(resolveKeybinding("D", {}, ctx)).toEqual({ commandId: "toggle_detail_pane" })
  })

  it("Escape in detail pane unfocuses (detail_pane.close)", () => {
    const ctx = createContext({ isInDetailPane: true })
    expect(resolveKeybinding("Escape", {}, ctx)).toEqual({ commandId: "detail_pane.close" })
  })

  it("Escape without detail pane focused falls through to close_or_quit", () => {
    const ctx = createContext({ isInDetailPane: false })
    expect(resolveKeybinding("Escape", {}, ctx)).toEqual({ commandId: "close_or_quit" })
  })

  it("a is a chord prefix for add operations", () => {
    expect(isChordPrefix("a")).toBe(true)
  })

  it("a-prefix chords resolve correctly", () => {
    const ctx = createContext()
    expect(resolveChord("a", "#", {}, ctx)).toEqual({ commandId: "add", targetId: "#" })
    expect(resolveChord("a", "@", {}, ctx)).toEqual({ commandId: "add", targetId: "@" })
    expect(resolveChord("a", "+", {}, ctx)).toEqual({ commandId: "add", targetId: "+" })
    expect(resolveChord("a", "[", {}, ctx)).toEqual({ commandId: "add", targetId: "[" })
    expect(resolveChord("a", "i", {}, ctx)).toEqual({ commandId: "insert_child" })
    expect(resolveChord("a", "j", {}, ctx)).toEqual({ commandId: "add_sibling_below" })
    expect(resolveChord("a", "h", {}, ctx)).toEqual({ commandId: "insert_at_parent" })
  })

  it("a standalone (chord timeout) resolves to noop", () => {
    const ctx = createContext()
    expect(resolveKeybinding("a", {}, ctx)).toEqual({ commandId: "noop" })
  })

  describe("bare symbol shortcuts (convenience aliases)", () => {
    it("@ in node mode → add with targetId @ (same as a@)", () => {
      const ctx = createContext()
      expect(resolveKeybinding("@", {}, ctx)).toEqual({ commandId: "add", targetId: "@" })
      expect(resolveChord("a", "@", {}, ctx)).toEqual({ commandId: "add", targetId: "@" })
    })

    it("# in node mode → add with targetId # (same as a#)", () => {
      const ctx = createContext()
      expect(resolveKeybinding("#", {}, ctx)).toEqual({ commandId: "add", targetId: "#" })
      expect(resolveChord("a", "#", {}, ctx)).toEqual({ commandId: "add", targetId: "#" })
    })

    it("+ in node mode → add with targetId + (same as a+)", () => {
      const ctx = createContext()
      expect(resolveKeybinding("+", {}, ctx)).toEqual({ commandId: "add", targetId: "+" })
      expect(resolveChord("a", "+", {}, ctx)).toEqual({ commandId: "add", targetId: "+" })
    })

    it("[ in node mode → add with targetId [ (same as a[)", () => {
      const ctx = createContext()
      expect(resolveKeybinding("[", {}, ctx)).toEqual({ commandId: "add", targetId: "[" })
      expect(resolveChord("a", "[", {}, ctx)).toEqual({ commandId: "add", targetId: "[" })
    })

    it("bare symbols are blocked during text input", () => {
      const ctx = createContext({ textInputFocused: true, isInlineEditing: true })
      // All should resolve to noop (wildcard catch-all in inline-edit-barrier)
      expect(resolveKeybinding("@", {}, ctx)).toEqual({ commandId: "noop" })
      expect(resolveKeybinding("#", {}, ctx)).toEqual({ commandId: "noop" })
      expect(resolveKeybinding("+", {}, ctx)).toEqual({ commandId: "noop" })
      expect(resolveKeybinding("[", {}, ctx)).toEqual({ commandId: "noop" })
    })

    it("bare symbols are blocked when dialog is open", () => {
      const ctx = createContext({ searchDialogOpen: true })
      // Should not resolve to the add shortcut commands
      const addAt = { commandId: "add", targetId: "@" }
      const addHash = { commandId: "add", targetId: "#" }
      const addPlus = { commandId: "add", targetId: "+" }
      const addBracket = { commandId: "add", targetId: "[" }
      expect(resolveKeybinding("@", {}, ctx)).not.toEqual(addAt)
      expect(resolveKeybinding("#", {}, ctx)).not.toEqual(addHash)
      expect(resolveKeybinding("+", {}, ctx)).not.toEqual(addPlus)
      expect(resolveKeybinding("[", {}, ctx)).not.toEqual(addBracket)
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
      ["u", {}, "undo"],
      ["o", {}, "insert_below"],
      ["p", {}, "clipboard_paste"],
      ["d", {}, "clipboard_cut"],
      ["y", {}, "clipboard_copy"],
      ["c", {}, "capture_inbox"],
      ["z", {}, "zoom_inwards"],
    ])("%s (normally %s) is blocked in text mode", (key, mods, normalCmd) => {
      // Verify it works in node mode
      const result = resolveKeybinding(key, mods, nodeCtx)
      expect(result).not.toBeNull()
      expect(result!.commandId).toBe(normalCmd)
      // In text mode, it should resolve to noop (wildcard catch-all)
      expect(resolveKeybinding(key, mods, inlineCtx)).toEqual({ commandId: "noop" })
    })
  })

  describe("text-editing keys still work during inline editing", () => {
    it("Escape → text.exit_edit", () => {
      expect(resolveKeybinding("Escape", {}, inlineCtx)).toEqual({ commandId: "text.exit_edit" })
    })

    it("Enter → text.confirm", () => {
      expect(resolveKeybinding("Enter", {}, inlineCtx)).toEqual({ commandId: "text.confirm" })
    })

    it("Backspace → text.delete_backward", () => {
      expect(resolveKeybinding("Backspace", {}, inlineCtx)).toEqual({ commandId: "text.delete_backward" })
    })

    it("Delete → text.delete_forward", () => {
      expect(resolveKeybinding("Delete", {}, inlineCtx)).toEqual({ commandId: "text.delete_forward" })
    })

    it("ArrowLeft → text.cursor_left", () => {
      expect(resolveKeybinding("ArrowLeft", {}, inlineCtx)).toEqual({ commandId: "text.cursor_left" })
    })

    it("ArrowRight → text.cursor_right", () => {
      expect(resolveKeybinding("ArrowRight", {}, inlineCtx)).toEqual({ commandId: "text.cursor_right" })
    })

    it("ArrowUp → text.cursor_up", () => {
      expect(resolveKeybinding("ArrowUp", {}, inlineCtx)).toEqual({ commandId: "text.cursor_up" })
    })

    it("ArrowDown → text.cursor_down", () => {
      expect(resolveKeybinding("ArrowDown", {}, inlineCtx)).toEqual({ commandId: "text.cursor_down" })
    })

    it("Ctrl+a → text.cursor_start", () => {
      expect(resolveKeybinding("a", { ctrl: true }, inlineCtx)).toEqual({ commandId: "text.cursor_start" })
    })

    it("Ctrl+e → text.cursor_end", () => {
      expect(resolveKeybinding("e", { ctrl: true }, inlineCtx)).toEqual({ commandId: "text.cursor_end" })
    })

    it("Ctrl+w → text.delete_word", () => {
      expect(resolveKeybinding("w", { ctrl: true }, inlineCtx)).toEqual({ commandId: "text.delete_word" })
    })

    it("Ctrl+u → text.delete_to_start", () => {
      expect(resolveKeybinding("u", { ctrl: true }, inlineCtx)).toEqual({ commandId: "text.delete_to_start" })
    })

    it("Ctrl+k → text.delete_to_end", () => {
      expect(resolveKeybinding("k", { ctrl: true }, inlineCtx)).toEqual({ commandId: "text.delete_to_end" })
    })
  })

  describe("undo/redo work during inline editing", () => {
    it("Cmd+z → undo", () => {
      expect(resolveKeybinding("z", { cmd: true }, inlineCtx)).toEqual({ commandId: "undo" })
    })

    it("Cmd+Shift+z → redo", () => {
      expect(resolveKeybinding("z", { cmd: true, shift: true }, inlineCtx)).toEqual({ commandId: "redo" })
    })

    it("Ctrl+y → text.yank", () => {
      expect(resolveKeybinding("y", { ctrl: true }, inlineCtx)).toEqual({ commandId: "text.yank" })
    })
  })

  describe("Ctrl combos from node-mode are blocked during inline editing", () => {
    it("Ctrl+d (page down) is blocked", () => {
      expect(resolveKeybinding("d", { ctrl: true }, nodeCtx)).toEqual({ commandId: "page_down" })
      expect(resolveKeybinding("d", { ctrl: true }, inlineCtx)).toEqual({ commandId: "noop" })
    })

    it("Ctrl+j (sibling board next) is blocked", () => {
      expect(resolveKeybinding("j", { ctrl: true }, nodeCtx)).toEqual({ commandId: "sibling_board_next" })
      expect(resolveKeybinding("j", { ctrl: true }, inlineCtx)).toEqual({ commandId: "noop" })
    })

    it("Ctrl+i (toggle detail pane) is blocked", () => {
      expect(resolveKeybinding("i", { ctrl: true }, nodeCtx)).toEqual({ commandId: "toggle_detail_pane" })
      expect(resolveKeybinding("i", { ctrl: true }, inlineCtx)).toEqual({ commandId: "noop" })
    })
  })

  describe("Option+direction keys are blocked during inline editing", () => {
    it("Option+ArrowUp (shift up) is blocked", () => {
      expect(resolveKeybinding("ArrowUp", { opt: true }, nodeCtx)).toEqual({ commandId: "shift_up" })
      expect(resolveKeybinding("ArrowUp", { opt: true }, inlineCtx)).toEqual({ commandId: "noop" })
    })

    it("Option+ArrowDown (shift down) is blocked", () => {
      expect(resolveKeybinding("ArrowDown", { opt: true }, nodeCtx)).toEqual({ commandId: "shift_down" })
      expect(resolveKeybinding("ArrowDown", { opt: true }, inlineCtx)).toEqual({ commandId: "noop" })
    })
  })
})

describe("Cmd shortcuts (kitty protocol, cmd modifier)", () => {
  beforeEach(() => {
    clearKeybindings()
    initDefaultKeybindings()
  })

  // Helper for cmd modifier
  const sup = { cmd: true }

  describe("already-wired Cmd shortcuts", () => {
    it("Cmd+z → undo", () => {
      expectKey("z", "undo", sup)
    })

    it("Cmd+Shift+z → redo", () => {
      expectKey("z", "redo", { cmd: true, shift: true })
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
      expectKey("o", "open_in_terminal", { cmd: true, shift: true })
    })

    it("Cmd+n → capture_dialog (capture with dialog)", () => {
      expectKey("n", "capture_dialog", sup)
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
      expect(resolveKeybinding("b", sup, ctx)).toEqual({ commandId: "text.bold" })
    })

    it("Cmd+i → text.italic during inline editing", () => {
      const ctx = createContext({ isInlineEditing: true, textInputFocused: true })
      expect(resolveKeybinding("i", sup, ctx)).toEqual({ commandId: "text.italic" })
    })

    it("Cmd+b is not text.bold in node mode (no isInlineEditing)", () => {
      const ctx = createContext()
      expect(resolveKeybinding("b", sup, ctx)).not.toEqual({ commandId: "text.bold" })
    })

    it("Cmd+i is not text.italic in node mode (no isInlineEditing)", () => {
      const ctx = createContext()
      expect(resolveKeybinding("i", sup, ctx)).not.toEqual({ commandId: "text.italic" })
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

    it("Option+h/l still shift nodes (Alt fallback)", () => {
      expectKey("h", "shift_left", { opt: true })
      expectKey("l", "shift_right", { opt: true })
    })
  })
})
