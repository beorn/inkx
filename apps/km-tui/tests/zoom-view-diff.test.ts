/**
 * Zoom View Diff Test
 *
 * When zooming into a file-backed node (.md), cards should render identically
 * to the board root view. Two issues caused visual differences:
 *
 * 1. Root-level column derivation: deriveColumnsFromRepo used !isBlock() to
 *    filter columns, making li/link nodes into columns. buildBoardState uses
 *    extractBody() which only treats oi nodes as columns. Fix: use extractBody
 *    in both paths, with a virtual body column for leading content.
 *
 * 2. Per-column embed handling: kNodeToColumnState correctly handles embeds
 *    as non-virtual cards when no structural children exist.
 */

import { describe, test, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import { deriveColumnsFromRepo } from "../src/hooks/use-columns.ts"
import { buildBoardState } from "../src/state.ts"
import type { KNode } from "@km/core"
import { ulid } from "ulid"

function makeNode(partial: Partial<KNode> & { id: string; type: KNode["type"] }): KNode {
  return {
    id: partial.id,
    type: partial.type,
    ...(partial.fstype ? { fstype: partial.fstype } : {}),
    ...(partial.list_marker ? { list_marker: partial.list_marker } : {}),
    ...(partial.embed ? { embed: partial.embed } : {}),
    parent_id: partial.parent_id ?? null,
    parent_idx: partial.parent_idx ?? 0,
    link_to: partial.link_to ?? null,
    title: partial.title,
    content: partial.content ?? partial.title ?? "",
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "mock",
  }
}

describe("Zoom View Diff - embed cards should not be virtual", () => {
  test("embed cards in a column are NOT marked virtual", () => {
    // Simulate: file node "@next" with sections containing embeds
    const rootId = ulid()
    const sectionId = ulid()
    const embed1Id = ulid()
    const embed2Id = ulid()
    const targetId = ulid()

    const nodes: KNode[] = [
      makeNode({ id: rootId, type: "oi", fstype: "mdfile", title: "Next Actions", parent_id: null }),
      makeNode({ id: sectionId, type: "oi", fstype: "mdsection", title: "Processing", parent_id: rootId, parent_idx: 0 }),
      makeNode({
        id: embed1Id,
        type: "link",
        embed: true,
        content: "Embed 1",
        parent_id: sectionId,
        parent_idx: 0,
        link_to: targetId,
      }),
      makeNode({
        id: embed2Id,
        type: "link",
        embed: true,
        content: "Embed 2",
        parent_id: sectionId,
        parent_idx: 1,
        link_to: targetId,
      }),
      // Target node for embeds
      makeNode({ id: targetId, type: "li", list_marker: "-", title: "Some task", parent_id: null }),
    ]

    const repo = createFakeRepo({ nodes })

    // Derive columns as if zoomed into the file node (rootId is the zoom root)
    const columns = deriveColumnsFromRepo(repo, rootId, new Set())

    // Should have 1 column: "Processing"
    expect(columns.length).toBe(1)
    const processingCol = columns[0]!
    expect(processingCol.node.id).toBe(sectionId)

    // Cards should be the embeds
    expect(processingCol.cards.length).toBe(2)

    // BUG: embeds were marked as virtual because they're not tasks and not structural
    // FIX: embeds should NOT be virtual — they are discrete items
    for (const card of processingCol.cards) {
      expect(card.isVirtual).toBeFalsy()
    }
  })

  test("paragraph cards in a column without structural children ARE virtual", () => {
    // Paragraphs are genuine body content — they should remain virtual
    const rootId = ulid()
    const sectionId = ulid()
    const para1Id = ulid()
    const para2Id = ulid()

    const nodes: KNode[] = [
      makeNode({ id: rootId, type: "oi", fstype: "mdfile", title: "Notes", parent_id: null }),
      makeNode({ id: sectionId, type: "oi", fstype: "mdsection", title: "Intro", parent_id: rootId, parent_idx: 0 }),
      makeNode({ id: para1Id, type: "p", content: "First paragraph", parent_id: sectionId, parent_idx: 0 }),
      makeNode({ id: para2Id, type: "p", content: "Second paragraph", parent_id: sectionId, parent_idx: 1 }),
    ]

    const repo = createFakeRepo({ nodes })
    const columns = deriveColumnsFromRepo(repo, rootId, new Set())

    expect(columns.length).toBe(1)
    const col = columns[0]!

    // Paragraphs in a column with no structural children and no tasks = all virtual
    for (const card of col.cards) {
      expect(card.isVirtual).toBe(true)
    }
  })

  test("mixed embed + paragraph column: embeds not virtual, paragraphs are body", () => {
    // When a column has both paragraphs (before structural) and embeds,
    // the embeds should still not be virtual
    const rootId = ulid()
    const sectionId = ulid()
    const paraId = ulid()
    const embedId = ulid()
    const targetId = ulid()

    const nodes: KNode[] = [
      makeNode({ id: rootId, type: "oi", fstype: "mdfile", title: "Mixed", parent_id: null }),
      makeNode({ id: sectionId, type: "oi", fstype: "mdsection", title: "Section", parent_id: rootId, parent_idx: 0 }),
      makeNode({ id: paraId, type: "p", content: "Intro text", parent_id: sectionId, parent_idx: 0 }),
      makeNode({
        id: embedId,
        type: "link",
        embed: true,
        content: "Embed ref",
        parent_id: sectionId,
        parent_idx: 1,
        link_to: targetId,
      }),
      makeNode({ id: targetId, type: "li", list_marker: "-", title: "Target", parent_id: null }),
    ]

    const repo = createFakeRepo({ nodes })
    const columns = deriveColumnsFromRepo(repo, rootId, new Set())

    expect(columns.length).toBe(1)
    const col = columns[0]!
    expect(col.cards.length).toBe(2)

    // Both are non-structural and there are no structural children,
    // so extractBody returns all in body with empty items.
    // With the fix, embed cards should NOT be virtual even in this case.
    const paraCard = col.cards.find((c) => c.node.id === paraId)
    const embedCard = col.cards.find((c) => c.node.id === embedId)

    // After fix: embed should not be virtual
    expect(embedCard?.isVirtual).toBeFalsy()
  })
})

describe("Zoom View Diff - deriveColumnsFromRepo matches buildBoardState", () => {
  test("li nodes before sections become body, not columns", () => {
    // When a file has list items before sections, they should NOT become columns.
    // Previously, deriveColumnsFromRepo used !isBlock() which made li/link into columns.
    const rootId = ulid()
    const taskId = ulid()
    const sectionId = ulid()
    const cardId = ulid()

    const nodes: KNode[] = [
      makeNode({ id: rootId, type: "oi", fstype: "mdfile", title: "Board", parent_id: null }),
      makeNode({ id: taskId, type: "li", list_marker: "-", content: "Leading task", parent_id: rootId, parent_idx: 0 }),
      makeNode({
        id: sectionId,
        type: "oi",
        fstype: "mdsection",
        title: "Section",
        parent_id: rootId,
        parent_idx: 1,
      }),
      makeNode({
        id: cardId,
        type: "li",
        list_marker: "-",
        content: "Card in section",
        parent_id: sectionId,
        parent_idx: 0,
      }),
    ]

    const repo = createFakeRepo({ nodes })

    // deriveColumnsFromRepo should produce the same structure as buildBoardState
    const derived = deriveColumnsFromRepo(repo, rootId, new Set())
    const built = buildBoardState(repo, rootId)

    // Both should have: 1 virtual body column + 1 structural column = 2 columns
    expect(derived.length).toBe(2)
    expect(built.columns.length).toBe(2)

    // First column should be virtual body
    expect(derived[0]!.isVirtual).toBe(true)
    expect(built.columns[0]!.isVirtual).toBe(true)

    // Second column should be the section
    expect(derived[1]!.node.id).toBe(sectionId)
    expect(built.columns[1]!.node.id).toBe(sectionId)
  })

  test("only oi nodes become columns in deriveColumnsFromRepo", () => {
    // Verify that link nodes are not turned into columns
    const rootId = ulid()
    const embedId = ulid()
    const targetId = ulid()
    const sectionId = ulid()

    const nodes: KNode[] = [
      makeNode({ id: rootId, type: "oi", fstype: "mdfile", title: "Board", parent_id: null }),
      makeNode({
        id: embedId,
        type: "link",
        embed: true,
        content: "Leading embed",
        parent_id: rootId,
        parent_idx: 0,
        link_to: targetId,
      }),
      makeNode({
        id: sectionId,
        type: "oi",
        fstype: "mdsection",
        title: "Section",
        parent_id: rootId,
        parent_idx: 1,
      }),
      makeNode({ id: targetId, type: "li", list_marker: "-", title: "Target task", parent_id: null }),
    ]

    const repo = createFakeRepo({ nodes })
    const columns = deriveColumnsFromRepo(repo, rootId, new Set())

    // Should have 2 columns: virtual body (with embed) + Section
    // NOT 3 columns (embed as column + section as column)
    expect(columns.length).toBe(2)
    expect(columns[0]!.isVirtual).toBe(true)
    expect(columns[1]!.node.id).toBe(sectionId)
  })

  test("file with only sections produces same columns from both paths", () => {
    // Common case: .md file with only section children (no leading body)
    const rootId = ulid()
    const sec1Id = ulid()
    const sec2Id = ulid()
    const task1Id = ulid()
    const task2Id = ulid()

    const nodes: KNode[] = [
      makeNode({ id: rootId, type: "oi", fstype: "mdfile", title: "Board", parent_id: null }),
      makeNode({ id: sec1Id, type: "oi", fstype: "mdsection", title: "Todo", parent_id: rootId, parent_idx: 0 }),
      makeNode({ id: sec2Id, type: "oi", fstype: "mdsection", title: "Done", parent_id: rootId, parent_idx: 1 }),
      makeNode({ id: task1Id, type: "li", list_marker: "-", content: "Task 1", parent_id: sec1Id, parent_idx: 0 }),
      makeNode({ id: task2Id, type: "li", list_marker: "-", content: "Task 2", parent_id: sec2Id, parent_idx: 0 }),
    ]

    const repo = createFakeRepo({ nodes })

    const derived = deriveColumnsFromRepo(repo, rootId, new Set())
    const built = buildBoardState(repo, rootId)

    // Both should have exactly 2 columns (no body column)
    expect(derived.length).toBe(2)
    expect(built.columns.length).toBe(2)

    // Column structure should match
    expect(derived[0]!.node.id).toBe(sec1Id)
    expect(derived[1]!.node.id).toBe(sec2Id)
    expect(built.columns[0]!.node.id).toBe(sec1Id)
    expect(built.columns[1]!.node.id).toBe(sec2Id)

    // Card counts should match
    expect(derived[0]!.cards.length).toBe(built.columns[0]!.cards.length)
    expect(derived[1]!.cards.length).toBe(built.columns[1]!.cards.length)
  })
})
