/**
 * Board Slow Tests - Integration tests using createFakeRepo test double
 * Run with: bun run test:all (includes slow tests)
 */

import { describe, test, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import type { KNode } from "@km/core"
import { getNodeDisplayName } from "../src/state.ts"
import { testEnv, item } from "./helpers/board-test.ts"
import { createViewLens, createVisibleLens } from "@km/board"

/** Helper: create lens from repo + rootId */
function lens(repo: ReturnType<typeof createFakeRepo>, rootId: string) {
  return createVisibleLens(createViewLens(repo, { rootId, foldDepths: new Map() }))
}

describe("Lens-based column derivation", () => {
  test("lens derives columns from children", () => {
    const nodes = item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a")))
    const repo = createFakeRepo({ nodes })
    const l = lens(repo, "board")
    const colIds = l.children("board")
    expect(colIds).toHaveLength(2)
    expect(l.children(colIds[0]!)).toHaveLength(2)
    expect(l.children(colIds[1]!)).toHaveLength(1)
  })

  test("lens derives columns from folder root", () => {
    const nodes = item.root("repo-root", item.folder("Projects"), item.folder("Archive"))
    const repo = createFakeRepo({ nodes })
    const l = lens(repo, "repo-root")
    expect(l.children("repo-root")).toHaveLength(2)
  })

  test("lens derives nested folders", () => {
    const nodes = item.root(
      "repo-root",
      item.folder("ref", item.folder("Projects"), item.folder("Archive"), item.folder("Work")),
    )
    const repo = createFakeRepo({ nodes })
    const l = lens(repo, "ref")
    const colIds = l.children("ref")
    expect(colIds).toHaveLength(3)
    const colNames = colIds.map((id) => repo.getNode(id)?.content || repo.getNode(id)?.data?.name)
    expect(colNames).toEqual(["Projects", "Archive", "Work"])
  })

  test("getNodeDisplayName returns content", () => {
    const nodes = item.task("Test Task")
    const repo = createFakeRepo({ nodes })
    const node = repo.getNode("Test Task")!
    expect(getNodeDisplayName(repo, node)).toBe("Test Task")
  })

  test("getNodeDisplayName returns data.name if present", () => {
    const nodes = item.folder("My Folder", item("child"))
    const repo = createFakeRepo({ nodes })
    const node = repo.getNode("My Folder")!
    expect(getNodeDisplayName(repo, node)).toBe("My Folder")
  })

  test("lens filters paragraph nodes into body column (km-1tho)", () => {
    const nodes = item.file(
      "@issue.md",
      item.p("All issues tracked with the @issue tag."),
      item.section("Open Issues", item("Fix bug #1")),
      item.section("Closed Issues", item("Fix bug #2")),
    )
    const repo = createFakeRepo({ nodes })
    const l = lens(repo, "@issue.md")
    const colIds = l.children("@issue.md")
    expect(colIds).toHaveLength(3)
    expect(l.role(colIds[0]!)).toBe("body-column")
    expect(l.children(colIds[0]!)).toHaveLength(1)
    expect(repo.getNode(l.children(colIds[0]!)[0]!)?.type).toBe("p")
    expect(repo.getNode(colIds[1]!)?.type).toBe("h")
    expect(repo.getNode(colIds[2]!)?.type).toBe("h")
  })

  test("lens groups code and quote nodes into body column", () => {
    const nodes = item.file(
      "readme.md",
      item.code("const x = 1;"),
      item.quote("Some quote text"),
      item.section("Getting Started", item("Install dependencies")),
    )
    const repo = createFakeRepo({ nodes })
    const l = lens(repo, "readme.md")
    const colIds = l.children("readme.md")
    expect(colIds).toHaveLength(2)
    expect(l.role(colIds[0]!)).toBe("body-column")
    expect(l.children(colIds[0]!)).toHaveLength(2)
    expect(colIds[1]).toBe("Getting Started")
  })
})

describe("Render", () => {
  test("Board renders columns and cards", () => {
    const { board } = testEnv(() => item("board", item("Todo", item.task("Task 1")), item("Done")))
    const text = board.screenshot()
    expect(text).toContain("Todo")
    expect(text).toContain("Done")
    expect(text).toContain("Task 1")
  })

  test("Board handles empty board", () => {
    const { board } = testEnv(() => item("board"))
    const text = board.screenshot()
    expect(text).toContain("Empty board")
  })
})

// =============================================================================
// Console toggle (Bug: backtick doesn't work due to stale pause/resume refs)
// =============================================================================

describe("Console toggle", () => {
  test("backtick sets showConsole to true", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("task1"))))

    // Initially console is hidden
    expect(store.getState().ui.showConsole).toBe(false)

    // Press backtick to toggle console
    board.press("`")

    // showConsole should be true
    expect(store.getState().ui.showConsole).toBe(true)

    // Press backtick again to toggle back
    board.press("`")
    expect(store.getState().ui.showConsole).toBe(false)
  })
})
