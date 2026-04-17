/**
 * Phase 3 tests — omnibox row adapters.
 */
import { describe, expect, it } from "vitest"
import type { CommandDef } from "@km/commands"
import type { KNode } from "@km/core"
import { commandToRow, nodeToRow } from "../src/views/omnibox-row-adapters.ts"

const fakeCommand: CommandDef = {
  id: "goto",
  name: "Go to",
  description: "Navigate to a node",
  category: "Navigation",
  execute: () => null,
}

function node(id: string, content: string, taskStatus?: string): KNode {
  return {
    id,
    content,
    ...(taskStatus && {
      item: { task: { status: taskStatus, marker: "- [ ]" } },
    }),
  } as unknown as KNode
}

describe("commandToRow", () => {
  it("maps CommandDef fields to row data", () => {
    const row = commandToRow(fakeCommand)
    expect(row.id).toBe("goto")
    expect(row.kind).toBe("command")
    expect(row.title).toBe("Go to")
    expect(row.context).toBe("Navigate to a node")
  })

  it("defaults hint to command category", () => {
    const row = commandToRow(fakeCommand)
    expect(row.hint).toBe("Navigation")
  })

  it("hint override wins over category", () => {
    const row = commandToRow(fakeCommand, { keybindingHint: "gg" })
    expect(row.hint).toBe("gg")
  })

  it("propagates isSelected and disabled flags", () => {
    const row = commandToRow(fakeCommand, { isSelected: true, disabled: true })
    expect(row.isSelected).toBe(true)
    expect(row.disabled).toBe(true)
  })

  it("sets kind='command' so the confirm handler can branch without parsing ids", () => {
    const row = commandToRow(fakeCommand)
    expect(row.kind).toBe("command")
  })
})

describe("nodeToRow", () => {
  it("maps node content to title", () => {
    const row = nodeToRow(node("n1", "Buy milk"))
    expect(row.id).toBe("n1")
    expect(row.kind).toBe("node")
    expect(row.title).toBe("Buy milk")
  })

  it("falls back to id when content missing", () => {
    const row = nodeToRow({ id: "n2" } as KNode)
    expect(row.title).toBe("n2")
  })

  it("surfaces task-status icon for task nodes", () => {
    const row = nodeToRow(node("t1", "Fix bug", "wip"))
    expect(row.icon.length).toBeGreaterThan(0)
    expect(row.iconColor).toBeDefined()
  })

  it("passes parentContext through", () => {
    const row = nodeToRow(node("n1", "Buy milk"), { parentContext: "Shopping" })
    expect(row.context).toBe("Shopping")
  })

  it("passes hint through (e.g. 'recent', 'favorite')", () => {
    const row = nodeToRow(node("n1", "Buy milk"), { hint: "recent" })
    expect(row.hint).toBe("recent")
  })

  it("sets kind='node' so the confirm handler can branch without parsing ids", () => {
    const row = nodeToRow(node("n1", "foo"))
    expect(row.kind).toBe("node")
  })
})

describe("adapter kind discriminator", () => {
  it("command and node rows can share the same underlying id — `kind` disambiguates", () => {
    const cmdRow = commandToRow({ ...fakeCommand, id: "inbox" })
    const nodeRow = nodeToRow(node("inbox", "Inbox"))
    expect(cmdRow.id).toBe("inbox")
    expect(nodeRow.id).toBe("inbox")
    // Underlying ids collide — that's fine because consumers branch on kind.
    expect(cmdRow.kind).toBe("command")
    expect(nodeRow.kind).toBe("node")
  })
})
