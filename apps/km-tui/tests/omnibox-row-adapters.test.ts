/**
 * Phase 3 tests — omnibox row adapters.
 */
import { describe, expect, it } from "vitest"
import type { CommandDef } from "@km/commands"
import type { KNode } from "@km/core"
import {
  commandToRow,
  favoriteToRow,
  nodeToRow,
} from "../src/views/omnibox-row-adapters.ts"

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
    expect(row.id).toBe("cmd:goto")
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

  it("uses cmd: id namespace to avoid collision with nodes", () => {
    const row = commandToRow(fakeCommand)
    expect(row.id.startsWith("cmd:")).toBe(true)
  })
})

describe("nodeToRow", () => {
  it("maps node content to title", () => {
    const row = nodeToRow(node("n1", "Buy milk"))
    expect(row.id).toBe("node:n1")
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

  it("uses node: id namespace to avoid collision with commands", () => {
    const row = nodeToRow(node("n1", "foo"))
    expect(row.id.startsWith("node:")).toBe(true)
  })
})

describe("favoriteToRow", () => {
  it("composes node data + key hint", () => {
    const row = favoriteToRow("i", node("inbox", "Inbox"))
    expect(row.id).toBe("fav:i")
    expect(row.title).toBe("Inbox")
    expect(row.hint).toBe("I")
  })

  it("uppercases the key for display", () => {
    const row = favoriteToRow("a", node("a", "Archive"))
    expect(row.hint).toBe("A")
  })
})

describe("adapter collision safety", () => {
  it("command ids and node ids cannot collide even when the underlying ID matches", () => {
    const cmdRow = commandToRow({ ...fakeCommand, id: "inbox" })
    const nodeRow = nodeToRow(node("inbox", "Inbox"))
    expect(cmdRow.id).toBe("cmd:inbox")
    expect(nodeRow.id).toBe("node:inbox")
    expect(cmdRow.id).not.toBe(nodeRow.id)
  })
})
