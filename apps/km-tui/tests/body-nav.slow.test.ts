/**
 * Body content navigation tests.
 *
 * Tests navigation behavior when files/boards have body content (paragraphs,
 * code blocks, HRs, etc.) before the first section/outline item. Body content
 * is rendered as a virtual "Description" column.
 *
 * Covers:
 * - j/k vertical navigation through body cards
 * - h/l horizontal navigation between body and structural columns
 * - Y-position matching when moving between body and structural columns
 * - Body block spacing and rendering in cards/columns views
 * - Zoom into nodes with body content (cursor placement)
 * - Body column collapse error (__body__ repo lookup)
 * - Navigation layer classification of body nodes
 * - Board-level j/k with body content and stickyX
 * - Deep nesting with body content
 * - Real vault scenarios with mixed columns
 */

import { describe, it, test, expect, afterEach, vi } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { createFakeRepo, type Repo } from "@km/storage"
import { createBoardDriver } from "../src/driver.ts"
import { createCardsViewNavigation, type NavState } from "../src/view-navigation.ts"
import { createGridNavigator, buildViewTree, buildViewIndex } from "@km/board"
import { deriveColumnsFromRepo } from "../src/hooks/use-columns.ts"
import { createBoardTest, type BoardTestHarness } from "../src/testing.ts"
import { BODY_CONTENT_BOARD } from "./fixtures/body-content-fixture.ts"
import { getActiveBoardPane } from "../src/board-app-store.ts"

function makeNavState(cursorNodeId: string, rootId: string, repo: Repo): NavState {
  const vTree = buildViewTree(repo, rootId, new Map())
  const vIndex = buildViewIndex(vTree)
  return { cursorNodeId, rootId, foldDepths: new Map(), collapsedNodes: new Set(), viewTree: vTree, viewIndex: vIndex }
}

function cursor(nodeId: string): string {
  return `[id="${nodeId}"][data-cursor]`
}

/** CSS selector for node with spaces in ID: use attribute selector */
function id(nodeId: string): string {
  return `[id="${nodeId}"]`
}

// =============================================================================
// Body content within a column: j/k navigation
// =============================================================================

describe("body content within a column: j/k navigation", () => {
  it("j from column header enters first body card", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.p("body-p1"), item.p("body-p2"), item("sub-section", item("task1")))),
    )

    // Initial cursor on first card in col1 (should be body-p1)
    board.expect(cursor("body-p1")).toExist()

    // j should move to second body card
    board.press("j")
    board.expect(cursor("body-p2")).toExist()
  })

  it("j navigates through body cards then to structural cards", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.p("body-p1"), item.p("body-p2"), item("sub-section", item("task1")))),
    )

    board.expect(cursor("body-p1")).toExist()

    board.press("j")
    board.expect(cursor("body-p2")).toExist()

    // j from last body card should go to first structural card (sub-section)
    board.press("j")
    board.expect(cursor("sub-section")).toExist()
  })

  it("k navigates back through body cards", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item.p("body-p1"), item.p("body-p2"), item("sub-section", item("task1")))),
    )

    // Navigate to sub-section
    board.press("j").press("j")
    board.expect(cursor("sub-section")).toExist()

    // k should go back to body-p2
    board.press("k")
    board.expect(cursor("body-p2")).toExist()

    // k should go to body-p1
    board.press("k")
    board.expect(cursor("body-p1")).toExist()

    // k should go to column header
    board.press("k")
    board.expect(cursor("col1")).toExist()
  })

  it("j/k works with multiple columns where one has body content", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col-with-body", item.p("intro"), item.p("details"), item("child1"), item("child2")),
        item("col-normal", item("task-a"), item("task-b")),
      ),
    )

    // Start on first body card
    board.expect(cursor("intro")).toExist()

    // j through body content
    board.press("j")
    board.expect(cursor("details")).toExist()

    // j to structural cards
    board.press("j")
    board.expect(cursor("child1")).toExist()

    board.press("j")
    board.expect(cursor("child2")).toExist()

    // k back
    board.press("k")
    board.expect(cursor("child1")).toExist()

    board.press("k")
    board.expect(cursor("details")).toExist()
  })

  it("body-only column: j/k through only body cards", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("body-col", item.p("para1"), item.p("para2"), item.p("para3")),
        item("normal-col", item("task1")),
      ),
    )

    // Start on first body card
    board.expect(cursor("para1")).toExist()

    board.press("j")
    board.expect(cursor("para2")).toExist()

    board.press("j")
    board.expect(cursor("para3")).toExist()

    // j at last body card — should hit boundary
    board.press("j")
    expect(board.bell).toBe(true)

    // k back to para2
    board.press("k")
    board.expect(cursor("para2")).toExist()
  })
})

// =============================================================================
// Body content navigation (board-level body column)
// =============================================================================

describe("body content navigation", () => {
  it("j moves down through body cards", () => {
    const { board } = testEnv(() => item("board", item.p("para1"), item.p("para2"), item("col1", item("task1"))))

    // Cursor should start on first body paragraph
    board.expect("#para1[data-cursor]").toExist()

    // j should move to second body paragraph
    board.press("j")
    board.expect("#para2[data-cursor]").toExist()
  })

  it("k moves up through body cards", () => {
    const { board } = testEnv(() => item("board", item.p("para1"), item.p("para2"), item("col1", item("task1"))))

    // Move to second paragraph first
    board.press("j")
    board.expect("#para2[data-cursor]").toExist()

    // k should go back to first
    board.press("k")
    board.expect("#para1[data-cursor]").toExist()
  })

  it("k from first body card goes to body column header, then board level", () => {
    const { board } = testEnv(() => item("board", item.p("para1"), item("col1", item("task1"))))

    // Start on para1
    board.expect("#para1[data-cursor]").toExist()

    // k should go to body column header (__body__board)
    board.press("k")
    board.expect('[id="__body__board"][data-cursor]').toExist()

    // k again should go to board level
    board.press("k")
    board.expect("#board[data-cursor]").toExist()
  })

  it("j from last body card hits boundary", () => {
    const { board } = testEnv(() => item("board", item.p("para1"), item("col1", item("task1"))))

    // Start on para1 (last/only body card)
    board.expect("#para1[data-cursor]").toExist()

    // j should hit boundary (body cards are in their own visual column)
    board.press("j")
    // Cursor should still be on para1 (boundary hit)
    board.expect("#para1[data-cursor]").toExist()
  })

  it("l from body card navigates to structural column", () => {
    const { board } = testEnv(() =>
      item("board", item.p("body text"), item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
    )

    // Start on body card
    board.expect("[id='body text'][data-cursor]").toExist()

    // l should navigate to first structural column
    board.press("l")
    board.expect("#task1[data-cursor]").toExist()
  })

  it("navigation layer correctly classifies body nodes", () => {
    const nodes = item("board", item.p("body text"), item("col1", item("task1")))
    const repo = createFakeRepo({ nodes })

    const nav = createCardsViewNavigation()
    const registry = createGridNavigator()

    const navState = makeNavState("body text", "board", repo)

    // Down from single body card should be null (boundary)
    const downTarget = nav.navigate("down", navState, repo, registry)
    expect(downTarget).toBeNull()

    // Up from body card should go to body column header
    const upTarget = nav.navigate("up", navState, repo, registry)
    expect(upTarget).toBe("__body__board")
  })

  it("navigation layer handles multiple body nodes", () => {
    const nodes = item("board", item.p("p1"), item.p("p2"), item.p("p3"), item("col1", item("task1")))
    const repo = createFakeRepo({ nodes })

    const nav = createCardsViewNavigation()
    const registry = createGridNavigator()

    // Down from p1 → p2
    expect(nav.navigate("down", makeNavState("p1", "board", repo), repo, registry)).toBe("p2")

    // Down from p2 → p3
    expect(nav.navigate("down", makeNavState("p2", "board", repo), repo, registry)).toBe("p3")

    // Down from p3 → null (boundary)
    expect(nav.navigate("down", makeNavState("p3", "board", repo), repo, registry)).toBeNull()

    // Up from p3 → p2
    expect(nav.navigate("up", makeNavState("p3", "board", repo), repo, registry)).toBe("p2")

    // Up from p1 → body column header
    expect(nav.navigate("up", makeNavState("p1", "board", repo), repo, registry)).toBe("__body__board")
  })
})

// =============================================================================
// Body column navigation after zoom (km-nyxsp)
// =============================================================================

describe("body column navigation after zoom", () => {
  it("l from body column header after zoom goes to structural column", () => {
    const { board } = testEnv(() =>
      item("board", item("root-section", item.p("body-text"), item("sub1", item("t1")), item("sub2", item("t2")))),
    )

    // Navigate to column header and zoom in to root-section
    board.press("k") // body-text → root-section column header
    board.press("z") // zoom into root-section

    // After zoom, cursor on first body card
    board.expect("#body-text[data-cursor]").toExist()

    // k to body column header
    board.press("k")
    board.expect('[id="__body__root-section"][data-cursor]').toExist()

    // l should go to sub1 column (first structural column)
    board.press("l")

    const cursorId = board.q("[data-cursor]").getAttribute("id")
    expect(cursorId).toBe("sub1")
  })

  it("l from body card after zoom goes to structural column", () => {
    const { board } = testEnv(() =>
      item("board", item("root4", item.p("body-p"), item("sec-x", item("tx1")), item("sec-y", item("ty1")))),
    )

    // Navigate to column header and zoom
    board.press("k") // body-p → root4 column header
    board.press("z") // zoom into root4

    board.expect("#body-p[data-cursor]").toExist()

    // l directly from body card — should go to sec-x's first card
    board.press("l")

    const cursorId = board.q("[data-cursor]").getAttribute("id")
    expect(cursorId).not.toBe("body-p")
    expect(cursorId).not.toBe("root4")
  })
})

// =============================================================================
// Zoom into nodes with body content — cursor placement
// =============================================================================

describe("zoom into node with body content: cursor placement", () => {
  it("zoom places cursor on first meaningful body card", () => {
    // Board has a card. The card has body content + structural children.
    // Zooming into the card should place cursor on the first meaningful body card.
    const nodes = item(
      "board",
      item(
        "col1",
        item("target-card", item.p("intro-text"), item.p("detail-text"), item("subsection1", item("task1"))),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Cursor on target-card
    expect(driver.getState().selectedNodeId).toBe("target-card")

    // Zoom inwards: board → col1 → target-card (one level per press)
    driver.press("z")
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("col1")
    driver.press("z")
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("target-card")

    // Cursor should be on first body card (intro-text), not stuck on board level
    const cursorId = getActiveBoardPane(driver.store.getState())!.cursorNodeId
    // intro-text is a body paragraph — it becomes a card in the virtual body column
    expect(cursorId).toBe("intro-text")
  })

  it("zoom into node with HR body content still navigates", () => {
    // HR nodes have no content → filtered by meaningfulBody.
    // Zoom should still place cursor on a valid card.
    const nodes = item(
      "board",
      item("col1", item("section-with-hr", item.hr("hr1"), item.p("after-hr-text"), item("subsection", item("task1")))),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Zoom inwards: board → col1 → section-with-hr (one level per press)
    driver.press("z")
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("col1")
    driver.press("z")
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("section-with-hr")

    // Cursor should NOT be stuck on board level — should be on a navigable card
    const pane = getActiveBoardPane(driver.store.getState())!
    // HR has no content so it's filtered from virtual body column.
    // after-hr-text should be in the body column, or cursor should be on subsection.
    expect(pane.cursorNodeId).not.toBe("section-with-hr")
    expect(pane.cursorNodeId).not.toBeNull()
  })

  it("j/k works after zoom into node with body content", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item(
          "col1",
          item("target", item.p("body1"), item.p("body2"), item("sub1", item("t1")), item("sub2", item("t2"))),
        ),
      ),
    )

    // Zoom inwards: board → col1 → target (one level per press)
    board.press("z")
    board.press("z")

    // After zoom, cursor should be on first body card
    board.expect(cursor("body1")).toExist()

    // j should navigate to body2
    board.press("j")
    board.expect(cursor("body2")).toExist()

    // j should hit boundary (body column boundary)
    board.press("j")
    expect(board.bell).toBe(true)
  })

  it("j from board level with body nodes skips to first column if body filtered", () => {
    // When body nodes are empty/HR (filtered by meaningfulBody),
    // board-level j should navigate to the first structural column, not loop.
    const nodes = item(
      "board",
      item(
        "col1",
        item("section", item.hr("hr-only"), item("subsection1", item("task1")), item("subsection2", item("task2"))),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Zoom inwards: board → col1 → section (one level per press)
    driver.press("z")
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("col1")
    driver.press("z")
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("section")

    // Navigate to board level first
    driver.press("k")
    driver.press("k")
    driver.press("k")

    // Now from board level, j should go to a column header or card, not get stuck
    driver.press("j")
    const afterJ = getActiveBoardPane(driver.store.getState())!
    // Should NOT be on the root (board level) — should have moved somewhere
    expect(afterJ.cursorNodeId).not.toBe("section")
  })
})

// =============================================================================
// BUG REPRODUCER: body node filtered by meaningfulBody blocks navigation
// =============================================================================

describe("BUG: empty body node blocks j/k navigation", () => {
  it("board-level j should skip filtered-out body nodes", () => {
    // A section has:
    //   - An HR (no content) as first child
    //   - Then structural oi children
    // The HR is filtered by meaningfulBody, so it's NOT in any column.
    // Board-level j tries repo.getChildren(rootId)[0] which is the HR.
    // SELECT can't find it in nodeIndex → cursor stays at board level → stuck!
    const nodes = item(
      "board",
      item(
        "col1",
        item(
          "root-section",
          item.hr("hr-empty"), // HR = no content → filtered out
          item("sec1", item("task1")),
          item("sec2", item("task2")),
        ),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Zoom inwards: board → col1 → root-section (one level per press)
    driver.press("z")
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("col1")
    driver.press("z")
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("root-section")

    // Navigate to board level
    driver.press("k")
    driver.press("k")

    // j from board level should go to a column, not get stuck
    driver.press("j")
    const afterJ = getActiveBoardPane(driver.store.getState())!
    // Should be on sec1 (first structural column), not stuck at board level
    expect(afterJ.cursorNodeId).not.toBe("root-section")
    expect(afterJ.cursorNodeId).not.toBe("hr-empty")
  })

  it("zoom into node with empty first body child should not get stuck", () => {
    const nodes = item(
      "board",
      item(
        "col1",
        item(
          "target",
          item.hr("hr-first"), // HR = no content → filtered out
          item("sub1", item("t1")),
          item("sub2", item("t2")),
        ),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Zoom inwards: board → col1 → target (one level per press)
    driver.press("z")
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("col1")
    driver.press("z")
    expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("target")

    // Cursor should NOT be on the HR (it's filtered from columns)
    // It should be on the first structural column's first card
    const paneState = getActiveBoardPane(driver.store.getState())!
    expect(paneState.cursorNodeId).not.toBe("hr-first")
    expect(paneState.cursorNodeId).not.toBe("target") // not stuck at board level
  })
})

// =============================================================================
// Real vault scenario: column with body content + structural cards
// =============================================================================

describe("real vault scenario: zoom into section with mixed columns", () => {
  it("j/k works in column that has body + structural cards after zoom", () => {
    // Mimic the real vault structure:
    // Root: "Landing the Plane"
    //   |- Someday/Maybe (oi) → columns with cards
    //   |- Agent Instructions (oi) → has body paragraphs + structural sub-sections
    //   +- CLAUDE.md (oi) → has body paragraphs + structural sub-sections
    const { board } = testEnv(() =>
      item(
        "root",
        item(
          "col1",
          item(
            "landing",
            item("someday", item("ideas"), item("projects")),
            item(
              "agent-instructions",
              item.p("bd-beads-text"),
              item("quick-ref", item("bd-ready")),
              item("landing-sub", item("sub-task1")),
            ),
            item(
              "claude-md",
              item.p("instructions-text"),
              item("owner", item("serial-entrepreneur")),
              item("context-system", item("para-style")),
            ),
          ),
        ),
      ),
    )

    // Zoom inwards: root → col1 → landing (one level per press)
    board.press("z")
    board.press("z")

    // Now at column level or card level in the zoomed view
    // Navigate to agent-instructions column's body card
    board.press("l") // move to agent-instructions column area
    board.expect(cursor("bd-beads-text")).toExist()

    // j should move to next card in agent-instructions column
    board.press("j")
    board.expect(cursor("quick-ref")).toExist()

    // j again
    board.press("j")
    board.expect(cursor("landing-sub")).toExist()

    // k back
    board.press("k")
    board.expect(cursor("quick-ref")).toExist()

    board.press("k")
    board.expect(cursor("bd-beads-text")).toExist()
  })
})

// =============================================================================
// BUG: collapse on body column triggers __body__ repo lookup error
// =============================================================================

describe("BUG: collapse on body column triggers __body__ repo lookup error", () => {
  test("pressing c on body column should not produce console.error about __body__ not in repo", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const { board } = testEnv(() => item("board", item.p("body text here"), item("col1", item("A"))))

    // Cursor starts on body column (first non-collapsed column).
    // Press g.c to toggle collapse on body column — this triggers the bug:
    // "ERROR km:nav cursor node not in repo: __body__board, falling back to root"
    board.press("v").press("c")

    // Check no error was logged about __body__
    const bodyErrors = errorSpy.mock.calls.filter((args) =>
      args.some((arg) => typeof arg === "string" && arg.includes("__body__")),
    )
    expect(bodyErrors, "should not log __body__ repo lookup error").toHaveLength(0)

    errorSpy.mockRestore()
  })

  test("pressing c on body column should produce a boundary bell (body is not collapsible)", () => {
    const { board } = testEnv(() => item("board", item.p("body text here"), item("col1", item("A"))))

    // Body column is virtual/synthetic — collapse should be a boundary error (bell)
    board.press("v").press("c")
    expect(board.bell, "body column collapse should ring bell").toBe(true)
  })

  test("navigate to body column then collapse — key sequence c, l, c", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const { board } = testEnv(() => item("board", item.p("body text here"), item("col1", item("A"))))

    // g.c on body column (should be noop/boundary)
    board.press("v").press("c")
    // l to navigate to col1
    board.press("l")
    // g.c to collapse col1 (this should work fine)
    board.press("v").press("c")

    const bodyErrors = errorSpy.mock.calls.filter((args) =>
      args.some((arg) => typeof arg === "string" && arg.includes("__body__")),
    )
    expect(bodyErrors, "no __body__ errors during sequence c,l,c").toHaveLength(0)

    errorSpy.mockRestore()
  })
})

// =============================================================================
// Body Content Visual Tests
// =============================================================================

describe("Body Content Visual Tests", () => {
  let board: BoardTestHarness | null = null

  afterEach(() => {
    if (board) {
      board.unmount()
      board = null
    }
  })

  test("body content file renders correctly", async () => {
    const repo = createFakeRepo({ nodes: BODY_CONTENT_BOARD.nodes })
    board = await createBoardTest(repo)
    const screenshot = board.screenshot()

    // Should render content from body fixture
    expect(screenshot.length).toBeGreaterThan(0)
    expect(screenshot).toBeTruthy()
  })

  test("navigation with h/l moves between columns", async () => {
    const repo = createFakeRepo({ nodes: BODY_CONTENT_BOARD.nodes })
    board = await createBoardTest(repo)

    // Initial state
    const initial = board.screenshot()
    expect(initial.length).toBeGreaterThan(0)

    // Press 'l' to move right
    board.press("l")
    const afterRight = board.screenshot()
    expect(afterRight.length).toBeGreaterThan(0)

    // Press 'h' to move left
    board.press("h")
    const afterLeft = board.screenshot()
    expect(afterLeft.length).toBeGreaterThan(0)

    // Press 'l' twice to go further right
    board.press("l")
    board.press("l")
    const afterTwoRight = board.screenshot()
    expect(afterTwoRight.length).toBeGreaterThan(0)
  })

  test("navigation with j/k moves between cards", async () => {
    const repo = createFakeRepo({ nodes: BODY_CONTENT_BOARD.nodes })
    board = await createBoardTest(repo)

    // Navigate to a column first
    board.press("l")

    // Navigate down into the column
    board.press("j")
    const afterDown = board.screenshot()
    expect(afterDown.length).toBeGreaterThan(0)

    // Navigate up
    board.press("k")
    const afterUp = board.screenshot()
    expect(afterUp.length).toBeGreaterThan(0)
  })

  test("g (go top) navigates to first card", async () => {
    const repo = createFakeRepo({ nodes: BODY_CONTENT_BOARD.nodes })
    board = await createBoardTest(repo)

    // Navigate to a column
    board.press("l")

    // Navigate down a couple times
    board.press("j")
    board.press("j")
    const afterTwoDown = board.screenshot()

    // Press 'gg' to go to top
    board.press("g")
    board.press("g")
    const afterGoTop = board.screenshot()

    expect(afterTwoDown.length).toBeGreaterThan(0)
    expect(afterGoTop.length).toBeGreaterThan(0)
  })

  test("nested content expands correctly", async () => {
    const repo = createFakeRepo({ nodes: BODY_CONTENT_BOARD.nodes })
    board = await createBoardTest(repo)

    // Navigate to Column B (two 'l' presses)
    board.press("l")
    board.press("l")

    // Navigate to a card
    board.press("j")
    const beforeExpand = board.screenshot()

    // Expand the card
    board.press("enter")
    const afterExpand = board.screenshot()

    expect(beforeExpand.length).toBeGreaterThan(0)
    expect(afterExpand.length).toBeGreaterThan(0)
  })
})

// =============================================================================
// Body h/l navigation Y-position matching
// =============================================================================

describe("body h/l navigation Y-position matching", () => {
  test("l from 3rd body card goes to Y-matched card in structural column", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.p("body-1"),
          item.p("body-2"),
          item.p("body-3"),
          item.p("body-4"),
          item.p("body-5"),
          item("col1", item("task-a"), item("task-b"), item("task-c"), item("task-d"), item("task-e")),
        ),
      { rows: 40 },
    )

    board.expect("#body-1[data-cursor]").toExist()
    board.press("j") // → body-2
    board.press("j") // → body-3
    board.expect("#body-3[data-cursor]").toExist()

    // l should land on task-c (same Y as body-3), not task-a (first)
    board.press("l")
    board.expect("#task-c[data-cursor]").toExist()
  })

  test("l from body-1 goes to task-a (both at top)", () => {
    const { board } = testEnv(
      () => item("board", item.p("body-1"), item("col1", item("task-a"), item("task-b"), item("task-c"))),
      { rows: 40 },
    )

    board.expect("#body-1[data-cursor]").toExist()
    board.press("l")
    board.expect("#task-a[data-cursor]").toExist()
  })

  test("l from body card then h back preserves Y position", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.p("bp-1"),
          item.p("bp-2"),
          item.p("bp-3"),
          item("s1", item("t-1"), item("t-2"), item("t-3")),
        ),
      { rows: 40 },
    )

    board.press("j") // → bp-2
    board.press("j") // → bp-3
    board.expect("#bp-3[data-cursor]").toExist()

    board.press("l")
    const rightTarget = board.q("[data-cursor]").getAttribute("id")
    expect(rightTarget).not.toBe("bp-1") // Should not jump to top

    board.press("h")
    const backTarget = board.q("[data-cursor]").getAttribute("id")
    expect(backTarget).toMatch(/^bp-/)
  })

  test("l from structural column card goes to next column at same Y", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("col1", item("a1"), item("a2"), item("a3"), item("a4"), item("a5")),
          item("col2", item("b1"), item("b2"), item("b3"), item("b4"), item("b5")),
        ),
      { rows: 40 },
    )

    // Cursor starts on first card (a1), navigate to a3
    board.expect("#a1[data-cursor]").toExist()
    board.press("j") // → a2
    board.press("j") // → a3
    board.expect("#a3[data-cursor]").toExist()

    // l to col2 — should go to b3 (same Y), not b1
    board.press("l")
    board.expect("#b3[data-cursor]").toExist()
  })

  test("h from structural column card into body column matches Y-position (km-tui.vbody-nav)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.p("body-1"),
          item.p("body-2"),
          item.p("body-3"),
          item.p("body-4"),
          item.p("body-5"),
          item("col1", item("task-a"), item("task-b"), item("task-c"), item("task-d"), item("task-e")),
        ),
      { rows: 40 },
    )

    // Navigate right to structural column
    board.press("l")
    board.expect("#task-a[data-cursor]").toExist()

    // Navigate down to task-c (3rd card)
    board.press("j").press("j")
    board.expect("#task-c[data-cursor]").toExist()

    // h should land on body-3 (same Y as task-c), not body-1 (first)
    board.press("h")
    board.expect("#body-3[data-cursor]").toExist()
  })

  test("h from structural column to body preserves Y across multiple hops (km-tui.vbody-nav)", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.p("bp-1"),
          item.p("bp-2"),
          item.p("bp-3"),
          item.p("bp-4"),
          item.p("bp-5"),
          item("s1", item("t-1"), item("t-2"), item("t-3"), item("t-4"), item("t-5")),
          item("s2", item("u-1"), item("u-2"), item("u-3"), item("u-4"), item("u-5")),
        ),
      { rows: 40 },
    )

    // Navigate to s2, go down to u-4
    board.press("l").press("l")
    board.expect("#u-1[data-cursor]").toExist()
    board.press("j").press("j").press("j")
    board.expect("#u-4[data-cursor]").toExist()

    // h to s1 → should Y-match to t-4
    board.press("h")
    board.expect("#t-4[data-cursor]").toExist()

    // h to body → should Y-match to bp-4
    board.press("h")
    board.expect("#bp-4[data-cursor]").toExist()
  })

  test("h from deep structural card clamps to last body card (km-tui.vbody-nav)", () => {
    // Body has only 2 cards, structural column has 8. Navigating h from
    // a card far down should clamp to last body card (body-2), not overshoot.
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.p("body-1"),
          item.p("body-2"),
          item("col1", item("t1"), item("t2"), item("t3"), item("t4"), item("t5"), item("t6"), item("t7"), item("t8")),
        ),
      { rows: 40 },
    )

    // Navigate right to structural column, then deep down
    board.press("l")
    board.expect("#t1[data-cursor]").toExist()
    for (let i = 0; i < 7; i++) board.press("j")
    board.expect("#t8[data-cursor]").toExist()

    // h should clamp to last body card (body-2), not crash or go to body-1
    board.press("h")
    board.expect("#body-2[data-cursor]").toExist()
  })
})

// =============================================================================
// Body block spacing
// =============================================================================

describe("Body block spacing", () => {
  // Helper to create a board with body content (paragraphs before sections)
  // Uses section nodes (oi type) for structural items so extractBody
  // correctly classifies paragraphs as body and sections as structural.
  function boardWithBodyContent() {
    return item(
      "board",
      item(
        "col1",
        item.p("body paragraph one"),
        item.p("body paragraph two"),
        item.section("task-a", item("task-a-child")),
        item.section("task-b", item("task-b-child")),
      ),
    )
  }

  describe("cards view", () => {
    test("body blocks have compact content (blank lines collapsed)", () => {
      // Create a body card with internal blank lines
      const nodes = item("board", item("col1", item.p("line one\n\nline two\n\n\nline three"), item("task-a")))
      const { board } = testEnv(() => nodes)

      const screenshot = board.screenshot()
      expect(screenshot).toContain("line one")
      expect(screenshot).toContain("line two")
      expect(screenshot).toContain("line three")

      // Find the lines inside the card (after the column header separator)
      const lines = screenshot.split("\n")
      const sepIdx = lines.findIndex((l) => l.includes("───"))
      const contentLines = lines.slice(sepIdx + 1)

      const lineOneIdx = contentLines.findIndex((l) => l.includes("line one"))
      const lineTwoIdx = contentLines.findIndex((l) => l.includes("line two"))
      const lineThreeIdx = contentLines.findIndex((l) => l.includes("line three"))

      // All three lines should be on consecutive rows (no blank gap between them)
      // because compactContent collapses \n\n → \n
      expect(lineTwoIdx).toBe(lineOneIdx + 1)
      expect(lineThreeIdx).toBe(lineTwoIdx + 1)
    })

    test("body blocks render with borders in cards view", () => {
      const { board } = testEnv(boardWithBodyContent)

      const screenshot = board.screenshot()
      expect(screenshot).toContain("body paragraph one")
      expect(screenshot).toContain("body paragraph two")

      // Body cards should have round border characters (╭ or ╰)
      expect(screenshot).toMatch(/[╭╰]/)
    })
  })

  describe("columns view", () => {
    test("body blocks have no blank line between them", () => {
      const { board } = testEnv(boardWithBodyContent, { viewMode: "columns" })

      const screenshot = board.screenshot()
      expect(screenshot).toContain("body paragraph one")
      expect(screenshot).toContain("body paragraph two")

      // Find the lines after the column header separator
      const lines = screenshot.split("\n")
      const sepIdx = lines.findIndex((l) => l.includes("───"))
      const contentLines = lines.slice(sepIdx + 1)

      const paraOneIdx = contentLines.findIndex((l) => l.includes("body paragraph one"))
      const paraTwoIdx = contentLines.findIndex((l) => l.includes("body paragraph two"))

      // Body blocks are compact — no blank line between them (index diff of 1)
      expect(paraTwoIdx).toBe(paraOneIdx + 1)
    })

    test("body blocks have no borders in columns view", () => {
      const { board } = testEnv(boardWithBodyContent, { viewMode: "columns" })

      const screenshot = board.screenshot()

      // Find the lines after the column header separator
      const lines = screenshot.split("\n")
      const sepIdx = lines.findIndex((l) => l.includes("───"))
      const contentLines = lines.slice(sepIdx + 1)

      const paraOneIdx = contentLines.findIndex((l) => l.includes("body paragraph one"))

      // No round border characters near body content
      if (paraOneIdx > 0) {
        const lineBefore = contentLines[paraOneIdx - 1]!
        expect(lineBefore).not.toMatch(/[╭╮╰╯]/)
      }
      const lineAfter = contentLines[paraOneIdx + 1]
      if (lineAfter) {
        expect(lineAfter).not.toMatch(/[╭╮╰╯]/)
      }
    })

    test("body blocks have same spacing as structural items", () => {
      const { board } = testEnv(boardWithBodyContent, { viewMode: "columns" })

      const screenshot = board.screenshot()
      const lines = screenshot.split("\n")
      const sepIdx = lines.findIndex((l) => l.includes("───"))
      const contentLines = lines.slice(sepIdx + 1)

      const paraOneIdx = contentLines.findIndex((l) => l.includes("body paragraph one"))
      const paraTwoIdx = contentLines.findIndex((l) => l.includes("body paragraph two"))
      const taskAIdx = contentLines.findIndex((l) => l.includes("task-a"))
      const taskBIdx = contentLines.findIndex((l) => l.includes("task-b"))

      // Both body and structural items: spacing of 1 (compact, no blank lines)
      const bodySpacing = paraTwoIdx - paraOneIdx
      const structuralSpacing = taskBIdx - taskAIdx

      expect(bodySpacing).toBe(1)
      expect(structuralSpacing).toBe(1)
    })
  })
})

// =============================================================================
// Body content: vertical navigation (j/k) — file-based tests
// =============================================================================

describe("Body content: vertical navigation (j/k)", () => {
  test("j navigates down through body cards", () => {
    const { board } = testEnv(() =>
      item.file("doc", item.p("intro-p"), item.p("second-p"), item.section("sec1", item("task1"), item("task2"))),
    )

    // Initial cursor should be on first body card
    board.expect(cursor("intro-p")).toExist()

    // j moves to next body card
    board.press("j")
    board.expect(cursor("second-p")).toExist()
  })

  test("j at last body card hits boundary (cannot cross to structural column)", () => {
    const { board } = testEnv(() => item.file("doc", item.p("intro"), item.section("sec1", item("task1"))))

    // Start at body card
    board.expect(cursor("intro")).toExist()

    // j at last (only) body card — boundary
    board.press("j")
    expect(board.bell).toBe(true)
  })

  test("k at first body card moves to body column header, then board level", () => {
    const { board } = testEnv(() => item.file("doc", item.p("intro"), item.section("sec1", item("task1"))))

    // Start at body card
    board.expect(cursor("intro")).toExist()

    // k moves to body column header
    board.press("k")
    board.expect('[id="__body__doc"][data-cursor]').toExist()

    // k again moves to board (root)
    board.press("k")
    board.expect(cursor("doc")).toExist()
  })

  test("k navigates up through body cards", () => {
    const { board } = testEnv(() =>
      item.file("doc", item.p("p1"), item.p("p2"), item.p("p3"), item.section("sec1", item("task1"))),
    )

    // Navigate to third body card
    board.press("j").press("j")
    board.expect(cursor("p3")).toExist()

    // k moves back up
    board.press("k")
    board.expect(cursor("p2")).toExist()

    board.press("k")
    board.expect(cursor("p1")).toExist()

    // k from first body card to body column header
    board.press("k")
    board.expect('[id="__body__doc"][data-cursor]').toExist()

    // k from body column header to board
    board.press("k")
    board.expect(cursor("doc")).toExist()
  })
})

// =============================================================================
// Body content: horizontal navigation (h/l) — file-based tests
// =============================================================================

describe("Body content: horizontal navigation (h/l)", () => {
  test("l from body card navigates to first structural column card", () => {
    const { board } = testEnv(() =>
      item.file("doc", item.p("intro"), item.section("sec1", item("task1"), item("task2"))),
    )

    // Start at body card
    board.expect(cursor("intro")).toExist()

    // l navigates from body column to first structural column
    board.press("l")
    board.expect(cursor("task1")).toExist()
  })

  test("h from structural column card navigates back to body", () => {
    const { board } = testEnv(() => item.file("doc", item.p("intro"), item.section("sec1", item("task1"))))

    // Navigate to structural column
    board.press("l")
    board.expect(cursor("task1")).toExist()

    // h navigates back to body
    board.press("h")
    board.expect(cursor("intro")).toExist()
  })

  test("h at body card is boundary (leftmost)", () => {
    const { board } = testEnv(() => item.file("doc", item.p("intro"), item.section("sec1", item("task1"))))

    // Start at body card
    board.expect(cursor("intro")).toExist()

    // h at body column — boundary
    board.press("h")
    expect(board.bell).toBe(true)
  })

  test("l between structural columns works with body present", () => {
    const { board } = testEnv(() =>
      item.file("doc", item.p("intro"), item.section("sec1", item("task1")), item.section("sec2", item("task2"))),
    )

    // Navigate to first structural column
    board.press("l")
    board.expect(cursor("task1")).toExist()

    // l to second structural column
    board.press("l")
    board.expect(cursor("task2")).toExist()

    // h back to first structural column
    board.press("h")
    board.expect(cursor("task1")).toExist()

    // h back to body
    board.press("h")
    board.expect(cursor("intro")).toExist()
  })
})

// =============================================================================
// Body content: deep nesting
// =============================================================================

describe("Body content: deep nesting", () => {
  test("j/k works in structural column when body column exists", () => {
    const { board } = testEnv(() =>
      item.file("doc", item.p("intro"), item.section("sec1", item("task1"), item("task2"), item("task3"))),
    )

    // Navigate to structural column
    board.press("l")
    board.expect(cursor("task1")).toExist()

    // j/k within structural column
    board.press("j")
    board.expect(cursor("task2")).toExist()

    board.press("j")
    board.expect(cursor("task3")).toExist()

    board.press("k")
    board.expect(cursor("task2")).toExist()
  })

  test("k from structural card to column header to board", () => {
    const { board } = testEnv(() => item.file("doc", item.p("intro"), item.section("sec1", item("task1"))))

    // Navigate to structural column card
    board.press("l")
    board.expect(cursor("task1")).toExist()

    // k to column header
    board.press("k")
    board.expect(cursor("sec1")).toExist()

    // k to board
    board.press("k")
    board.expect(cursor("doc")).toExist()
  })
})

// =============================================================================
// Body content only (no sections)
// =============================================================================

describe("Body content only (no sections)", () => {
  test("j/k through body-only file", () => {
    const { board } = testEnv(() => item.file("doc", item.p("p1"), item.p("p2"), item.p("p3")))

    // Should start on first body card
    board.expect(cursor("p1")).toExist()

    board.press("j")
    board.expect(cursor("p2")).toExist()

    board.press("j")
    board.expect(cursor("p3")).toExist()

    // j at last body card — boundary
    board.press("j")
    expect(board.bell).toBe(true)

    board.press("k")
    board.expect(cursor("p2")).toExist()
  })

  test("h/l at body-only file hits boundary", () => {
    const { board } = testEnv(() => item.file("doc", item.p("p1"), item.p("p2")))

    board.expect(cursor("p1")).toExist()

    // h — boundary (leftmost)
    board.press("h")
    expect(board.bell).toBe(true)

    // l — boundary (no structural columns)
    board.press("l")
    expect(board.bell).toBe(true)
  })
})

// =============================================================================
// Board-level j/k with body content
// =============================================================================

describe("Board-level j/k with body content", () => {
  test("j from board level goes to first body card", () => {
    const { board } = testEnv(() =>
      item.file("doc", item.p("intro"), item.section("sec1", item("task1")), item.section("sec2", item("task2"))),
    )

    // Navigate to board level (k → body column header, k → board)
    board.press("k") // first body card -> body column header
    board.press("k") // body column header -> board
    board.expect(cursor("doc")).toExist()

    // j from board level — stickyX not set, defaults to index 0
    // repo.getChildren returns [intro, sec1, sec2]
    // index 0 = intro (paragraph, body content)
    board.press("j")
    board.expect(cursor("intro")).toExist()
  })

  test("j from board level goes to structural column when stickyX remembers it", () => {
    const { board } = testEnv(() =>
      item.file("doc", item.p("intro"), item.section("sec1", item("task1")), item.section("sec2", item("task2"))),
    )

    // Navigate right to structural column, then up to column header, then up to board
    board.press("l") // body -> sec1 card
    board.expect(cursor("task1")).toExist()

    board.press("k") // card -> column header
    board.expect(cursor("sec1")).toExist()

    board.press("k") // column header -> board (saves stickyX)
    board.expect(cursor("doc")).toExist()

    // j from board with stickyX set
    // stickyX was set by indexOfChild(columns, "sec1") where columns = repo.getChildren(rootId)
    // repo.getChildren = [intro, sec1, sec2], sec1 is at index 1
    // So stickyX = 1, and columns[1] = sec1
    board.press("j")
    board.expect(cursor("sec1")).toExist()
  })

  test("j from board after navigating from body card up goes back to body", () => {
    const { board } = testEnv(() =>
      item.file("doc", item.p("intro"), item.p("detail"), item.section("sec1", item("task1"))),
    )

    // Start at body card
    board.expect(cursor("intro")).toExist()

    // Go down to second body card
    board.press("j")
    board.expect(cursor("detail")).toExist()

    // k three times: second body card → first body card → body column header → board
    board.press("k")
    board.expect(cursor("intro")).toExist()
    board.press("k") // body column header
    board.press("k") // board
    board.expect(cursor("doc")).toExist()

    // j from board — stickyX not set (body cards don't save stickyX)
    board.press("j")
    board.expect(cursor("intro")).toExist()
  })
})
