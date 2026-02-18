/**
 * Structural Sharing Tests for useColumns
 *
 * Verifies that applyStructuralSharing reuses previous CardState references
 * when the underlying data hasn't changed, enabling reference equality
 * checks in React.memo instead of field-by-field comparison.
 */

import { describe, it, expect } from "vitest"
import type { KNode } from "@km/core"
import type { ColumnState, CardState } from "../src/types.ts"
import { applyStructuralSharing, deriveColumnsFromRepo } from "../src/hooks/use-columns.ts"
import { createFakeRepo } from "@km/storage"
import { item } from "./helpers/board-test.ts"

// =============================================================================
// Helpers
// =============================================================================

function makeNode(overrides: Partial<KNode> = {}): KNode {
  return {
    id: "node-1",
    type: "li",
    parent_id: "col-1",
    parent_idx: 0,
    content: "Test task",
    data: {},
    link_to: null,
    created_at: 1000,
    updated_at: 1000,
    version: "v1",
    ...overrides,
  }
}

function makeCard(overrides: Partial<CardState> & { node?: Partial<KNode> } = {}): CardState {
  const { node: nodeOverrides, ...cardOverrides } = overrides
  return {
    node: makeNode(nodeOverrides),
    children: [],
    childCount: 0,
    ...cardOverrides,
  }
}

function makeColumn(id: string, cards: CardState[], overrides: Partial<ColumnState> = {}): ColumnState {
  return {
    node: makeNode({ id, type: "oi", content: id }),
    cards,
    ...overrides,
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("applyStructuralSharing", () => {
  it("reuses card reference when data is identical", () => {
    const prevCard = makeCard({ node: { id: "card-1", content: "Task A" } })
    const nextCard = makeCard({ node: { id: "card-1", content: "Task A" } })

    const prev = [makeColumn("col-1", [prevCard])]
    const next = [makeColumn("col-1", [nextCard])]

    const result = applyStructuralSharing(prev, next)

    // Should reuse the previous card reference (same object)
    expect(result[0]!.cards[0]).toBe(prevCard)
    expect(result[0]!.cards[0]).not.toBe(nextCard)
  })

  it("returns new card reference when content changes", () => {
    const prevCard = makeCard({ node: { id: "card-1", content: "Task A" } })
    const nextCard = makeCard({ node: { id: "card-1", content: "Task A updated" } })

    const prev = [makeColumn("col-1", [prevCard])]
    const next = [makeColumn("col-1", [nextCard])]

    const result = applyStructuralSharing(prev, next)

    // Should use the new card reference (content changed)
    expect(result[0]!.cards[0]).toBe(nextCard)
    expect(result[0]!.cards[0]).not.toBe(prevCard)
  })

  it("returns new card reference when task_status changes", () => {
    const prevCard = makeCard({ node: { id: "card-1", content: "Task", task_status: "todo" } })
    const nextCard = makeCard({ node: { id: "card-1", content: "Task", task_status: "done" } })

    const prev = [makeColumn("col-1", [prevCard])]
    const next = [makeColumn("col-1", [nextCard])]

    const result = applyStructuralSharing(prev, next)

    expect(result[0]!.cards[0]).toBe(nextCard)
  })

  it("returns new card reference when due_at changes", () => {
    const prevCard = makeCard({ node: { id: "card-1", content: "Task", due_at: "2026-01-01" } })
    const nextCard = makeCard({ node: { id: "card-1", content: "Task", due_at: "2026-02-01" } })

    const prev = [makeColumn("col-1", [prevCard])]
    const next = [makeColumn("col-1", [nextCard])]

    const result = applyStructuralSharing(prev, next)

    expect(result[0]!.cards[0]).toBe(nextCard)
  })

  it("returns new card reference when priority changes", () => {
    const prevCard = makeCard({ node: { id: "card-1", content: "Task", priority: 1 } })
    const nextCard = makeCard({ node: { id: "card-1", content: "Task", priority: 3 } })

    const prev = [makeColumn("col-1", [prevCard])]
    const next = [makeColumn("col-1", [nextCard])]

    const result = applyStructuralSharing(prev, next)

    expect(result[0]!.cards[0]).toBe(nextCard)
  })

  it("returns new card reference when childCount changes", () => {
    const prevCard = makeCard({ node: { id: "card-1" }, childCount: 2 })
    const nextCard = makeCard({ node: { id: "card-1" }, childCount: 3 })

    const prev = [makeColumn("col-1", [prevCard])]
    const next = [makeColumn("col-1", [nextCard])]

    const result = applyStructuralSharing(prev, next)

    expect(result[0]!.cards[0]).toBe(nextCard)
  })

  it("reuses entire previous array when nothing changes", () => {
    const card1 = makeCard({ node: { id: "card-1", content: "A" } })
    const card2 = makeCard({ node: { id: "card-2", content: "B" } })

    const prev = [makeColumn("col-1", [card1, card2])]
    const next = [
      makeColumn("col-1", [
        makeCard({ node: { id: "card-1", content: "A" } }),
        makeCard({ node: { id: "card-2", content: "B" } }),
      ]),
    ]

    const result = applyStructuralSharing(prev, next)

    // Entire array should be reused
    expect(result).toBe(prev)
  })

  it("handles new columns (no previous match)", () => {
    const prev: ColumnState[] = []
    const nextCard = makeCard({ node: { id: "card-1" } })
    const next = [makeColumn("col-1", [nextCard])]

    const result = applyStructuralSharing(prev, next)

    // No previous to share with — uses new references
    expect(result[0]!.cards[0]).toBe(nextCard)
  })

  it("handles card count changes within a column", () => {
    const prevCard = makeCard({ node: { id: "card-1", content: "A" } })
    const nextCard1 = makeCard({ node: { id: "card-1", content: "A" } })
    const nextCard2 = makeCard({ node: { id: "card-2", content: "B" } })

    const prev = [makeColumn("col-1", [prevCard])]
    const next = [makeColumn("col-1", [nextCard1, nextCard2])]

    const result = applyStructuralSharing(prev, next)

    // First card should be shared, second is new
    expect(result[0]!.cards[0]).toBe(prevCard)
    expect(result[0]!.cards[1]).toBe(nextCard2)
    expect(result[0]!.cards.length).toBe(2)
  })

  it("handles multiple columns with mixed changes", () => {
    const prevCard1 = makeCard({ node: { id: "card-1", content: "A" } })
    const prevCard2 = makeCard({ node: { id: "card-2", content: "B" } })

    const prev = [makeColumn("col-1", [prevCard1]), makeColumn("col-2", [prevCard2])]

    const next = [
      makeColumn("col-1", [makeCard({ node: { id: "card-1", content: "A" } })]),
      makeColumn("col-2", [makeCard({ node: { id: "card-2", content: "B changed" } })]),
    ]

    const result = applyStructuralSharing(prev, next)

    // Col-1 card unchanged — reuse reference
    expect(result[0]!.cards[0]).toBe(prevCard1)
    // Col-2 card changed — new reference
    expect(result[1]!.cards[0]).not.toBe(prevCard2)
    expect(result[1]!.cards[0]!.node.content).toBe("B changed")
  })

  it("handles virtual body cards (individual, not merged)", () => {
    const prevCard1 = makeCard({
      node: { id: "body-1", type: "p", content: "Paragraph 1" },
      isVirtual: true,
    })
    const prevCard2 = makeCard({
      node: { id: "body-2", type: "p", content: "Paragraph 2" },
      isVirtual: true,
    })

    // Same body content
    const nextCard1 = makeCard({
      node: { id: "body-1", type: "p", content: "Paragraph 1" },
      isVirtual: true,
    })
    const nextCard2 = makeCard({
      node: { id: "body-2", type: "p", content: "Paragraph 2" },
      isVirtual: true,
    })

    const prev = [makeColumn("col-1", [prevCard1, prevCard2])]
    const next = [makeColumn("col-1", [nextCard1, nextCard2])]

    const result = applyStructuralSharing(prev, next)

    // Body content unchanged — reuse references
    expect(result[0]!.cards[0]).toBe(prevCard1)
    expect(result[0]!.cards[1]).toBe(prevCard2)
  })

  it("detects virtual body card content change", () => {
    const prevCard1 = makeCard({
      node: { id: "body-1", type: "p", content: "Paragraph 1" },
      isVirtual: true,
    })
    const prevCard2 = makeCard({
      node: { id: "body-2", type: "p", content: "Old text" },
      isVirtual: true,
    })

    const nextCard1 = makeCard({
      node: { id: "body-1", type: "p", content: "Paragraph 1" },
      isVirtual: true,
    })
    const nextCard2 = makeCard({
      node: { id: "body-2", type: "p", content: "New text" },
      isVirtual: true,
    })

    const prev = [makeColumn("col-1", [prevCard1, prevCard2])]
    const next = [makeColumn("col-1", [nextCard1, nextCard2])]

    const result = applyStructuralSharing(prev, next)

    // First card unchanged, second changed
    expect(result[0]!.cards[0]).toBe(prevCard1)
    expect(result[0]!.cards[1]).toBe(nextCard2)
  })
})

describe("deriveColumnsFromRepo + structural sharing", () => {
  it("returns same card references when repo version changes but card data does not", () => {
    const nodes = item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a")))
    const repo = createFakeRepo({ nodes })
    const foldedNodes = new Set<string>()

    // First derivation
    const columns1 = deriveColumnsFromRepo(repo, "board", foldedNodes)

    // Mutate a node in col2 (should not affect col1 cards)
    repo.updateNode("2a", { content: "2a updated" })

    // Second derivation
    const columns2 = deriveColumnsFromRepo(repo, "board", foldedNodes)

    // Apply structural sharing
    const shared = applyStructuralSharing(columns1, columns2)

    // Col1 cards should be reused (col2 changed, col1 didn't)
    expect(shared[0]!.cards[0]).toBe(columns1[0]!.cards[0])
    expect(shared[0]!.cards[1]).toBe(columns1[0]!.cards[1])

    // Col2 card should have new content
    expect(shared[1]!.cards[0]!.node.content).toBe("2a updated")
    expect(shared[1]!.cards[0]).not.toBe(columns1[1]!.cards[0])
  })
})
