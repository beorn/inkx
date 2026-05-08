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
    expect(store.cursorPathChildId("branch")()).toBe("leaf")
    expect(store.cursorPathChildId("parent")()).toBe("branch")
    expect(store.cursorChild("parent")()).toBe(false)
    expect(store.cursorDescendant("parent")()).toBe(true)

    store.setCursor("sibling")

    expect(store.cursorChild("branch")()).toBe(false)
    expect(store.cursorPathChildId("branch")()).toBeNull()
    expect(store.cursorPathChildId("parent")()).toBe("sibling")
    expect(store.cursorChild("parent")()).toBe(true)
  })

  test("cursor hot path does not subscribe rendered trees or controller to global cursor", () => {
    const sourceFiles = [
      "../src/views/TreeNode.tsx",
      "../src/views/CardColumn.tsx",
      "../src/views/useBoardController.ts",
    ]

    for (const sourceFile of sourceFiles) {
      const source = readFileSync(resolve(__dirname, sourceFile), "utf8")
      expect(source, sourceFile).not.toContain("useSignal(nodeStore.cursor)")
    }

    const controllerSource = readFileSync(resolve(__dirname, "../src/views/useBoardController.ts"), "utf8")
    expect(controllerSource).not.toContain("useSignal(paneSel.node.cursor)")
    expect(controllerSource).not.toContain("useSignal(ps.sel.node.cursor)")
  })

  test("command context keeps a visible-lens node index cache", () => {
    const boardAppSource = readFileSync(resolve(__dirname, "../src/board/board-app.ts"), "utf8")

    expect(boardAppSource).toContain("nodeIndexCache")
    expect(boardAppSource).toContain("cachedNodeIndex?.lens === visibleLens")
  })
})
