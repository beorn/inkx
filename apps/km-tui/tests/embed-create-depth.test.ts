/**
 * Embed Create Depth — Section depth when creating nodes among embeds
 *
 * Bug: When pressing `n` to create a node after an embed (`![[...]]`),
 * `handleAddNodeAfter` used to create a section with depth=2 (default)
 * because embeds have no `data.depth`. If the parent column is also
 * depth=2, the new section has the wrong depth for markdown round-trip.
 *
 * Fix: `siblingOrParentDepth()` in `board-actions-edit.ts` computes
 * the correct depth from the parent when the sibling has no depth.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

const colItems = (col: string) => `#${col} [data-view='item']`

describe("embed create depth", () => {
  test("new node after embed gets parent depth + 1", () => {
    // Simulate: an H2 column (depth=2) containing embeds (no depth)
    // When creating a new node among the embeds, it should get depth=3
    // (parent depth 2 + 1), NOT depth=2 (the default).
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("embed-a"), item("embed-b")))
      // Set parent column to depth=2 (simulates an H2 section)
      for (const n of nodes) {
        if (n.id === "col1") {
          n.data = { ...n.data, depth: 2 }
        }
        // Embeds have no depth — simulate by leaving data.depth unset
        // and setting link_to (what makes them embeds in the real app)
        if (n.id === "embed-a" || n.id === "embed-b") {
          n.link_to = "some-target"
          n.type = "oi"
          n.data = {} // no depth, like real embeds
        }
      }
      return nodes
    })

    // Navigate to first embed, press n to create new node after it
    board.press("n")
    board.press("Escape") // exit inline edit

    const items = board.q(colItems("col1"))
    expect(items.count()).toBe(3)

    // The new node (at position 1, between embed-a and embed-b) should
    // have depth=3 (parent col depth=2 + 1), NOT depth=2
    const newNodeId = items.nth(1).getAttribute("id")
    expect(newNodeId).toBeDefined()
    expect(newNodeId).not.toBe("embed-a")
    expect(newNodeId).not.toBe("embed-b")

    const newNode = repo.getNode(newNodeId!)
    expect(newNode).toBeTruthy()
    expect(newNode!.data?.depth).toBe(3)
  })

  test("new node after section sibling inherits sibling depth", () => {
    // When siblings have explicit depth, the new node should inherit it
    // directly (not compute from parent).
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("sec-a"), item("sec-b")))
      // Parent column is H1 (depth=1 would be unusual, let's use a more
      // realistic H2 parent with H3 children)
      for (const n of nodes) {
        if (n.id === "col1") {
          n.data = { ...n.data, depth: 2 }
        }
        if (n.id === "sec-a" || n.id === "sec-b") {
          n.type = "oi"
          n.data = { depth: 3 }
        }
      }
      return nodes
    })

    // Navigate to sec-a, press n
    board.press("n")
    board.press("Escape")

    const items = board.q(colItems("col1"))
    expect(items.count()).toBe(3)

    const newNodeId = items.nth(1).getAttribute("id")
    expect(newNodeId).toBeDefined()

    const newNode = repo.getNode(newNodeId!)
    expect(newNode).toBeTruthy()
    // Should inherit sibling depth=3 directly
    expect(newNode!.data?.depth).toBe(3)
  })

  test("new node at board root level gets depth 2", () => {
    // When the parent column has no depth (file node), children should
    // default to depth=2 (standard H2 under a file).
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("child-a"), item("child-b")))
      // col1 has no depth (simulates a file node)
      // children also have no depth (e.g., paragraphs or embeds)
      for (const n of nodes) {
        if (n.id === "child-a" || n.id === "child-b") {
          n.type = "oi"
          n.data = {} // no depth
        }
      }
      return nodes
    })

    board.press("n")
    board.press("Escape")

    const items = board.q(colItems("col1"))
    expect(items.count()).toBe(3)

    const newNodeId = items.nth(1).getAttribute("id")
    expect(newNodeId).toBeDefined()

    const newNode = repo.getNode(newNodeId!)
    expect(newNode).toBeTruthy()
    // Parent has no depth (file), so default is 2
    expect(newNode!.data?.depth).toBe(2)
  })

  test("new node before embed also gets correct depth", () => {
    // Same bug could occur with `p` (insert above) — verify it uses
    // siblingOrParentDepth too.
    const { board, repo } = testEnv(() => {
      const nodes = item("board", item("col1", item("embed-a"), item("embed-b")))
      for (const n of nodes) {
        if (n.id === "col1") {
          n.data = { ...n.data, depth: 2 }
        }
        if (n.id === "embed-a" || n.id === "embed-b") {
          n.link_to = "some-target"
          n.type = "oi"
          n.data = {}
        }
      }
      return nodes
    })

    // Press p to insert before current node
    board.press("p")
    board.press("Escape")

    const items = board.q(colItems("col1"))
    expect(items.count()).toBe(3)

    // The new node (at position 0, before embed-a) should get depth=3
    const newNodeId = items.nth(0).getAttribute("id")
    expect(newNodeId).toBeDefined()
    expect(newNodeId).not.toBe("embed-a")
    expect(newNodeId).not.toBe("embed-b")

    const newNode = repo.getNode(newNodeId!)
    expect(newNode).toBeTruthy()
    expect(newNode!.data?.depth).toBe(3)
  })
})
