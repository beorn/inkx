/**
 * Regression: km-tui.vbody-nav
 *
 * Left navigation (h) into virtual body column should land on the
 * Y-position-matched card, not jump to the wrong card.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("vbody-nav: left into virtual body column", () => {
  test("h from structural column card lands on Y-matched body card", () => {
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
    board.press("l")
    expect(board.q("[data-cursor]").getAttribute("id")).toMatch(/^task-/)
    board.press("j")
    board.press("j")

    board.press("h")
    const bodyTarget = board.q("[data-cursor]").getAttribute("id")
    expect(bodyTarget).toMatch(/^body-/)
    expect(bodyTarget).not.toBe("body-5")
  })

  test("h from first structural column directly into body", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("intro"),
          item.paragraph("detail"),
          item.paragraph("notes"),
          item("Tasks", item("t1"), item("t2"), item("t3")),
          item("Done", item("d1")),
        ),
      { rows: 40 },
    )

    board.expect("#intro[data-cursor]").toExist()
    board.press("l")
    board.press("j")
    board.press("j")
    board.expect("#t3[data-cursor]").toExist()

    board.press("h")
    const target = board.q("[data-cursor]").getAttribute("id")
    expect(target).toMatch(/^(intro|detail|notes)$/)
  })

  test("round-trip: body→structural→body preserves approximate Y position", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("b1"),
          item.paragraph("b2"),
          item.paragraph("b3"),
          item("s1", item("t1"), item("t2"), item("t3")),
        ),
      { rows: 40 },
    )

    board.press("j") // → b2
    board.press("j") // → b3
    board.expect("#b3[data-cursor]").toExist()

    board.press("l")
    expect(board.q("[data-cursor]").getAttribute("id")).toMatch(/^t/)

    board.press("h")
    const backTarget = board.q("[data-cursor]").getAttribute("id")
    expect(backTarget).toMatch(/^b/)
    expect(backTarget).not.toBe("b1")
  })

  test("large board with scrolling: h into body navigates to correct card", () => {
    const bodyCards = Array.from({ length: 20 }, (_, i) => item.paragraph(`body-${i + 1}`))
    const structCards = Array.from({ length: 20 }, (_, i) => item(`task-${i + 1}`))

    const { board } = testEnv(() => item("board", ...bodyCards, item("col1", ...structCards)), {
      rows: 20,
      columns: 80,
    })

    board.expect("#body-1[data-cursor]").toExist()
    board.press("l")
    expect(board.q("[data-cursor]").getAttribute("id")).toMatch(/^task-/)

    for (let i = 0; i < 8; i++) board.press("j")

    board.press("h")
    const bodyTarget = board.q("[data-cursor]").getAttribute("id")
    expect(bodyTarget).toMatch(/^body-/)
    const bodyIdx = parseInt(bodyTarget!.replace("body-", ""))
    expect(bodyIdx).toBeGreaterThan(1)
    expect(bodyIdx).toBeLessThan(20)
  })

  test("h from middle of second structural col, then to first, then to body", () => {
    const { board } = testEnv(
      () =>
        item(
          "board",
          item.paragraph("bp1"),
          item.paragraph("bp2"),
          item.paragraph("bp3"),
          item("Col1", item("a1"), item("a2"), item("a3")),
          item("Col2", item("b1"), item("b2"), item("b3")),
        ),
      { rows: 40 },
    )

    board.expect("#bp1[data-cursor]").toExist()
    board.press("l") // → Col1 first card
    board.press("l") // → Col2 first card
    board.press("j") // → b2
    board.press("j") // → b3
    board.expect("#b3[data-cursor]").toExist()

    board.press("h")
    const col1Target = board.q("[data-cursor]").getAttribute("id")
    expect(col1Target).toMatch(/^a/)

    board.press("h")
    const bodyTarget = board.q("[data-cursor]").getAttribute("id")
    expect(bodyTarget).toMatch(/^bp/)
  })

  test("h from scrolled structural column to unscrolled body: Y-mismatch from scroll offset", () => {
    // When the structural column has been scrolled down to show card N,
    // its card N has screen Y near the top of the column. But the body
    // column hasn't scrolled — its card N is still at its natural (further down)
    // position, possibly off-screen.
    //
    // stickyY captures from the structural card's screen position (scrolled up),
    // so findItemAtY in body column finds the WRONG card (one at the top
    // that happens to be at that low Y value).
    const bodyCards = Array.from({ length: 10 }, (_, i) => item.paragraph(`bp-${i + 1}`))
    const structCards = Array.from({ length: 10 }, (_, i) => item(`t-${i + 1}`))

    const { board } = testEnv(() => item("board", ...bodyCards, item("col1", ...structCards)), {
      rows: 12,
      columns: 80,
    })

    // Cursor starts on bp-1
    board.expect("#bp-1[data-cursor]").toExist()

    // Navigate to structural column
    board.press("l")
    expect(board.q("[data-cursor]").getAttribute("id")).toBe("t-1")

    // Navigate down to t-5 (structural column scrolls)
    board.press("j") // t-2
    board.press("j") // t-3
    board.press("j") // t-4
    board.press("j") // t-5
    board.expect("#t-5[data-cursor]").toExist()

    // h to body column — should land near bp-5, not bp-1 or bp-2
    board.press("h")
    const bodyTarget = board.q("[data-cursor]").getAttribute("id")
    expect(bodyTarget).toMatch(/^bp-/)
    const bodyIdx = parseInt(bodyTarget!.replace("bp-", ""))
    // The visually adjacent body card should be approximately bp-5
    // (same position in the column, not same screen Y)
    expect(bodyIdx, `expected body card ~5, got ${bodyIdx}`).toBeGreaterThanOrEqual(4)
    expect(bodyIdx).toBeLessThanOrEqual(6)
  })

  test("scrolled structural col with unscrolled body: h should not overshoot", () => {
    // The structural column has many cards; user scrolls deep into it.
    // The body column has few cards at the top.
    // When pressing h, stickyY is based on the structural card's screen position
    // (which has been scrolled). The body cards are at the top, so stickyY
    // may be below all body cards, and findItemAtY would clamp to last.
    const bodyCards = Array.from({ length: 3 }, (_, i) => item.paragraph(`bp-${i + 1}`))
    const structCards = Array.from({ length: 30 }, (_, i) => item(`t-${i + 1}`))

    const { board } = testEnv(() => item("board", ...bodyCards, item("col1", ...structCards)), {
      rows: 15,
      columns: 80,
    })

    board.expect("#bp-1[data-cursor]").toExist()

    // Navigate to structural column and scroll down deep
    board.press("l")
    for (let i = 0; i < 10; i++) board.press("j")
    const structId = board.q("[data-cursor]").getAttribute("id")
    expect(structId).toMatch(/^t-/)

    // h to body — stickyY is from a card well below the body column's visible area
    // Should land on a body card (clamped to last body card is acceptable)
    board.press("h")
    const bodyTarget = board.q("[data-cursor]").getAttribute("id")
    expect(bodyTarget).toMatch(/^bp-/)

    // Verify it's a valid body card, not undefined or wrong
    expect(["bp-1", "bp-2", "bp-3"]).toContain(bodyTarget)
  })
})
