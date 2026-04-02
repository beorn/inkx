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
  ViewTree,
  buildViewTree,
  buildViewIndex,
  ViewTree,
  deriveCursorPath,
  toColumnViews,
  type ViewTreeRepo,
  type ViewNode,
  type ViewNodeColumnCache,
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
      return nodes.filter((n) => n.parent_id === parentId).sort((a, b) => a.parent_idx - b.parent_idx)
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
    const nodes: KNode[] = [heading("col1", null, 0, "Column 1"), paragraph("c1", "col1", 0, "Task 1")]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, null, emptyFoldDepths)

    expect(tree.id).toBe("__root__")
    expect(tree.role).toBe("board")
    expect(tree.node).toBeNull()
    expect(tree.children).toHaveLength(1)
  })

  test("body column with null root uses __body__root id", () => {
    const nodes: KNode[] = [block("p1", null, 0, "Description"), heading("col1", null, 1, "Column")]
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

describe("ViewTree.nodes", () => {
  const emptyFoldDepths = new Map<string, number>()

  test("yields all nodes in DFS order", () => {
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
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    const ids = [...ViewTree.nodes(tree)].map((n) => n.id)
    expect(ids).toEqual(["root", "col1", "c1a", "sub1", "c1b", "col2", "c2a"])
  })

  test("match predicate controls yielding without affecting descent", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Column"),
      paragraph("c1", "col1", 0, "Card"),
      paragraph("sub1", "c1", 0, "Sub"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    // Only yield cards — but still descend into columns to find them
    const cards = [...ViewTree.nodes(tree, { match: (vn) => vn.role === "card" })]
    expect(cards.map((c) => c.id)).toEqual(["c1"])
  })

  test("into predicate controls descent without affecting yielding", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Column"),
      paragraph("c1", "col1", 0, "Card"),
      paragraph("sub1", "c1", 0, "Sub"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    // Don't descend into cards — subitems should not appear
    const ids = [...ViewTree.nodes(tree, { into: (vn) => vn.role !== "card" })].map((n) => n.id)
    expect(ids).toEqual(["root", "col1", "c1"])
    // c1 is yielded (into doesn't affect yielding), but sub1 is not (descent stopped)
  })

  test("match and into are orthogonal", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Column"),
      paragraph("c1", "col1", 0, "Card"),
      paragraph("sub1", "c1", 0, "Sub"),
      paragraph("sub2", "sub1", 0, "Deep Sub"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    // Only yield subitems, but don't descend past depth 1 subitems
    const ids = [
      ...ViewTree.nodes(tree, {
        match: (vn) => vn.role === "subitem",
        into: (vn) => vn.role !== "subitem",
      }),
    ].map((n) => n.id)
    // sub1 is yielded (match passes) but its children not visited (into stops at subitems)
    expect(ids).toEqual(["sub1"])
  })

  test("reverse option processes children in reverse order", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "First"),
      heading("col2", "root", 1, "Second"),
      paragraph("c1a", "col1", 0, "Card 1A"),
      paragraph("c1b", "col1", 1, "Card 1B"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    const ids = [...ViewTree.nodes(tree, { reverse: true })].map((n) => n.id)
    // Reverse: col2 before col1, c1b before c1a
    expect(ids).toEqual(["root", "col2", "col1", "c1b", "c1a"])
  })

  test("empty tree yields only root", () => {
    const nodes: KNode[] = [heading("root", null, 0)]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    const ids = [...ViewTree.nodes(tree)].map((n) => n.id)
    expect(ids).toEqual(["root"])
  })
})

describe("ViewTree.next / ViewTree.prev", () => {
  const emptyFoldDepths = new Map<string, number>()

  test("next returns the following sibling", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "First"),
      heading("col2", "root", 1, "Second"),
      heading("col3", "root", 2, "Third"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    const col1 = tree.children[0]!
    const col2 = tree.children[1]!
    expect(ViewTree.next(col1)?.id).toBe("col2")
    expect(ViewTree.next(col2)?.id).toBe("col3")
  })

  test("prev returns the preceding sibling", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "First"),
      heading("col2", "root", 1, "Second"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    const col2 = tree.children[1]!
    expect(ViewTree.prev(col2)?.id).toBe("col1")
  })

  test("returns null at boundary", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "First"),
      heading("col2", "root", 1, "Second"),
    ]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    const col1 = tree.children[0]!
    const col2 = tree.children[1]!
    expect(ViewTree.prev(col1)).toBeNull()
    expect(ViewTree.next(col2)).toBeNull()
  })

  test("returns null for root node (no parent)", () => {
    const nodes: KNode[] = [heading("root", null, 0)]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", emptyFoldDepths)

    expect(ViewTree.next(tree)).toBeNull()
    expect(ViewTree.prev(tree)).toBeNull()
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
    const nodes: KNode[] = [heading("root", null, 0), heading("col", "root", 0), paragraph("card", "col", 0, "Card")]
    const repo = createMockRepo(nodes)
    const tree = buildViewTree(repo, "root", new Map())
    const index = buildViewIndex(tree)

    expect(deriveCursorPath(index, "card")).toEqual(["col", "card"])
  })

  test("returns [columnId] for a column", () => {
    const nodes: KNode[] = [heading("root", null, 0), heading("col", "root", 0)]
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

// =============================================================================
// Per-column caching tests
// =============================================================================

/**
 * A mock repo that caches getChildren results by reference identity,
 * so we can control cache invalidation by calling bustChildren().
 */
function createCachingMockRepo(initialNodes: KNode[]) {
  const nodeMap = new Map<string, KNode>()
  for (const n of initialNodes) nodeMap.set(n.id, n)

  // Cache of children arrays keyed by parentId (null → "__null__")
  const childrenCache = new Map<string, KNode[]>()

  function cacheKey(parentId: string | null): string {
    return parentId ?? "__null__"
  }

  const repo: ViewTreeRepo = {
    getNode(id: string) {
      return nodeMap.get(id) ?? null
    },
    getChildren(parentId: string | null) {
      const key = cacheKey(parentId)
      const cached = childrenCache.get(key)
      if (cached) return cached
      const result = [...nodeMap.values()]
        .filter((n) => n.parent_id === parentId)
        .sort((a, b) => a.parent_idx - b.parent_idx)
      childrenCache.set(key, result)
      return result
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

  return {
    repo,
    /** Add a node to the mock repo */
    addNode(node: KNode) {
      nodeMap.set(node.id, node)
      // Bust the parent's children cache so next getChildren returns a new array
      childrenCache.delete(cacheKey(node.parent_id))
    },
    /** Remove a node from the mock repo */
    removeNode(id: string) {
      const node = nodeMap.get(id)
      if (node) {
        nodeMap.delete(id)
        childrenCache.delete(cacheKey(node.parent_id))
      }
    },
    /** Bust children cache for a specific parent (forces new array reference) */
    bustChildren(parentId: string | null) {
      childrenCache.delete(cacheKey(parentId))
    },
  }
}

describe("buildViewTree caching", () => {
  const emptyFoldDepths = new Map<string, number>()

  test("cache hit: unchanged columns reuse same ViewNode object", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Todo"),
      heading("col2", "root", 1, "Done"),
      paragraph("c1", "col1", 0, "Task 1"),
      paragraph("c2", "col2", 0, "Task 2"),
    ]

    const { repo } = createCachingMockRepo(nodes)
    const cache: ViewNodeColumnCache = new Map()

    // First build populates cache
    const tree1 = buildViewTree(repo, "root", emptyFoldDepths, cache)
    expect(tree1.children).toHaveLength(2)
    expect(cache.size).toBe(2)

    const col1v1 = tree1.children[0]!
    const col2v1 = tree1.children[1]!

    // Second build with same repo state — should reuse cached ViewNodes
    const tree2 = buildViewTree(repo, "root", emptyFoldDepths, cache)
    expect(tree2.children[0]).toBe(col1v1) // Same object reference
    expect(tree2.children[1]).toBe(col2v1) // Same object reference
  })

  test("cache miss: mutated column rebuilds only that column", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Todo"),
      heading("col2", "root", 1, "Done"),
      paragraph("c1", "col1", 0, "Task 1"),
      paragraph("c2", "col2", 0, "Task 2"),
    ]

    const mock = createCachingMockRepo(nodes)
    const cache: ViewNodeColumnCache = new Map()

    // First build
    const tree1 = buildViewTree(mock.repo, "root", emptyFoldDepths, cache)
    const col1v1 = tree1.children[0]!
    const col2v1 = tree1.children[1]!

    // Mutate col1: add a new card
    mock.addNode(paragraph("c1b", "col1", 1, "Task 1B"))

    // Second build
    const tree2 = buildViewTree(mock.repo, "root", emptyFoldDepths, cache)
    expect(tree2.children[0]).not.toBe(col1v1) // col1 rebuilt (new children ref)
    expect(tree2.children[1]).toBe(col2v1) // col2 unchanged (cache hit)

    // The rebuilt col1 has the new card
    expect(tree2.children[0]!.children).toHaveLength(2)
    expect(tree2.children[0]!.children[1]!.id).toBe("c1b")
  })

  test("no cache: works identically to uncached build", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Todo"),
      paragraph("c1", "col1", 0, "Task 1"),
    ]

    const { repo } = createCachingMockRepo(nodes)

    // Build without cache
    const tree1 = buildViewTree(repo, "root", emptyFoldDepths)
    // Build with empty cache
    const cache: ViewNodeColumnCache = new Map()
    const tree2 = buildViewTree(repo, "root", emptyFoldDepths, cache)

    // Same structure
    expect(tree1.children).toHaveLength(tree2.children.length)
    expect(tree1.children[0]!.id).toBe(tree2.children[0]!.id)
    expect(tree1.children[0]!.children.length).toBe(tree2.children[0]!.children.length)
  })

  test("cache cleared on zoom change: fresh cache for new rootId", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Todo"),
      heading("col2", "root", 1, "Done"),
      paragraph("c1", "col1", 0, "Task 1"),
      paragraph("c2", "col2", 0, "Task 2"),
      // col1 also has sub-columns when zoomed into
      heading("sub1", "col1", 1, "Sub Section"),
      paragraph("s1", "sub1", 0, "Sub Task"),
    ]

    const { repo } = createCachingMockRepo(nodes)

    // Build at root level
    const cache1: ViewNodeColumnCache = new Map()
    const tree1 = buildViewTree(repo, "root", emptyFoldDepths, cache1)
    expect(cache1.size).toBe(2) // col1, col2

    // Simulate zoom: create a new cache (as board-app.ts does on rootId change)
    const cache2: ViewNodeColumnCache = new Map()
    const tree2 = buildViewTree(repo, "col1", emptyFoldDepths, cache2)
    expect(tree2.role).toBe("board")
    expect(tree2.id).toBe("col1")
    // sub1 is now a column
    expect(cache2.size).toBeGreaterThan(0)
    // Old cache entries are irrelevant — no cross-contamination
    expect(cache1.size).toBe(2)
  })

  test("cached column parent pointer is updated to new root", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Todo"),
      paragraph("c1", "col1", 0, "Task 1"),
    ]

    const { repo } = createCachingMockRepo(nodes)
    const cache: ViewNodeColumnCache = new Map()

    const tree1 = buildViewTree(repo, "root", emptyFoldDepths, cache)
    expect(tree1.children[0]!.parent).toBe(tree1)

    // Second build creates a new root
    const tree2 = buildViewTree(repo, "root", emptyFoldDepths, cache)
    expect(tree2).not.toBe(tree1) // New root
    expect(tree2.children[0]!.parent).toBe(tree2) // Parent pointer updated
  })
})
