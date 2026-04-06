/**
 * Board Render Tests (Pure Data)
 *
 * useChildren hook tests (from use-children.test.ts).
 */

import React, { act } from "react"
import { describe, it, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Text } from "@silvery/ag-react"

import { useChildren } from "../src/hooks/use-children.ts"
import { item } from "./helpers/board-test.ts"
import { createFakeRepo, createStoreFromRepo, withReactive } from "@km/storage"
import type { Repo } from "@km/storage"
import { StoreProvider } from "../src/state/store-context.tsx"

/** Simple wrapper component that renders children IDs for assertion */
function ChildrenDisplay({ repo, parentId }: { repo: Parameters<typeof useChildren>[0]; parentId: string | null }) {
  const children = useChildren(repo, parentId)
  return React.createElement(Text, null, children.map((c) => c.id).join(","))
}

/** Wrap ChildrenDisplay with StoreProvider for signal-based reactivity */
function renderChildrenDisplay(repo: Repo, parentId: string | null) {
  const reactiveStore = withReactive(createStoreFromRepo(repo))
  const inner = React.createElement(ChildrenDisplay, { repo, parentId })
  return React.createElement(StoreProvider, { store: reactiveStore, children: inner })
}

const render = createRenderer()

describe("useChildren", () => {
  it("returns children of a parent node", () => {
    const nodes = item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a")))
    const repo = createFakeRepo({ nodes })

    const app = render(renderChildrenDisplay(repo, "col1"))

    expect(app.text).toContain("1a,1b")
  })

  it("returns empty array for leaf node", () => {
    const nodes = item("board", item("col1", item("task1")))
    const repo = createFakeRepo({ nodes })

    const app = render(renderChildrenDisplay(repo, "task1"))

    expect(app.text).toBe("")
  })

  it("returns root children when parentId is null", () => {
    const nodes = item("board", item("col1"), item("col2"))
    const repo = createFakeRepo({ nodes })

    const app = render(renderChildrenDisplay(repo, null))

    expect(app.text).toContain("board")
  })

  it("updates when repo is mutated", () => {
    const nodes = item("board", item("col1", item("task1")))
    const repo = createFakeRepo({ nodes })

    const el = renderChildrenDisplay(repo, "col1")
    const app = render(el)

    expect(app.text).toBe("task1")

    repo.addNode("col1", { type: "p", item: {}, content: "task2" })
    act(() => {
      app.rerender(el)
    })

    expect(app.text).toContain("task1")
    expect(app.text).toContain("fake-1")
  })
})
