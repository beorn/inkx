/**
 * Comparison test: ViewTree (legacy buildViewTree → viewNodeToColumnViews)
 * vs ViewLens (createViewLens → createVisibleLens → createViewTree).
 *
 * Tests structural equivalence of columns and cards produced by both paths.
 */

import { describe, test, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import type { KNode } from "@km/core"

// Legacy + new lens path (all from main barrel)
import {
  buildViewTree,
  viewNodeToColumnViews,
  createViewLens,
  createVisibleLens,
  createViewTree,
  type ViewNode,
} from "@km/board"

// =============================================================================
// Helpers
// =============================================================================

/** Flat node builder — creates a node with given properties */
function n(id: string, parentId: string | null, type: "h" | "p" = "h", extra: Record<string, unknown> = {}): KNode {
  return {
    id,
    type,
    parent_id: parentId,
    parent_idx: 0,
    content: type === "p" ? id : undefined,
    data: type === "h" ? { name: id } : {},
    ...(type === "h" ? { item: {}, name: id, title: id, fstype: "mdsection" } : {}),
    ...(type === "p" ? { item: { list: "-", task: { marker: "[ ]", status: "todo" } } } : {}),
    symlink_to: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
    ...extra,
  } as KNode
}

/** Derive columns from the legacy path (buildViewTree → viewNodeToColumnViews) */
function legacyColumns(nodes: KNode[], rootId: string) {
  const repo = createFakeRepo({ nodes })
  const viewTree = buildViewTree(repo, rootId, new Map())
  const columns = viewNodeToColumnViews(viewTree)
  return columns.map((col) => ({
    colId: col.node.id,
    isVirtual: col.isVirtual ?? false,
    cardIds: col.cardNodes.map((c) => c.id),
    cardCount: col.cardNodes.length,
    cards: col.cardNodes.map((c) => ({
      id: c.id,
      isBody: c.isBody,
      isBrokenEmbed: c.isBrokenEmbed,
      hasBodyChildren: c.hasBodyChildren,
      resolvedNodeId: c.resolvedNode?.id,
    })),
  }))
}

/** Derive columns from the new lens path (createViewLens → createVisibleLens → createViewTree) */
function lensColumns(nodes: KNode[], rootId: string) {
  const repo = createFakeRepo({ nodes })
  const viewLens = createViewLens(repo, { rootId, foldDepths: new Map() })
  const visibleLens = createVisibleLens(viewLens)
  const tree = createViewTree()
  tree.sync(visibleLens)

  // Get columns from the lens
  const colIds = visibleLens.children(rootId)
  return colIds.map((colId) => {
    const colNode = visibleLens.get(colId)
    const role = visibleLens.role(colId)
    const isVirtual = role === "body-column"
    const cardIds = visibleLens.children(colId)

    return {
      colId,
      isVirtual,
      cardIds: [...cardIds],
      cardCount: cardIds.length,
      cards: cardIds.map((cardId) => {
        const cardNode = visibleLens.get(cardId)
        const embed = visibleLens.resolvedEmbed(cardId)
        const isBody = visibleLens.isBody(cardId)
        const firstChildId = visibleLens.children(cardId)[0]
        const firstChild = firstChildId ? visibleLens.get(firstChildId) : undefined
        const hasBodyChildren = !isBody && firstChild != null && firstChild.type !== "h"

        return {
          id: cardId,
          isBody,
          isBrokenEmbed: cardNode?.symlink_to != null && embed === undefined,
          hasBodyChildren,
          resolvedNodeId: embed?.id,
        }
      }),
    }
  })
}

/** Compare both paths and report differences */
function compare(nodes: KNode[], rootId: string) {
  const legacy = legacyColumns(nodes, rootId)
  const lens = lensColumns(nodes, rootId)

  const diffs: string[] = []

  // Compare column count
  if (legacy.length !== lens.length) {
    diffs.push(`Column count: legacy=${legacy.length}, lens=${lens.length}`)
    diffs.push(`  Legacy cols: [${legacy.map((c) => `${c.colId}${c.isVirtual ? " (virtual)" : ""}`).join(", ")}]`)
    diffs.push(`  Lens cols:   [${lens.map((c) => `${c.colId}${c.isVirtual ? " (virtual)" : ""}`).join(", ")}]`)
  }

  // Compare each column that exists in both
  const maxCols = Math.max(legacy.length, lens.length)
  for (let i = 0; i < maxCols; i++) {
    const l = legacy[i]
    const r = lens[i]

    if (!l) {
      diffs.push(`Column[${i}]: missing in legacy, present in lens as ${r!.colId}`)
      continue
    }
    if (!r) {
      diffs.push(`Column[${i}]: present in legacy as ${l.colId}, missing in lens`)
      continue
    }

    if (l.colId !== r.colId) {
      diffs.push(`Column[${i}] ID: legacy=${l.colId}, lens=${r.colId}`)
    }
    if (l.isVirtual !== r.isVirtual) {
      diffs.push(`Column[${i}] isVirtual: legacy=${l.isVirtual}, lens=${r.isVirtual}`)
    }
    if (l.cardCount !== r.cardCount) {
      diffs.push(`Column[${i}] cardCount: legacy=${l.cardCount}, lens=${r.cardCount}`)
      diffs.push(`  Legacy cards: [${l.cardIds.join(", ")}]`)
      diffs.push(`  Lens cards:   [${r.cardIds.join(", ")}]`)
    }

    // Compare card details
    const maxCards = Math.max(l.cardCount, r.cardCount)
    for (let j = 0; j < maxCards; j++) {
      const lc = l.cards[j]
      const rc = r.cards[j]

      if (!lc) {
        diffs.push(`Column[${i}].card[${j}]: missing in legacy, present in lens as ${rc!.id}`)
        continue
      }
      if (!rc) {
        diffs.push(`Column[${i}].card[${j}]: present in legacy as ${lc.id}, missing in lens`)
        continue
      }

      if (lc.id !== rc.id) {
        diffs.push(`Column[${i}].card[${j}] ID: legacy=${lc.id}, lens=${rc.id}`)
      }
      if (lc.isBody !== rc.isBody) {
        diffs.push(`Column[${i}].card[${j}] isBody: legacy=${lc.isBody}, lens=${rc.isBody}`)
      }
      if (lc.isBrokenEmbed !== rc.isBrokenEmbed) {
        diffs.push(`Column[${i}].card[${j}] isBrokenEmbed: legacy=${lc.isBrokenEmbed}, lens=${rc.isBrokenEmbed}`)
      }
      if (lc.hasBodyChildren !== rc.hasBodyChildren) {
        diffs.push(`Column[${i}].card[${j}] hasBody: legacy=${lc.hasBodyChildren}, lens=${rc.hasBodyChildren}`)
      }
      if (lc.resolvedNodeId !== rc.resolvedNodeId) {
        diffs.push(`Column[${i}].card[${j}] resolvedNode: legacy=${lc.resolvedNodeId}, lens=${rc.resolvedNodeId}`)
      }
    }
  }

  return { legacy, lens, diffs }
}

// =============================================================================
// Test Fixtures
// =============================================================================

describe("lens vs legacy: column structure comparison", () => {
  test("simple columns (headings with paragraph children)", () => {
    const nodes = [
      n("board", null),
      n("col1", "board"),
      n("1a", "col1", "p"),
      n("1b", "col1", "p"),
      n("col2", "board"),
      n("2a", "col2", "p"),
    ]

    const result = compare(nodes, "board")
    if (result.diffs.length > 0) {
      console.log("DIFFS (simple columns):", result.diffs)
    }
    expect(result.diffs).toEqual([])
  })

  test("body paragraphs before first heading (board level)", () => {
    // Board has paragraphs BEFORE the first heading column
    const nodes = [
      n("board", null),
      n("body-text", "board", "p", { content: "Some body text", parent_idx: 0 }),
      n("col1", "board", "h", { parent_idx: 1 }),
      n("1a", "col1", "p"),
    ]

    const result = compare(nodes, "board")
    if (result.diffs.length > 0) {
      console.log("DIFFS (body paragraphs at board level):", result.diffs)
    }
    expect(result.diffs).toEqual([])
  })

  test("body paragraphs before first heading (column level)", () => {
    // Column has paragraphs before its first heading child
    const nodes = [
      n("board", null),
      n("col1", "board"),
      n("body-para", "col1", "p", { content: "body paragraph", parent_idx: 0 }),
      n("heading-child", "col1", "h", { parent_idx: 1 }),
      n("task-1", "heading-child", "p"),
    ]

    const result = compare(nodes, "board")
    if (result.diffs.length > 0) {
      console.log("DIFFS (body paragraphs at column level):", result.diffs)
    }
    expect(result.diffs).toEqual([])
  })

  test("embed cards (symlink_to)", () => {
    // Embed card that links to another node
    const target = n("target-node", null, "h", { parent_idx: 0 })
    const targetChild = n("target-child", "target-node", "p")

    const nodes = [
      n("board", null),
      n("col1", "board"),
      n("regular-card", "col1", "p", { parent_idx: 0 }),
      {
        ...n("embed-card", "col1", "p", { parent_idx: 1 }),
        symlink_to: "target-node",
      } as KNode,
      target,
      targetChild,
    ]

    const result = compare(nodes, "board")
    if (result.diffs.length > 0) {
      console.log("DIFFS (embed cards):", result.diffs)
    }
    expect(result.diffs).toEqual([])
  })

  test("broken embed (symlink_to non-existent target)", () => {
    const nodes = [
      n("board", null),
      n("col1", "board"),
      {
        ...n("broken-embed", "col1", "p", { parent_idx: 0 }),
        symlink_to: "nonexistent",
      } as KNode,
      n("regular", "col1", "p", { parent_idx: 1 }),
    ]

    const result = compare(nodes, "board")
    if (result.diffs.length > 0) {
      console.log("DIFFS (broken embed):", result.diffs)
    }
    expect(result.diffs).toEqual([])
  })

  test("empty column (no cards)", () => {
    const nodes = [n("board", null), n("col1", "board"), n("col2", "board")]

    const result = compare(nodes, "board")
    if (result.diffs.length > 0) {
      console.log("DIFFS (empty column):", result.diffs)
    }
    expect(result.diffs).toEqual([])
  })

  test("single board node (no children)", () => {
    const nodes = [n("board", null)]

    const result = compare(nodes, "board")
    if (result.diffs.length > 0) {
      console.log("DIFFS (single board):", result.diffs)
    }
    expect(result.diffs).toEqual([])
  })

  test("mixed body and structural columns", () => {
    // Board with both body paragraphs and structural columns
    const nodes = [
      n("board", null),
      n("para1", "board", "p", { content: "First paragraph", parent_idx: 0 }),
      n("para2", "board", "p", { content: "Second paragraph", parent_idx: 1 }),
      n("col1", "board", "h", { parent_idx: 2 }),
      n("1a", "col1", "p"),
      n("col2", "board", "h", { parent_idx: 3 }),
      n("2a", "col2", "p"),
    ]

    const result = compare(nodes, "board")
    if (result.diffs.length > 0) {
      console.log("DIFFS (mixed body+structural):", result.diffs)
    }
    expect(result.diffs).toEqual([])
  })

  test("embed in body column", () => {
    // Body paragraph that is an embed
    const nodes = [
      n("board", null),
      {
        ...n("embed-body", "board", "p", { content: "embed body text", parent_idx: 0 }),
        symlink_to: "target",
      } as KNode,
      n("target", null, "h"),
      n("col1", "board", "h", { parent_idx: 1 }),
      n("1a", "col1", "p"),
    ]

    const result = compare(nodes, "board")
    if (result.diffs.length > 0) {
      console.log("DIFFS (embed in body):", result.diffs)
    }
    expect(result.diffs).toEqual([])
  })

  test("deep nesting (cards with subitems)", () => {
    const nodes = [
      n("board", null),
      n("col1", "board"),
      n("card1", "col1", "p", { parent_idx: 0 }),
      n("sub1", "card1", "p"),
      n("sub1a", "sub1", "p"),
      n("card2", "col1", "p", { parent_idx: 1 }),
    ]

    const result = compare(nodes, "board")
    if (result.diffs.length > 0) {
      console.log("DIFFS (deep nesting):", result.diffs)
    }
    expect(result.diffs).toEqual([])
  })

  test("collapsed column (km.collapse:: true)", () => {
    const nodes = [
      n("board", null),
      n("col1", "board", "h", { rules: { collapse: true }, parent_idx: 0 }),
      n("1a", "col1", "p"),
      n("col2", "board", "h", { parent_idx: 1 }),
      n("2a", "col2", "p"),
    ]

    const result = compare(nodes, "board")
    if (result.diffs.length > 0) {
      console.log("DIFFS (collapsed column):", result.diffs)
    }
    expect(result.diffs).toEqual([])
  })

  test("detail-only column excluded", () => {
    const nodes = [
      n("board", null),
      n("col1", "board"),
      n("1a", "col1", "p"),
      // "activity" is a well-known metadata section that should be excluded
      n("activity", "board", "h", { content: "activity", title: "activity", name: "activity" }),
      n("act-child", "activity", "p"),
    ]

    const result = compare(nodes, "board")
    if (result.diffs.length > 0) {
      console.log("DIFFS (detail-only):", result.diffs)
    }
    expect(result.diffs).toEqual([])
  })

  test("multiple columns with varying card counts", () => {
    const nodes = [
      n("board", null),
      n("col1", "board", "h", { parent_idx: 0 }),
      n("1a", "col1", "p", { parent_idx: 0 }),
      n("1b", "col1", "p", { parent_idx: 1 }),
      n("1c", "col1", "p", { parent_idx: 2 }),
      n("col2", "board", "h", { parent_idx: 1 }),
      n("2a", "col2", "p"),
      n("col3", "board", "h", { parent_idx: 2 }),
    ]

    const result = compare(nodes, "board")
    if (result.diffs.length > 0) {
      console.log("DIFFS (multiple columns):", result.diffs)
    }
    expect(result.diffs).toEqual([])
  })

  test("card with body children (hasBodyChildren flag)", () => {
    // Card (heading) with a paragraph child before heading children
    const nodes = [
      n("board", null),
      n("col1", "board"),
      n("card-with-body", "col1", "h", { parent_idx: 0 }),
      n("body-para", "card-with-body", "p", { content: "body", parent_idx: 0 }),
      n("heading-sub", "card-with-body", "h", { parent_idx: 1 }),
    ]

    const result = compare(nodes, "board")
    if (result.diffs.length > 0) {
      console.log("DIFFS (card with body children):", result.diffs)
    }
    expect(result.diffs).toEqual([])
  })

  test("embed card resolves children from target", () => {
    // Embed card should show target's children, not its own
    const nodes = [
      n("board", null),
      n("col1", "board"),
      {
        ...n("embed-card", "col1", "p", { parent_idx: 0 }),
        symlink_to: "target",
      } as KNode,
      n("target", null, "h"),
      n("target-child1", "target", "p", { parent_idx: 0 }),
      n("target-child2", "target", "p", { parent_idx: 1 }),
    ]

    const result = compare(nodes, "board")
    if (result.diffs.length > 0) {
      console.log("DIFFS (embed resolves children):", result.diffs)
    }
    expect(result.diffs).toEqual([])
  })

  test("hidden nodes are excluded", () => {
    // Use hiddenNodeIds to exclude specific nodes
    const nodes = [
      n("board", null),
      n("col1", "board", "h", { parent_idx: 0 }),
      n("visible", "col1", "p", { parent_idx: 0 }),
      n("hidden", "col1", "p", { parent_idx: 1 }),
      n("col2", "board", "h", { parent_idx: 1 }),
      n("2a", "col2", "p"),
    ]

    const repo = createFakeRepo({ nodes })
    const hiddenNodeIds = new Set(["hidden"])

    // Legacy path with hidden
    const viewTree = buildViewTree(repo, "board", new Map(), undefined, hiddenNodeIds)
    const legacyCols = viewNodeToColumnViews(viewTree)

    // Lens path with hidden
    const viewLens = createViewLens(repo, {
      rootId: "board",
      foldDepths: new Map(),
      hiddenNodeIds,
    })
    const visibleLens = createVisibleLens(viewLens)

    const colIds = visibleLens.children("board")
    const lensCols = colIds.map((colId) => ({
      colId,
      cardIds: [...visibleLens.children(colId)],
    }))

    expect(legacyCols.map((c) => ({ colId: c.node.id, cardIds: c.cardNodes.map((n) => n.id) }))).toEqual(lensCols)
  })

  // =====================================================================
  // Use the item() builder style fixtures (closer to real test patterns)
  // =====================================================================

  test("item-style: standard 3-column board", () => {
    // Simulates item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a")))
    // item() creates parent nodes as type "h" with fstype "folder"
    // and leaf nodes as type "p" with task data
    const nodes: KNode[] = [
      {
        id: "board",
        type: "h",
        item: {},
        fstype: "folder",
        content: undefined,
        data: { name: "board" },
        parent_id: null,
        parent_idx: 0,
        symlink_to: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as KNode,
      {
        id: "col1",
        type: "h",
        item: {},
        fstype: "folder",
        content: undefined,
        data: { name: "col1" },
        parent_id: "board",
        parent_idx: 0,
        symlink_to: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as KNode,
      {
        id: "1a",
        type: "p",
        item: { list: "-", task: { marker: "[ ]", status: "todo" } },
        content: "1a",
        data: {},
        parent_id: "col1",
        parent_idx: 0,
        symlink_to: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as KNode,
      {
        id: "1b",
        type: "p",
        item: { list: "-", task: { marker: "[ ]", status: "todo" } },
        content: "1b",
        data: {},
        parent_id: "col1",
        parent_idx: 1,
        symlink_to: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as KNode,
      {
        id: "col2",
        type: "h",
        item: {},
        fstype: "folder",
        content: undefined,
        data: { name: "col2" },
        parent_id: "board",
        parent_idx: 1,
        symlink_to: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as KNode,
      {
        id: "2a",
        type: "p",
        item: { list: "-", task: { marker: "[ ]", status: "todo" } },
        content: "2a",
        data: {},
        parent_id: "col2",
        parent_idx: 0,
        symlink_to: null,
        created_at: Date.now(),
        updated_at: Date.now(),
        version: "v1",
      } as KNode,
    ]

    const result = compare(nodes, "board")
    if (result.diffs.length > 0) {
      console.log("DIFFS (item-style 3-col):", result.diffs)
    }
    expect(result.diffs).toEqual([])
  })

  test("walkOrder matches between lens and legacy", () => {
    const nodes = [
      n("board", null),
      n("col1", "board", "h", { parent_idx: 0 }),
      n("1a", "col1", "p", { parent_idx: 0 }),
      n("1b", "col1", "p", { parent_idx: 1 }),
      n("col2", "board", "h", { parent_idx: 1 }),
      n("2a", "col2", "p"),
    ]

    const repo = createFakeRepo({ nodes })

    // Legacy: get walk order from ViewNode tree
    const viewTree = buildViewTree(repo, "board", new Map())
    const legacyWalk: string[] = []
    function walkViewNode(vn: ViewNode) {
      if (vn.role !== "board") legacyWalk.push(vn.id)
      for (const child of vn.children) walkViewNode(child)
    }
    walkViewNode(viewTree)

    // Lens: get walk order from visible lens
    const viewLens = createViewLens(repo, { rootId: "board", foldDepths: new Map() })
    const visibleLens = createVisibleLens(viewLens)
    const lensWalk = [...visibleLens.walkOrder]

    expect(lensWalk).toEqual(legacyWalk)
  })
})
