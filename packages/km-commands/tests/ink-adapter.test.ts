/**
 * Ink Adapter Tests
 *
 * Tests for the Ink key event to command system bridge.
 */

import { describe, it, expect, beforeEach } from "vitest"
import {
  initCommandSystem,
  inkKeyToString,
  inkKeyToModifiers,
  processInkKey,
  buildKeybindingContext,
  wouldHandleKey,
  type InkKeyEvent,
} from "../src/ink-adapter.ts"
import type { CommandContext, TNode } from "../src/types.ts"
import { clearRegistry } from "../src/registry.ts"
import { clearKeybindings } from "../src/keybindings.ts"

// Helper to create minimal TNode for context
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

// Helper to create minimal CommandContext
function createCommandContext(
  overrides?: Partial<CommandContext>,
): CommandContext {
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
    foldedNodes: new Set(),
    ...overrides,
  }
}

describe("inkKeyToString", () => {
  it("converts arrow keys", () => {
    expect(inkKeyToString("", { upArrow: true })).toBe("ArrowUp")
    expect(inkKeyToString("", { downArrow: true })).toBe("ArrowDown")
    expect(inkKeyToString("", { leftArrow: true })).toBe("ArrowLeft")
    expect(inkKeyToString("", { rightArrow: true })).toBe("ArrowRight")
  })

  it("converts special keys", () => {
    expect(inkKeyToString("", { return: true })).toBe("Enter")
    expect(inkKeyToString("", { escape: true })).toBe("Escape")
    expect(inkKeyToString("", { backspace: true })).toBe("Backspace")
    expect(inkKeyToString("", { delete: true })).toBe("Delete")
    expect(inkKeyToString("", { tab: true })).toBe("Tab")
  })

  it("returns input character for regular keys", () => {
    expect(inkKeyToString("j", {})).toBe("j")
    expect(inkKeyToString("k", {})).toBe("k")
    expect(inkKeyToString("a", {})).toBe("a")
    expect(inkKeyToString("G", {})).toBe("G")
    expect(inkKeyToString("1", {})).toBe("1")
    expect(inkKeyToString(" ", {})).toBe(" ")
  })

  it("prioritizes special key flags over input", () => {
    // If both enter flag and input are present, flag wins
    expect(inkKeyToString("\r", { return: true })).toBe("Enter")
    expect(inkKeyToString("\x1b", { escape: true })).toBe("Escape")
  })

  it("handles empty key event", () => {
    expect(inkKeyToString("x", {})).toBe("x")
    expect(inkKeyToString("", {})).toBe("")
  })
})

describe("inkKeyToModifiers", () => {
  it("extracts ctrl modifier", () => {
    const result = inkKeyToModifiers({ ctrl: true })
    expect(result.ctrl).toBe(true)
    expect(result.shift).toBe(false)
    expect(result.alt).toBe(false)
    expect(result.meta).toBe(false)
  })

  it("extracts shift modifier", () => {
    const result = inkKeyToModifiers({ shift: true })
    expect(result.ctrl).toBe(false)
    expect(result.shift).toBe(true)
    expect(result.alt).toBe(false)
    expect(result.meta).toBe(false)
  })

  it("maps Ink meta to meta (Alt/Option on macOS)", () => {
    // In Ink/inkx, meta represents Alt/Option — pass through as meta
    const result = inkKeyToModifiers({ meta: true })
    expect(result.ctrl).toBe(false)
    expect(result.shift).toBe(false)
    expect(result.alt).toBe(false)
    expect(result.meta).toBe(true)
  })

  it("handles multiple modifiers", () => {
    const result = inkKeyToModifiers({ ctrl: true, shift: true })
    expect(result.ctrl).toBe(true)
    expect(result.shift).toBe(true)
    expect(result.alt).toBe(false)
    expect(result.meta).toBe(false)
  })

  it("handles all modifiers combined", () => {
    const result = inkKeyToModifiers({ ctrl: true, shift: true, meta: true })
    expect(result.ctrl).toBe(true)
    expect(result.shift).toBe(true)
    expect(result.alt).toBe(false)
    expect(result.meta).toBe(true) // Ink meta passes through
  })

  it("handles empty key event", () => {
    const result = inkKeyToModifiers({})
    expect(result.ctrl).toBe(false)
    expect(result.shift).toBe(false)
    expect(result.alt).toBe(false)
    expect(result.meta).toBe(false)
  })

  it("treats undefined as false", () => {
    const result = inkKeyToModifiers({
      ctrl: undefined,
      shift: undefined,
      meta: undefined,
    } as InkKeyEvent)
    expect(result.ctrl).toBe(false)
    expect(result.shift).toBe(false)
    expect(result.alt).toBe(false)
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

  it("passes through hasSelection", () => {
    expect(buildKeybindingContext({ hasSelection: true }).hasSelection).toBe(
      true,
    )
    expect(buildKeybindingContext({ hasSelection: false }).hasSelection).toBe(
      false,
    )
    expect(buildKeybindingContext({}).hasSelection).toBe(false)
  })

  it("passes through isInDetailPane", () => {
    expect(
      buildKeybindingContext({ isInDetailPane: true }).isInDetailPane,
    ).toBe(true)
    expect(
      buildKeybindingContext({ isInDetailPane: false }).isInDetailPane,
    ).toBe(false)
    expect(buildKeybindingContext({}).isInDetailPane).toBe(false)
  })

  it("passes through isInOutlineMode", () => {
    expect(
      buildKeybindingContext({ isInOutlineMode: true }).isInOutlineMode,
    ).toBe(true)
    expect(
      buildKeybindingContext({ isInOutlineMode: false }).isInOutlineMode,
    ).toBe(false)
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

    const result = processInkKey("j", {}, cmdCtx, kbCtx)
    expect(result.handled).toBe(true)
    expect(result.commandId).toBe("cursor_down")
  })

  it("can be called multiple times (idempotent)", () => {
    initCommandSystem()
    initCommandSystem()

    const kbCtx = buildKeybindingContext({})
    const cmdCtx = createCommandContext()

    const result = processInkKey("j", {}, cmdCtx, kbCtx)
    expect(result.handled).toBe(true)
  })
})

describe("processInkKey", () => {
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

    const result = processInkKey("j", {}, cmdCtx, kbCtx)

    expect(result.handled).toBe(true)
    expect(result.commandId).toBe("cursor_down")
    expect(result.actions).not.toBeNull()
  })

  it("returns handled=false for unknown keys", () => {
    const kbCtx = buildKeybindingContext({})
    const cmdCtx = createCommandContext()

    const result = processInkKey("~", {}, cmdCtx, kbCtx)

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

    const result = processInkKey("", { downArrow: true }, cmdCtx, kbCtx)

    expect(result.handled).toBe(true)
    // Per docs/06-ui.md: arrows use same commands as hjkl
    expect(result.commandId).toBe("cursor_down")
  })

  it("processes modifier keys", () => {
    const kbCtx = buildKeybindingContext({})
    const cmdCtx = createCommandContext()

    const result = processInkKey("z", { ctrl: true }, cmdCtx, kbCtx)

    expect(result.handled).toBe(true)
    expect(result.commandId).toBe("undo")
  })

  it("respects mode-specific keybindings", () => {
    const normalCtx = buildKeybindingContext({})
    const moveCtx = buildKeybindingContext({ inMoveMode: true })
    const cmdCtx = createCommandContext()

    // Enter in normal mode → enter_inline_edit
    const normalResult = processInkKey("", { return: true }, cmdCtx, normalCtx)
    expect(normalResult.commandId).toBe("enter_inline_edit")

    // Enter in move mode → confirm_move
    const moveResult = processInkKey("", { return: true }, cmdCtx, moveCtx)
    expect(moveResult.commandId).toBe("confirm_move")
  })

  it("processes Escape key", () => {
    const kbCtx = buildKeybindingContext({})
    const cmdCtx = createCommandContext()

    const result = processInkKey("", { escape: true }, cmdCtx, kbCtx)

    expect(result.handled).toBe(true)
    expect(result.commandId).toBe("close_or_quit")
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
    expect(wouldHandleKey("`", {}, kbCtx)).toBe(false)
    expect(wouldHandleKey("}", {}, kbCtx)).toBe(false)
  })

  it("respects modifiers", () => {
    const kbCtx = buildKeybindingContext({})

    // Ctrl+Z is registered (undo)
    expect(wouldHandleKey("z", { ctrl: true }, kbCtx)).toBe(true)
    // Plain z is fold_all, so it IS registered
    expect(wouldHandleKey("z", {}, kbCtx)).toBe(true)
    // But Ctrl+Shift+Alt+z is not registered
    expect(
      wouldHandleKey("z", { ctrl: true, shift: true, meta: true }, kbCtx),
    ).toBe(false)
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
