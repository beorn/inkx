import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createFakeRepo } from "@km/storage"
import { describe, expect, test } from "vitest"
import { createNodeStore } from "../src/state/reactive.ts"
import { item } from "./helpers/board-test.ts"

const __dirname = dirname(fileURLToPath(import.meta.url))

describe("reactive node store cursor locality", () => {
  test("cursorChild tracks only the cursor's direct parent", () => {
    const nodes = item(
      "board",
      item("col", item.folder("parent", item.folder("branch", item("leaf")), item("sibling"))),
    )
    const repo = createFakeRepo({ nodes })
    const store = createNodeStore()

    store.hydrate(repo, "board", new Map(), new Set())
    store.setCursor("leaf")

    expect(store.cursorChild("branch")()).toBe(true)
    expect(store.cursorChild("parent")()).toBe(false)
    expect(store.cursorDescendant("parent")()).toBe(true)

    store.setCursor("sibling")

    expect(store.cursorChild("branch")()).toBe(false)
    expect(store.cursorChild("parent")()).toBe(true)
  })

  test("TreeNode uses per-node cursor signals instead of the global cursor signal", () => {
    const treeNodeSource = readFileSync(resolve(__dirname, "../src/views/TreeNode.tsx"), "utf8")

    expect(treeNodeSource).not.toContain("useSignal(nodeStore.cursor)")
  })
})
