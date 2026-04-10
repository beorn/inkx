/**
 * Spatial (visual) navigation tests -- Y-position matching (h/l) with stickyY.
 *
 * Core invariant: when pressing h/l, the cursor should land on the card
 * in the target column that is closest to the source card's Y position,
 * NOT always the first card.
 *
 * These tests rely on layout notifications being enabled in the test renderer
 * (run.tsx) so that useScrollRect fires and populates the position
 * registry with real screen positions -- the same path as production.
 *
 * Consolidated from:
 * - virtual-nav.slow.test.ts (structural column Y-position matching)
 * - vbody-nav.slow.test.ts (body column Y-position matching)
 */
import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// =============================================================================
// Structural column Y-position matching
// =============================================================================

describe("spatial navigation: Y-position matching", () => {
  // NOTE: uses `registry` (position registry) which is not exposed by createTestApp —
  // stays on testEnv.
  test("position registry is populated by layout notifications", () => {
    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item("ColA", item("A1"), item("A2"), item("A3")),
          item("ColB", item("B1"), item("B2"), item("B3")),
        ),
      { rows: 24, columns: 80 },
    )

    // Registry should have sections for both columns (0 and 1)
    // This proves useScrollRect fires during test renders
    expect(registry.hasSection(0)).toBe(true)
    expect(registry.hasSection(1)).toBe(true)

    // Each section should have the correct number of items
    expect(registry.getItemCount(0)).toBe(3)
    expect(registry.getItemCount(1)).toBe(3)

    // Positions should be real screen coordinates (not zero)
    const a1Pos = registry.getPosition(0, 0)
    expect(a1Pos).toBeDefined()
    expect(a1Pos!.y).toBeGreaterThan(0) // below the header row

    // Cards in the same column should have increasing Y positions
    const a2Pos = registry.getPosition(0, 1)
    const a3Pos = registry.getPosition(0, 2)
    expect(a2Pos!.y).toBeGreaterThan(a1Pos!.y)
    expect(a3Pos!.y).toBeGreaterThan(a2Pos!.y)

    // Corresponding cards across columns should have matching Y positions
    const b1Pos = registry.getPosition(1, 0)
    expect(b1Pos!.y).toBe(a1Pos!.y) // same row, different column

    // Suppress unused variable warning
    void board
  })

  // NOTE: uses `registry.stickyY` which is not exposed by createTestApp — stays on testEnv.
  test("j then l: lands on Y-matched card, not first card", () => {
    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item("ColA", item("A1"), item("A2"), item("A3"), item("A4"), item("A5")),
          item("ColB", item("B1"), item("B2"), item("B3"), item("B4"), item("B5")),
        ),
      { rows: 24, columns: 80 },
    )

    expect(board.q("[data-cursor]").textContent()).toContain("A1")
    board.command("cursor_down").command("cursor_down").command("cursor_down")
    expect(board.q("[data-cursor]").textContent()).toContain("A4")

    // Verify stickyY is set from A4's position
    board.command("cursor_right")
    expect(registry.stickyY).not.toBeNull()

    const cursor = board.q("[data-cursor]").textContent()
    // With real positions, should land on exactly B4 (same Y as A4)
    expect(cursor).toContain("B4")
  })

  test("j then l with body column: Y-match still works", () => {
    using app = createTestApp(
      item(
        "board",
        item.p("Some body text"),
        item("ColA", item("A1"), item("A2"), item("A3"), item("A4"), item("A5")),
        item("ColB", item("B1"), item("B2"), item("B3"), item("B4"), item("B5")),
      ),
      { rows: 24, cols: 120 },
    )

    // Navigate from body to ColA
    app.command("cursor_right")
    expect(app.q("[data-cursor]").textContent()).toContain("A1")

    app.command("cursor_down")
    app.command("cursor_down")
    app.command("cursor_down")
    expect(app.q("[data-cursor]").textContent()).toContain("A4")

    app.command("cursor_right")
    const cursor = app.q("[data-cursor]").textContent()
    // With real positions, should land on exactly B4
    expect(cursor).toContain("B4")
  })

  test("3 columns: l from middle column matches Y position", () => {
    using app = createTestApp(
      item(
        "board",
        item("ColA", item("A1"), item("A2"), item("A3")),
        item("ColB", item("B1"), item("B2"), item("B3")),
        item("ColC", item("C1"), item("C2"), item("C3")),
      ),
      { rows: 24, cols: 120 },
    )

    // Navigate to B3 (last card in ColB)
    app.command("cursor_right") // -> B1
    app.command("cursor_down")
    app.command("cursor_down") // -> B3
    expect(app.q("[data-cursor]").textContent()).toContain("B3")

    app.command("cursor_right")
    const cursor = app.q("[data-cursor]").textContent()
    // Should match Y position of B3 -> C3
    expect(cursor).toContain("C3")
  })

  // NOTE: uses `registry.stickyY` — stays on testEnv.
  test("h preserves stickyY across multiple column hops", () => {
    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item("ColA", item("A1"), item("A2"), item("A3"), item("A4"), item("A5")),
          item("ColB", item("B1"), item("B2"), item("B3"), item("B4"), item("B5")),
          item("ColC", item("C1"), item("C2"), item("C3"), item("C4"), item("C5")),
        ),
      { rows: 24, columns: 120 },
    )

    // Navigate to A4
    board.command("cursor_down").command("cursor_down").command("cursor_down")
    expect(board.q("[data-cursor]").textContent()).toContain("A4")

    // l to ColB -> B4, then l to ColC -> C4
    board.command("cursor_right")
    expect(board.q("[data-cursor]").textContent()).toContain("B4")

    board.command("cursor_right")
    expect(board.q("[data-cursor]").textContent()).toContain("C4")

    // h back should preserve stickyY -> B4
    board.command("cursor_left")
    expect(board.q("[data-cursor]").textContent()).toContain("B4")

    // stickyY should still be set
    expect(registry.stickyY).not.toBeNull()
  })

  test("many columns with varying card counts: Y-match with unequal columns", () => {
    using app = createTestApp(
      item(
        "board",
        item("ColA", item("A1"), item("A2"), item("A3"), item("A4"), item("A5"), item("A6"), item("A7"), item("A8")),
        item("ColB", item("B1"), item("B2"), item("B3")),
      ),
      { rows: 24, cols: 80 },
    )

    // Navigate to A8 (last card in long column)
    for (let i = 0; i < 7; i++) app.command("cursor_down")
    expect(app.q("[data-cursor]").textContent()).toContain("A8")

    app.command("cursor_right")
    const cursor = app.q("[data-cursor]").textContent()
    // A8 is at the bottom, ColB only has 3 cards -> should land on B3 (closest)
    expect(cursor).toContain("B3")
  })

  // NOTE: uses `registry.stickyY` — stays on testEnv.
  test("stickyY is cleared by vertical navigation (j/k)", () => {
    const { board, registry } = testEnv(
      () =>
        item(
          "board",
          item("ColA", item("A1"), item("A2"), item("A3")),
          item("ColB", item("B1"), item("B2"), item("B3")),
        ),
      { rows: 24, columns: 80 },
    )

    // Move down to A3 and then right -> sets stickyY
    board.command("cursor_down").command("cursor_down")
    board.command("cursor_right")
    expect(registry.stickyY).not.toBeNull()

    // Move up (vertical nav) -> should clear stickyY
    board.command("cursor_up")
    expect(registry.stickyY).toBeNull()
  })

  test("h from first column goes to header then rings bell, l from last column rings bell", () => {
    using app = createTestApp(item("board", item("ColA", item("A1")), item("ColB", item("B1"))), {
      rows: 24,
      cols: 80,
    })

    // h from first card -> goes to column header
    app.command("cursor_left")
    expect(app.bell).toBe(false)
    app.expect("#ColA[data-cursor]").toExist()

    // h at column header -> bell
    app.command("cursor_left")
    expect(app.bell).toBe(true)

    // Navigate to last column card
    app.command("cursor_down") // ColA header -> A1
    app.command("cursor_right") // A1 -> B1
    expect(app.q("[data-cursor]").textContent()).toContain("B1")

    // l from last column -> bell
    app.command("cursor_right")
    expect(app.bell).toBe(true)
  })
})

// =============================================================================
// Virtual body column Y-position matching (km-tui.vbody-nav)
// =============================================================================

describe("vbody-nav: left into virtual body column", () => {
  test("h from structural column card lands on Y-matched body card", () => {
    using app = createTestApp(
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

    app.expect("#body-1[data-cursor]").toExist()
    app.command("cursor_right")
    expect(app.q("[data-cursor]").getAttribute("id")).toMatch(/^task-/)
    app.command("cursor_down")
    app.command("cursor_down")

    app.command("cursor_left")
    const bodyTarget = app.q("[data-cursor]").getAttribute("id")
    expect(bodyTarget).toMatch(/^body-/)
    expect(bodyTarget).not.toBe("body-5")
  })

  test("h from first structural column directly into body", () => {
    using app = createTestApp(
      item(
        "board",
        item.p("intro"),
        item.p("detail"),
        item.p("notes"),
        item("Tasks", item("t1"), item("t2"), item("t3")),
        item("Done", item("d1")),
      ),
      { rows: 40 },
    )

    app.expect("#intro[data-cursor]").toExist()
    app.command("cursor_right")
    app.command("cursor_down")
    app.command("cursor_down")
    app.expect("#t3[data-cursor]").toExist()

    app.command("cursor_left")
    const target = app.q("[data-cursor]").getAttribute("id")
    expect(target).toMatch(/^(intro|detail|notes)$/)
  })

  test("round-trip: body->structural->body preserves approximate Y position", () => {
    using app = createTestApp(
      item("board", item.p("b1"), item.p("b2"), item.p("b3"), item("s1", item("t1"), item("t2"), item("t3"))),
      { rows: 40 },
    )

    app.command("cursor_down") // -> b2
    app.command("cursor_down") // -> b3
    app.expect("#b3[data-cursor]").toExist()

    app.command("cursor_right")
    expect(app.q("[data-cursor]").getAttribute("id")).toMatch(/^t/)

    app.command("cursor_left")
    const backTarget = app.q("[data-cursor]").getAttribute("id")
    expect(backTarget).toMatch(/^b/)
    expect(backTarget).not.toBe("b1")
  })

  test("large board with scrolling: h into body navigates to correct card", () => {
    const bodyCards = Array.from({ length: 20 }, (_, i) => item.p(`body-${i + 1}`))
    const structCards = Array.from({ length: 20 }, (_, i) => item(`task-${i + 1}`))

    using app = createTestApp(item("board", ...bodyCards, item("col1", ...structCards)), {
      rows: 20,
      cols: 80,
    })

    app.expect("#body-1[data-cursor]").toExist()
    app.command("cursor_right")
    expect(app.q("[data-cursor]").getAttribute("id")).toMatch(/^task-/)

    for (let i = 0; i < 8; i++) app.command("cursor_down")

    app.command("cursor_left")
    const bodyTarget = app.q("[data-cursor]").getAttribute("id")
    expect(bodyTarget).toMatch(/^body-/)
    const bodyIdx = parseInt(bodyTarget!.replace("body-", ""))
    expect(bodyIdx).toBeGreaterThan(1)
    expect(bodyIdx).toBeLessThan(20)
  })

  test("h from middle of second structural col, then to first, then to body", async () => {
    using app = createTestApp(
      item(
        "board",
        item.p("bp1"),
        item.p("bp2"),
        item.p("bp3"),
        item("Col1", item("a1"), item("a2"), item("a3")),
        item("Col2", item("b1"), item("b2"), item("b3")),
      ),
      { rows: 40 },
    )

    app.expect("#bp1[data-cursor]").toExist()
    app.command("cursor_right") // -> Col1 first card
    app.command("cursor_right") // -> Col2 first card
    app.command("cursor_down") // -> b2
    app.command("cursor_down") // -> b3
    app.expect("#b3[data-cursor]").toExist()

    app.command("cursor_left")
    const col1Target = app.q("[data-cursor]").getAttribute("id")
    expect(col1Target).toMatch(/^a/)

    app.command("cursor_left")
    const bodyTarget = app.q("[data-cursor]").getAttribute("id")
    expect(bodyTarget).toMatch(/^bp/)
  })

  test("h from scrolled structural column to unscrolled body: Y-mismatch from scroll offset", () => {
    // When the structural column has been scrolled down to show card N,
    // its card N has screen Y near the top of the column. But the body
    // column hasn't scrolled -- its card N is still at its natural (further down)
    // position, possibly off-screen.
    //
    // stickyY captures from the structural card's screen position (scrolled up),
    // so findItemAtY in body column finds the WRONG card (one at the top
    // that happens to be at that low Y value).
    const bodyCards = Array.from({ length: 10 }, (_, i) => item.p(`bp-${i + 1}`))
    const structCards = Array.from({ length: 10 }, (_, i) => item(`t-${i + 1}`))

    using app = createTestApp(item("board", ...bodyCards, item("col1", ...structCards)), {
      rows: 12,
      cols: 80,
    })

    // Cursor starts on bp-1
    app.expect("#bp-1[data-cursor]").toExist()

    // Navigate to structural column
    app.command("cursor_right")
    expect(app.q("[data-cursor]").getAttribute("id")).toBe("t-1")

    // Navigate down to t-5 (structural column scrolls)
    app.command("cursor_down") // t-2
    app.command("cursor_down") // t-3
    app.command("cursor_down") // t-4
    app.command("cursor_down") // t-5
    app.expect("#t-5[data-cursor]").toExist()

    // h to body column -- should land near bp-5, not bp-1 or bp-2
    app.command("cursor_left")
    const bodyTarget = app.q("[data-cursor]").getAttribute("id")
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
    const bodyCards = Array.from({ length: 3 }, (_, i) => item.p(`bp-${i + 1}`))
    const structCards = Array.from({ length: 30 }, (_, i) => item(`t-${i + 1}`))

    using app = createTestApp(item("board", ...bodyCards, item("col1", ...structCards)), {
      rows: 15,
      cols: 80,
    })

    app.expect("#bp-1[data-cursor]").toExist()

    // Navigate to structural column and scroll down deep
    app.command("cursor_right")
    for (let i = 0; i < 10; i++) app.command("cursor_down")
    const structId = app.q("[data-cursor]").getAttribute("id")
    expect(structId).toMatch(/^t-/)

    // h to body -- stickyY is from a card well below the body column's visible area
    // Should land on a body card (clamped to last body card is acceptable)
    app.command("cursor_left")
    const bodyTarget = app.q("[data-cursor]").getAttribute("id")
    expect(bodyTarget).toMatch(/^bp-/)

    // Verify it's a valid body card, not undefined or wrong
    expect(["bp-1", "bp-2", "bp-3"]).toContain(bodyTarget)
  })
})
