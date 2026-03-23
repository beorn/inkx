/**
 * useChildren Hook Tests
 *
 * Tests the generic useChildren hook that returns children of any node.
 * Uses createFakeRepo + silvery createRenderer to exercise the React hook.
 */

import React, { act } from "react"
import { describe, it, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Text } from "@silvery/ag-react"
import { createFakeRepo } from "@km/storage"
import { item } from "./helpers/board-test.ts"
import { useChildren } from "../src/hooks/use-children.ts"

/** Simple wrapper component that renders children IDs for assertion */
function ChildrenDisplay({ repo, parentId }: { repo: Parameters<typeof useChildren>[0]; parentId: string | null }) {
  const children = useChildren(repo, parentId)
  return React.createElement(Text, null, children.map((c) => c.id).join(","))
}

const render = createRenderer()

describe("useChildren", () => {
  it("returns children of a parent node", () => {
    const nodes = item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a")))
    const repo = createFakeRepo({ nodes })

    const app = render(React.createElement(ChildrenDisplay, { repo, parentId: "col1" }))

    expect(app.text).toContain("1a,1b")
  })

  it("returns empty array for leaf node", () => {
    const nodes = item("board", item("col1", item("task1")))
    const repo = createFakeRepo({ nodes })

    const app = render(React.createElement(ChildrenDisplay, { repo, parentId: "task1" }))

    // Leaf node has no children — empty string from join
    expect(app.text).toBe("")
  })

  it("returns root children when parentId is null", () => {
    const nodes = item("board", item("col1"), item("col2"))
    const repo = createFakeRepo({ nodes })

    // "board" has parent_id: null, so getChildren(null) returns [board]
    const app = render(React.createElement(ChildrenDisplay, { repo, parentId: null }))

    expect(app.text).toContain("board")
  })

  it("updates when repo is mutated", () => {
    const nodes = item("board", item("col1", item("task1")))
    const repo = createFakeRepo({ nodes })

    const el = React.createElement(ChildrenDisplay, {
      repo,
      parentId: "col1",
    })
    const app = render(el)

    expect(app.text).toBe("task1")

    // Mutate and trigger re-render via rerender
    repo.addNode("col1", { type: "p", item: true, content: "task2" })
    act(() => {
      app.rerender(el)
    })

    // Should now show both children (task1 + the new fake-1 id)
    expect(app.text).toContain("task1")
    expect(app.text).toContain("fake-1")
  })
})
