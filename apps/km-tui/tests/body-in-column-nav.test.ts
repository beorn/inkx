/**
 * Test: j/k navigation through body content WITHIN a column AND at board level.
 *
 * Reproducer for km-tui.virtual-nav: in real vaults, columns often have
 * body content (paragraphs, code blocks) before their first oi sub-section.
 * These body cards should be navigable with j/k within the column.
 *
 * Also tests zoom-into-node with body content: the cursor should land on
 * the first meaningful card, not get stuck on a filtered-out body node.
 */
import { describe, it, test, expect, vi } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { createFakeRepo } from "@km/storage"
import { createBoardDriver } from "../src/driver.ts"

function cursor(nodeId: string): string {
  return `[id="${nodeId}"][data-cursor]`
}

describe("body content within a column: j/k navigation", () => {
  it("j from column header enters first body card", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1",
          item.paragraph("body-p1"),
          item.paragraph("body-p2"),
          item("sub-section", item("task1")),
        ),
      ),
    )

    // Initial cursor on first card in col1 (should be body-p1)
    board.expect(cursor("body-p1")).toExist()

    // j should move to second body card
    board.press("j")
    board.expect(cursor("body-p2")).toExist()
  })

  it("j navigates through body cards then to structural cards", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1",
          item.paragraph("body-p1"),
          item.paragraph("body-p2"),
          item("sub-section", item("task1")),
        ),
      ),
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
      item(
        "board",
        item("col1",
          item.paragraph("body-p1"),
          item.paragraph("body-p2"),
          item("sub-section", item("task1")),
        ),
      ),
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
        item("col-with-body",
          item.paragraph("intro"),
          item.paragraph("details"),
          item("child1"),
          item("child2"),
        ),
        item("col-normal",
          item("task-a"),
          item("task-b"),
        ),
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
        item("body-col",
          item.paragraph("para1"),
          item.paragraph("para2"),
          item.paragraph("para3"),
        ),
        item("normal-col",
          item("task1"),
        ),
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
// Zoom into nodes with body content — cursor placement
// =============================================================================

describe("zoom into node with body content: cursor placement", () => {
  it("zoom places cursor on first meaningful body card", () => {
    // Board has a card. The card has body content + structural children.
    // Zooming into the card should place cursor on the first meaningful body card.
    const nodes = item(
      "board",
      item("col1",
        item("target-card",
          item.paragraph("intro-text"),
          item.paragraph("detail-text"),
          item("subsection1", item("task1")),
        ),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Cursor on target-card
    expect(driver.getState().selectedNodeId).toBe("target-card")

    // Zoom in (e)
    driver.press("e")
    expect(driver.store.getState().rootId).toBe("target-card")

    // Cursor should be on first body card (intro-text), not stuck on board level
    const cursorId = driver.store.getState().cursorNodeId
    // intro-text is a body paragraph — it becomes a card in the virtual body column
    expect(cursorId).toBe("intro-text")
  })

  it("zoom into node with HR body content still navigates", () => {
    // HR nodes have no content → filtered by meaningfulBody.
    // Zoom should still place cursor on a valid card.
    const nodes = item(
      "board",
      item("col1",
        item("section-with-hr",
          item.hr("hr1"),
          item.paragraph("after-hr-text"),
          item("subsection", item("task1")),
        ),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Zoom into section-with-hr
    driver.press("e")
    expect(driver.store.getState().rootId).toBe("section-with-hr")

    // Cursor should NOT be stuck on board level — should be on a navigable card
    const state = driver.store.getState()
    // HR has no content so it's filtered from virtual body column.
    // after-hr-text should be in the body column, or cursor should be on subsection.
    expect(state.cursorNodeId).not.toBe("section-with-hr")
    expect(state.cursorNodeId).not.toBeNull()
  })

  it("j/k works after zoom into node with body content", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1",
          item("target",
            item.paragraph("body1"),
            item.paragraph("body2"),
            item("sub1", item("t1")),
            item("sub2", item("t2")),
          ),
        ),
      ),
    )

    // Zoom into target (cursor starts on target)
    board.press("e")

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
      item("col1",
        item("section",
          item.hr("hr-only"),
          item("subsection1", item("task1")),
          item("subsection2", item("task2")),
        ),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Zoom into section
    driver.press("e")
    expect(driver.store.getState().rootId).toBe("section")

    // Navigate to board level first
    driver.press("k")
    driver.press("k")
    driver.press("k")

    // Now from board level, j should go to a column header or card, not get stuck
    driver.press("j")
    const afterJ = driver.store.getState()
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
      item("col1",
        item("root-section",
          item.hr("hr-empty"),    // HR = no content → filtered out
          item("sec1", item("task1")),
          item("sec2", item("task2")),
        ),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Zoom into root-section
    driver.press("e")
    expect(driver.store.getState().rootId).toBe("root-section")

    // Navigate to board level
    driver.press("k")
    driver.press("k")

    // j from board level should go to a column, not get stuck
    driver.press("j")
    const afterJ = driver.store.getState()
    // Should be on sec1 (first structural column), not stuck at board level
    expect(afterJ.cursorNodeId).not.toBe("root-section")
    expect(afterJ.cursorNodeId).not.toBe("hr-empty")
  })

  it("zoom into node with empty first body child should not get stuck", () => {
    const nodes = item(
      "board",
      item("col1",
        item("target",
          item.hr("hr-first"),    // HR = no content → filtered out
          item("sub1", item("t1")),
          item("sub2", item("t2")),
        ),
      ),
    )
    const repo = createFakeRepo({ nodes })
    const driver = createBoardDriver(repo, "board")

    // Zoom into target
    driver.press("e")
    expect(driver.store.getState().rootId).toBe("target")

    // Cursor should NOT be on the HR (it's filtered from columns)
    // It should be on the first structural column's first card
    const state = driver.store.getState()
    expect(state.cursorNodeId).not.toBe("hr-first")
    expect(state.cursorNodeId).not.toBe("target") // not stuck at board level
  })
})

// =============================================================================
// Real vault scenario: column with body content + structural cards
// =============================================================================

describe("real vault scenario: zoom into section with mixed columns", () => {
  it("j/k works in column that has body + structural cards after zoom", () => {
    // Mimic the real vault structure:
    // Root: "Landing the Plane"
    //   ├─ Someday/Maybe (oi) → columns with cards
    //   ├─ Agent Instructions (oi) → has body paragraphs + structural sub-sections
    //   └─ CLAUDE.md (oi) → has body paragraphs + structural sub-sections
    const { board } = testEnv(() =>
      item(
        "root",
        item("col1",
          item("landing",
            item("someday", item("ideas"), item("projects")),
            item("agent-instructions",
              item.paragraph("bd-beads-text"),
              item("quick-ref", item("bd-ready")),
              item("landing-sub", item("sub-task1")),
            ),
            item("claude-md",
              item.paragraph("instructions-text"),
              item("owner", item("serial-entrepreneur")),
              item("context-system", item("para-style")),
            ),
          ),
        ),
      ),
    )

    // Zoom into "landing" → becomes root, children become columns
    board.press("e")

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
// (merged from body-collapse-error.test.ts)
// =============================================================================

describe("BUG: collapse on body column triggers __body__ repo lookup error", () => {
  test("pressing c on body column should not produce console.error about __body__ not in repo", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const { board } = testEnv(() =>
      item("board",
        item.paragraph("body text here"),
        item("col1", item("A")),
      )
    )

    // Cursor starts on body column (first non-collapsed column).
    // Press c to toggle collapse on body column — this triggers the bug:
    // "ERROR km:nav cursor node not in repo: __body__board, falling back to root"
    board.press("c")

    // Check no error was logged about __body__
    const bodyErrors = errorSpy.mock.calls.filter(
      (args) => args.some((arg) => typeof arg === "string" && arg.includes("__body__"))
    )
    expect(bodyErrors, "should not log __body__ repo lookup error").toHaveLength(0)

    errorSpy.mockRestore()
  })

  test("pressing c on body column should produce a boundary bell (body is not collapsible)", () => {
    const { board } = testEnv(() =>
      item("board",
        item.paragraph("body text here"),
        item("col1", item("A")),
      )
    )

    // Body column is virtual/synthetic — collapse should be a boundary error (bell)
    board.press("c")
    expect(board.bell, "body column collapse should ring bell").toBe(true)
  })

  test("navigate to body column then collapse — key sequence c, l, c", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const { board } = testEnv(() =>
      item("board",
        item.paragraph("body text here"),
        item("col1", item("A")),
      )
    )

    // c on body column (should be noop/boundary)
    board.press("c")
    // l to navigate to col1
    board.press("l")
    // c to collapse col1 (this should work fine)
    board.press("c")

    const bodyErrors = errorSpy.mock.calls.filter(
      (args) => args.some((arg) => typeof arg === "string" && arg.includes("__body__"))
    )
    expect(bodyErrors, "no __body__ errors during sequence c,l,c").toHaveLength(0)

    errorSpy.mockRestore()
  })
})
