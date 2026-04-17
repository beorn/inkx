/**
 * Omnibox command projection tests — covers projection, ranking, and
 * context-aware availability filtering.
 */
import { describe, expect, it } from "vitest"
import { allCommands } from "@km/commands"
import type { CommandDef, KeybindingContext } from "@km/commands"
import {
  commandResultsForOmnibox,
  filterAvailableCommands,
  projectCommands,
  rankCommands,
} from "../src/state/omnibox-projection.ts"

function findCmd(id: string): CommandDef | undefined {
  return allCommands.find((c) => c.id === id)
}

/**
 * Permissive keybinding context for tests. All flags false, no cursor,
 * so built-in predicates (`hasCursor`, `textInputFocused`, `inMoveMode`,
 * etc.) evaluate to their "neutral" values. Tests that care about a
 * specific predicate override the relevant field.
 */
function testCtx(overrides: Partial<KeybindingContext> = {}): KeybindingContext {
  return {
    currentNode: null,
    textInputFocused: false,
    mode: "normal",
    isInDetailPane: false,
    isInOutlineMode: false,
    hasMultiSelection: false,
    isInlineEditing: false,
    searchDialogOpen: false,
    itemPickerOpen: false,
    newItemDialogOpen: false,
    datePromptOpen: false,
    filterDialogOpen: false,
    helpOverlayOpen: false,
    deleteConfirmOpen: false,
    consoleOpen: false,
    hasActiveToast: false,
    visualMode: false,
    ...overrides,
  } as KeybindingContext
}

describe("projectCommands", () => {
  it("returns every supplied command as a row descriptor", () => {
    const rows = projectCommands(allCommands)
    expect(rows.length).toBe(allCommands.length)
  })

  it("every projected row carries kind='command'", () => {
    const rows = projectCommands(allCommands)
    for (const row of rows) {
      expect(row.kind).toBe("command")
    }
  })

  it("the new `default` command is present in allCommands", () => {
    const rows = projectCommands(allCommands)
    expect(rows.some((r) => r.id === "default" && r.kind === "command")).toBe(true)
  })
})

describe("default command", () => {
  it("exists in the allCommands export", () => {
    const def = findCmd("default")
    expect(def).toBeDefined()
    expect(def?.name).toMatch(/default/i)
    expect(def?.category).toBe("Navigation")
  })

  it("emits CURSOR_TO when ctx.targetId is set", () => {
    const def = findCmd("default")!
    const op = def.execute({
      currentNode: null,
      currentNodeId: null,
      selectedNodes: [],
      viewMode: "cards",
      siblingIndex: 0,
      siblingCount: 0,
      columnIndex: 0,
      columnCount: 0,
      moveMode: false,
      foldDepths: new Map(),
      targetId: "node-42",
    })
    expect(op).toEqual({ type: "CURSOR_TO", locationKey: "node-42" })
  })

  it("returns null when ctx.targetId is missing (no-op)", () => {
    const def = findCmd("default")!
    const op = def.execute({
      currentNode: null,
      currentNodeId: null,
      selectedNodes: [],
      viewMode: "cards",
      siblingIndex: 0,
      siblingCount: 0,
      columnIndex: 0,
      columnCount: 0,
      moveMode: false,
      foldDepths: new Map(),
    })
    expect(op).toBeNull()
  })
})

describe("filterAvailableCommands", () => {
  it("commands with no modes list and no when predicate are available in every mode", () => {
    const cmds = [{ id: "a", name: "A", description: "", category: "Navigation" as const, execute: () => null }]
    const ctx = testCtx()
    expect(filterAvailableCommands(cmds, ctx, "normal")).toHaveLength(1)
    expect(filterAvailableCommands(cmds, ctx, "move")).toHaveLength(1)
    expect(filterAvailableCommands(cmds, ctx, "search")).toHaveLength(1)
    expect(filterAvailableCommands(cmds, ctx, "input")).toHaveLength(1)
  })

  it("commands with a modes list are gated by that list", () => {
    const cmds = [
      {
        id: "m1",
        name: "Move only",
        description: "",
        category: "Edit" as const,
        modes: ["move" as const],
        execute: () => null,
      },
      {
        id: "a",
        name: "Always",
        description: "",
        category: "Navigation" as const,
        execute: () => null,
      },
    ]
    const ctx = testCtx()
    const inNormal = filterAvailableCommands(cmds, ctx, "normal")
    expect(inNormal.map((c) => c.id)).toEqual(["a"])
    const inMove = filterAvailableCommands(cmds, ctx, "move")
    expect(inMove.map((c) => c.id).sort()).toEqual(["a", "m1"])
  })
})

describe("rankCommands", () => {
  const cmds = [
    {
      id: "goto",
      name: "Go to",
      description: "Navigate to a board",
      category: "Navigation" as const,
      execute: () => null,
    },
    {
      id: "move",
      name: "Move",
      description: "Move selection to target",
      category: "Edit" as const,
      execute: () => null,
    },
    { id: "add", name: "Add", description: "Attach tag or link", category: "Edit" as const, execute: () => null },
  ]

  it("empty query returns input unchanged", () => {
    expect(rankCommands(cmds, "")).toEqual(cmds)
  })

  it("exact name match is top-ranked", () => {
    const ranked = rankCommands(cmds, "move")
    expect(ranked[0]?.id).toBe("move")
  })

  it("prefix on name beats description substring", () => {
    const ranked = rankCommands(cmds, "go")
    expect(ranked[0]?.id).toBe("goto")
  })

  it("non-matches are filtered out", () => {
    const ranked = rankCommands(cmds, "xyz")
    expect(ranked.length).toBe(0)
  })
})

describe("commandResultsForOmnibox", () => {
  it("empty query returns all available commands projected as rows", () => {
    const rows = commandResultsForOmnibox(allCommands, testCtx(), "", "normal")
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.kind).toBe("command")
    }
  })

  it("filters by query fuzzy match", () => {
    const rows = commandResultsForOmnibox(allCommands, testCtx(), "goto", "normal")
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]?.id).toBe("goto") // exact match top
  })
})
