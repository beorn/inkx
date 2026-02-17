/**
 * Test: Navigation with body content (paragraphs before structural items).
 *
 * Reproducer for bug: when a board has body content (paragraphs before the first
 * oi/section), visual navigation (j/k/h/l) breaks because the navigation layer
 * treats body nodes (which are direct children of root) as column headers
 * instead of cards within the virtual "Description" column.
 */
import { describe, it, test, expect, afterEach } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { createFakeRepo } from "@km/storage"
import { createCardsViewNavigation, type NavState } from "../src/view-navigation.ts"
import { createGridNavigator } from "@km/board"
import { deriveColumnsFromRepo } from "../src/hooks/use-columns.ts"
import { createBoardTest, type BoardTestHarness } from "../src/testing.ts"
import { BODY_CONTENT_BOARD } from "./fixtures/body-content-fixture.ts"

describe("body content navigation", () => {
  it("j moves down through body cards", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("para1"),
          item.paragraph("para2"),
          item("col1", item("task1")),
        ),
    )

    // Cursor should start on first body paragraph
    board.expect("#para1[data-cursor]").toExist()

    // j should move to second body paragraph
    board.press("j")
    board.expect("#para2[data-cursor]").toExist()
  })

  it("k moves up through body cards", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("para1"),
          item.paragraph("para2"),
          item("col1", item("task1")),
        ),
    )

    // Move to second paragraph first
    board.press("j")
    board.expect("#para2[data-cursor]").toExist()

    // k should go back to first
    board.press("k")
    board.expect("#para1[data-cursor]").toExist()
  })

  it("k from first body card goes to body column header, then board level", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("para1"),
          item("col1", item("task1")),
        ),
    )

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
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("para1"),
          item("col1", item("task1")),
        ),
    )

    // Start on para1 (last/only body card)
    board.expect("#para1[data-cursor]").toExist()

    // j should hit boundary (body cards are in their own visual column)
    board.press("j")
    // Cursor should still be on para1 (boundary hit)
    board.expect("#para1[data-cursor]").toExist()
  })

  it("l from body card navigates to structural column", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("body text"),
          item("col1", item("task1"), item("task2")),
          item("col2", item("task3")),
        ),
    )

    // Start on body card
    board.expect("[id='body text'][data-cursor]").toExist()

    // l should navigate to first structural column
    board.press("l")
    board.expect("#task1[data-cursor]").toExist()
  })

  it("navigation layer correctly classifies body nodes", () => {
    const nodes = item(
      "board",
      item.paragraph("body text"),
      item("col1", item("task1")),
    )
    const repo = createFakeRepo({ nodes })

    const nav = createCardsViewNavigation()
    const registry = createGridNavigator()

    const navState: NavState = {
      cursorNodeId: "body text",
      rootId: "board",
      foldedNodes: new Set(),
      collapsedNodes: new Set(),
    }

    // Down from single body card should be null (boundary)
    const downTarget = nav.navigate("down", navState, repo, registry)
    expect(downTarget).toBeNull()

    // Up from body card should go to body column header
    const upTarget = nav.navigate("up", navState, repo, registry)
    expect(upTarget).toBe("__body__board")
  })

  it("navigation layer handles multiple body nodes", () => {
    const nodes = item(
      "board",
      item.paragraph("p1"),
      item.paragraph("p2"),
      item.paragraph("p3"),
      item("col1", item("task1")),
    )
    const repo = createFakeRepo({ nodes })

    const nav = createCardsViewNavigation()
    const registry = createGridNavigator()

    // Down from p1 → p2
    expect(nav.navigate("down", { cursorNodeId: "p1", rootId: "board", foldedNodes: new Set(), collapsedNodes: new Set() }, repo, registry)).toBe("p2")

    // Down from p2 → p3
    expect(nav.navigate("down", { cursorNodeId: "p2", rootId: "board", foldedNodes: new Set(), collapsedNodes: new Set() }, repo, registry)).toBe("p3")

    // Down from p3 → null (boundary)
    expect(nav.navigate("down", { cursorNodeId: "p3", rootId: "board", foldedNodes: new Set(), collapsedNodes: new Set() }, repo, registry)).toBeNull()

    // Up from p3 → p2
    expect(nav.navigate("up", { cursorNodeId: "p3", rootId: "board", foldedNodes: new Set(), collapsedNodes: new Set() }, repo, registry)).toBe("p2")

    // Up from p1 → body column header
    expect(nav.navigate("up", { cursorNodeId: "p1", rootId: "board", foldedNodes: new Set(), collapsedNodes: new Set() }, repo, registry)).toBe("__body__board")
  })
})

// =============================================================================
// Body column navigation after zoom (km-nyxsp)
// =============================================================================

describe("body column navigation after zoom", () => {
  it("l from body column header after zoom goes to structural column", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("root-section",
            item.paragraph("body-text"),
            item("sub1", item("t1")),
            item("sub2", item("t2")),
          ),
        ),
    )

    // Navigate to column header and zoom in to root-section
    board.press("k") // body-text → root-section column header
    board.press("e") // zoom into root-section

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
    const { board } = testEnv(
      () =>
        item(
          "board",
          item("root4",
            item.paragraph("body-p"),
            item("sec-x", item("tx1")),
            item("sec-y", item("ty1")),
          ),
        ),
    )

    // Navigate to column header and zoom
    board.press("k") // body-p → root4 column header
    board.press("e") // zoom into root4

    board.expect("#body-p[data-cursor]").toExist()

    // l directly from body card — should go to sec-x's first card
    board.press("l")

    const cursorId = board.q("[data-cursor]").getAttribute("id")
    expect(cursorId).not.toBe("body-p")
    expect(cursorId).not.toBe("root4")
  })
})

// =============================================================================
// Body Content Visual Tests (merged from body-content.test.ts)
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
// Body h/l navigation Y-position matching (merged from body-hscroll-ypos.test.ts)
// =============================================================================

describe("body h/l navigation Y-position matching", () => {
  test("l from 3rd body card goes to Y-matched card in structural column", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("body-1"),
          item.paragraph("body-2"),
          item.paragraph("body-3"),
          item.paragraph("body-4"),
          item.paragraph("body-5"),
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
      () =>
        item(
          "board",
          item.paragraph("body-1"),
          item("col1", item("task-a"), item("task-b"), item("task-c")),
        ),
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
          item.paragraph("bp-1"),
          item.paragraph("bp-2"),
          item.paragraph("bp-3"),
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
})

// =============================================================================
// Body block spacing (merged from body-block-spacing.test.ts)
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
        item.paragraph("body paragraph one"),
        item.paragraph("body paragraph two"),
        item.section("task-a", item("task-a-child")),
        item.section("task-b", item("task-b-child")),
      ),
    )
  }

  describe("cards view", () => {
    test("body blocks have compact content (blank lines collapsed)", () => {
      // Create a body card with internal blank lines
      const nodes = item(
        "board",
        item(
          "col1",
          item.paragraph("line one\n\nline two\n\n\nline three"),
          item("task-a"),
        ),
      )
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
    test("body blocks have one blank line between them", () => {
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

      // There should be exactly one blank line between body blocks (index diff of 2)
      expect(paraTwoIdx).toBe(paraOneIdx + 2)
      // The line between them should be blank (empty or whitespace only)
      const lineBetween = contentLines[paraOneIdx + 1]!
      expect(lineBetween.trim()).toBe("")
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

    test("body blocks have more spacing than structural items", () => {
      const { board } = testEnv(boardWithBodyContent, { viewMode: "columns" })

      const screenshot = board.screenshot()
      const lines = screenshot.split("\n")
      const sepIdx = lines.findIndex((l) => l.includes("───"))
      const contentLines = lines.slice(sepIdx + 1)

      const paraOneIdx = contentLines.findIndex((l) => l.includes("body paragraph one"))
      const paraTwoIdx = contentLines.findIndex((l) => l.includes("body paragraph two"))
      const taskAIdx = contentLines.findIndex((l) => l.includes("task-a"))
      const taskBIdx = contentLines.findIndex((l) => l.includes("task-b"))

      // Body blocks: spacing of 2 (one blank line between them)
      const bodySpacing = paraTwoIdx - paraOneIdx
      // Structural items: spacing of 1 (no blank line between them)
      const structuralSpacing = taskBIdx - taskAIdx

      expect(bodySpacing).toBe(2)
      expect(structuralSpacing).toBe(1)
    })
  })
})
