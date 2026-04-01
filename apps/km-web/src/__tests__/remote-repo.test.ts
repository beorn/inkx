import { describe, it, expect } from "vitest"
import { createNodeCache } from "../node-cache.ts"
import type { KNode } from "@km/core"

/** Tests for cache-backed operations matching remote-repo.ts logic */

function makeNode(overrides: Partial<KNode> & { id: string; parent_id: string }): KNode {
  return {
    type: "p",
    content: "",
    parent_idx: 0,
    created_at: 0,
    updated_at: 0,
    version: "1",
    data: {},
    ...overrides,
  } as KNode
}

const nodes = [
  makeNode({ id: "1", parent_id: ".", content: "Buy groceries", item: { task: { status: "todo", marker: "[ ]" } } }),
  makeNode({
    id: "2",
    parent_id: ".",
    content: "Fix login bug",
    title: "Login Bug",
    item: { task: { status: "wip", marker: "[/]" } },
  }),
  makeNode({ id: "3", parent_id: ".", content: "Write docs", item: { task: { status: "done", marker: "[x]" } } }),
  makeNode({ id: "4", parent_id: ".", content: "Meeting notes" }),
]
// Add name to node 4
;(nodes[3] as unknown as Record<string, unknown>).name = "meeting-notes.md"

function setup() {
  const cache = createNodeCache()
  cache.hydrate(nodes)
  return cache
}

describe("cache-backed search", () => {
  it("matches content case-insensitively", () => {
    const cache = setup()
    const results = cache.getAllNodes().filter((n) => n.content?.toLowerCase().includes("bug"))
    expect(results).toHaveLength(1)
    expect(results[0]!.id).toBe("2")
  })

  it("matches title", () => {
    const cache = setup()
    const results = cache
      .getAllNodes()
      .filter((n) => n.content?.toLowerCase().includes("login") || n.title?.toLowerCase().includes("login"))
    expect(results).toHaveLength(1)
    expect(results[0]!.id).toBe("2")
  })

  it("returns empty for no match", () => {
    const cache = setup()
    const results = cache.getAllNodes().filter((n) => n.content?.toLowerCase().includes("zzzzz"))
    expect(results).toHaveLength(0)
  })
})

describe("resolveByName", () => {
  it("finds node by name (case insensitive, strips .md)", () => {
    const cache = setup()
    const lower = "meeting-notes"
    const found = cache.getAllNodes().find((n) => {
      const name = (n as unknown as Record<string, unknown>).name as string | undefined
      return name?.toLowerCase().replace(/\.md$/i, "") === lower
    })
    expect(found?.id).toBe("4")
  })

  it("finds node with .md extension query", () => {
    const cache = setup()
    const query = "Meeting-Notes.md"
    const lower = query.toLowerCase().replace(/\.md$/i, "")
    const found = cache.getAllNodes().find((n) => {
      const name = (n as unknown as Record<string, unknown>).name as string | undefined
      return name?.toLowerCase().replace(/\.md$/i, "") === lower
    })
    expect(found?.id).toBe("4")
  })
})

describe("task filtering", () => {
  it("getAllTasks returns nodes with task_status", () => {
    const cache = setup()
    const tasks = cache.getAllNodes().filter((n) => n.item?.task?.status != null)
    expect(tasks).toHaveLength(3)
  })

  it("getTasksByStatus filters by status", () => {
    const cache = setup()
    const todo = cache.getAllNodes().filter((n) => n.item?.task?.status === "todo")
    expect(todo).toHaveLength(1)
    expect(todo[0]!.id).toBe("1")

    const done = cache.getAllNodes().filter((n) => n.item?.task?.status === "done")
    expect(done).toHaveLength(1)
    expect(done[0]!.id).toBe("3")
  })
})
