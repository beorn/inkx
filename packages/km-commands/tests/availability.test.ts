/**
 * Phase 8 — Command availability via optional `when?: WhenPredicate`.
 *
 * `isCommandAvailable(def, ctx, mode?)` is the pre-filter the unified
 * omnibox, command palette, and (eventually) the keybinding resolver use
 * to hide commands that don't apply to the current context. Existing
 * commands without `when` and without `modes` are always available.
 */
import { describe, it, expect } from "vitest"
import { isCommandAvailable } from "../src/availability.ts"
import { hasCursor, textInputFocused, inMoveMode, and, not } from "../src/when.ts"
import type { CommandDef, KeybindingContext, KmOp } from "../src/index.ts"
// Smoke import — verifies the omnibox `default` command compiles cleanly
// alongside the optional `when` field on CommandDef.
import { omniboxCommands } from "../src/commands/omnibox.ts"

// --- Test helpers -----------------------------------------------------------

function createCtx(overrides?: Partial<KeybindingContext>): KeybindingContext {
  return {
    mode: "normal",
    hasMultiSelection: false,
    isInDetailPane: false,
    isInOutlineMode: false,
    isInlineEditing: false,
    currentNode: null,
    textInputFocused: false,
    searchDialogOpen: false,
    itemPickerOpen: false,
    newItemDialogOpen: false,
    datePromptOpen: false,
    filterDialogOpen: false,
    helpOverlayOpen: false,
    deleteConfirmOpen: false,
    consoleOpen: false,
    hasActiveToast: false,
    cursorAtStart: () => false,
    cursorAtEnd: () => true,
    hasVisibleChildren: () => false,
    editDepth: () => "card" as const,
    ...overrides,
  }
}

const noopExecute = (): KmOp | KmOp[] | null => null

function makeCmd(overrides: Partial<CommandDef>): CommandDef {
  return {
    id: "test_cmd",
    name: "Test",
    description: "A test command",
    category: "Navigation",
    execute: noopExecute,
    ...overrides,
  }
}

// --- Tests ------------------------------------------------------------------

describe("isCommandAvailable", () => {
  it("returns true for a command with no `when` and no `modes`", () => {
    const def = makeCmd({})
    expect(isCommandAvailable(def, createCtx())).toBe(true)
    expect(isCommandAvailable(def, createCtx(), "normal")).toBe(true)
    expect(isCommandAvailable(def, createCtx(), "move")).toBe(true)
  })

  it("hides commands gated on `hasCursor` when no cursor exists", () => {
    const def = makeCmd({ when: hasCursor })
    expect(isCommandAvailable(def, createCtx({ currentNode: null }))).toBe(false)
  })

  it("offers commands gated on `hasCursor` when a cursor is present", () => {
    const def = makeCmd({ when: hasCursor })
    // Minimal stub — the predicate only checks `currentNode != null`
    const fakeNode = { id: "n1" } as KeybindingContext["currentNode"]
    expect(isCommandAvailable(def, createCtx({ currentNode: fakeNode }))).toBe(true)
  })

  it("hides commands gated on `not(inMoveMode)` while in move mode", () => {
    const def = makeCmd({ when: not(inMoveMode) })
    expect(isCommandAvailable(def, createCtx({ mode: "move" }))).toBe(false)
    expect(isCommandAvailable(def, createCtx({ mode: "normal" }))).toBe(true)
  })

  it("composes `and(hasCursor, not(textInputFocused))` correctly", () => {
    const def = makeCmd({ when: and(hasCursor, not(textInputFocused)) })
    const fakeNode = { id: "n1" } as KeybindingContext["currentNode"]

    // No cursor → false
    expect(isCommandAvailable(def, createCtx({ currentNode: null }))).toBe(false)
    // Cursor + text input focused → false
    expect(isCommandAvailable(def, createCtx({ currentNode: fakeNode, textInputFocused: true }))).toBe(false)
    // Cursor + no text input → true
    expect(isCommandAvailable(def, createCtx({ currentNode: fakeNode, textInputFocused: false }))).toBe(true)
  })

  it("requires BOTH `modes` and `when` to pass when both are present", () => {
    const def = makeCmd({ modes: ["normal"], when: hasCursor })
    const fakeNode = { id: "n1" } as KeybindingContext["currentNode"]

    // Wrong mode, even with cursor → false
    expect(isCommandAvailable(def, createCtx({ currentNode: fakeNode, mode: "move" }), "move")).toBe(false)
    // Right mode, no cursor → false
    expect(isCommandAvailable(def, createCtx({ currentNode: null, mode: "normal" }), "normal")).toBe(false)
    // Right mode + cursor → true
    expect(isCommandAvailable(def, createCtx({ currentNode: fakeNode, mode: "normal" }), "normal")).toBe(true)
  })

  it("skips the `modes` gate when no `mode` argument is supplied", () => {
    // A surface that doesn't know the current mode (e.g., raw registry
    // listing) should not filter on modes — only on `when`.
    const def = makeCmd({ modes: ["normal"] })
    expect(isCommandAvailable(def, createCtx())).toBe(true)
  })

  it("smoke: omnibox `default` command compiles with optional `when`", () => {
    // Just verify the import resolves and the command exists. The point
    // is to exercise the Phase 8 type change against a real CommandDef.
    const def = omniboxCommands.find((c) => c.id === "default")
    expect(def).toBeDefined()
    // Default has no `when` set — should be available everywhere.
    expect(isCommandAvailable(def!, createCtx())).toBe(true)
  })
})
