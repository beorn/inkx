/**
 * Tree Snapshot API — TestApp.snapshotTree() / expectTreeSnapshot()
 *
 * Structured snapshots capture the semantic board tree without pinning raw
 * terminal cells. Use them when the behavior is tree shape, cursor, folding,
 * view, focus, or overlay state rather than renderer geometry.
 */

import { describe, expect, test } from "vitest"
import { createTestApp, item } from "./helpers/create-test-app.ts"

describe("TestApp.snapshotTree()", () => {
  test("emits header and tree lines in the documented format", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))))

    const snap = app.snapshotTree()
    const [header, ...treeLines] = snap.split("\n")

    expect(header).toMatch(/^view=cards focus=\S+ overlay=null$/)
    expect(treeLines).toEqual([
      "> column: col1 [cursor=false]",
      "    task: task1 [cursor]",
      "    task: task2",
      "> column: col2 [cursor=false]",
      "    task: task3",
    ])
  })

  test("cursor marker moves after navigation", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2"))))

    expect(app.snapshotTree()).toContain("task: task1 [cursor]")
    expect(app.snapshotTree()).not.toContain("task: task2 [cursor]")

    app.press("j")

    const after = app.snapshotTree()
    expect(after).toContain("task: task2 [cursor]")
    expect(after).not.toContain("task: task1 [cursor]")
    expect(after).toMatch(/task: task1$/m)
  })

  test("expectTreeSnapshot matches a saved snapshot", () => {
    using app = createTestApp(item("board", item("col1", item("task1"), item("task2")), item("col2", item("task3"))))

    expect(app.snapshotTree()).toMatchInlineSnapshot(`
      "view=cards focus=main overlay=null
      > column: col1 [cursor=false]
          task: task1 [cursor]
          task: task2
      > column: col2 [cursor=false]
          task: task3"
    `)

    app.expectTreeSnapshot("after-init")
  })
})
