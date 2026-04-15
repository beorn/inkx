/**
 * Phase 4 tests — omnibox command projection + default command.
 */
import { describe, expect, it } from "vitest"
import { allCommands } from "@km/commands"
import type { CommandDef } from "@km/commands"
import {
  commandResultsForOmnibox,
  filterCommandsByMode,
  projectCommands,
  rankCommands,
} from "../src/state/omnibox-projection.ts"

function findCmd(id: string): CommandDef | undefined {
  return allCommands.find((c) => c.id === id)
}

describe("projectCommands", () => {
  it("returns every supplied command as a row descriptor", () => {
    const rows = projectCommands(allCommands)
    expect(rows.length).toBe(allCommands.length)
  })

  it("every projected row is in the cmd: namespace", () => {
    const rows = projectCommands(allCommands)
    for (const row of rows) {
      expect(row.id.startsWith("cmd:")).toBe(true)
    }
  })

  it("the new `default` command is present in allCommands", () => {
    const rows = projectCommands(allCommands)
    expect(rows.some((r) => r.id === "cmd:default")).toBe(true)
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

describe("filterCommandsByMode", () => {
  it("commands with no modes list are available in every mode", () => {
    const cmds = [
      { id: "a", name: "A", description: "", category: "Navigation" as const, execute: () => null },
    ]
    expect(filterCommandsByMode(cmds, "normal")).toHaveLength(1)
    expect(filterCommandsByMode(cmds, "move")).toHaveLength(1)
    expect(filterCommandsByMode(cmds, "search")).toHaveLength(1)
    expect(filterCommandsByMode(cmds, "input")).toHaveLength(1)
  })

  it("commands with modes list are gated by that list", () => {
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
    const inNormal = filterCommandsByMode(cmds, "normal")
    expect(inNormal.map((c) => c.id)).toEqual(["a"])
    const inMove = filterCommandsByMode(cmds, "move")
    expect(inMove.map((c) => c.id).sort()).toEqual(["a", "m1"])
  })
})

describe("rankCommands", () => {
  const cmds = [
    { id: "goto", name: "Go to", description: "Navigate to a board", category: "Navigation" as const, execute: () => null },
    { id: "move", name: "Move", description: "Move selection to target", category: "Edit" as const, execute: () => null },
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
  it("empty query returns all commands projected as rows", () => {
    const rows = commandResultsForOmnibox(allCommands, "", "normal")
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.id.startsWith("cmd:")).toBe(true)
    }
  })

  it("filters by query fuzzy match", () => {
    const rows = commandResultsForOmnibox(allCommands, "goto", "normal")
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]?.id).toBe("cmd:goto") // exact match top
  })
})
