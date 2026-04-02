/**
 * ViewNode Tree — Unit Tests
 *
 * Tests buildViewTree with a mock repo (in-memory Maps).
 * Verifies role assignment, body detection, embeds, collapse, dedup,
 * traversal utilities, and cursor path derivation.
 */

import { describe, test, expect } from "vitest"
import type { KNode } from "@km/core"
import {
  buildViewTree,
  buildViewIndex,
  dfsTraversal,
  deriveCursorPath,
  toColumnViews,
  type ViewTreeRepo,
  type ViewNode,
} from "../src/view-tree.ts"

// =============================================================================
// Mock Repo
// =============================================================================

function createMockRepo(nodes: KNode[]): ViewTreeRepo {
  const nodeMap = new Map<string, KNode>()
  for (const n of nodes) nodeMap.set(n.id, n)

  return {
    getNode(id: string) {
      return nodeMap.get(id) ?? null
    },
    getChildren(parentId: string | null) {
      return nodes
        .filter((n) => n.parent_id === parentId)
        .sort((a, b) => a.parent_idx - b.parent_idx)
    },
    getNodesBatch(ids: string[]) {
      const result = new Map<string, KNode>()
      for (const id of ids) {
        const n = nodeMap.get(id)
        if (n) result.set(id, n)
      }
      return result
    },
  }
}

/** Shorthand: create an outline item (heading) node */
function heading(id: string, parentId: string | null, idx: number, content?: string): KNode {
  return {
    id,
    type: "h",
    item: {},
    fstype: "mdsection",
    parent_id: parentId,
    parent_idx: idx,
    content: content ?? id,
    title: content ?? id,
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
}

/** Shorthand: create a paragraph / list item node */
function paragraph(id: string, parentId: string | null, idx: number, content?: string): KNode {
  return {
    id,
    type: "p",
    item: { list: "-" },
    parent_id: parentId,
    parent_idx: idx,
    content: content ?? id,
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
}

/** Shorthand: create a plain block (no item) node */
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

// =============================================================================
// Tests
// =============================================================================

describe("buildViewTree", () => {
  const emptyFoldDepths = new Map<string, number>()

  test("simple tree: root → 2 columns → 3 cards each → subitems", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Todo"),
      heading("col2", "root", 1, "Done"),
      paragraph("c1a", "col1", 0, "Task 1"),
      paragraph("c1b", "col1", 1, "Task 2"),
      paragraph("c1c", "col1", 2, "Task 3"),
      paragraph("c2a", "col2", 0, "Task 4"),
      paragraph("c2b", "col2", 1, "Task 5"),
      paragraph("c2c", "col2", 2, "Task 6"),
      // Subitems under c1a
      paragraph("s1", "c1a", 0, "Sub 1"),
      paragraph("s2", "c1a", 1, "Sub 2"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    expect(tree.role).toBe("board")
    expect(tree.id).toBe("root")
    expect(tree.children).toHaveLength(2)

    const col1 = tree.children[0]!
    const col2 = tree.children[1]!
    expect(col1.role).toBe("column")
    expect(col1.id).toBe("col1")
    expect(col1.children).toHaveLength(3)

    expect(col2.role).toBe("column")
    expect(col2.id).toBe("col2")
    expect(col2.children).toHaveLength(3)

    // Cards
    for (const card of col1.children) {
      expect(card.role).toBe("card")
      expect(card.parent).toBe(col1)
    }

    // Subitems under first card
    const card1 = col1.children[0]!
    expect(card1.children).toHaveLength(2)
    expect(card1.children[0]!.role).toBe("subitem")
    expect(card1.children[0]!.id).toBe("s1")
    expect(card1.children[1]!.role).toBe("subitem")
  })

  test("body content: paragraphs before first heading create virtual body-column", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      block("p1", "root", 0, "Description text"),
      block("p2", "root", 1, "More description"),
      heading("col1", "root", 2, "Tasks"),
      paragraph("c1", "col1", 0, "Task 1"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    expect(tree.children).toHaveLength(2) // body-column + col1

    const bodyCol = tree.children[0]!
    expect(bodyCol.role).toBe("body-column")
    expect(bodyCol.id).toBe("__body__root")
    expect(bodyCol.node).not.toBeNull()
    expect(bodyCol.children).toHaveLength(2)
    expect(bodyCol.children[0]!.role).toBe("card")
    expect(bodyCol.children[0]!.isBody).toBe(true)

    const col1 = tree.children[1]!
    expect(col1.role).toBe("column")
    expect(col1.id).toBe("col1")
  })

  test("embeds: card with embed_source has resolvedEmbed, children from target", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Column"),
      { ...paragraph("embed-card", "col1", 0, "Embed"), embed_source: "target" },
      heading("target", null, 0, "Target Node"),
      paragraph("target-child1", "target", 0, "Target Child 1"),
      paragraph("target-child2", "target", 1, "Target Child 2"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    const col = tree.children[0]!
    const embedCard = col.children[0]!
    expect(embedCard.resolvedEmbed).toBeDefined()
    expect(embedCard.resolvedEmbed!.id).toBe("target")
    // Children come from the resolved target
    expect(embedCard.children).toHaveLength(2)
    expect(embedCard.children[0]!.id).toBe("target-child1")
  })

  test("collapsed columns: km.collapse:: true → included but empty children", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      {
        ...heading("col-collapsed", "root", 0, "Backlog km.collapse:: true"),
        // No pre-parsed rules — will be parsed from content
      },
      paragraph("c1", "col-collapsed", 0, "Hidden task"),
      heading("col-open", "root", 1, "Open"),
      paragraph("c2", "col-open", 0, "Visible task"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    expect(tree.children).toHaveLength(2)
    const collapsed = tree.children[0]!
    expect(collapsed.role).toBe("column")
    expect(collapsed.id).toBe("col-collapsed")
    expect(collapsed.children).toHaveLength(0) // Collapsed = no children

    const open = tree.children[1]!
    expect(open.children).toHaveLength(1)
  })

  test("detail-only: nodes with detailOnly flag are excluded", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Visible"),
      { ...heading("detail-col", "root", 1, "Hidden"), data: { detailOnly: true } },
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    expect(tree.children).toHaveLength(1)
    expect(tree.children[0]!.id).toBe("col1")
  })

  test("well-known metadata sections (Activity/Comments/Attachments) are excluded", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Tasks"),
      heading("activity", "root", 1, "Activity"),
      heading("comments", "root", 2, "Comments"),
      heading("attachments", "root", 3, "Attachments"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    expect(tree.children).toHaveLength(1)
    expect(tree.children[0]!.id).toBe("col1")
  })

  test("empty tree: no children → tree has only board root", () => {
    const nodes: KNode[] = [heading("root", null, 0)]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    expect(tree.role).toBe("board")
    expect(tree.children).toHaveLength(0)
  })

  test("deep nesting: card → subitem → subitem → subitem all get role 'subitem'", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col", "root", 0),
      paragraph("card", "col", 0, "Card"),
      paragraph("sub1", "card", 0, "Sub 1"),
      paragraph("sub2", "sub1", 0, "Sub 2"),
      paragraph("sub3", "sub2", 0, "Sub 3"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    const col = tree.children[0]!
    const card = col.children[0]!
    expect(card.role).toBe("card")

    const sub1 = card.children[0]!
    expect(sub1.role).toBe("subitem")

    const sub2 = sub1.children[0]!
    expect(sub2.role).toBe("subitem")

    const sub3 = sub2.children[0]!
    expect(sub3.role).toBe("subitem")
  })

  test("dedup by fs_path: keeps node with more children", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      { ...heading("dup1", "root", 0, "File"), fs_path: "/test/file.md" },
      { ...heading("dup2", "root", 1, "File"), fs_path: "/test/file.md" },
      paragraph("c1", "dup1", 0, "Child1"),
      paragraph("c2", "dup1", 1, "Child2"),
      paragraph("c3", "dup2", 0, "Child3"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    // dup1 has 2 children, dup2 has 1 → dup1 wins
    expect(tree.children).toHaveLength(1)
    expect(tree.children[0]!.id).toBe("dup1")
    expect(tree.children[0]!.children).toHaveLength(2)
  })

  test("null rootId produces a board with __root__ id", () => {
    const nodes: KNode[] = [
      heading("col1", null, 0, "Column 1"),
      paragraph("c1", "col1", 0, "Task 1"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, null, emptyFoldDepths)

    expect(tree.id).toBe("__root__")
    expect(tree.role).toBe("board")
    expect(tree.node).toBeNull()
    expect(tree.children).toHaveLength(1)
  })

  test("body column with null root uses __body__root id", () => {
    const nodes: KNode[] = [
      block("p1", null, 0, "Description"),
      heading("col1", null, 1, "Column"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, null, emptyFoldDepths)

    expect(tree.children[0]!.id).toBe("__body__root")
    expect(tree.children[0]!.role).toBe("body-column")
  })

  test("body cards that are collapsed are excluded from body column", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      {
        ...block("p-collapsed", "root", 0, "Collapsed km.collapse:: true"),
      },
      block("p-visible", "root", 1, "Visible paragraph"),
      heading("col1", "root", 2, "Column"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    // Only the visible paragraph should appear in the body column
    const bodyCol = tree.children[0]!
    expect(bodyCol.role).toBe("body-column")
    expect(bodyCol.children).toHaveLength(1)
    expect(bodyCol.children[0]!.id).toBe("p-visible")
  })

  test("empty content paragraphs are excluded from body", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      block("p-empty", "root", 0, ""),
      block("p-whitespace", "root", 1, "   "),
      block("p-visible", "root", 2, "Has content"),
      heading("col1", "root", 3, "Column"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    const bodyCol = tree.children[0]!
    expect(bodyCol.role).toBe("body-column")
    expect(bodyCol.children).toHaveLength(1)
    expect(bodyCol.children[0]!.id).toBe("p-visible")
  })

  test("parent pointers are correctly set throughout the tree", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col", "root", 0),
      paragraph("card", "col", 0, "Card"),
      paragraph("sub", "card", 0, "Sub"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    expect(tree.parent).toBeNull()

    const col = tree.children[0]!
    expect(col.parent).toBe(tree)

    const card = col.children[0]!
    expect(card.parent).toBe(col)

    const sub = card.children[0]!
    expect(sub.parent).toBe(card)
  })
})

describe("buildViewIndex", () => {
  test("indexes all nodes by id for O(1) lookup", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col", "root", 0),
      paragraph("card", "col", 0, "Card"),
      paragraph("sub", "card", 0, "Sub"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", new Map())
    const index = buildViewIndex(tree)

    expect(index.size).toBe(4) // root + col + card + sub
    expect(index.get("root")?.role).toBe("board")
    expect(index.get("col")?.role).toBe("column")
    expect(index.get("card")?.role).toBe("card")
    expect(index.get("sub")?.role).toBe("subitem")
  })
})

describe("dfsTraversal", () => {
  test("yields nodes in top-to-bottom, left-to-right visual order", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "First"),
      heading("col2", "root", 1, "Second"),
      paragraph("c1a", "col1", 0, "Card 1A"),
      paragraph("c1b", "col1", 1, "Card 1B"),
      paragraph("c2a", "col2", 0, "Card 2A"),
      paragraph("sub1", "c1a", 0, "Sub under 1A"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", new Map())

    const ids = [...dfsTraversal(tree)].map((n) => n.id)
    expect(ids).toEqual(["root", "col1", "c1a", "sub1", "c1b", "col2", "c2a"])
  })
})

describe("deriveCursorPath", () => {
  test("returns path from root to target node", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col", "root", 0),
      paragraph("card", "col", 0, "Card"),
      paragraph("sub", "card", 0, "Sub"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", new Map())
    const index = buildViewIndex(tree)

    const path = deriveCursorPath(index, "sub")
    expect(path).toEqual(["col", "card", "sub"])
  })

  test("returns [columnId, cardId] for a card", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col", "root", 0),
      paragraph("card", "col", 0, "Card"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", new Map())
    const index = buildViewIndex(tree)

    expect(deriveCursorPath(index, "card")).toEqual(["col", "card"])
  })

  test("returns [columnId] for a column", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col", "root", 0),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", new Map())
    const index = buildViewIndex(tree)

    expect(deriveCursorPath(index, "col")).toEqual(["col"])
  })

  test("returns empty array for unknown node", () => {
    const nodes: KNode[] = [heading("root", null, 0)]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", new Map())
    const index = buildViewIndex(tree)

    expect(deriveCursorPath(index, "nonexistent")).toEqual([])
  })
})

describe("toColumnViews", () => {
  test("converts tree to compat column views", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Todo"),
      heading("col2", "root", 1, "Done"),
      paragraph("c1", "col1", 0, "Task 1"),
      paragraph("c2", "col1", 1, "Task 2"),
      paragraph("c3", "col2", 0, "Task 3"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", new Map())

    const columns = toColumnViews(tree)
    expect(columns).toHaveLength(2)

    expect(columns[0]!.nodeId).toBe("col1")
    expect(columns[0]!.isVirtual).toBe(false)
    expect(columns[0]!.cardIds).toEqual(["c1", "c2"])
    expect(columns[0]!.cardCount).toBe(2)

    expect(columns[1]!.nodeId).toBe("col2")
    expect(columns[1]!.cardIds).toEqual(["c3"])
  })

  test("body column is marked as virtual", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      block("p1", "root", 0, "Description text"),
      heading("col1", "root", 1, "Tasks"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", new Map())

    const columns = toColumnViews(tree)
    expect(columns).toHaveLength(2)
    expect(columns[0]!.isVirtual).toBe(true)
    expect(columns[0]!.nodeId).toBe("__body__root")
  })
})
