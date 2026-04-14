/**
 * Unit tests for useCardInteraction's click-target resolver.
 *
 * The full DOM dispatch path is hard to exercise in headless mode because
 * the Card's outer Box may have a minimal scrollRect (h=1) when cards are
 * rendered inside a VirtualList, so clicks on visual border cells don't
 * map to the card's hit rect. These unit tests drive the walk logic
 * directly against synthetic node trees, covering the cases that matter:
 *
 * 1. Hit target already has an id → use it
 * 2. Hit target descends into a node with an id (inner content) → use that id
 * 3. Hit target is deep inside the card chrome (border / padding) with no id
 *    ancestor until the card boundary → STOP at the card boundary and use
 *    the card's own nodeId, NOT walk past it to the column's id
 *
 * Case 3 is the core of km-tui.card-border-click — without the card-boundary
 * stop, the DOM onClick walks up past the Card's outer Box (which has
 * `data-card-id` but no `id`) to the Column's `id={colId}` and dispatches
 * SELECT for the column, clobbering the card selection the app-level
 * mousedown handler just set. Symptom: cursor lands on the card, then
 * immediately jumps to the column header.
 */

import { describe, test, expect } from "vitest"
import { resolveClickTargetId } from "../src/hooks/use-card-interaction.tsx"

// Minimal node shape matching what resolveClickTargetId reads from AgNode.
type Node = { props: Record<string, unknown>; parent: Node | null }

// Build an ancestor chain and return the leaf (hit target). Arguments are
// ordered leaf → root. The walker reads `.parent` to climb upward, so we
// thread parents from root down to leaf so each node's `.parent` points
// toward the root.
function chain(...nodesLeafToRoot: Array<Record<string, unknown>>): Node {
  // Start at root, walk down to leaf, threading `.parent` upward.
  let parent: Node | null = null
  for (let i = nodesLeafToRoot.length - 1; i >= 0; i--) {
    parent = { props: nodesLeafToRoot[i]!, parent }
  }
  // parent is now the leaf with a chain of `.parent` refs leading to root.
  return parent!
}

describe("resolveClickTargetId", () => {
  test("returns fallback when hit target is a bare box with no ancestors", () => {
    const target = chain({})
    expect(resolveClickTargetId(target, "fallback-card")).toBe("fallback-card")
  })

  test("returns the deepest ancestor id when walking up from a text node", () => {
    // Hit a silvery-text inside the item box; walker finds task-2 first.
    const target = chain(
      { id: undefined }, // silvery-text (leaf)
      { id: undefined }, // inner wrapper
      { id: "task-2", "data-view": "item" }, // item box
      { "data-card-id": "task-2", "data-view": "card" }, // card wrapper
      { id: "Inbox", "data-view": "column" }, // column
    )
    expect(resolveClickTargetId(target, "task-2")).toBe("task-2")
  })

  test("stops at data-card-id boundary when no inner id exists (border cell)", () => {
    // Click lands on a border cell of the card — the hit target is a box
    // somewhere above the card interior (e.g., a wrapper) and the walker
    // reaches the Card's outer Box (data-card-id) without finding an `id`.
    // Without the card-boundary stop, the walk continues to the Column and
    // returns `Inbox` (wrong — would select the column).
    const target = chain(
      {}, // intermediate box (no id, no data-card-id)
      { "data-card-id": "task-2", "data-view": "card" }, // card wrapper — STOP HERE
      { id: "Inbox", "data-view": "column" }, // column — walker MUST NOT reach this
    )
    expect(resolveClickTargetId(target, "task-2")).toBe("task-2")
  })

  test("stops at data-view=card boundary even without data-card-id", () => {
    const target = chain(
      {},
      { "data-view": "card" }, // card wrapper with only data-view
      { id: "Inbox", "data-view": "column" },
    )
    expect(resolveClickTargetId(target, "task-2")).toBe("task-2")
  })

  test("prefers inner id over card boundary", () => {
    // When an inner sub-item (e.g., a child bullet) has its own id, the
    // walker finds it BEFORE hitting the card boundary. The sub-item id
    // wins — this is the embed / sub-item selection path.
    const target = chain(
      {},
      { id: "sub-bullet-1" }, // inner sub-item — walker stops here
      { id: "task-2", "data-view": "item" },
      { "data-card-id": "task-2", "data-view": "card" },
      { id: "Inbox", "data-view": "column" },
    )
    expect(resolveClickTargetId(target, "task-2")).toBe("sub-bullet-1")
  })

  test("handles null target gracefully (returns fallback)", () => {
    expect(resolveClickTargetId(null, "task-2")).toBe("task-2")
  })
})
