/**
 * ViewLens — Unit Tests
 *
 * Verifies that createViewLens produces equivalent results to buildViewTree
 * for the same inputs. Tests role assignment, body detection, embeds,
 * collapse, dedup, walkOrder, and O(1) navigation.
 */

import { describe, test, expect } from "vitest"
import type { KNode } from "@km/core"
import type { SectionRules } from "@km/markdown"
import { buildViewTree, buildViewIndex, ViewTree, type ViewTreeRepo } from "../src/view-tree.ts"
import { createViewLens, type ViewLensRepo } from "../src/view-lens.ts"

// =============================================================================
// Mock Repo
// =============================================================================

function createMockRepo(nodes: KNode[]): ViewTreeRepo & ViewLensRepo {
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
// Helpers: extract walk order and roles from buildViewTree for comparison
// =============================================================================

function viewTreeWalkOrder(tree: ReturnType<typeof buildViewTree>): string[] {
  const ids: string[] = []
  for (const node of ViewTree.nodes(tree)) {
    if (node.role !== "board") ids.push(node.id)
  }
  return ids
}

function viewTreeRoles(tree: ReturnType<typeof buildViewTree>): Map<string, string> {
  const map = new Map<string, string>()
  for (const node of ViewTree.nodes(tree)) {
    map.set(node.id, node.role)
  }
  return map
}

function viewTreeBodyFlags(tree: ReturnType<typeof buildViewTree>): Map<string, boolean> {
  const map = new Map<string, boolean>()
  for (const node of ViewTree.nodes(tree)) {
    if (node.isBody) map.set(node.id, true)
  }
  return map
}

function viewTreeParents(tree: ReturnType<typeof buildViewTree>): Map<string, string | null> {
  const map = new Map<string, string | null>()
  for (const node of ViewTree.nodes(tree)) {
    map.set(node.id, node.parent?.id ?? null)
  }
  return map
}

function viewTreeChildren(tree: ReturnType<typeof buildViewTree>): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const node of ViewTree.nodes(tree)) {
    map.set(
      node.id,
      node.children.map((c) => c.id),
    )
  }
  return map
}

// =============================================================================
// Tests: equivalence with buildViewTree
// =============================================================================

describe("createViewLens", () => {
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
      paragraph("s1", "c1a", 0, "Sub 1"),
      paragraph("s2", "c1a", 1, "Sub 2"),
    ]
    const repo = createMockRepo(nodes)
    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    // Root children
    expect(lens.children("root")).toEqual(["col1", "col2"])

    // Column children
    expect(lens.children("col1")).toEqual(["c1a", "c1b", "c1c"])
    expect(lens.children("col2")).toEqual(["c2a", "c2b", "c2c"])

    // Card children
    expect(lens.children("c1a")).toEqual(["s1", "s2"])
    expect(lens.children("c1b")).toEqual([])

    // Roles
    expect(lens.role("root")).toBe("board")
    expect(lens.role("col1")).toBe("column")
    expect(lens.role("c1a")).toBe("card")
    expect(lens.role("s1")).toBe("subitem")
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
    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    const rootChildren = lens.children("root")
    expect(rootChildren).toHaveLength(2)
    expect(rootChildren[0]).toBe("__body__root")
    expect(rootChildren[1]).toBe("col1")

    // Body column
    expect(lens.role("__body__root")).toBe("body-column")
    expect(lens.children("__body__root")).toEqual(["p1", "p2"])
    expect(lens.role("p1")).toBe("card")
    expect(lens.isBody("p1")).toBe(true)
    expect(lens.isBody("p2")).toBe(true)

    // Virtual body node exists
    expect(lens.get("__body__root")).toBeDefined()
    expect(lens.get("__body__root")!.title).toBe("Description")
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
    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    expect(lens.resolvedEmbed("embed-card")).toBeDefined()
    expect(lens.resolvedEmbed("embed-card")!.id).toBe("target")
    // Children come from the resolved target
    expect(lens.children("embed-card")).toEqual(["target-child1", "target-child2"])
  })

  test("collapsed columns: km.collapse:: true → included but empty children", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col-collapsed", "root", 0, "Backlog km.collapse:: true"),
      paragraph("c1", "col-collapsed", 0, "Hidden task"),
      heading("col-open", "root", 1, "Open"),
      paragraph("c2", "col-open", 0, "Visible task"),
    ]
    const repo = createMockRepo(nodes)
    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    expect(lens.children("root")).toEqual(["col-collapsed", "col-open"])
    expect(lens.children("col-collapsed")).toEqual([]) // Collapsed = no children
    expect(lens.children("col-open")).toEqual(["c2"])
  })

  test("detail-only: nodes with detailOnly flag are excluded", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Visible"),
      { ...heading("detail-col", "root", 1, "Hidden"), data: { detailOnly: true } },
    ]
    const repo = createMockRepo(nodes)
    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    expect(lens.children("root")).toEqual(["col1"])
  })

  test("well-known metadata sections excluded", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Tasks"),
      heading("activity", "root", 1, "Activity"),
      heading("comments", "root", 2, "Comments"),
      heading("attachments", "root", 3, "Attachments"),
    ]
    const repo = createMockRepo(nodes)
    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    expect(lens.children("root")).toEqual(["col1"])
  })

  test("empty tree: no children → root has no children", () => {
    const nodes: KNode[] = [heading("root", null, 0)]
    const repo = createMockRepo(nodes)
    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    expect(lens.children("root")).toEqual([])
    expect(lens.role("root")).toBe("board")
  })

  test("deep nesting: subitems all get role 'subitem'", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col", "root", 0),
      paragraph("card", "col", 0, "Card"),
      paragraph("sub1", "card", 0, "Sub 1"),
      paragraph("sub2", "sub1", 0, "Sub 2"),
      paragraph("sub3", "sub2", 0, "Sub 3"),
    ]
    const repo = createMockRepo(nodes)
    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    expect(lens.role("card")).toBe("card")
    expect(lens.role("sub1")).toBe("subitem")
    expect(lens.role("sub2")).toBe("subitem")
    expect(lens.role("sub3")).toBe("subitem")
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
    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    expect(lens.children("root")).toEqual(["dup1"])
    expect(lens.children("dup1")).toEqual(["c1", "c2"])
  })

  test("null rootId uses __root__ as effective root", () => {
    const nodes: KNode[] = [heading("col1", null, 0, "Column 1"), paragraph("c1", "col1", 0, "Task 1")]
    const repo = createMockRepo(nodes)
    const lens = createViewLens(repo, { rootId: null, foldDepths: emptyFoldDepths })

    expect(lens.rootId).toBeNull()
    expect(lens.role("__root__")).toBe("board")
    expect(lens.children("__root__")).toEqual(["col1"])
  })

  test("hidden nodes are excluded", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Visible"),
      heading("col2", "root", 1, "Hidden"),
      paragraph("c1", "col1", 0, "Card 1"),
      paragraph("c2", "col1", 1, "Hidden Card"),
    ]
    const repo = createMockRepo(nodes)
    const hidden = new Set(["col2", "c2"])
    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths, hiddenNodeIds: hidden })

    expect(lens.children("root")).toEqual(["col1"])
    expect(lens.children("col1")).toEqual(["c1"])
  })

  test("parent pointers are correct", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col", "root", 0),
      paragraph("card", "col", 0, "Card"),
      paragraph("sub", "card", 0, "Sub"),
    ]
    const repo = createMockRepo(nodes)
    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    // Force children computation
    lens.children("root")
    lens.children("col")
    lens.children("card")

    expect(lens.parent("root")).toBeNull()
    expect(lens.parent("col")).toBe("root")
    expect(lens.parent("card")).toBe("col")
    expect(lens.parent("sub")).toBe("card")
  })
})

// =============================================================================
// Tests: walkOrder
// =============================================================================

describe("createViewLens walkOrder", () => {
  const emptyFoldDepths = new Map<string, number>()

  test("walkOrder matches buildViewTree DFS order", () => {
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
    const expectedWalkOrder = viewTreeWalkOrder(tree)

    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })
    expect([...lens.walkOrder]).toEqual(expectedWalkOrder)
  })

  test("walkOrder with body column", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      block("p1", "root", 0, "Description"),
      heading("col1", "root", 1, "Tasks"),
      paragraph("c1", "col1", 0, "Task 1"),
    ]
    const repo = createMockRepo(nodes)

    const tree = buildViewTree(repo, "root", emptyFoldDepths)
    const expectedWalkOrder = viewTreeWalkOrder(tree)

    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })
    expect([...lens.walkOrder]).toEqual(expectedWalkOrder)
  })

  test("walkOrder is lazy and cached", () => {
    const nodes: KNode[] = [heading("root", null, 0), heading("col", "root", 0)]
    const repo = createMockRepo(nodes)
    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    const wo1 = lens.walkOrder
    const wo2 = lens.walkOrder
    expect(wo1).toBe(wo2) // Same reference
  })
})

// =============================================================================
// Tests: nextInWalk / prevInWalk
// =============================================================================

describe("createViewLens navigation", () => {
  const emptyFoldDepths = new Map<string, number>()

  test("nextInWalk traverses entire tree in DFS order", () => {
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
    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    // Walk the entire tree via nextInWalk
    const walked: string[] = []
    let current: string | null = lens.walkOrder[0] ?? null
    while (current) {
      walked.push(current)
      current = lens.nextInWalk(current)
    }

    expect(walked).toEqual([...lens.walkOrder])
  })

  test("prevInWalk traverses entire tree in reverse DFS order", () => {
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
    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    const wo = lens.walkOrder
    const walked: string[] = []
    let current: string | null = wo[wo.length - 1] ?? null
    while (current) {
      walked.push(current)
      current = lens.prevInWalk(current)
    }

    expect(walked).toEqual([...wo].reverse())
  })

  test("nextInWalk/prevInWalk match ViewSnapshot behavior", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "First"),
      paragraph("c1a", "col1", 0, "Card 1A"),
      paragraph("sub1", "c1a", 0, "Sub"),
      paragraph("c1b", "col1", 1, "Card 1B"),
      heading("col2", "root", 1, "Second"),
      paragraph("c2a", "col2", 0, "Card 2A"),
    ]
    const repo = createMockRepo(nodes)
    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    // First child navigation
    expect(lens.nextInWalk("col1")).toBe("c1a")
    expect(lens.nextInWalk("c1a")).toBe("sub1")
    // Next sibling after last child
    expect(lens.nextInWalk("sub1")).toBe("c1b")
    // Ancestor's next sibling
    expect(lens.nextInWalk("c1b")).toBe("col2")
    // Last node returns null
    expect(lens.nextInWalk("c2a")).toBeNull()

    // Prev navigation
    expect(lens.prevInWalk("c2a")).toBe("col2")
    expect(lens.prevInWalk("col2")).toBe("c1b")
    expect(lens.prevInWalk("c1b")).toBe("sub1")
    expect(lens.prevInWalk("sub1")).toBe("c1a")
    expect(lens.prevInWalk("c1a")).toBe("col1")
    expect(lens.prevInWalk("col1")).toBeNull()
  })

  test("navigation returns null for unknown nodes", () => {
    const nodes: KNode[] = [heading("root", null, 0), heading("col", "root", 0)]
    const repo = createMockRepo(nodes)
    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    expect(lens.nextInWalk("nonexistent")).toBeNull()
    expect(lens.prevInWalk("nonexistent")).toBeNull()
  })
})

// =============================================================================
// Tests: equivalence with buildViewTree across complex scenarios
// =============================================================================

describe("createViewLens equivalence with buildViewTree", () => {
  const emptyFoldDepths = new Map<string, number>()

  test("roles match buildViewTree for all nodes", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      block("p1", "root", 0, "Description"),
      heading("col1", "root", 1, "Tasks"),
      paragraph("c1", "col1", 0, "Card"),
      paragraph("sub1", "c1", 0, "Sub"),
      paragraph("sub2", "sub1", 0, "Deep Sub"),
    ]
    const repo = createMockRepo(nodes)

    const tree = buildViewTree(repo, "root", emptyFoldDepths)
    const treeRoles = viewTreeRoles(tree)

    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })
    // Force full traversal
    for (const id of lens.walkOrder) {
      const expectedRole = treeRoles.get(id)
      expect(lens.role(id)).toBe(expectedRole)
    }
    expect(lens.role("root")).toBe("board")
  })

  test("body flags match buildViewTree", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      block("p1", "root", 0, "Body text"),
      block("p2", "root", 1, "More body"),
      heading("col1", "root", 2, "Tasks"),
      paragraph("c1", "col1", 0, "Not body"),
    ]
    const repo = createMockRepo(nodes)

    const tree = buildViewTree(repo, "root", emptyFoldDepths)
    const treeBodyFlags = viewTreeBodyFlags(tree)

    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    expect(lens.isBody("p1")).toBe(treeBodyFlags.has("p1"))
    expect(lens.isBody("p2")).toBe(treeBodyFlags.has("p2"))
    // c1 is a paragraph node within col1 — it IS body content per extractBody
    expect(lens.isBody("c1")).toBe(treeBodyFlags.has("c1"))
  })

  test("parent pointers match buildViewTree", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Col"),
      paragraph("c1", "col1", 0, "Card"),
      paragraph("sub1", "c1", 0, "Sub"),
    ]
    const repo = createMockRepo(nodes)

    const tree = buildViewTree(repo, "root", emptyFoldDepths)
    const treeParents = viewTreeParents(tree)

    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    // Walk and check parents match
    for (const id of lens.walkOrder) {
      const expectedParent = treeParents.get(id)
      expect(lens.parent(id)).toBe(expectedParent)
    }
  })

  test("children match buildViewTree at every level", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      block("p1", "root", 0, "Body"),
      heading("col1", "root", 1, "Tasks"),
      heading("col2", "root", 2, "Done"),
      paragraph("c1a", "col1", 0, "Task 1"),
      paragraph("c1b", "col1", 1, "Task 2"),
      paragraph("c2a", "col2", 0, "Task 3"),
      paragraph("s1", "c1a", 0, "Sub"),
    ]
    const repo = createMockRepo(nodes)

    const tree = buildViewTree(repo, "root", emptyFoldDepths)
    const treeChildren = viewTreeChildren(tree)

    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    // Check root children
    expect([...lens.children("root")]).toEqual(treeChildren.get("root"))

    // Check all nodes' children
    for (const id of lens.walkOrder) {
      const expectedChildren = treeChildren.get(id) ?? []
      expect([...lens.children(id)]).toEqual(expectedChildren)
    }
  })

  test("body cards within columns treated correctly", () => {
    // Column with body content (paragraphs before first heading within a column)
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Column"),
      block("body-in-col", "col1", 0, "Body paragraph in column"),
      paragraph("card1", "col1", 1, "Structural card"),
    ]
    const repo = createMockRepo(nodes)

    const tree = buildViewTree(repo, "root", emptyFoldDepths)
    const treeChildren = viewTreeChildren(tree)
    const treeBodyFlags = viewTreeBodyFlags(tree)

    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths })

    // Verify children match
    const expectedColChildren = treeChildren.get("col1") ?? []
    expect([...lens.children("col1")]).toEqual(expectedColChildren)

    // Verify body flag on the body card
    expect(lens.isBody("body-in-col")).toBe(treeBodyFlags.has("body-in-col"))
  })

  test("hidden nodes within columns", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col1", "root", 0, "Column"),
      paragraph("c1", "col1", 0, "Visible"),
      paragraph("c2", "col1", 1, "Hidden"),
      paragraph("c3", "col1", 2, "Visible"),
    ]
    const repo = createMockRepo(nodes)
    const hidden = new Set(["c2"])

    const tree = buildViewTree(repo, "root", emptyFoldDepths, undefined, hidden)
    const treeChildren = viewTreeChildren(tree)

    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths, hiddenNodeIds: hidden })

    expect([...lens.children("col1")]).toEqual(treeChildren.get("col1"))
  })

  test("hidden subitems", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col", "root", 0),
      paragraph("card", "col", 0, "Card"),
      paragraph("sub1", "card", 0, "Visible sub"),
      paragraph("sub2", "card", 1, "Hidden sub"),
      paragraph("sub3", "card", 2, "Visible sub"),
    ]
    const repo = createMockRepo(nodes)
    const hidden = new Set(["sub2"])

    const tree = buildViewTree(repo, "root", emptyFoldDepths, undefined, hidden)
    const treeChildren = viewTreeChildren(tree)

    const lens = createViewLens(repo, { rootId: "root", foldDepths: emptyFoldDepths, hiddenNodeIds: hidden })

    expect([...lens.children("card")]).toEqual(treeChildren.get("card"))
  })
})

// =============================================================================
// Tests: section rules
// =============================================================================

describe("createViewLens rules", () => {
  test("column rules parsed from heading content", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col-limited", "root", 0, "In Progress km.limit:: 3"),
      heading("col-colored", "root", 1, "Done km.color:: green"),
      heading("col-plain", "root", 2, "Backlog"),
    ]
    const repo = createMockRepo(nodes)
    const lens = createViewLens(repo, { rootId: "root", foldDepths: new Map() })

    const limitedRules = lens.rules("col-limited")
    expect(limitedRules).toBeDefined()
    expect(limitedRules!.limit).toBe(3)

    const coloredRules = lens.rules("col-colored")
    expect(coloredRules).toBeDefined()
    expect(coloredRules!.color).toBe("green")

    // Plain column — no rules
    expect(lens.rules("col-plain")).toBeUndefined()
  })

  test("column with pre-parsed rules uses them", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      { ...heading("col", "root", 0, "Column"), rules: { limit: 5, color: "cyan" } as SectionRules },
    ]
    const repo = createMockRepo(nodes)
    const lens = createViewLens(repo, { rootId: "root", foldDepths: new Map() })

    expect(lens.rules("col")?.limit).toBe(5)
    expect(lens.rules("col")?.color).toBe("cyan")
  })
})

// =============================================================================
// Tests: get() for various node types
// =============================================================================

describe("createViewLens get()", () => {
  test("returns KNode for real nodes", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      heading("col", "root", 0, "Column"),
      paragraph("card", "col", 0, "Card"),
    ]
    const repo = createMockRepo(nodes)
    const lens = createViewLens(repo, { rootId: "root", foldDepths: new Map() })

    expect(lens.get("root")?.id).toBe("root")
    expect(lens.get("col")?.id).toBe("col")
    expect(lens.get("card")?.id).toBe("card")
  })

  test("returns virtual KNode for body column", () => {
    const nodes: KNode[] = [
      heading("root", null, 0),
      block("p1", "root", 0, "Description"),
      heading("col1", "root", 1, "Tasks"),
    ]
    const repo = createMockRepo(nodes)
    const lens = createViewLens(repo, { rootId: "root", foldDepths: new Map() })

    const bodyNode = lens.get("__body__root")
    expect(bodyNode).toBeDefined()
    expect(bodyNode!.id).toBe("__body__root")
  })

  test("returns undefined for nonexistent node", () => {
    const nodes: KNode[] = [heading("root", null, 0)]
    const repo = createMockRepo(nodes)
    const lens = createViewLens(repo, { rootId: "root", foldDepths: new Map() })

    expect(lens.get("nonexistent")).toBeUndefined()
  })

  test("returns undefined for virtual root (null rootId)", () => {
    const nodes: KNode[] = [heading("col", null, 0)]
    const repo = createMockRepo(nodes)
    const lens = createViewLens(repo, { rootId: null, foldDepths: new Map() })

    expect(lens.get("__root__")).toBeUndefined()
  })
})
