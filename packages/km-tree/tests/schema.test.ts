/**
 * Schema Tests — canHaveChildren, canParent, canBecomeBlock
 */

import { describe, test, expect } from "vitest"
import { createTestRepo } from "@km/storage"
import { canHaveChildren, canParent, canBecomeBlock } from "../src/schema.ts"

describe("canHaveChildren", () => {
  test("item node can have children", () => {
    expect(canHaveChildren({ item: {} })).toBe(true)
  })

  test("block node (no item) cannot have children", () => {
    expect(canHaveChildren({})).toBe(false)
    expect(canHaveChildren({ item: undefined })).toBe(false)
  })
})

describe("canParent", () => {
  test("item parent can accept any child", () => {
    expect(canParent({ item: {} }, { item: {} })).toBe(true)
    expect(canParent({ item: {} }, {})).toBe(true)
  })

  test("block parent cannot accept children", () => {
    expect(canParent({}, { item: {} })).toBe(false)
    expect(canParent({}, {})).toBe(false)
  })
})

describe("canBecomeBlock", () => {
  test("childless item can become block", () => {
    const repo = createTestRepo()
    const parentId = repo.addNode(null, { type: "h", item: {}, name: "Section", content: "Section" })
    const childId = repo.addNode(parentId, { type: "p", item: {}, content: "Leaf item", parent_idx: 1 })

    expect(canBecomeBlock(repo, childId)).toBe(true)
  })

  test("item with children cannot become block", () => {
    const repo = createTestRepo()
    const parentId = repo.addNode(null, { type: "h", item: {}, name: "Section", content: "Section" })
    const childId = repo.addNode(parentId, { type: "p", item: {}, content: "Has kids", parent_idx: 1 })
    repo.addNode(childId, { type: "p", content: "Grandchild", parent_idx: 1 })

    expect(canBecomeBlock(repo, childId)).toBe(false)
  })

  test("block node with no children can become block (already is)", () => {
    const repo = createTestRepo()
    const parentId = repo.addNode(null, { type: "h", item: {}, name: "Section", content: "Section" })
    const blockId = repo.addNode(parentId, { type: "p", content: "Paragraph", parent_idx: 1 })

    expect(canBecomeBlock(repo, blockId)).toBe(true)
  })
})
