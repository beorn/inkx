import { describe, expect, test } from "vitest"
import { findDefaultAddSection, type RulePlacementNode } from "../src/index.ts"

function childrenByParent(nodes: RulePlacementNode[]): (parentId: string) => RulePlacementNode[] {
  return (parentId) => nodes.filter((node) => (node.data?.parentId as string | undefined) === parentId)
}

describe("findDefaultAddSection", () => {
  test("uses km.default before first eligible fallback", () => {
    const nodes: RulePlacementNode[] = [
      { id: "doing", type: "h", fstype: "mdsection", item: {}, data: { parentId: "board" } },
      { id: "inbox", type: "h", fstype: "mdsection", item: {}, rules: { default: true }, data: { parentId: "board" } },
    ]

    expect(findDefaultAddSection("board", childrenByParent(nodes))?.id).toBe("inbox")
  })

  test("uses nested km.default before an earlier fallback", () => {
    const nodes: RulePlacementNode[] = [
      { id: "doing", type: "h", fstype: "mdsection", item: {}, data: { parentId: "board" } },
      { id: "archive", type: "h", fstype: "mdsection", item: {}, data: { parentId: "board" } },
      {
        id: "inbox",
        type: "h",
        fstype: "mdsection",
        item: {},
        rules: { default: true },
        data: { parentId: "archive" },
      },
    ]

    expect(findDefaultAddSection("board", childrenByParent(nodes))?.id).toBe("inbox")
  })

  test("falls back to the first non-collapsed, non-removed section", () => {
    const nodes: RulePlacementNode[] = [
      {
        id: "collapsed",
        type: "h",
        fstype: "mdsection",
        item: {},
        rules: { collapse: true },
        data: { parentId: "board" },
      },
      { id: "queue", type: "h", fstype: "mdsection", item: {}, data: { parentId: "board" } },
      { id: "done", type: "h", fstype: "mdsection", item: {}, rules: { removed: true }, data: { parentId: "board" } },
    ]

    expect(findDefaultAddSection("board", childrenByParent(nodes))?.id).toBe("queue")
  })

  test("does not fall back into collapsed or removed sections", () => {
    const nodes: RulePlacementNode[] = [
      {
        id: "collapsed",
        type: "h",
        fstype: "mdsection",
        item: {},
        rules: { collapse: true },
        data: { parentId: "board" },
      },
      { id: "hidden-child", type: "h", fstype: "mdsection", item: {}, data: { parentId: "collapsed" } },
      {
        id: "removed",
        type: "h",
        fstype: "mdsection",
        item: {},
        rules: { removed: true },
        data: { parentId: "board" },
      },
      { id: "removed-child", type: "h", fstype: "mdsection", item: {}, data: { parentId: "removed" } },
      { id: "queue", type: "h", fstype: "mdsection", item: {}, data: { parentId: "board" } },
    ]

    expect(findDefaultAddSection("board", childrenByParent(nodes))?.id).toBe("queue")
  })

  test("does not let nested fallback outrank the direct section", () => {
    const nodes: RulePlacementNode[] = [
      { id: "queue", type: "h", fstype: "mdsection", item: {}, data: { parentId: "board" } },
      { id: "deep", type: "h", fstype: "mdsection", item: {}, data: { parentId: "queue" } },
    ]

    expect(findDefaultAddSection("board", childrenByParent(nodes))?.id).toBe("queue")
  })

  test("ignores non-section outline nodes", () => {
    const nodes: RulePlacementNode[] = [
      { id: "embed-card", type: "h", item: {}, rules: { default: true }, data: { parentId: "board" } },
      { id: "queue", type: "h", fstype: "mdsection", item: {}, data: { parentId: "board" } },
    ]

    expect(findDefaultAddSection("board", childrenByParent(nodes))?.id).toBe("queue")
  })
})
