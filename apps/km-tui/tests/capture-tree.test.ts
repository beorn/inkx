/**
 * captureTree — unit tests for repo → SelectionTree snapshot.
 *
 * Verifies walkOrder, has, contains against a known repo shape, and confirms
 * the snapshot is immutable relative to subsequent repo mutations.
 */

import { describe, expect, test } from "vitest"
import { createFakeRepo } from "@km/storage"
import type { ID } from "@silvery/selection"
import { captureTree } from "../src/state/capture-tree.ts"
import { item } from "./helpers/board-test.ts"

const asId = (s: string) => s as ID

describe("captureTree", () => {
  test("walkOrder returns DFS walk from root", () => {
    // board → col1 → 1a, 1b, 1c
    const repo = createFakeRepo({
      nodes: item("board", item("col1", item("1a"), item("1b"), item("1c"))),
    })

    const tree = captureTree(repo, asId("board"))

    // DFS order: board, col1, 1a, 1b, 1c
    expect(tree.walkOrder(null)).toEqual(["board", "col1", "1a", "1b", "1c"])
  })

  test("has returns true for nodes in walk, false otherwise", () => {
    const repo = createFakeRepo({
      nodes: item("board", item("col1", item("1a"), item("1b"))),
    })

    const tree = captureTree(repo, asId("board"))

    expect(tree.has(asId("board"))).toBe(true)
    expect(tree.has(asId("col1"))).toBe(true)
    expect(tree.has(asId("1a"))).toBe(true)
    expect(tree.has(asId("1b"))).toBe(true)
    expect(tree.has(asId("ghost"))).toBe(false)
  })

  test("contains: ancestor contains descendant (direct + transitive)", () => {
    const repo = createFakeRepo({
      nodes: item("board", item("col1", item("1a"), item("1b"))),
    })

    const tree = captureTree(repo, asId("board"))

    // Direct
    expect(tree.contains(asId("col1"), asId("1a"))).toBe(true)
    expect(tree.contains(asId("board"), asId("col1"))).toBe(true)
    // Transitive
    expect(tree.contains(asId("board"), asId("1a"))).toBe(true)
    expect(tree.contains(asId("board"), asId("1b"))).toBe(true)
    // Self
    expect(tree.contains(asId("1a"), asId("1a"))).toBe(true)
    // Negative: sibling is not an ancestor
    expect(tree.contains(asId("1a"), asId("1b"))).toBe(false)
    // Negative: child is not an ancestor of its parent
    expect(tree.contains(asId("1a"), asId("col1"))).toBe(false)
  })

  test("snapshot is immutable relative to repo mutations after capture", () => {
    const repo = createFakeRepo({
      nodes: item("board", item("col1", item("1a"), item("1b"))),
    })

    const prevTree = captureTree(repo, asId("board"))

    // Mutate the repo: delete 1a
    repo.deleteNode("1a")

    // prevTree should still see 1a
    expect(prevTree.has(asId("1a"))).toBe(true)
    expect(prevTree.walkOrder(null)).toContain("1a")

    // Fresh capture reflects the mutation
    const nextTree = captureTree(repo, asId("board"))
    expect(nextTree.has(asId("1a"))).toBe(false)
    expect(nextTree.walkOrder(null)).not.toContain("1a")
  })

  test("walkOrder scopes to the given root's subtree", () => {
    // board → col1 → 1a, col2 → 2a
    const repo = createFakeRepo({
      nodes: item("board", item("col1", item("1a")), item("col2", item("2a"))),
    })

    const col1Tree = captureTree(repo, asId("col1"))

    // Scoped to col1 only — col2 + 2a are absent
    expect(col1Tree.walkOrder(null)).toEqual(["col1", "1a"])
    expect(col1Tree.has(asId("col2"))).toBe(false)
    expect(col1Tree.has(asId("2a"))).toBe(false)
    expect(col1Tree.has(asId("1a"))).toBe(true)
  })

  test("null root walks from top-level children", () => {
    // Two separate top-level trees
    const repo = createFakeRepo({
      nodes: [
        ...item("board", item("col1", item("1a"))),
        // simulate a second top-level board by directly appending with null parent
      ],
    })

    const tree = captureTree(repo, null)

    // Should include everything under null-parent roots
    expect(tree.has(asId("board"))).toBe(true)
    expect(tree.has(asId("col1"))).toBe(true)
    expect(tree.has(asId("1a"))).toBe(true)
  })
})
