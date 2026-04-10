// testEnv FREEZE bucket — see km-all.test-system bead. Reason: store white-box (dispatchBoard, zoomAndFlush, searchReplace, act)
/**
 * Search Tests
 *
 * Covers all search-related functionality:
 * - Search dialog: fuzzy match/score, tags, opening/closing, special chars
 * - Search navigation: zoom target resolution, body-board navigation, key flow
 * - Search & replace: find, replace current, replace all, regex toggle
 *
 * Consolidated from:
 * - search-dialog.slow.test.ts (fuzzy match, dialog bugs, scope, special chars)
 * - search-nav.slow.spec.ts (findZoomTarget, navigateToNode, zoom + cursor, key flow)
 * - search-replace.slow.test.ts (find & replace dialog)
 */

import { describe, test, expect, vi } from "vitest"
import { act } from "react"
import { fuzzyMatch, fuzzyScore, extractTags } from "../src/views/search-utils.ts"
import { testEnv, item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import { createFakeRepo, type Repo } from "@km/storage"
import { findZoomTarget } from "../src/views/use-board-dialogs.ts"
import { navigateToNode } from "../src/navigation/navigate-to-node.ts"
import type { KNode } from "@km/core"
import { deriveColumnsFromRepo, buildNodeIndex, deriveCursorIndices } from "../src/hooks/use-columns.ts"
import type { SignalStoreApi as StoreApi } from "../src/state/signal-store.ts"
import { getActiveBoardPane, type BoardAppStore } from "../src/state/board-app-store.ts"
import { dispatchCommandById } from "../src/board/board-app.ts"

// =============================================================================
// Shared helpers
// =============================================================================

/**
 * Open the search dialog via the "search" command.
 * After dispatching, press Backspace to flush the silvery render pipeline.
 * The dialog text input is empty at this point, so Backspace is a no-op.
 */
function openSearchDialog(store: StoreApi<BoardAppStore>, board: ReturnType<typeof testEnv>["board"]) {
  act(() => {
    dispatchCommandById("search", store.getState as () => BoardAppStore)
    store.setState((s) => s)
  })
  board.press("Backspace") // flush silvery render pipeline
}

// Helper to create li nodes with li children (item() converts parents to oi)
function makeLiNode(id: string, parentId: string | null, parentIdx: number, children?: string[]): KNode[] {
  const node: KNode = {
    id,
    type: "p",
    item: { list: "-", task: { status: "todo", marker: "[ ]" } },
    content: id,
    data: {},
    parent_id: parentId,
    parent_idx: parentIdx,
    symlink_to: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
  const result: KNode[] = [node]
  if (children) {
    for (let i = 0; i < children.length; i++) {
      result.push(...makeLiNode(children[i]!, id, i))
    }
  }
  return result
}

function makeOiNode(id: string, parentId: string | null, parentIdx: number): KNode {
  return {
    id,
    type: "h",
    item: {},
    fstype: "folder",
    content: undefined,
    data: { name: id },
    parent_id: parentId,
    parent_idx: parentIdx,
    symlink_to: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
}

/** Dispatch a board action and flush React so DOM reflects the state change. */
function dispatchAndFlush(store: StoreApi<BoardAppStore>, action: Parameters<BoardAppStore["dispatchBoard"]>[0]) {
  act(() => {
    store.getState().dispatchBoard(action)
    store.setState((s) => s)
  })
}

function zoomAndFlush(store: StoreApi<BoardAppStore>, nodeId: string, cursor?: string) {
  act(() => {
    const s = store.getState()
    s.dispatchBoard({ type: "ZOOM_IN", nodeId })
    if (cursor) s.sel.node.select([cursor as import("@silvery/selection").ID])
    store.setState((ss) => ss)
  })
}

/** Derive layout from store state on demand (layout is no longer stored). */
function derivedState(store: StoreApi<BoardAppStore>) {
  const s = store.getState()
  const pane = getActiveBoardPane(s)!
  const columns = deriveColumnsFromRepo(s.repo, pane.rootId, pane.foldDepths)
  const nodeIndex = buildNodeIndex(columns)
  const cursor = deriveCursorIndices(columns, pane.sel.node.cursor() as string | null, nodeIndex)
  const col = columns[cursor.colIndex]
  const card = col?.cardNodes[cursor.cardIndex]
  const selectedNode = card ?? col?.node ?? null
  const cursorDepth: "board" | "column" | "card" =
    cursor.colIndex === -1 ? "board" : cursor.cardIndex === -1 ? "column" : "card"
  return {
    columns,
    colIndex: cursor.colIndex,
    cardIndex: cursor.cardIndex,
    nodeIndex,
    selectedNode,
    cursorDepth,
  }
}

// #############################################################################
// SEARCH DIALOG
// #############################################################################

// =============================================================================
// Fuzzy matching utilities
// =============================================================================

describe("fuzzyMatch", () => {
  test("matches exact string", () => {
    expect(fuzzyMatch("test", "test")).toBe(true)
  })

  test("matches characters in order", () => {
    expect(fuzzyMatch("tst", "test")).toBe(true)
  })

  test("matches characters with gaps", () => {
    expect(fuzzyMatch("tk", "task")).toBe(true)
  })

  test("is case-insensitive", () => {
    expect(fuzzyMatch("TeSt", "test")).toBe(true)
    expect(fuzzyMatch("test", "TEST")).toBe(true)
  })

  test("does not match out-of-order characters", () => {
    expect(fuzzyMatch("tse", "test")).toBe(false)
  })

  test("does not match missing characters", () => {
    expect(fuzzyMatch("xyz", "test")).toBe(false)
  })

  test("matches empty query", () => {
    expect(fuzzyMatch("", "test")).toBe(true)
  })
})

describe("fuzzyScore", () => {
  test("scores exact match higher than partial", () => {
    const exactScore = fuzzyScore("test", "test")
    const partialScore = fuzzyScore("test", "testing")
    expect(exactScore).toBeGreaterThan(partialScore)
  })

  test("scores consecutive matches with bonus", () => {
    // Consecutive matches get bonus points (consecutive * 2 per match)
    // This test verifies the algorithm works correctly, not comparing absolute scores
    const score = fuzzyScore("abc", "abcdef")
    expect(score).toBeGreaterThan(0) // Valid match
    // Consecutive bonus: a=2, b=4, c=6 = 12 points from consecutive
    // Plus start bonus: 10 points
    // Minus length penalty: 6 * 0.1 = 0.6
    // Expected approximately: 12 + 10 - 0.6 = 21.4
    expect(score).toBeGreaterThan(20)
  })

  test("scores start matches higher", () => {
    const startScore = fuzzyScore("te", "test")
    const middleScore = fuzzyScore("st", "test")
    expect(startScore).toBeGreaterThan(middleScore)
  })

  test("returns -1 for non-match", () => {
    expect(fuzzyScore("xyz", "test")).toBe(-1)
  })

  test("prefers shorter targets", () => {
    const shortScore = fuzzyScore("t", "task")
    const longScore = fuzzyScore("t", "task with long description")
    expect(shortScore).toBeGreaterThan(longScore)
  })
})

describe("extractTags", () => {
  test("extracts single tag", () => {
    expect(extractTags("This is #urgent")).toEqual(["urgent"])
  })

  test("extracts multiple tags", () => {
    expect(extractTags("This is #urgent and #blocked")).toEqual(["urgent", "blocked"])
  })

  test("handles no tags", () => {
    expect(extractTags("No tags here")).toEqual([])
  })

  test("handles undefined content", () => {
    expect(extractTags(undefined)).toEqual([])
  })

  test("handles tags with numbers", () => {
    expect(extractTags("Tagged with #p1 and #tag2")).toEqual(["p1", "tag2"])
  })

  test("handles tags at start", () => {
    expect(extractTags("#urgent task description")).toEqual(["urgent"])
  })

  test("handles multiple consecutive tags", () => {
    expect(extractTags("#urgent #blocked #p1")).toEqual(["urgent", "blocked", "p1"])
  })

  test("does not extract # without word", () => {
    expect(extractTags("Just a # symbol")).toEqual([])
  })

  test("includes hyphens in tag names", () => {
    expect(extractTags("#tag-with-dash")).toEqual(["tag-with-dash"])
  })
})

// =============================================================================
// Search dialog bugs
// =============================================================================

describe("Search dialog bugs", () => {
  describe("km-tui.2: [2 after backspace", () => {
    test("backspacing to empty shows placeholder, not [2", async () => {
      using app = createTestApp(item("board", item("col", item("alpha"), item("beta"))))

      // Open search and type
      app.dispatch("search")
      app.press("a")
      app.press("b")

      // Verify we have "ab" in input
      expect(app.text).toContain("ab")

      // Backspace twice to empty
      app.press("Backspace")
      app.press("Backspace")

      // Should NOT contain [2
      expect(app.text).not.toContain("[2")

      // Should show placeholder or empty input area
      // The dialog should still be open with "Search" title
      expect(app.text).toContain("Search")
    })

    test("rapid backspace doesn't leave artifacts", () => {
      using app = createTestApp(item("board", item("col", item("test"))))

      app.dispatch("search")
      app.press("t")
      app.press("e")
      app.press("s")
      app.press("t")

      // Rapid backspace
      app.press("Backspace")
      app.press("Backspace")
      app.press("Backspace")
      app.press("Backspace")

      // Should not have any escape sequence fragments
      expect(app.text).not.toContain("[2")
      expect(app.text).not.toContain("[A")
      expect(app.text).not.toContain("[B")
    })
  })

  describe("km-tui.3: title visibility during loading", () => {
    test("Search title remains visible with results", () => {
      using app = createTestApp(
        item(
          "board",
          item(
            "col",
            item("Task Alpha"),
            item("Task Beta"),
            item("Task Gamma"),
            item("Task Delta"),
            item("Task Epsilon"),
          ),
        ),
        { rows: 20 },
      )

      app.dispatch("search")
      app.command("task_dialog")
      app.press("a")

      // Title should always be visible
      expect(app.text).toContain("Search")

      // Input should be visible (either the typed text or placeholder)
      expect(app.text).toMatch(/Ta|type to search/)
    })
  })
})

// =============================================================================
// Escape closes search dialog (km-h9p52)
// =============================================================================

describe("Bug: Escape does not close search dialog (km-h9p52)", () => {
  function makeEscapeTestApp() {
    return createTestApp(
      item(
        "board",
        item("col1", item("Alpha task"), item("Beta testing"), item("Gamma ray")),
        item("col2", item("Delta force"), item("Epsilon value")),
      ),
      { cols: 100, rows: 30 },
    )
  }

  test("pressing Escape closes the search dialog", () => {
    using app = makeEscapeTestApp()

    // Open search dialog
    app.dispatch("search")
    app.expect("[data-dialog='search']").toExist()

    // Press Escape to close
    app.press("Escape")

    // Search dialog should be gone
    app.expect("[data-dialog='search']").not.toExist()
  })

  test("pressing Escape closes search dialog after typing a query", () => {
    using app = makeEscapeTestApp()

    // Open search, type a query
    app.dispatch("search")
    app.press("a")
    app.command("cursor_right")
    app.expect("[data-dialog='search']").toExist()

    // Press Escape to close
    app.press("Escape")

    // Search dialog should be gone
    app.expect("[data-dialog='search']").not.toExist()
  })

  test("board is navigable after closing search with Escape", () => {
    using app = makeEscapeTestApp()

    // Open and close search
    app.dispatch("search")
    app.press("Escape")

    // Should be able to navigate normally
    app.command("cursor_down")
    // Board content should be visible, not a dialog
    expect(app.text).not.toContain("Type to search")
  })
})

// =============================================================================
// Search scope feature
// =============================================================================

function makeScopeApp() {
  return createTestApp(
    item(
      "board",
      item("col1", item("Alpha project", item("Alpha subtask one"), item("Alpha subtask two")), item("Beta project")),
      item("col2", item("Gamma project"), item("Delta project")),
    ),
    { cols: 100, rows: 30 },
  )
}

/** Get only the text rendered inside the search dialog overlay */
function scopeDialogText(app: ReturnType<typeof createTestApp>): string {
  return app.q("[data-dialog='search']").textContent()
}

describe("Search scope: UI toggle", () => {
  test("search dialog opens with 'All' scope by default", () => {
    using app = makeScopeApp()
    app.dispatch("search")
    const text = scopeDialogText(app)
    // Scope prompt: "All > "
    expect(text).toContain("All")
    // Footer has Tab hint
    expect(text).toContain("Tab")
  })

  test("Tab toggles scope between All and scoped, back to All", async () => {
    using app = makeScopeApp()
    app.dispatch("search")

    // Initially "All > " prompt
    let text = scopeDialogText(app)
    expect(text).toContain("All")

    // Tab switches to scoped — prompt shows "in <node name> > "
    app.command("indent_node")
    text = scopeDialogText(app)
    expect(text).toContain("in ")
    expect(text).toContain("search all") // Footer: "Tab search all"

    // Tab switches back to "All > "
    app.command("indent_node")
    text = scopeDialogText(app)
    expect(text).toContain("All")
    expect(text).toContain("narrow") // Footer: "Tab narrow ..."
  })
})

describe("Search scope: result filtering", () => {
  test("'All' scope returns results from entire repo", () => {
    using app = makeScopeApp()
    app.dispatch("search")

    // Type a query that matches items in both columns
    // Note: "Alpha project" is a folder (has children), so it's excluded from search results.
    // Only leaf nodes (tasks) are searchable.
    app.press("p")
    app.press("r")
    app.command("insert_below")
    app.command("cursor_down")
    const text = scopeDialogText(app)

    // Should find leaf items from both columns
    expect(text).toContain("Beta")
    expect(text).toContain("Gamma")
    expect(text).toContain("Delta")
  })

  test("'Subtree' scope restricts results to cursor node descendants", () => {
    using app = makeScopeApp()

    // Cursor starts on first card ("Alpha project" which has children)
    // Open search, switch to Subtree scope
    app.dispatch("search")
    app.command("indent_node") // Switch to "Subtree" scope

    // Search for "subtask" — only Alpha project descendants should match
    app.press("s")
    app.command("undo")
    app.press("b")
    const text = scopeDialogText(app)
    expect(text).toContain("Alpha subtask one")
    expect(text).toContain("Alpha subtask two")

    // Items from other columns/cards should NOT appear in dialog results
    expect(text).not.toContain("Beta")
    expect(text).not.toContain("Gamma")
    expect(text).not.toContain("Delta")
  })

  test("'Subtree' scope with query matching nothing in subtree shows no results", () => {
    using app = makeScopeApp()

    // Cursor starts on "Alpha project"
    app.dispatch("search")
    app.command("indent_node") // Subtree scope

    // Search for "Delta" — not a descendant of Alpha
    app.command("toggle_detail_pane")
    app.press("e")
    app.command("cursor_right")
    const text = scopeDialogText(app)
    expect(text).toContain("No matching items")
  })

  test("switching scope re-filters results", () => {
    using app = makeScopeApp()
    app.dispatch("search")

    // Type query matching items across the board
    app.press("p")
    app.press("r")
    app.command("insert_below")
    app.command("cursor_down")

    // In All scope, should see results from both columns
    let text = scopeDialogText(app)
    expect(text).toContain("Beta")
    expect(text).toContain("Gamma")
    expect(text).toContain("Delta")

    // Switch to Subtree scope (cursor is on Alpha project)
    // Alpha project descendants include Alpha subtask one/two but they don't match "proj"
    // Alpha project itself is a folder (skipped). So only Alpha's leaf descendants matching "proj" would show.
    app.command("indent_node")
    text = scopeDialogText(app)

    // Gamma/Delta are not descendants of Alpha, should not appear in dialog results
    expect(text).not.toContain("Gamma")
    expect(text).not.toContain("Delta")
  })
})

describe("Search scope: scope node capture", () => {
  test("scope uses cursor node when search opens", () => {
    using app = makeScopeApp()

    // Move cursor to second card (Beta project)
    app.command("cursor_down")

    // Open search with Subtree scope
    app.dispatch("search")
    app.command("indent_node")

    // Search for "project" — only Beta should match (it has no descendants with "project")
    app.press("p")
    app.press("r")
    app.command("insert_below")
    app.command("cursor_down")
    const text = scopeDialogText(app)
    expect(text).toContain("Beta")
    // Alpha is not a descendant of Beta — should not appear in dialog results
    expect(text).not.toContain("Alpha project")
    expect(text).not.toContain("Gamma")
  })
})

// =============================================================================
// Special characters in search (km-tui.search-blank)
// =============================================================================

describe("Bug: special characters in search cause blank screen (km-tui.search-blank)", () => {
  function makeSearchApp() {
    return createTestApp(
      item(
        "board",
        item("col1", item("ready-made task"), item("Alpha testing"), item("Beta project")),
        item("col2", item("Gamma ray"), item("Delta force")),
      ),
      { cols: 100, rows: 30 },
    )
  }

  test("typing 'ready-' does not blank the screen", () => {
    using app = makeSearchApp()

    app.dispatch("search")
    // Type "ready-" character by character
    for (const c of "ready-") app.press(c)

    // The search dialog must still be visible — not blank
    expect(app.text).toContain("Search")
    // Should show input text
    expect(app.text).toContain("ready-")
  })

  test("typing backtick does not blank the screen", () => {
    using app = makeSearchApp()

    app.dispatch("search")
    app.press("`")

    // The search dialog must still be visible — not blank
    expect(app.text).toContain("Search")
  })

  test("typing parentheses in search does not crash", () => {
    using app = makeSearchApp()

    app.dispatch("search")
    app.press("(")
    app.press("t")
    app.press("e")
    app.press("s")
    app.press("t")
    app.press(")")

    expect(app.text).toContain("Search")
  })
})

// #############################################################################
// SEARCH NAVIGATION
// #############################################################################

// =============================================================================
// findZoomTarget
// =============================================================================

describe("findZoomTarget", () => {
  test("returns grandparent for depth-2 target", () => {
    const nodes = item("root", item("parent", item("child1"), item("child2")))
    const repo = createFakeRepo({ nodes })
    const child1 = repo.getNode("child1")!

    const result = findZoomTarget(child1, repo)
    expect(result.zoomTarget.id).toBe("root")
    expect(result.cursorTarget.id).toBe("child1")
  })

  test("returns parent when no grandparent", () => {
    const nodes = item("root", item("child1"), item("child2"))
    const repo = createFakeRepo({ nodes })
    const child1 = repo.getNode("child1")!

    const result = findZoomTarget(child1, repo)
    expect(result.zoomTarget.id).toBe("root")
    expect(result.cursorTarget.id).toBe("child1")
  })

  test("returns target itself when at root level", () => {
    const nodes = item("root")
    const repo = createFakeRepo({ nodes })
    const root = repo.getNode("root")!

    const result = findZoomTarget(root, repo)
    expect(result.zoomTarget.id).toBe("root")
    expect(result.cursorTarget.id).toBe("root")
  })

  test("body-only grandparent with great-grandparent: zooms to great-grandparent", () => {
    // When grandparent (flatList) has no oi children -> body-only board.
    // If a great-grandparent exists, zoom there instead so flatList becomes
    // a column and task1 becomes a visible card. Cursor lands on task1
    // (the parent of subtask1, which is the navigable card).
    const vaultNode = makeOiNode("vault", null, 0)
    const flatListNode = makeOiNode("flatList", "vault", 0)
    const task1Nodes = makeLiNode("task1", "flatList", 0, ["subtask1", "subtask2"])
    const task2Nodes = makeLiNode("task2", "flatList", 1)
    const allNodes: KNode[] = [vaultNode, flatListNode, ...task1Nodes, ...task2Nodes]

    const repo = createFakeRepo({ nodes: allNodes })
    const subtask1 = repo.getNode("subtask1")!

    const result = findZoomTarget(subtask1, repo)
    // Zoom to vault (great-grandparent) so flatList is a column, task1 is a card
    expect(result.zoomTarget.id).toBe("vault")
    expect(result.cursorTarget.id).toBe("task1")
  })

  test("body-only grandparent without great-grandparent: walks cursor up to parent", () => {
    // When grandparent has no oi children and there's NO great-grandparent,
    // we must zoom to grandparent (only option) and walk cursor to parent.
    const flatListNode = makeOiNode("flatList", null, 0)
    const task1Nodes = makeLiNode("task1", "flatList", 0, ["subtask1"])
    const task2Nodes = makeLiNode("task2", "flatList", 1)
    const allNodes: KNode[] = [flatListNode, ...task1Nodes, ...task2Nodes]

    const repo = createFakeRepo({ nodes: allNodes })
    const subtask1 = repo.getNode("subtask1")!

    // ancestors: [subtask1, task1, flatList] (length 3)
    // grandparent = flatList (no oi children), no great-grandparent
    const result = findZoomTarget(subtask1, repo)
    expect(result.zoomTarget.id).toBe("flatList")
    expect(result.cursorTarget.id).toBe("task1")
  })

  test("deep target (ancestors >= 4): zooms to grandparent with cursor on target", () => {
    // Structure: root > section1 > section2 > deep-task
    // ancestors: [deep-task, section2, section1, root] (length 4)
    // grandparent = section1, which has oi children (section2) -> normal multi-column board
    // Expected: zoom to grandparent (section1), cursor on target (deep-task)
    const nodes = item("root", item("section1", item("section2", item("deep-task"), item("other-task"))))
    const repo = createFakeRepo({ nodes })
    const deepTask = repo.getNode("deep-task")!

    const result = findZoomTarget(deepTask, repo)
    expect(result.zoomTarget.id).toBe("section1")
    expect(result.cursorTarget.id).toBe("deep-task")
  })

  test("deep target in body-only grandparent: zooms to great-grandparent", () => {
    // Structure: root > section1 > flatList(li-only) > task1 > subtask1
    // Bug scenario: flatList has no oi children, only li. Zooming to flatList
    // produces a single-column board with many flat cards.
    // For ancestors.length >= 4 with body-only grandparent, zoom to great-grandparent
    // so flatList becomes a column and task1 is a card.
    const rootNode = makeOiNode("root", null, 0)
    const section1Node = makeOiNode("section1", "root", 0)
    const flatListNode = makeOiNode("flatList", "section1", 0)
    const task1Nodes = makeLiNode("task1", "flatList", 0, ["subtask1"])
    const task2Nodes = makeLiNode("task2", "flatList", 1)
    const allNodes: KNode[] = [rootNode, section1Node, flatListNode, ...task1Nodes, ...task2Nodes]

    const repo = createFakeRepo({ nodes: allNodes })
    const subtask1 = repo.getNode("subtask1")!

    // ancestors: [subtask1, task1, flatList, section1, root] (length 5)
    // grandparent = flatList (no oi children -> body-only)
    // great-grandparent = section1
    // Should zoom to section1 (great-grandparent) so flatList is a column
    // and task1 is a visible card
    const result = findZoomTarget(subtask1, repo)
    expect(result.zoomTarget.id).toBe("section1")
    expect(result.cursorTarget.id).toBe("task1")
  })
})

// =============================================================================
// ZOOM_IN to body-only board: cursor + navigation
// =============================================================================

describe("ZOOM_IN to body-only board: cursor + navigation", () => {
  test("cursor lands on card level after zoom to body-only board", () => {
    const { store } = testEnv(
      () => item("root", item("col", item("flatNode", item("task1"), item("task2"), item("task3")))),
      { checkIncremental: false },
    )

    zoomAndFlush(store, "flatNode", "task2")

    const pane = getActiveBoardPane(store.getState())!
    expect(pane.rootId).toBe("flatNode")
    expect(pane.sel.node.cursor() as string | null).toBe("task2")
    expect(derivedState(store).cursorDepth).toBe("card")
  })

  test("j/k navigation works after zoom to body-only board", () => {
    const { board, store } = testEnv(
      () => item("root", item("col", item("flatNode", item("task1"), item("task2"), item("task3")))),
      { checkIncremental: false },
    )

    zoomAndFlush(store, "flatNode", "task1")

    board.expectState({ cursor: "task1" })

    board.command("cursor_down")
    board.expectState({ cursor: "task2" })

    board.command("cursor_down")
    board.expectState({ cursor: "task3" })

    board.command("cursor_up")
    board.expectState({ cursor: "task2" })
  })

  test("cursor + DOM visible after zoom to body-only board", () => {
    const { board, store } = testEnv(
      () => item("root", item("col", item("flatNode", item("task1"), item("task2"), item("task3")))),
      { checkIncremental: false },
    )

    zoomAndFlush(store, "flatNode", "task2")

    board.expect("#task2[data-cursor]").toExist()
    board.expectScreen("task2")
  })

  test("j/k with DOM assertions after zoom to body-only board", () => {
    const { board, store } = testEnv(
      () => item("root", item("col", item("flatNode", item("task1"), item("task2"), item("task3")))),
      { checkIncremental: false },
    )

    zoomAndFlush(store, "flatNode", "task1")

    board.expect("#task1[data-cursor]").toExist()

    board.command("cursor_down")
    board.expect("#task2[data-cursor]").toExist()

    board.command("cursor_down")
    board.expect("#task3[data-cursor]").toExist()

    board.command("cursor_up")
    board.expect("#task2[data-cursor]").toExist()
  })
})

// =============================================================================
// BUG: j/k broken when cursor is on body-card descendant
// =============================================================================

describe("BUG: j/k broken when cursor is on body-card descendant", () => {
  test("j/k navigates between subtasks when cursor is on a descendant", () => {
    // When cursor is on a subtask (child of a body card), j/k navigates
    // between sibling subtasks within the same body card. Once at the last
    // subtask, j moves to the next body card.
    const flatListNode = makeOiNode("flatList", null, 0)
    const task1Nodes = makeLiNode("task1", "flatList", 0, ["subtask1", "subtask2"])
    const task2Nodes = makeLiNode("task2", "flatList", 1)
    const task3Nodes = makeLiNode("task3", "flatList", 2)
    const allNodes: KNode[] = [flatListNode, ...task1Nodes, ...task2Nodes, ...task3Nodes]

    const repo = createFakeRepo({ nodes: allNodes })
    const { board, store } = testEnv(() => allNodes, { checkIncremental: false })

    // ZOOM_IN to flatList with cursor on subtask1 (a descendant of body card task1)
    zoomAndFlush(store, "flatList", "subtask1")

    const paneAfterZoom = getActiveBoardPane(store.getState())!
    expect(paneAfterZoom.rootId).toBe("flatList")

    // j moves to next subtask within the same body card
    board.command("cursor_down")
    board.expectState({ cursor: "subtask2" })

    // j from last subtask moves to next body card
    board.command("cursor_down")
    board.expectState({ cursor: "task2" })

    board.command("cursor_down")
    board.expectState({ cursor: "task3" })

    board.command("cursor_up")
    board.expectState({ cursor: "task2" })
  })
})

// =============================================================================
// Paragraph-only board: cursor + navigation
// =============================================================================

describe("paragraph-only board: cursor + navigation", () => {
  test("cursor + j/k work on paragraph body board", () => {
    const { board, store } = testEnv(
      () => item("root", item("docs", item("readme", item.p("intro"), item.p("setup"), item.p("usage")))),
      { checkIncremental: false },
    )

    zoomAndFlush(store, "readme", "setup")

    expect(getActiveBoardPane(store.getState())!.rootId).toBe("readme")
    board.expectState({ cursor: "setup" })
    expect(derivedState(store).cursorDepth).toBe("card")

    board.command("cursor_down")
    board.expectState({ cursor: "usage" })

    board.command("cursor_up")
    board.expectState({ cursor: "setup" })

    board.command("cursor_up")
    board.expectState({ cursor: "intro" })
  })
})

// =============================================================================
// Full search flow integration
// =============================================================================

describe("full search flow integration", () => {
  test("search in deep tree: zoom + cursor + j/k navigation", () => {
    const { board, store } = testEnv(
      () =>
        item(
          "root",
          item(
            "projects",
            item("project-a", item("taskA1"), item("taskA2"), item("taskA3")),
            item("project-b", item("taskB1")),
          ),
        ),
      { checkIncremental: false },
    )

    const repo = store.getState().repo
    const taskA2 = repo.getNode("taskA2")!
    const { zoomTarget, cursorTarget } = findZoomTarget(taskA2, repo)

    expect(zoomTarget.id).toBe("projects")
    expect(cursorTarget.id).toBe("taskA2")

    zoomAndFlush(store, zoomTarget.id, cursorTarget.id)

    expect(getActiveBoardPane(store.getState())!.rootId).toBe("projects")
    board.expectState({ cursor: "taskA2" })
    expect(derivedState(store).cursorDepth).toBe("card")

    board.expect("#taskA2[data-cursor]").toExist()

    board.command("cursor_down")
    board.expectState({ cursor: "taskA3" })

    board.command("cursor_up")
    board.expectState({ cursor: "taskA2" })
  })

  test("SELECT on already-visible card", () => {
    const { board, store } = testEnv(
      () => item("root", item("col1", item("taskA"), item("taskB")), item("col2", item("taskC"))),
      { checkIncremental: false },
    )

    dispatchAndFlush(store, { type: "SELECT", nodeId: "taskB" })

    board.expectState({ cursor: "taskB" })
    board.expect("#taskB[data-cursor]").toExist()
  })
})

// =============================================================================
// Scroll to selection after zoom
// =============================================================================

describe("scroll to selection after zoom", () => {
  test("ZOOM_IN scrolls to cursor card when it would be off-screen", () => {
    // Create a board with many items in a column -- enough to require scrolling
    // on a small terminal (rows=15). With header + breadcrumb + separator,
    // only ~3 cards are visible (card height=4). Card at index 12 is off-screen.
    const tasks = Array.from({ length: 15 }, (_, i) => item(`task${i}`))
    const { board, store } = testEnv(() => item("root", item("big-col", ...tasks), item("small-col", item("other"))), {
      rows: 15,
      checkIncremental: false,
    })

    // Zoom to root with cursor on task12 (deep in the list, off-screen)
    zoomAndFlush(store, "root", "task12")

    board.expectState({ cursor: "task12" })

    // Press j to trigger a render cycle (dispatchAndFlush doesn't run doRender).
    // j moves cursor to task13, which should also be in the scrolled view.
    board.command("cursor_down")
    board.expectState({ cursor: "task13" })

    // After navigating from task12 to task13, both should be in the scrolled view
    board.expectScreen("task13")
  })

  test("search navigate to off-screen card scrolls it into view", () => {
    // Simulate the search flow: deep tree where target is a grandchild of root,
    // but far enough down the column to be off-screen
    const tasks = Array.from({ length: 20 }, (_, i) => item(`deep${i}`))
    const { board, store } = testEnv(() => item("root", item("section", ...tasks)), {
      rows: 15,
      checkIncremental: false,
    })

    const repo = store.getState().repo
    const deep15 = repo.getNode("deep15")!
    const { zoomTarget, cursorTarget } = findZoomTarget(deep15, repo)

    zoomAndFlush(store, zoomTarget.id, cursorTarget.id)

    // Press j to trigger render and move cursor
    board.command("cursor_down")

    // deep15 or its neighbor should be visible
    board.expectScreen("deep16")
  })

  test("SELECT on off-screen card in current view scrolls it into view", () => {
    // Target is already a grandchild of root (visible in layout model),
    // but far enough down the column to be off-screen. SELECT should scroll.
    const tasks = Array.from({ length: 20 }, (_, i) => item(`card${i}`))
    const { board, store } = testEnv(() => item("root", item("col1", ...tasks), item("col2", item("x"))), {
      rows: 15,
      checkIncremental: false,
    })

    // SELECT a card deep in col1 -- should scroll to make it visible
    dispatchAndFlush(store, { type: "SELECT", nodeId: "card15" })

    // Press j to trigger render and move cursor
    board.command("cursor_down")
    board.expectState({ cursor: "card16" })

    board.expectScreen("card16")
  })

  test("ZOOM_IN scrolls to cursor in columns view", () => {
    // Columns view uses single-row items, so more items fit. Still need to scroll
    // when target is deep enough. 30 items in a column with 15-row terminal.
    const tasks = Array.from({ length: 30 }, (_, i) => item(`ctask${i}`))
    const { board, store } = testEnv(() => item("root", item("big-col", ...tasks), item("small-col", item("other"))), {
      rows: 15,
      viewMode: "columns",
      checkIncremental: false,
    })

    // Zoom with cursor on ctask25 (far off-screen in columns view)
    zoomAndFlush(store, "root", "ctask25")

    board.expectState({ cursor: "ctask25" })

    // Press j to trigger render and move cursor
    board.command("cursor_down")
    board.expectState({ cursor: "ctask26" })

    board.expectScreen("ctask26")
  })

  test("cursor state is correct in DOM after ZOOM_IN (no render needed)", () => {
    // Verify that the cursor DOM element is correct after ZOOM_IN,
    // even before a render cycle runs (DOM is updated by React, not silvery pipeline)
    const tasks = Array.from({ length: 15 }, (_, i) => item(`dtask${i}`))
    const { board, store } = testEnv(() => item("root", item("col", ...tasks)), { rows: 15, checkIncremental: false })

    zoomAndFlush(store, "root", "dtask12")

    // DOM should have cursor on dtask12
    board.expect("#dtask12[data-cursor]").toExist()
    board.expectState({ cursor: "dtask12" })
    expect(derivedState(store).cardIndex).toBe(12)
  })
})

// =============================================================================
// navigateToNode() -- unified navigate function
// =============================================================================

describe("navigateToNode", () => {
  test("target is current root -> SELECT on itself", () => {
    const nodes = item("root", item("col1", item("task1")))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("root", "root", repo)
    expect(result).toEqual({ action: "SELECT", cursorTarget: "root" })
  })

  test("target not found -> returns null", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    const nodes = item("root", item("col1"))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("nonexistent", "root", repo)
    expect(result).toBeNull()
    spy.mockRestore()
  })

  test("target is direct child of root (column level) -> SELECT", () => {
    const nodes = item("root", item("col1", item("task1")), item("col2", item("task2")))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("col1", "root", repo)
    expect(result).toEqual({ action: "SELECT", cursorTarget: "col1" })
  })

  test("target is grandchild of root (card level) -> SELECT", () => {
    const nodes = item("root", item("col1", item("task1"), item("task2")), item("col2"))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("task2", "root", repo)
    expect(result).toEqual({ action: "SELECT", cursorTarget: "task2" })
  })

  test("target is one level deep -> ZOOM_IN to parent", () => {
    // Structure: root > projects > project-a > taskA1
    // Current root = root, target = taskA1
    // taskA1's parent = project-a (child of projects), grandparent = projects
    // projects is not a child/grandchild of root -> need ZOOM_IN
    // resolveZoomTarget: grandparent = projects -> zoom to projects, cursor on taskA1
    const nodes = item("root", item("projects", item("project-a", item("taskA1"), item("taskA2"))))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("taskA1", "root", repo)
    expect(result).toEqual({
      action: "ZOOM_IN",
      zoomTarget: "projects",
      cursorTarget: "taskA1",
    })
  })

  test("target is deeply nested -> ZOOM_IN to appropriate ancestor", () => {
    // Structure: root > area > projects > project-a > task > subtask
    // Current root = root, target = subtask
    // subtask's grandparent = project-a, which has oi children
    // -> zoom to project-a (grandparent), cursor on subtask
    const nodes = item("root", item("area", item("projects", item("project-a", item("task", item("subtask"))))))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("subtask", "root", repo)
    expect(result).toEqual({
      action: "ZOOM_IN",
      zoomTarget: "project-a",
      cursorTarget: "subtask",
    })
  })

  test("target with body-only grandparent -> zooms to great-grandparent", () => {
    // Structure: vault(oi) > flatList(oi, no oi children) > task1(li) > subtask1(li)
    // flatList has only li children (body-only board).
    // great-grandparent = vault -> zoom there so flatList becomes a column
    const vaultNode = makeOiNode("vault", null, 0)
    const flatListNode = makeOiNode("flatList", "vault", 0)
    const task1Nodes = makeLiNode("task1", "flatList", 0, ["subtask1"])
    const task2Nodes = makeLiNode("task2", "flatList", 1)
    const allNodes: KNode[] = [vaultNode, flatListNode, ...task1Nodes, ...task2Nodes]
    const repo = createFakeRepo({ nodes: allNodes })

    const result = navigateToNode("subtask1", null, repo)
    expect(result).toEqual({
      action: "ZOOM_IN",
      zoomTarget: "vault",
      cursorTarget: "task1",
    })
  })

  test("body-only grandparent without great-grandparent -> DETAIL_VIEW (flat list fallback)", () => {
    // Structure: flatList(oi, no oi children) > task1(li) > subtask1(li)
    // No great-grandparent -> flatList is the zoom target but has no structure.
    // Returns DETAIL_VIEW so the caller opens the detail pane instead of
    // landing on a single-column flat board.
    const flatListNode = makeOiNode("flatList", null, 0)
    const task1Nodes = makeLiNode("task1", "flatList", 0, ["subtask1"])
    const task2Nodes = makeLiNode("task2", "flatList", 1)
    const allNodes: KNode[] = [flatListNode, ...task1Nodes, ...task2Nodes]
    const repo = createFakeRepo({ nodes: allNodes })

    const result = navigateToNode("subtask1", null, repo)
    expect(result).toEqual({
      action: "DETAIL_VIEW",
      zoomTarget: "flatList",
      cursorTarget: "task1",
    })
  })

  test("target already visible after zoom -> SELECT without re-zoom", () => {
    // Structure: root > col1 > task1, task2
    // If we're already zoomed to root, and target is task1 (grandchild) -> just SELECT
    const nodes = item("root", item("col1", item("task1"), item("task2")))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("task1", "root", repo)
    expect(result).toEqual({ action: "SELECT", cursorTarget: "task1" })
  })

  test("target visible at zoomed-in level -> SELECT", () => {
    // Structure: root > projects > project-a > taskA1, taskA2
    // Current root = projects (already zoomed in)
    // target = taskA1 -> grandchild of projects -> SELECT
    const nodes = item("root", item("projects", item("project-a", item("taskA1"), item("taskA2"))))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("taskA1", "projects", repo)
    expect(result).toEqual({ action: "SELECT", cursorTarget: "taskA1" })
  })

  test("rootId is null (top-level) with depth-2 target -> SELECT", () => {
    // When rootId is null, the board shows root nodes as columns
    // and their children as cards. A grandchild of null (i.e., child of
    // a root node) is visible at card level -> SELECT.
    const nodes = item("root", item("child"))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("child", null, repo)
    expect(result).toEqual({ action: "SELECT", cursorTarget: "child" })
  })

  test("rootId is null with deeply nested target -> ZOOM_IN", () => {
    // When rootId is null and target is deep, ZOOM_IN is needed.
    // Structure: root > col > task > subtask
    // subtask's grandparent = col, col's parent = root, root's parent = null
    // subtask is NOT a child or grandchild of null -> ZOOM_IN
    const nodes = item("root", item("col", item("task", item("subtask"))))
    const repo = createFakeRepo({ nodes })

    const result = navigateToNode("subtask", null, repo)
    expect(result).toEqual({
      action: "ZOOM_IN",
      zoomTarget: "col",
      cursorTarget: "subtask",
    })
  })
})

// =============================================================================
// Full search flow (key presses): / -> type -> Enter -> cursor lands on match
// =============================================================================

describe("search flow via key presses", () => {
  test("search + Enter navigates cursor to the matched card (deep tree)", () => {
    // Structure: root > projects > project-a > taskA1, taskA2, taskA3
    //                            > project-b > taskB1
    // User searches for "taskA2" and expects cursor to land on it.
    using app = createTestApp(
      item(
        "root",
        item(
          "projects",
          item("project-a", item("taskA1"), item("taskA2"), item("taskA3")),
          item("project-b", item("taskB1")),
        ),
      ),
      { incremental: false },
    )

    // Open search dialog
    app.dispatch("search")
    app.expect("[data-dialog='search']").toExist()

    // Type search query
    for (const ch of "taskA2") app.press(ch)

    // Confirm search result
    app.press("Enter")

    // Dialog should be closed
    app.expect("[data-dialog='search']").not.toExist()

    // Cursor should be on the matched card
    app.expect("#taskA2[data-cursor]").toExist()
  })

  test("search + Enter for already-visible card uses SELECT (no zoom)", () => {
    // Structure: root > col1 > taskA, taskB > col2 > taskC
    // User is at root, taskB is already visible (grandchild of root).
    using app = createTestApp(item("root", item("col1", item("taskA"), item("taskB")), item("col2", item("taskC"))), {
      incremental: false,
    })

    // Open search dialog
    app.dispatch("search")
    app.expect("[data-dialog='search']").toExist()

    // Type search query
    for (const ch of "taskB") app.press(ch)

    // Confirm search result
    app.press("Enter")

    // Cursor should be on the matched card; col1/col2 still both visible (root unchanged)
    app.expect("[data-dialog='search']").not.toExist()
    expect(app.text).toContain("col1")
    expect(app.text).toContain("col2")
    app.expect("#taskB[data-cursor]").toExist()
  })

  test("search + Enter for deeply nested node zooms to make it a card", () => {
    // Structure: root > projects > project-a > task1 > subtask1
    // subtask1 is depth 4 from root. After search, board should zoom so that
    // subtask1 (or its parent task1) is a visible card, not just a descendant.
    using app = createTestApp(item("root", item("projects", item("project-a", item("task1", item("subtask-xyz"))))), {
      incremental: false,
    })

    // Search for the deeply nested subtask
    app.dispatch("search")
    for (const ch of "subtask-xyz") app.press(ch)
    app.press("Enter")

    app.expect("[data-dialog='search']").not.toExist()

    // Some node should have data-cursor on the screen — j/k should work
    app.expect("[data-cursor]").toExist()

    // The cursor should be navigable with j/k (didn't break)
    app.command("cursor_down")
    app.expect("[data-cursor]").toExist()
  })

  test("search for depth-3 node zooms and places cursor on exact card", () => {
    // Structure: vault > section > project > my-task, other-task
    // my-task is at depth 3 from vault. Search should zoom to section
    // and place cursor on my-task (now a card under project column).
    using app = createTestApp(item("vault", item("section", item("project", item("my-task"), item("other-task")))), {
      incremental: false,
    })

    // Search for the depth-3 node
    app.dispatch("search")
    for (const ch of "my-task") app.press(ch)
    app.press("Enter")

    app.expect("[data-dialog='search']").not.toExist()
    // Cursor should be on the exact matched card
    app.expect("#my-task[data-cursor]").toExist()
    // After zoom, "section" content (project column with my-task and other-task) should be visible
    expect(app.text).toContain("project")
    expect(app.text).toContain("other-task")
  })

  test("search with multiple results selects the first match", () => {
    // When search returns multiple results, pressing Enter selects the first one.
    using app = createTestApp(
      item("root", item("col1", item("alpha-task"), item("beta-task")), item("col2", item("alpha-note"))),
      { incremental: false },
    )

    app.dispatch("search")
    for (const ch of "alpha") app.press(ch)
    app.press("Enter")

    // First result should be selected (order depends on repo.search)
    app.expect("[data-dialog='search']").not.toExist()
    // Either alpha-task or alpha-note should have the cursor
    const alphaTaskCursor = app.q("#alpha-task[data-cursor]").count()
    const alphaNoteCursor = app.q("#alpha-note[data-cursor]").count()
    expect(alphaTaskCursor + alphaNoteCursor).toBeGreaterThan(0)
  })

  test("search for oi file node (non-folder) selects it correctly", () => {
    // oi nodes with fstype="file" are NOT skipped by search.
    // When selected, they may be at column level or card level.
    const fileNode: KNode = {
      id: "readme-file",
      type: "h",
      item: {},
      fstype: "file",
      content: "README",
      data: { name: "README" },
      parent_id: "docs",
      parent_idx: 0,
      symlink_to: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      version: "v1",
    }
    const nodes = item("root", item("docs", item("other-file")))
    // Insert the file node as child of docs
    nodes.push(fileNode)
    using app = createTestApp(nodes, { incremental: false })

    app.dispatch("search")
    for (const ch of "README") app.press(ch)
    app.press("Enter")

    app.expect("[data-dialog='search']").not.toExist()
    // README file is a grandchild of root -> SELECT
    app.expect("#readme-file[data-cursor]").toExist()
  })

  test("search SELECT within same column updates selectedNode correctly", () => {
    // When cursor is already on a card in col1 and search selects a different
    // card in the same column, selectedNode should update to the new card.
    // This tests the cursorPosition memo dependency chain.
    using app = createTestApp(
      item("root", item("col1", item("taskA"), item("taskB"), item("taskC")), item("col2", item("taskD"))),
      { incremental: false },
    )

    // Initial cursor is on taskA (first card of first column)
    app.expect("#taskA[data-cursor]").toExist()

    // Search for taskC (different card in the same column)
    app.dispatch("search")
    for (const ch of "taskC") app.press(ch)
    app.press("Enter")

    // Cursor should be on taskC
    app.expect("#taskC[data-cursor]").toExist()
    // Previous cursor should NOT have data-cursor
    app.expect("#taskA[data-cursor]").not.toExist()
  })

  test("search + Enter + j/k navigation works after search", () => {
    // Structure: root > projects > project-a > taskA1, taskA2, taskA3
    using app = createTestApp(
      item(
        "root",
        item(
          "projects",
          item("project-a", item("taskA1"), item("taskA2"), item("taskA3")),
          item("project-b", item("taskB1")),
        ),
      ),
      { incremental: false },
    )

    // Search and select taskA2
    app.dispatch("search")
    for (const ch of "taskA2") app.press(ch)
    app.press("Enter")

    app.expect("#taskA2[data-cursor]").toExist()

    // j/k should work from the search result position
    app.command("cursor_down")
    app.expect("#taskA3[data-cursor]").toExist()

    app.command("cursor_up")
    app.expect("#taskA2[data-cursor]").toExist()

    app.command("cursor_up")
    app.expect("#taskA1[data-cursor]").toExist()
  })

  test("search selects correct card when target is oi task under oi section (Asana-like)", () => {
    // Asana import structure: all nodes are oi
    // Project (oi) > Section (oi) > Task A (oi), Task B (oi)
    // User views Project, searches for Task B -- cursor should land on Task B card
    using app = createTestApp(
      item("project", item("section", item("task-alpha"), item("task-beta"), item("task-gamma"))),
      { incremental: false },
    )

    app.dispatch("search")
    for (const ch of "task-beta") app.press(ch)
    app.press("Enter")

    app.expect("[data-dialog='search']").not.toExist()
    app.expect("#task-beta[data-cursor]").toExist()
  })

  test("search for oi subtask zooms correctly and lands cursor on subtask", () => {
    // Asana-like: Project > Section > Task > Subtask
    // User views Project, searches for Subtask -- should zoom to Section,
    // making Task a column and Subtask a card.
    using app = createTestApp(
      item("project", item("section", item("parent-task", item("my-subtask"), item("other-subtask")))),
      { incremental: false },
    )

    app.dispatch("search")
    for (const ch of "my-subtask") app.press(ch)
    app.press("Enter")

    app.expect("[data-dialog='search']").not.toExist()
    // Cursor should be on the subtask itself
    app.expect("#my-subtask[data-cursor]").toExist()
    // After zoom, parent-task column header and other-subtask sibling should be visible
    expect(app.text).toContain("parent-task")
    expect(app.text).toContain("other-subtask")
  })

  test("search selectedNode matches cursor after same-column SELECT", () => {
    // Regression: when search SELECTs a card in the same column,
    // selectedNode should update to the new card (not stay on the old one).
    // This verifies the store's selectedNode is consistent with cursor.
    using app = createTestApp(item("root", item("col", item("first"), item("second"), item("third"))), {
      incremental: false,
    })

    // Initial cursor on first
    app.expect("#first[data-cursor]").toExist()

    // Search for third (same column, different card)
    app.dispatch("search")
    for (const ch of "third") app.press(ch)
    app.press("Enter")

    // Cursor must move to third, not stay on first
    app.expect("#third[data-cursor]").toExist()
    app.expect("#first[data-cursor]").not.toExist()
  })
})

// =============================================================================
// search flow integration tests requiring zoom + internal state inspection
// (kept on testEnv — these test internal action transitions like ZOOM_IN
// dispatched directly, where the testable signal is white-box state)
// =============================================================================

describe("search flow via key presses (zoom + internal state)", () => {
  test("search from zoomed-in view navigates to correct card", () => {
    // User is zoomed into "projects" and searches for a task in a sub-project.
    // Structure: root > projects > project-a > taskA1, taskA2
    //                             > project-b > taskB1
    // User zooms to "projects" first, then searches for "taskA2".
    const { board, store } = testEnv(
      () =>
        item(
          "root",
          item("projects", item("project-a", item("taskA1"), item("taskA2")), item("project-b", item("taskB1"))),
        ),
      { checkIncremental: false },
    )

    // Zoom into "projects" first via direct dispatch (no key binding for ZOOM_IN to specific node)
    dispatchAndFlush(store, { type: "ZOOM_IN", nodeId: "projects" })
    expect(getActiveBoardPane(store.getState())!.rootId).toBe("projects")

    // Now search for taskA2
    openSearchDialog(store, board)
    for (const ch of "taskA2") board.press(ch)
    board.press("Enter")

    // Should select taskA2 in the current view (it's a grandchild of "projects")
    board.expect("[data-dialog='search']").not.toExist()
    expect(getActiveBoardPane(store.getState())!.rootId).toBe("projects") // No zoom needed
    board.expectState({ cursor: "taskA2" })
    expect(derivedState(store).cursorDepth).toBe("card")
    board.expect("#taskA2[data-cursor]").toExist()
  })
})

// #############################################################################
// SEARCH & REPLACE
// #############################################################################

describe("Search & Replace", () => {
  /** Helper to create a standard board with searchable content */
  function searchBoard() {
    return testEnv(
      () =>
        item(
          "board",
          item("Todo", item("Buy milk"), item("Buy eggs"), item("Read book")),
          item("Done", item("Cook dinner"), item("Buy bread")),
        ),
      { columns: 100, checkIncremental: false },
    )
  }

  test("S opens the search/replace dialog", () => {
    const { board, store } = searchBoard()
    expect(getActiveBoardPane(store.getState())!.searchReplace).toBeNull()

    board.command("search_replace")

    const sr = getActiveBoardPane(store.getState())!.searchReplace
    expect(sr).not.toBeNull()
    expect(sr!.searchQuery).toBe("")
    expect(sr!.replaceQuery).toBe("")
    expect(sr!.focusedField).toBe("search")
    expect(sr!.useRegex).toBe(false)
  })

  test("Escape closes the search/replace dialog", () => {
    const { board, store } = searchBoard()

    board.command("search_replace")
    expect(getActiveBoardPane(store.getState())!.searchReplace).not.toBeNull()

    board.press("Escape")
    expect(getActiveBoardPane(store.getState())!.searchReplace).toBeNull()
  })

  test("typing updates the search query and shows matches", () => {
    const { board, store } = searchBoard()

    board.command("search_replace")
    // Type "Buy" into the search field
    board.press("B").command("undo").press("y")

    const sr = getActiveBoardPane(store.getState())!.searchReplace
    expect(sr).not.toBeNull()
    expect(sr!.searchQuery).toBe("Buy")
    expect(sr!.matchCount).toBe(3) // "Buy milk", "Buy eggs", "Buy bread"
    expect(sr!.matchNodeIds).toHaveLength(3)
  })

  test("Tab switches between search and replace fields", () => {
    const { board, store } = searchBoard()

    board.command("search_replace")
    expect(getActiveBoardPane(store.getState())!.searchReplace!.focusedField).toBe("search")

    board.command("indent_node")
    expect(getActiveBoardPane(store.getState())!.searchReplace!.focusedField).toBe("replace")

    board.command("indent_node")
    expect(getActiveBoardPane(store.getState())!.searchReplace!.focusedField).toBe("search")
  })

  test("Enter navigates to next match", () => {
    const { board, store } = searchBoard()

    board.command("search_replace")
    board.press("B").command("undo").press("y")

    const sr1 = getActiveBoardPane(store.getState())!.searchReplace!
    expect(sr1.matchIndex).toBe(0)
    expect(sr1.matchCount).toBe(3)

    board.press("Enter")
    const sr2 = getActiveBoardPane(store.getState())!.searchReplace!
    expect(sr2.matchIndex).toBe(1)

    board.press("Enter")
    const sr3 = getActiveBoardPane(store.getState())!.searchReplace!
    expect(sr3.matchIndex).toBe(2)

    // Wraps around
    board.press("Enter")
    const sr4 = getActiveBoardPane(store.getState())!.searchReplace!
    expect(sr4.matchIndex).toBe(0)
  })

  test("match count displays correctly with no matches", () => {
    const { board, store } = searchBoard()

    board.command("search_replace")
    board.command("zoom_inwards").command("zoom_inwards").command("zoom_inwards")

    const sr = getActiveBoardPane(store.getState())!.searchReplace!
    expect(sr.matchCount).toBe(0)
    expect(sr.matchNodeIds).toHaveLength(0)
  })

  test("Ctrl+R replaces the current match", () => {
    const { board, store, repo } = searchBoard()

    board.command("search_replace")
    // Search for "Buy"
    board.press("B").command("undo").press("y")

    const sr1 = getActiveBoardPane(store.getState())!.searchReplace!
    expect(sr1.matchCount).toBe(3)

    // Switch to replace field and type replacement
    board.command("indent_node")
    board.command("cursor_last").press("e").press("t")

    // Replace current match (first one: "Buy milk" -> "Get milk")
    board.press("ctrl+r")

    // Verify the replacement happened
    const firstMatchId = sr1.matchNodeIds[0]!
    const node = repo.getNode(firstMatchId)
    expect(node).toBeDefined()
    // The node should now have "Get" replacing "Buy"
    const text = node!.content ?? node!.name ?? ""
    expect(text).toContain("Get")
    expect(text).not.toMatch(/^Buy/)

    // Match count should decrease
    const sr2 = getActiveBoardPane(store.getState())!.searchReplace!
    expect(sr2.matchCount).toBe(2) // "Buy eggs" and "Buy bread" remain
  })

  test("replace all matches via command dispatch", () => {
    const { board, store, repo } = searchBoard()

    board.command("search_replace")
    board.press("B").command("undo").press("y")

    const sr1 = getActiveBoardPane(store.getState())!.searchReplace!
    expect(sr1.matchCount).toBe(3)
    const matchIds = [...sr1.matchNodeIds]

    // Switch to replace field and type replacement
    board.command("indent_node")
    board.command("cursor_last").press("e").press("t")

    // Replace all -- use dispatchCommandById since ctrl+shift+r
    // can't be represented in standard ANSI terminal encoding
    dispatchCommandById("search_replace.replace_all", store.getState)

    // Verify all replacements happened
    for (const nodeId of matchIds) {
      const node = repo.getNode(nodeId)
      expect(node).toBeDefined()
      const text = node!.content ?? node!.name ?? ""
      expect(text).toContain("Get")
      expect(text).not.toContain("Buy")
    }

    // Match count should be 0
    const sr2 = getActiveBoardPane(store.getState())!.searchReplace!
    expect(sr2.matchCount).toBe(0)
  })

  test("Ctrl+X toggles regex mode", () => {
    const { board, store } = searchBoard()

    board.command("search_replace")
    expect(getActiveBoardPane(store.getState())!.searchReplace!.useRegex).toBe(false)

    board.press("ctrl+x")
    expect(getActiveBoardPane(store.getState())!.searchReplace!.useRegex).toBe(true)

    board.press("ctrl+x")
    expect(getActiveBoardPane(store.getState())!.searchReplace!.useRegex).toBe(false)
  })

  test("regex search matches correctly", () => {
    const { board, store } = searchBoard()

    board.command("search_replace")

    // Enable regex
    board.press("ctrl+x")
    expect(getActiveBoardPane(store.getState())!.searchReplace!.useRegex).toBe(true)

    // Search for "Buy.*k" (matches "Buy milk" -- k in milk)
    board.press("B").command("undo").press("y")
    board.command("increase_content_lines").press("*").command("cursor_up")

    const sr = getActiveBoardPane(store.getState())!.searchReplace!
    // "Buy milk" matches Buy.*k (the k in milk)
    expect(sr.matchCount).toBeGreaterThanOrEqual(1)
  })

  test("dialog renders in the board output", () => {
    const { board } = searchBoard()

    board.command("search_replace")

    const output = board.screenshot()
    expect(output).toContain("[F]ind & Replace")
    expect(output).toContain("Find:")
    expect(output).toContain("Repl:")
  })

  test("invalid regex shows no matches instead of crashing", () => {
    const { board, store } = searchBoard()

    board.command("search_replace")

    // Enable regex
    board.press("ctrl+x")

    // Type an invalid regex
    board.press("[")

    const sr = getActiveBoardPane(store.getState())!.searchReplace!
    expect(sr.matchCount).toBe(0)
    // Should not crash
  })
})
