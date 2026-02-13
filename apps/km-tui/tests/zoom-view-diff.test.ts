/**
 * Zoom View Diff Test
 *
 * When zooming into a file-backed node (.md), cards should render with the same
 * border style as at the root level. Previously, embed cards were incorrectly
 * marked as virtual (isVirtual: true) when zoomed in, causing their borders
 * to use "black" (invisible) instead of "blackBright" (visible gray).
 *
 * Root cause: kNodeToColumnState marks all non-task cards as virtual when
 * a column has no structural children (sections/files/folders). Embeds
 * are not structural and not tasks, so they got marked virtual.
 */

import { describe, test, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import { deriveColumnsFromRepo } from "../src/hooks/use-columns.ts"
import type { KNode } from "@km/core"
import { ulid } from "ulid"

function makeNode(partial: Partial<KNode> & { id: string; type: KNode["type"] }): KNode {
  return {
    id: partial.id,
    type: partial.type,
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
      makeNode({ id: rootId, type: "file", title: "Next Actions", parent_id: null }),
      makeNode({ id: sectionId, type: "section", title: "Processing", parent_id: rootId, parent_idx: 0 }),
      makeNode({
        id: embed1Id,
        type: "embed",
        content: "Embed 1",
        parent_id: sectionId,
        parent_idx: 0,
        link_to: targetId,
      }),
      makeNode({
        id: embed2Id,
        type: "embed",
        content: "Embed 2",
        parent_id: sectionId,
        parent_idx: 1,
        link_to: targetId,
      }),
      // Target node for embeds
      makeNode({ id: targetId, type: "task", title: "Some task", parent_id: null }),
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
      makeNode({ id: rootId, type: "file", title: "Notes", parent_id: null }),
      makeNode({ id: sectionId, type: "section", title: "Intro", parent_id: rootId, parent_idx: 0 }),
      makeNode({ id: para1Id, type: "paragraph", content: "First paragraph", parent_id: sectionId, parent_idx: 0 }),
      makeNode({ id: para2Id, type: "paragraph", content: "Second paragraph", parent_id: sectionId, parent_idx: 1 }),
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
      makeNode({ id: rootId, type: "file", title: "Mixed", parent_id: null }),
      makeNode({ id: sectionId, type: "section", title: "Section", parent_id: rootId, parent_idx: 0 }),
      makeNode({ id: paraId, type: "paragraph", content: "Intro text", parent_id: sectionId, parent_idx: 0 }),
      makeNode({
        id: embedId,
        type: "embed",
        content: "Embed ref",
        parent_id: sectionId,
        parent_idx: 1,
        link_to: targetId,
      }),
      makeNode({ id: targetId, type: "task", title: "Target", parent_id: null }),
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
