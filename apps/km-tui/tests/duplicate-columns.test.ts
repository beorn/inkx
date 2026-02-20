/**
 * Duplicate Column Deduplication Tests
 *
 * Verifies that when the database contains duplicate nodes with the same
 * fs_path (e.g., from import bugs), deriveColumnsFromRepo produces only
 * one column per fs_path, keeping the one with more children.
 */

import { describe, test, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import type { KNode } from "@km/core"
import { deriveColumnsFromRepo } from "../src/hooks/use-columns.ts"

function makeNode(overrides: Partial<KNode> & { id: string; type: string }): KNode {
  return {
    parent_id: null,
    parent_idx: 0,
    content: "",
    data: {},
    link_to: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
    ...overrides,
  } as KNode
}

describe("duplicate column deduplication", () => {
  test("deduplicates columns with same fs_path, keeping the one with children", () => {
    // Simulate the Asana import bug: two oi nodes for @next.md,
    // one with children (populated) and one empty
    const root = makeNode({ id: "root", type: "oi", fstype: "repo", parent_id: null })
    const nextPopulated = makeNode({
      id: "next-1",
      type: "oi",
      fstype: "mdfile",
      parent_id: "root",
      parent_idx: 0,
      title: "Next Actions",
      fs_path: "@next.md",
      name: "@next",
    })
    const nextEmpty = makeNode({
      id: "next-2",
      type: "oi",
      fstype: "mdfile",
      parent_id: "root",
      parent_idx: 1,
      title: "Next Actions",
      fs_path: "@next.md",
      name: "@next",
    })
    const task1 = makeNode({
      id: "task-1",
      type: "li",
      parent_id: "next-1",
      parent_idx: 0,
      content: "Do something",
    })
    const task2 = makeNode({
      id: "task-2",
      type: "li",
      parent_id: "next-1",
      parent_idx: 1,
      content: "Do something else",
    })
    const otherCol = makeNode({
      id: "other-col",
      type: "oi",
      fstype: "mdfile",
      parent_id: "root",
      parent_idx: 2,
      title: "Other",
      fs_path: "other.md",
      name: "other",
    })

    const repo = createFakeRepo({
      nodes: [root, nextPopulated, nextEmpty, task1, task2, otherCol],
    })

    const columns = deriveColumnsFromRepo(repo, "root", new Set())

    // Should produce 2 columns (Next Actions + Other), NOT 3
    expect(columns.length).toBe(2)
    // The surviving column should be the populated one
    expect(columns[0]!.node.id).toBe("next-1")
    expect(columns[0]!.cardNodes.length).toBe(2)
    expect(columns[1]!.node.id).toBe("other-col")
  })

  test("deduplicates when empty column comes first", () => {
    const root = makeNode({ id: "root", type: "oi", fstype: "repo", parent_id: null })
    const nextEmpty = makeNode({
      id: "next-empty",
      type: "oi",
      fstype: "mdfile",
      parent_id: "root",
      parent_idx: 0,
      title: "Next Actions",
      fs_path: "@next.md",
      name: "@next",
    })
    const nextPopulated = makeNode({
      id: "next-pop",
      type: "oi",
      fstype: "mdfile",
      parent_id: "root",
      parent_idx: 1,
      title: "Next Actions",
      fs_path: "@next.md",
      name: "@next",
    })
    const task = makeNode({
      id: "task-1",
      type: "li",
      parent_id: "next-pop",
      parent_idx: 0,
      content: "Task",
    })

    const repo = createFakeRepo({
      nodes: [root, nextEmpty, nextPopulated, task],
    })

    const columns = deriveColumnsFromRepo(repo, "root", new Set())

    expect(columns.length).toBe(1)
    // Should keep the populated one regardless of order
    expect(columns[0]!.node.id).toBe("next-pop")
    expect(columns[0]!.cardNodes.length).toBe(1)
  })

  test("does not deduplicate nodes without fs_path", () => {
    const root = makeNode({ id: "root", type: "oi", fstype: "repo", parent_id: null })
    const col1 = makeNode({
      id: "col-1",
      type: "oi",
      fstype: "mdsection",
      parent_id: "root",
      parent_idx: 0,
      title: "Section A",
    })
    const col2 = makeNode({
      id: "col-2",
      type: "oi",
      fstype: "mdsection",
      parent_id: "root",
      parent_idx: 1,
      title: "Section A",
    })

    const repo = createFakeRepo({
      nodes: [root, col1, col2],
    })

    const columns = deriveColumnsFromRepo(repo, "root", new Set())

    // Both should remain — same title but no fs_path, so not duplicates
    expect(columns.length).toBe(2)
  })
})
