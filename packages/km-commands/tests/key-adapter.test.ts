/**
 * Key Adapter Tests
 *
 * Tests for the key event to command system bridge.
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  initCommandSystem,
  keyToString,
  keyToModifiers,
  processKey,
  buildKeybindingContext,
  wouldHandleKey,
  type KeyEvent,
} from "../src/key-adapter.ts"
import type { CommandContext, TNode } from "../src/types.ts"
import { clearRegistry } from "../src/registry.ts"
import { clearKeybindings } from "../src/keybindings.ts"

// Helper to create minimal TNode for context
function createNode(id: string, opts?: Partial<TNode>): TNode {
  return {
    id,
    type: "h",
    item: true,
    parent_id: null,
    parent_idx: 0,
    embed_source: null,
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

// Helper to create minimal CommandContext
function createCommandContext(overrides?: Partial<CommandContext>): CommandContext {
  return {
    currentNode: null,
    currentNodeId: null,
    selectedNodes: [],
    viewMode: "cards",
    siblingCount: 0,
    siblingIndex: 0,
    columnIndex: 0,
    columnCount: 0,
    moveMode: false,
    foldDepths: new Map(),
    ...overrides,
  }
}

describe("keyToString", () => {
  it("converts arrow keys", () => {
    expect(keyToString("", { upArrow: true })).toBe("ArrowUp")
    expect(keyToString("", { downArrow: true })).toBe("ArrowDown")
    expect(keyToString("", { leftArrow: true })).toBe("ArrowLeft")
    expect(keyToString("", { rightArrow: true })).toBe("ArrowRight")
  })

  it("converts special keys", () => {
    expect(keyToString("", { return: true })).toBe("Enter")
    expect(keyToString("", { escape: true })).toBe("Escape")
    expect(keyToString("", { backspace: true })).toBe("Backspace")
    expect(keyToString("", { delete: true })).toBe("Delete")
    expect(keyToString("", { tab: true })).toBe("Tab")
  })

  it("returns input character for regular keys", () => {
    expect(keyToString("j", {})).toBe("j")
    expect(keyToString("k", {})).toBe("k")
    expect(keyToString("a", {})).toBe("a")
    expect(keyToString("G", {})).toBe("g")
    expect(keyToString("1", {})).toBe("1")
    expect(keyToString(" ", {})).toBe(" ")
  })

  it("prioritizes special key flags over input", () => {
    // If both enter flag and input are present, flag wins
    expect(keyToString("\r", { return: true })).toBe("Enter")
    expect(keyToString("\x1b", { escape: true })).toBe("Escape")
  })

  it("handles empty key event", () => {
    expect(keyToString("x", {})).toBe("x")
    expect(keyToString("", {})).toBe("")
  })
})

describe("keyToModifiers", () => {
  it("extracts ctrl modifier", () => {
    const result = keyToModifiers({ ctrl: true })
    expect(result.ctrl).toBe(true)
    expect(result.shift).toBe(false)

    expect(result.opt).toBe(false)
  })

  it("extracts shift modifier", () => {
    const result = keyToModifiers({ shift: true })
    expect(result.ctrl).toBe(false)
    expect(result.shift).toBe(true)

    expect(result.opt).toBe(false)
  })

  it("maps Ink meta to opt (Alt/Option on macOS)", () => {
    // In Ink/silvery, meta represents Alt/Option — mapped to opt
    const result = keyToModifiers({ meta: true })
    expect(result.ctrl).toBe(false)
    expect(result.shift).toBe(false)

    expect(result.opt).toBe(true)
  })

  it("handles multiple modifiers", () => {
    const result = keyToModifiers({ ctrl: true, shift: true })
    expect(result.ctrl).toBe(true)
    expect(result.shift).toBe(true)

    expect(result.opt).toBe(false)
  })

  it("handles all modifiers combined", () => {
    const result = keyToModifiers({ ctrl: true, shift: true, meta: true })
    expect(result.ctrl).toBe(true)
    expect(result.shift).toBe(true)

    expect(result.opt).toBe(true) // Ink meta maps to opt
  })

  it("handles empty key event", () => {
    const result = keyToModifiers({})
    expect(result.ctrl).toBe(false)
    expect(result.shift).toBe(false)

    expect(result.opt).toBe(false)
  })

  it("treats undefined as false", () => {
    const result = keyToModifiers({
      ctrl: undefined,
      shift: undefined,
      meta: undefined,
    } as KeyEvent)
    expect(result.ctrl).toBe(false)
    expect(result.shift).toBe(false)
  })
})

describe("buildKeybindingContext", () => {
  it("defaults to normal mode", () => {
    const ctx = buildKeybindingContext({})
    expect(ctx.mode).toBe("normal")
  })

  it("sets move mode when inMoveMode is true", () => {
    const ctx = buildKeybindingContext({ inMoveMode: true })
    expect(ctx.mode).toBe("move")
  })

  it("sets search mode when inSearchMode is true", () => {
    const ctx = buildKeybindingContext({ inSearchMode: true })
    expect(ctx.mode).toBe("search")
  })

  it("sets input mode when inInputMode is true", () => {
    const ctx = buildKeybindingContext({ inInputMode: true })
    expect(ctx.mode).toBe("input")
  })

  it("prioritizes move mode over search mode", () => {
    const ctx = buildKeybindingContext({
      inMoveMode: true,
      inSearchMode: true,
    })
    expect(ctx.mode).toBe("move")
  })

  it("prioritizes search mode over input mode", () => {
    const ctx = buildKeybindingContext({
      inSearchMode: true,
      inInputMode: true,
    })
    expect(ctx.mode).toBe("search")
  })

  it("passes through hasMultiSelection", () => {
    expect(buildKeybindingContext({ hasMultiSelection: true }).hasMultiSelection).toBe(true)
    expect(buildKeybindingContext({ hasMultiSelection: false }).hasMultiSelection).toBe(false)
    expect(buildKeybindingContext({}).hasMultiSelection).toBe(false)
  })

  it("passes through isInDetailPane", () => {
    expect(buildKeybindingContext({ isInDetailPane: true }).isInDetailPane).toBe(true)
    expect(buildKeybindingContext({ isInDetailPane: false }).isInDetailPane).toBe(false)
    expect(buildKeybindingContext({}).isInDetailPane).toBe(false)
  })

  it("passes through isInOutlineMode", () => {
    expect(buildKeybindingContext({ isInOutlineMode: true }).isInOutlineMode).toBe(true)
    expect(buildKeybindingContext({ isInOutlineMode: false }).isInOutlineMode).toBe(false)
    expect(buildKeybindingContext({}).isInOutlineMode).toBe(false)
  })

  it("passes through currentNode", () => {
    const node = createNode("test")
    expect(buildKeybindingContext({ currentNode: node }).currentNode).toBe(node)
    expect(buildKeybindingContext({ currentNode: null }).currentNode).toBeNull()
    expect(buildKeybindingContext({}).currentNode).toBeNull()
  })
})

describe("initCommandSystem", () => {
  beforeEach(() => {
    clearRegistry()
    clearKeybindings()
  })

  it("registers commands and keybindings", () => {
    initCommandSystem()

    // Verify a known command is registered by checking if it can be resolved
    const kbCtx = buildKeybindingContext({})
    const cmdCtx = createCommandContext()

    const result = processKey("j", {}, cmdCtx, kbCtx)
    expect(result.handled).toBe(true)
    expect(result.commandId).toBe("cursor_down")
  })

  it("can be called multiple times (idempotent)", () => {
    initCommandSystem()
    initCommandSystem()

    const kbCtx = buildKeybindingContext({})
    const cmdCtx = createCommandContext()

    const result = processKey("j", {}, cmdCtx, kbCtx)
    expect(result.handled).toBe(true)
  })
})

describe("processKey", () => {
  beforeEach(() => {
    clearRegistry()
    clearKeybindings()
    initCommandSystem()
  })

  it("processes simple key press and returns action", () => {
    const kbCtx = buildKeybindingContext({})
    const cmdCtx = createCommandContext({
      siblingCount: 2,
      siblingIndex: 0,
    })

    const result = processKey("j", {}, cmdCtx, kbCtx)

    expect(result.handled).toBe(true)
    expect(result.commandId).toBe("cursor_down")
    expect(result.actions).not.toBeNull()
  })

  it("returns handled=false for unknown keys", () => {
    const kbCtx = buildKeybindingContext({})
    const cmdCtx = createCommandContext()

    const result = processKey("~", {}, cmdCtx, kbCtx)

    expect(result.handled).toBe(false)
    expect(result.commandId).toBeNull()
    expect(result.actions).toBeNull()
  })

  it("processes arrow keys", () => {
    const kbCtx = buildKeybindingContext({})
    const cmdCtx = createCommandContext({
      siblingCount: 2,
      siblingIndex: 0,
    })

    const result = processKey("", { downArrow: true }, cmdCtx, kbCtx)

    expect(result.handled).toBe(true)
    // Per docs/06-ui.md: arrows use same commands as hjkl
    expect(result.commandId).toBe("cursor_down")
  })

  it("processes modifier keys", () => {
    const kbCtx = buildKeybindingContext({})
    const cmdCtx = createCommandContext()

    // Cmd+Z → undo (Ctrl+Z is reserved for SIGTSTP)
    const result = processKey("z", { super: true }, cmdCtx, kbCtx)

    expect(result.handled).toBe(true)
    expect(result.commandId).toBe("undo")
  })

  it("respects mode-specific keybindings", () => {
    const normalCtx = buildKeybindingContext({})
    const moveCtx = buildKeybindingContext({ inMoveMode: true })
    const cmdCtx = createCommandContext()

    // Enter in normal mode → enter_inline_edit
    const normalResult = processKey("", { return: true }, cmdCtx, normalCtx)
    expect(normalResult.commandId).toBe("enter_inline_edit")

    // Enter in move mode → confirm_move
    const moveResult = processKey("", { return: true }, cmdCtx, moveCtx)
    expect(moveResult.commandId).toBe("confirm_move")
  })

  it("processes Escape key", () => {
    const kbCtx = buildKeybindingContext({})
    const cmdCtx = createCommandContext()

    const result = processKey("", { escape: true }, cmdCtx, kbCtx)

    expect(result.handled).toBe(true)
    expect(result.commandId).toBe("close_or_quit")
  })

  it("inserts shifted punctuation character, not base key, when text editing", () => {
    // Simulates Shift+3 on legacy terminal: parseKey normalizes '#' → input='3', shift=true, text='#'
    const kbCtx = buildKeybindingContext({ textInputFocused: true })
    const cmdCtx = createCommandContext()

    const result = processKey("3", { shift: true, text: "#" }, cmdCtx, kbCtx)

    expect(result.handled).toBe(true)
    expect(result.commandId).toBe("text.insert")
    expect(result.actions).toEqual({ type: "TEXT_INSERT", char: "#" })
  })

  it("inserts correct char for ALL 21 shifted punctuation in text mode", () => {
    const kbCtx = buildKeybindingContext({ textInputFocused: true })
    const cmdCtx = createCommandContext()

    // All 21 US QWERTY shifted punctuation: [base key (normalized), shifted char (text)]
    const pairs: [string, string][] = [
      ["1", "!"],
      ["2", "@"],
      ["3", "#"],
      ["4", "$"],
      ["5", "%"],
      ["6", "^"],
      ["7", "&"],
      ["8", "*"],
      ["9", "("],
      ["0", ")"],
      ["-", "_"],
      ["=", "+"],
      ["`", "~"],
      ["[", "{"],
      ["]", "}"],
      ["\\", "|"],
      [";", ":"],
      ["'", '"'],
      [",", "<"],
      [".", ">"],
      ["/", "?"],
    ]

    for (const [base, shifted] of pairs) {
      const result = processKey(base, { shift: true, text: shifted }, cmdCtx, kbCtx)
      expect(result.commandId).toBe("text.insert")
      expect(result.actions).toEqual({ type: "TEXT_INSERT", char: shifted })
    }
  })

  it("inserts normal characters without text field", () => {
    // When key.text is not set, falls back to input
    const kbCtx = buildKeybindingContext({ textInputFocused: true })
    const cmdCtx = createCommandContext()

    const result = processKey("a", {}, cmdCtx, kbCtx)

    expect(result.handled).toBe(true)
    expect(result.commandId).toBe("text.insert")
    expect(result.actions).toEqual({ type: "TEXT_INSERT", char: "a" })
  })

  it("v starts chord, then c resolves to toggle_collapse", () => {
    const kbCtx = buildKeybindingContext({})
    const cmdCtx = createCommandContext()

    // Step 1: v should start a chord (pending) — v is a chord prefix for view/visual
    const r1 = processKey("v", {}, cmdCtx, kbCtx)
    expect(r1.handled).toBe(true)
    expect(r1.pending).toBe("v")

    // Step 2: c should resolve the chord to toggle_collapse
    const r2 = processKey("c", {}, cmdCtx, kbCtx)
    expect(r2.handled).toBe(true)
    expect(r2.commandId).toBe("toggle_collapse")
  })
})

describe("wouldHandleKey", () => {
  beforeEach(() => {
    clearRegistry()
    clearKeybindings()
    initCommandSystem()
  })

  it("returns true for registered keys", () => {
    const kbCtx = buildKeybindingContext({})

    expect(wouldHandleKey("j", {}, kbCtx)).toBe(true)
    expect(wouldHandleKey("k", {}, kbCtx)).toBe(true)
    expect(wouldHandleKey("", { escape: true }, kbCtx)).toBe(true)
    expect(wouldHandleKey("", { return: true }, kbCtx)).toBe(true)
  })

  it("returns false for unregistered keys", () => {
    const kbCtx = buildKeybindingContext({})

    // Use keys/combinations that are definitely not registered
    expect(wouldHandleKey("~", {}, kbCtx)).toBe(false)
    // Note: backtick IS now registered (console.toggle)
    // Note: } IS now registered (nav_forward per v2 spec)
  })

  it("respects modifiers", () => {
    const kbCtx = buildKeybindingContext({})

    // Cmd+Z is registered (undo) — Ctrl+Z is reserved for SIGTSTP
    expect(wouldHandleKey("z", { super: true }, kbCtx)).toBe(true)
    // Plain z is fold_all, so it IS registered
    expect(wouldHandleKey("z", {}, kbCtx)).toBe(true)
    // But Ctrl+Shift+Alt+z is not registered
    expect(wouldHandleKey("z", { ctrl: true, shift: true, meta: true }, kbCtx)).toBe(false)
  })

  it("respects mode context", () => {
    const normalCtx = buildKeybindingContext({})
    const moveCtx = buildKeybindingContext({ inMoveMode: true })

    // m starts move mode in normal mode
    expect(wouldHandleKey("m", {}, normalCtx)).toBe(true)

    // Escape cancels in move mode
    expect(wouldHandleKey("", { escape: true }, moveCtx)).toBe(true)
  })
})

/**
 * Shifted key dual-path tests.
 *
 * `input` from parseKey serves TWO purposes:
 *   1. Keybinding resolution: keyMap.get(input) finds the bucket (e.g., "/" for "shift-/")
 *   2. Text insertion fallback: when key.text is absent, input is inserted
 *
 * key.text serves ONE purpose:
 *   - The actual character to insert in text mode (e.g., "?" for Shift+/)
 *
 * These tests verify BOTH paths work correctly for shifted punctuation,
 * catching the regression where changing input for text insertion broke keybinding resolution.
 */
describe("shifted key dual-path: keybinding resolution AND text insertion", () => {
  beforeEach(() => {
    clearRegistry()
    clearKeybindings()
    initCommandSystem()
  })

  // All 21 US QWERTY shifted punctuation: [base key, shifted char]
  const SHIFTED_PAIRS: [string, string][] = [
    ["1", "!"],
    ["2", "@"],
    ["3", "#"],
    ["4", "$"],
    ["5", "%"],
    ["6", "^"],
    ["7", "&"],
    ["8", "*"],
    ["9", "("],
    ["0", ")"],
    ["-", "_"],
    ["=", "+"],
    ["`", "~"],
    ["[", "{"],
    ["]", "}"],
    ["\\", "|"],
    [";", ":"],
    ["'", '"'],
    [",", "<"],
    [".", ">"],
    ["/", "?"],
  ]

  describe("text insertion path: key.text is used, not input", () => {
    // Kitty protocol: input = base key (e.g., "/"), key.text = shifted char (e.g., "?")
    // Text mode should insert key.text, not input
    it.each(SHIFTED_PAIRS)("Shift+%s inserts '%s' in text mode (Kitty-style)", (base, shifted) => {
      const kbCtx = buildKeybindingContext({ textInputFocused: true })
      const cmdCtx = createCommandContext()

      // Simulates Kitty parseKey output: input=base, key.text=shifted, shift=true
      const result = processKey(base, { shift: true, text: shifted }, cmdCtx, kbCtx)

      expect(result.commandId).toBe("text.insert")
      expect(result.actions).toEqual({ type: "TEXT_INSERT", char: shifted })
    })
  })

  describe("keybinding resolution path: input (base key) is used for keyMap lookup", () => {
    // The critical regression test: Shift+/ must resolve to "show_help" (bound to "shift-/").
    // This requires input="/" so keyMap.get("/") finds the bucket, then shift=true matches.
    // If input were "?", keyMap.get("?") would miss the bucket entirely.
    it("Shift+/ resolves to show_help in normal mode", () => {
      const kbCtx = buildKeybindingContext({})
      const cmdCtx = createCommandContext()

      // Simulates Kitty parseKey output for Shift+/: input="/", shift=true, text="?"
      const result = processKey("/", { shift: true, text: "?" }, cmdCtx, kbCtx)

      expect(result.handled).toBe(true)
      expect(result.commandId).toBe("show_help")
    })

    it("Shift+/ resolves to noop during inline editing (wildcard catch-all)", () => {
      const kbCtx = buildKeybindingContext({ textInputFocused: true })
      const cmdCtx = createCommandContext()

      // In text mode, Shift+/ inserts "?" (caught by text insertion path above)
      const result = processKey("/", { shift: true, text: "?" }, cmdCtx, kbCtx)

      expect(result.commandId).toBe("text.insert")
      expect(result.actions).toEqual({ type: "TEXT_INSERT", char: "?" })
    })

    it("Shift+[ resolves to nav_back (bound to 'shift-[')", () => {
      const kbCtx = buildKeybindingContext({})
      const cmdCtx = createCommandContext()

      // Kitty Shift+[ → input="[", shift=true, text="{"
      // keyMap.get("[") finds bucket, shift=true matches "shift-["
      const result = processKey("[", { shift: true, text: "{" }, cmdCtx, kbCtx)

      expect(result.handled).toBe(true)
      expect(result.commandId).toBe("nav_back")
    })

    it("Shift+] resolves to nav_forward (bound to 'shift-]')", () => {
      const kbCtx = buildKeybindingContext({})
      const cmdCtx = createCommandContext()

      // Kitty Shift+] → input="]", shift=true, text="}"
      const result = processKey("]", { shift: true, text: "}" }, cmdCtx, kbCtx)

      expect(result.handled).toBe(true)
      expect(result.commandId).toBe("nav_forward")
    })
  })
})
