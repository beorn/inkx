/**
 * ViewNode Tree — Equivalence Tests
 *
 * Proves that buildViewTree (km-board) produces structurally equivalent
 * results to deriveColumnsFromRepo (km-tui). Both implementations are run
 * on the same repo data, and their outputs compared for structural agreement.
 */

import { describe, test, expect } from "vitest"
import type { KNode } from "@km/core"
import { createFakeRepo } from "@km/storage"
import { buildViewTree, toColumnViews, type ViewTreeRepo } from "@km/board"
import { deriveColumnsFromRepo } from "../src/hooks/use-columns.ts"

// =============================================================================
// Helpers
// =============================================================================

function heading(id: string, parentId: string | null, idx: number, overrides: Partial<KNode> = {}): KNode {
  return {
    id,
    type: "h",
    item: {},
    fstype: "mdsection",
    parent_id: parentId,
    parent_idx: idx,
    content: overrides.content ?? id,
    title: overrides.title ?? overrides.content ?? id,
    name: overrides.name ?? overrides.content ?? id,
    data: overrides.data ?? {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
    ...overrides,
  }
}

function paragraph(
  id: string,
  parentId: string | null,
  idx: number,
  content?: string,
  overrides: Partial<KNode> = {},
): KNode {
  return {
    id,
    type: "p",
    item: { list: "-" },
    parent_id: parentId,
    parent_idx: idx,
    content: content ?? id,
    data: overrides.data ?? {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
    ...overrides,
  }
}

function block(id: string, parentId: string | null, idx: number, content?: string): KNode {
  return {
    id,
    type: "p",
    parent_id: parentId,
    parent_idx: idx,
    content: content ?? id,
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
}

function asViewTreeRepo(repo: ReturnType<typeof createFakeRepo>): ViewTreeRepo {
  return {
    getNode: (id) => repo.getNode(id),
    getChildren: (pid) => repo.getChildren(pid),
    getNodesBatch: (ids) => repo.getNodesBatch(ids),
  }
}

// =============================================================================
// Equivalence tests
// =============================================================================

describe("buildViewTree equivalence with deriveColumnsFromRepo", () => {
  const emptyFoldDepths = new Map<string, number>()

  test("simple kanban board: same columns, same card IDs, same order", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col-todo", "root", 0, { content: "Todo" }),
      heading("col-done", "root", 1, { content: "Done" }),
      paragraph("t1", "col-todo", 0, "Task 1"),
      paragraph("t2", "col-todo", 1, "Task 2"),
      paragraph("t3", "col-todo", 2, "Task 3"),
      paragraph("d1", "col-done", 0, "Done 1"),
      paragraph("d2", "col-done", 1, "Done 2"),
    ]

    const repo = createFakeRepo({ nodes })
    const viewTreeRepo = asViewTreeRepo(repo)

    const columns = deriveColumnsFromRepo(repo, "root", emptyFoldDepths)
    const tree = buildViewTree(viewTreeRepo, "root", emptyFoldDepths)
    const treeColumns = toColumnViews(tree)

    expect(treeColumns.length).toBe(columns.length)
    expect(treeColumns.map((c) => c.nodeId)).toEqual(columns.map((c) => c.node.id))

    for (let i = 0; i < columns.length; i++) {
      const expectedCardIds = columns[i]!.cardNodes.map((c) => c.id)
      expect(treeColumns[i]!.cardIds).toEqual(expectedCardIds)
    }
  })

  test("board with body content: body column detected identically", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      block("desc1", "root", 0, "Description paragraph"),
      block("desc2", "root", 1, "More description"),
      heading("col1", "root", 2, { content: "Tasks" }),
      paragraph("t1", "col1", 0, "Task 1"),
    ]

    const repo = createFakeRepo({ nodes })
    const viewTreeRepo = asViewTreeRepo(repo)

    const columns = deriveColumnsFromRepo(repo, "root", emptyFoldDepths)
    const tree = buildViewTree(viewTreeRepo, "root", emptyFoldDepths)
    const treeColumns = toColumnViews(tree)

    expect(treeColumns.length).toBe(columns.length)
    expect(treeColumns[0]!.isVirtual).toBe(true)
    expect(columns[0]!.isVirtual).toBe(true)

    const expectedBodyIds = columns[0]!.cardNodes.map((c) => c.id)
    expect(treeColumns[0]!.cardIds).toEqual(expectedBodyIds)
    expect(treeColumns[1]!.nodeId).toBe(columns[1]!.node.id)
  })

  test("board with detail-only sections: excluded from both", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, { content: "Visible" }),
      paragraph("t1", "col1", 0, "Task"),
      heading("activity", "root", 1, { content: "Activity", name: "Activity" }),
      heading("comments", "root", 2, { content: "Comments", name: "Comments" }),
    ]

    const repo = createFakeRepo({ nodes })
    const viewTreeRepo = asViewTreeRepo(repo)

    const columns = deriveColumnsFromRepo(repo, "root", emptyFoldDepths)
    const tree = buildViewTree(viewTreeRepo, "root", emptyFoldDepths)
    const treeColumns = toColumnViews(tree)

    expect(treeColumns.length).toBe(columns.length)
    expect(treeColumns.length).toBe(1)
    expect(treeColumns[0]!.nodeId).toBe("col1")
  })

  test("board with embeds: embed resolution matches", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, { content: "Column" }),
      {
        ...paragraph("embed", "col1", 0, "Embedded"),
        embed_source: "target",
      },
      heading("target", null, 0, { content: "Target" }),
      paragraph("tc1", "target", 0, "Target child"),
    ]

    const repo = createFakeRepo({ nodes })
    const viewTreeRepo = asViewTreeRepo(repo)

    const columns = deriveColumnsFromRepo(repo, "root", emptyFoldDepths)
    const tree = buildViewTree(viewTreeRepo, "root", emptyFoldDepths)
    const treeColumns = toColumnViews(tree)

    expect(treeColumns.length).toBe(columns.length)
    expect(treeColumns[0]!.cardIds).toEqual(columns[0]!.cardNodes.map((c) => c.id))

    const embedCard = tree.children[0]!.children[0]!
    expect(embedCard.resolvedEmbed?.id).toBe("target")

    const colViewCard = columns[0]!.cardNodes[0]!
    expect(colViewCard.resolvedNode?.id).toBe("target")
  })

  test("empty root: both produce zero columns", () => {
    const nodes: KNode[] = [heading("root", null, 0)]

    const repo = createFakeRepo({ nodes })
    const viewTreeRepo = asViewTreeRepo(repo)

    const columns = deriveColumnsFromRepo(repo, "root", emptyFoldDepths)
    const tree = buildViewTree(viewTreeRepo, "root", emptyFoldDepths)
    const treeColumns = toColumnViews(tree)

    expect(treeColumns.length).toBe(0)
    expect(columns.length).toBe(0)
  })

  test("collapsed-but-not-detail columns: both include them", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("backlog", "root", 0, { content: "Backlog km.collapse:: true", name: "Backlog" }),
      paragraph("hidden", "backlog", 0, "Hidden task"),
      heading("active", "root", 1, { content: "Active" }),
      paragraph("visible", "active", 0, "Visible task"),
    ]

    const repo = createFakeRepo({ nodes })
    const viewTreeRepo = asViewTreeRepo(repo)

    const columns = deriveColumnsFromRepo(repo, "root", emptyFoldDepths)
    const tree = buildViewTree(viewTreeRepo, "root", emptyFoldDepths)
    const treeColumns = toColumnViews(tree)

    expect(treeColumns.length).toBe(columns.length)
    expect(treeColumns.length).toBe(2)
    expect(treeColumns[0]!.nodeId).toBe(columns[0]!.node.id)
    expect(treeColumns[1]!.nodeId).toBe(columns[1]!.node.id)
  })

  test("dedup by fs_path: both produce same deduped result", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      { ...heading("dup1", "root", 0, { content: "File" }), fs_path: "/test.md" },
      { ...heading("dup2", "root", 1, { content: "File" }), fs_path: "/test.md" },
      paragraph("c1", "dup1", 0, "Child1"),
      paragraph("c2", "dup1", 1, "Child2"),
      paragraph("c3", "dup2", 0, "Child3"),
    ]

    const repo = createFakeRepo({ nodes })
    const viewTreeRepo = asViewTreeRepo(repo)

    const columns = deriveColumnsFromRepo(repo, "root", emptyFoldDepths)
    const tree = buildViewTree(viewTreeRepo, "root", emptyFoldDepths)
    const treeColumns = toColumnViews(tree)

    expect(treeColumns.length).toBe(columns.length)
    expect(treeColumns.length).toBe(1)
    expect(treeColumns[0]!.nodeId).toBe(columns[0]!.node.id)
  })

  test("column with mixed body + structural cards: same order", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, { content: "Column" }),
      block("body1", "col1", 0, "Body text"),
      paragraph("body2", "col1", 1, "Body list item"),
      heading("section1", "col1", 2, { content: "Section 1" }),
      heading("section2", "col1", 3, { content: "Section 2" }),
    ]

    const repo = createFakeRepo({ nodes })
    const viewTreeRepo = asViewTreeRepo(repo)

    const columns = deriveColumnsFromRepo(repo, "root", emptyFoldDepths)
    const tree = buildViewTree(viewTreeRepo, "root", emptyFoldDepths)
    const treeColumns = toColumnViews(tree)

    expect(treeColumns.length).toBe(columns.length)
    const expectedIds = columns[0]!.cardNodes.map((c) => c.id)
    expect(treeColumns[0]!.cardIds).toEqual(expectedIds)
  })
})
