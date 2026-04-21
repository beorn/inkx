/**
 * Navigation User Journeys — ALL user-facing navigation tests
 *
 * Consolidated from:
 * - board-nav.slow.spec.ts — journey: cursor movement across columns
 * - keyboard-navigation.slow.test.tsx — keyboard nav behaviors
 * - body-nav.slow.test.ts — body/sub-item navigation
 * - shift-cursor.test.ts — shift-based cursor movement
 * - cursor-prefetch.test.ts — cursor prefetching
 */

import { describe, it, test, expect, afterEach, vi } from "vitest"
import { act } from "react"
import { createRenderer } from "@silvery/test"
import { createGridNavigator, createViewTree, createViewLens, type ViewTreeProjection } from "@km/board"
import { createFakeRepo, type Repo } from "@km/storage"
import { item, renderBoardWithStore } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import { createBoardDriver } from "../src/driver.ts"
import { createCardsViewNavigation, type NavState } from "../src/navigation/view-navigation.ts"
import { createBoardTest, type BoardTestHarness } from "../src/testing.ts"
import { BODY_CONTENT_BOARD } from "./fixtures/body-content-fixture.ts"
import { getActiveBoardPane } from "../src/state/board-app-store.ts"

// =============================================================================
// Merged from board-nav.slow.spec.ts
// =============================================================================

describe("Merged from board-nav.slow.spec.ts", () => {
  describe("Cursoring", () => {
    // Default view mode tests (cards view)
    describe("Cards View", () => {
      test("vertical (j/k): cards → column → board → boundary", () => {
        using app = createTestApp(item.simpleBoard())
        // j down through cards
        app.expect("#1a[data-cursor]").toExist()
        app.command("cursor_down")
        app.expect("#1b[data-cursor]").toExist()
        app.command("cursor_down")
        app.expect("#1c[data-cursor]").toExist()

        // j at bottom stops (boundary)
        app.command("cursor_down")
        app.expect("#1c[data-cursor]").toExist()
        app.command("cursor_down")
        app.expect("#1c[data-cursor]").toExist()

        // k up through cards → column → board → boundary
        app.command("cursor_up")
        app.expect("#1b[data-cursor]").toExist()
        app.command("cursor_up")
        app.expect("#1a[data-cursor]").toExist()
        app.command("cursor_up")
        app.expect("#col1[data-cursor]").toExist()
        app.command("cursor_up")
        app.expect("#board[data-cursor]").toExist()

        // k at top stops (boundary)
        app.command("cursor_up")
        app.expect("#board[data-cursor]").toExist()
        app.command("cursor_up")
        app.expect("#board[data-cursor]").toExist()

        // j back down: board → column → card
        app.command("cursor_down")
        app.expect("#col1[data-cursor]").toExist()
        app.command("cursor_down")
        app.expect("#1a[data-cursor]").toExist()
      })

      test("horizontal (h/l): columns at card level and header level → boundary", () => {
        using app = createTestApp(item.multiColBoard())

        // --- Card level ---
        // l right through columns
        app.expect("#1a[data-cursor]").toExist()
        app.command("cursor_right")
        app.expect("#2a[data-cursor]").toExist()
        app.command("cursor_right")
        app.expect("#3a[data-cursor]").toExist()

        // l at right boundary stops
        app.command("cursor_right")
        app.expect("#3a[data-cursor]").toExist()
        app.command("cursor_right")
        app.expect("#3a[data-cursor]").toExist()

        // h back left through columns
        app.command("cursor_left")
        app.expect("#2a[data-cursor]").toExist()
        app.command("cursor_left")
        app.expect("#1a[data-cursor]").toExist()

        // h at left card goes to column header first
        app.command("cursor_left")
        app.expect("#col1[data-cursor]").toExist()

        // h at left column header boundary stops
        app.command("cursor_left")
        app.expect("#col1[data-cursor]").toExist()

        // l right through headers
        app.command("cursor_right")
        app.expect("#col2[data-cursor]").toExist()
        app.command("cursor_right")
        app.expect("#col3[data-cursor]").toExist()

        // l at right boundary stops
        app.command("cursor_right")
        app.expect("#col3[data-cursor]").toExist()
        app.command("cursor_right")
        app.expect("#col3[data-cursor]").toExist()

        // h back left through headers
        app.command("cursor_left")
        app.expect("#col2[data-cursor]").toExist()
        app.command("cursor_left")
        app.expect("#col1[data-cursor]").toExist()

        // h at left boundary stops
        app.command("cursor_left")
        app.expect("#col1[data-cursor]").toExist()
        app.command("cursor_left")
        app.expect("#col1[data-cursor]").toExist()
      })

      test("g/G: jump to first/last in column", () => {
        using app = createTestApp(item.simpleBoard())
        // Start at middle
        app.command("cursor_down")
        app.expect("#1b[data-cursor]").toExist()

        // g G to last
        app.command("cursor_last")
        app.expect("#1c[data-cursor]").toExist()

        // g G at last does nothing
        app.command("cursor_last")
        app.expect("#1c[data-cursor]").toExist()

        // g to first
        app.command("cursor_first")
        app.expect("#1a[data-cursor]").toExist()

        // g at first does nothing
        app.command("cursor_first")
        app.expect("#1a[data-cursor]").toExist()
      })

      describe("curswantX (horizontal position memory)", () => {
        test("remembers column when moving through headers", () => {
          using app = createTestApp(
            item(
              "board",
              item("col1", item("1a"), item("1b")),
              item("col2", item("2a"), item("2b")),
              item("col3", item("3a"), item("3b")),
            ),
          )
          app.command("cursor_right")
          app.command("cursor_right")
          app.expect("#3a[data-cursor]").toExist()

          app.command("cursor_up")
          app.expect("#col3[data-cursor]").toExist()
          app.command("cursor_up")
          app.expect("#board[data-cursor]").toExist()

          app.command("cursor_down")
          app.expect("#col3[data-cursor]").toExist()

          app.command("cursor_down")
          app.expect("#3a[data-cursor]").toExist()
        })

        test("preserves column when jumping between first/last card", () => {
          using app = createTestApp(
            item(
              "board",
              item("col1", item("1a"), item("1b"), item("1c")),
              item("col2", item("2a"), item("2b"), item("2c")),
            ),
          )
          app.command("cursor_right")
          app.expect("#2a[data-cursor]").toExist()

          app.command("cursor_last")
          app.expect("#2c[data-cursor]").toExist()

          app.command("cursor_first")
          app.expect("#2a[data-cursor]").toExist()
        })

        test("remembers X position in columns view", () => {
          using app = createTestApp(
            item("board", item("col1", item("task")), item("col2", item("task")), item("col3", item("task"))),
            { cols: 120 },
          )
          app.command("cursor_right")
          app.command("cursor_right")
          const col3Box = app.q("#col3").boundingBox()

          app.command("cursor_up")
          app.command("cursor_down")

          app.expect("#col3[data-cursor]").toExist()
          const returnedBox = app.q("#col3[data-cursor]").boundingBox()
          expect(returnedBox!.x).toBe(col3Box!.x)
        })
      })

      describe("curswantY (vertical position memory)", () => {
        test("remembers card position when moving between columns", () => {
          using app = createTestApp(
            item(
              "board",
              item("col1", item("1a"), item("1b"), item("1c"), item("1d")),
              item("col2", item("2a"), item("2b"), item("2c")),
              item("col3", item("3a"), item("3b"), item("3c"), item("3d")),
            ),
          )
          app.command("cursor_down")
          app.command("cursor_down")
          app.expect("#1c[data-cursor]").toExist()
          const card1cBox = app.q("#1c").boundingBox()

          app.command("cursor_right")
          const card2Box = app.q("[data-cursor]").boundingBox()
          expect(Math.abs(card2Box!.y - card1cBox!.y)).toBeLessThanOrEqual(15)

          app.command("cursor_right")
          const card3Box = app.q("[data-cursor]").boundingBox()
          expect(Math.abs(card3Box!.y - card1cBox!.y)).toBeLessThanOrEqual(15)

          app.command("cursor_left")
          app.command("cursor_left")
          const returnedBox = app.q("[data-cursor]").boundingBox()
          expect(Math.abs(returnedBox!.y - card1cBox!.y)).toBeLessThanOrEqual(15)
        })

        test("adjusts Y position when target column is shorter", () => {
          using app = createTestApp(
            item(
              "board",
              item("col1", item("1a"), item("1b"), item("1c"), item("1d")),
              item("col2", item("2a")), // Only one card
              item("col3", item("3a"), item("3b"), item("3c")),
            ),
          )
          app.command("cursor_last")
          app.expect("#1d[data-cursor]").toExist()

          app.command("cursor_right")
          app.expect("#2a[data-cursor]").toExist()

          app.command("cursor_right")
          app.expect("#3c[data-cursor]").toExist()
        })

        test("maintains Y position in columns view", () => {
          using app = createTestApp(
            item(
              "board",
              item("col1", item("task1"), item("task2"), item("task3")),
              item("col2", item("taskA"), item("taskB"), item("taskC")),
            ),
            { cols: 120 },
          )
          app.command("cursor_down")
          const card2Box = app.q("[data-cursor]").boundingBox()

          app.command("cursor_right")
          const col2Box = app.q("[data-cursor]").boundingBox()

          expect(Math.abs(col2Box!.y - card2Box!.y)).toBeLessThan(10)
        })
      })
    }) // End Cards View

    // View mode variations
    describe("List View", () => {
      test("vertical (j/k) navigation and g/G jump to first/last", () => {
        using app = createTestApp(item.simpleBoard(), {
          viewMode: "list",
        })

        app.expect("#1a[data-cursor]").toExist()
        app.command("cursor_down")
        app.expect("#1b[data-cursor]").toExist()
        app.command("cursor_down")
        app.expect("#1c[data-cursor]").toExist()

        app.command("cursor_down")
        app.expect("#1c[data-cursor]").toExist()

        app.command("cursor_up")
        app.expect("#1b[data-cursor]").toExist()
        app.command("cursor_up")
        app.expect("#1a[data-cursor]").toExist()
        app.command("cursor_up")
        app.expect("#col1[data-cursor]").toExist()
        app.command("cursor_up")
        app.expect("#board[data-cursor]").toExist()

        app.command("cursor_up")
        app.expect("#board[data-cursor]").toExist()

        app.command("cursor_down")
        app.command("cursor_down")
        app.command("cursor_down")
        app.expect("#1b[data-cursor]").toExist()

        app.command("cursor_last")
        app.expect("#1c[data-cursor]").toExist()

        app.command("cursor_last")
        app.expect("#1c[data-cursor]").toExist()

        app.command("cursor_first")
        app.expect("#1a[data-cursor]").toExist()

        app.command("cursor_first")
        app.expect("#1a[data-cursor]").toExist()
      })

      test("horizontal (h/l): moves between columns", () => {
        using app = createTestApp(item.multiColBoard(), { viewMode: "list" })

        app.expect("#1a[data-cursor]").toExist()
        app.command("cursor_right")
        app.expect("#2a[data-cursor]").toExist()
        app.command("cursor_right")
        app.expect("#3a[data-cursor]").toExist()

        app.command("cursor_right")
        app.expect("#3a[data-cursor]").toExist()

        app.command("cursor_left")
        app.expect("#2a[data-cursor]").toExist()
        app.command("cursor_left")
        app.expect("#1a[data-cursor]").toExist()

        app.command("cursor_left")
        app.expect("#col1[data-cursor]").toExist()

        app.command("cursor_left")
        app.expect("#col1[data-cursor]").toExist()
      })
    })

    describe("Tabs View", () => {
      test("vertical (j/k): cards within active tab → boundary", () => {
        using app = createTestApp(
          item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"), item("2b"))),
          { viewMode: "tabs" },
        )
        app.expect("#1a[data-cursor]").toExist()

        app.command("cursor_down")
        app.expect("#1b[data-cursor]").toExist()
        app.command("cursor_down")
        app.expect("#1c[data-cursor]").toExist()

        app.command("cursor_down")
        app.expect("#1c[data-cursor]").toExist()

        app.command("cursor_up")
        app.expect("#1b[data-cursor]").toExist()
        app.command("cursor_up")
        app.expect("#1a[data-cursor]").toExist()
        app.command("cursor_up")
        const output = app.text
        expect(output).toContain("board > col1")
        expect(output).not.toContain("col1 > 1a")
        app.command("cursor_up")
        app.expect("#board[data-cursor]").toExist()
      })

      test("horizontal (h/l): switch between tabs", () => {
        using app = createTestApp(item.multiColBoard(), { viewMode: "tabs" })
        app.expect("#1a[data-cursor]").toExist()

        app.command("cursor_right")
        app.expect("#2a[data-cursor]").toExist()
        app.expect("#1a").not.toExist()

        app.command("cursor_right")
        app.expect("#3a[data-cursor]").toExist()
        app.expect("#2a").not.toExist()

        app.command("cursor_right")
        app.expect("#3a[data-cursor]").toExist()

        app.command("cursor_left")
        app.expect("#2a[data-cursor]").toExist()
        app.expect("#3a").not.toExist()

        app.command("cursor_left")
        app.expect("#1a[data-cursor]").toExist()

        app.command("cursor_left")
        app.expect("#col1[data-cursor]").toExist()

        app.command("cursor_left")
        app.expect("#col1[data-cursor]").toExist()
      })

      test("cursor position when switching tabs", () => {
        using app = createTestApp(
          item(
            "board",
            item("col1", item("1a"), item("1b"), item("1c")),
            item("col2", item("2a"), item("2b"), item("2c")),
          ),
          { viewMode: "tabs" },
        )
        app.command("cursor_down")
        app.expect("#1b[data-cursor]").toExist()

        app.command("cursor_right")
        app.expect("#2a[data-cursor]").toExist()

        app.command("cursor_down")
        app.expect("#2b[data-cursor]").toExist()

        app.command("cursor_left")
        app.expect("#1b[data-cursor]").toExist()
      })

      test("tab header selection with k", () => {
        using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))), {
          viewMode: "tabs",
        })
        app.expect("#1a[data-cursor]").toExist()

        app.command("cursor_up")
        let output = app.text
        expect(output).toContain("board > col1")

        app.command("cursor_right")
        output = app.text
        expect(output).toContain("board > col2")

        app.command("cursor_down")
        app.expect("#2a[data-cursor]").toExist()
      })

      test("empty tab shows placeholder", () => {
        using app = createTestApp(
          item(
            "board",
            item("col1", item("1a")),
            item("col2"), // Empty tab
          ),
          { viewMode: "tabs" },
        )
        app.command("cursor_right")
        const output = app.text
        expect(output).toContain("(empty)")
      })
    })
  })

  describe("Boundaries and Edge Cases", () => {
    describe("empty states", () => {
      test("empty board shows helpful message", () => {
        using app = createTestApp(item("board"))
        const output = app.text
        expect(output).toContain("Empty board")
      })

      test("empty column - j/k do nothing", () => {
        using app = createTestApp(item("board", item("col1", item("task")), item("col2")))
        app.command("cursor_right")
        app.command("cursor_down")
        app.expect("#col2[data-cursor]").toExist()
      })

      test("single card - g/G do nothing", () => {
        using app = createTestApp(item("board", item("col", item("only"))))
        app.expect("#only[data-cursor]").toExist()
        app.command("cursor_first")
        app.expect("#only[data-cursor]").toExist()
        app.command("cursor_last")
        app.expect("#only[data-cursor]").toExist()
      })
    })

    test("single column: h goes to column header, l does nothing", async () => {
      using app = createTestApp(item("board", item("col", item("task"))))
      app.expect("#task[data-cursor]").toExist()

      app.command("cursor_left")
      app.expect("#col[data-cursor]").toExist()

      app.command("cursor_left")
      app.expect("#col[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#task[data-cursor]").toExist()

      app.command("cursor_right")
      app.expect("#task[data-cursor]").toExist()
    })

    test("k stops at top boundary, j stops at bottom boundary", async () => {
      using app = createTestApp(item.simpleBoard())

      app.expect("#1a[data-cursor]").toExist()
      app.command("cursor_up")
      app.expect("#col1[data-cursor]").toExist()
      app.command("cursor_up")
      app.expect("#board[data-cursor]").toExist()

      app.command("cursor_up")
      app.expect("#board[data-cursor]").toExist()
      app.command("cursor_up")
      app.expect("#board[data-cursor]").toExist()
      app.command("cursor_up")
      app.expect("#board[data-cursor]").toExist()

      app.command("cursor_down")
      app.command("cursor_down")
      app.command("cursor_down")
      app.command("cursor_down")
      app.expect("#1c[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#1c[data-cursor]").toExist()
      app.command("cursor_down")
      app.expect("#1c[data-cursor]").toExist()
      app.command("cursor_down")
      app.expect("#1c[data-cursor]").toExist()
    })

    test("h stops at left boundary, l stops at right boundary", async () => {
      using app = createTestApp(item.multiColBoard())

      app.expect("#1a[data-cursor]").toExist()
      app.command("cursor_right")
      app.expect("#2a[data-cursor]").toExist()
      app.command("cursor_left")
      app.expect("#1a[data-cursor]").toExist()

      app.command("cursor_left")
      app.expect("#col1[data-cursor]").toExist()

      app.command("cursor_left")
      app.expect("#col1[data-cursor]").toExist()
      app.command("cursor_left")
      app.expect("#col1[data-cursor]").toExist()

      app.command("cursor_right")
      app.expect("#col2[data-cursor]").toExist()
      app.command("cursor_right")
      app.expect("#col3[data-cursor]").toExist()

      app.command("cursor_right")
      app.expect("#col3[data-cursor]").toExist()
      app.command("cursor_right")
      app.expect("#col3[data-cursor]").toExist()
      app.command("cursor_right")
      app.expect("#col3[data-cursor]").toExist()
    })

    test("g does nothing at first card", () => {
      using app = createTestApp(item("board", item("col", item("1a"), item("1b"), item("1c"))))
      app.expect("#1a[data-cursor]").toExist()
      app.press("g")
      app.expect("#1a[data-cursor]").toExist()
    })

    test("g G does nothing at last card", () => {
      using app = createTestApp(item("board", item("col", item("1a"), item("1b"), item("1c"))))
      app.command("cursor_last")
      app.expect("#1c[data-cursor]").toExist()
      app.command("cursor_last")
      app.expect("#1c[data-cursor]").toExist()
    })

    describe("no-op key boundaries", () => {
      test("Escape, [, ], z on column header do nothing on task card", async () => {
        using app = createTestApp(item("board", item("col", item("task"))))

        app.expect("#task[data-cursor]").toExist()
        app.press("\x1B")
        app.expect("#task[data-cursor]").toExist()

        app.press("{")
        app.expect("#task[data-cursor]").toExist()

        app.press("}")
        app.expect("#task[data-cursor]").toExist()

        app.command("cursor_up")
        app.expect("#col[data-cursor]").toExist()
        app.command("fold_all_more")
        app.expect("#col[data-cursor]").toExist()
      })

      test("Enter and z do nothing on leaf card", () => {
        using app = createTestApp(item("board", item("col", item("leaf"))))

        app.expect("#leaf[data-cursor]").toExist()
        app.press("\r")
        app.expect("#leaf[data-cursor]").toExist()

        app.command("fold_all_more")
        app.expect("#leaf[data-cursor]").toExist()
      })
    })
  })

  describe("Boundary Feedback (Bell + Status)", () => {
    test("k at top boundary triggers bell/status, clears on next keypress", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))

      app.command("cursor_up")
      app.command("cursor_up")
      app.expect("#board[data-cursor]").toExist()

      app.command("cursor_up")
      expect(app.bell).toBe(true)
      expect(app.hasStatus).toBe(true)
      const status = app.getStatus()
      expect(status?.level).toBe("warning")
      expect(status?.message).toContain("Can't move")

      app.command("cursor_down")
      expect(app.hasStatus).toBe(false)

      app.command("cursor_left")
      expect(app.bell).toBe(true)
      expect(app.hasStatus).toBe(true)

      app.command("cursor_down")
      expect(app.hasStatus).toBe(false)
    })

    test.each([
      { key: "h", setup: ["h"], finalId: "#col1", desc: "h at left boundary (from column header)" },
      { key: "l", setup: ["l"], finalId: "#2a", desc: "l at right boundary" },
      { key: "j", setup: ["j"], finalId: "#1b", desc: "j at bottom boundary" },
    ])("$desc shows feedback", ({ key, setup, finalId }) => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
      for (const k of setup) app.press(k)
      app.expect(`${finalId}[data-cursor]`).toExist()

      app.press(key)
      expect(app.bell).toBe(true)
      expect(app.hasStatus).toBe(true)
    })

    test("boundary bell sets data-bell-flash attribute", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))
      expect(app.q("[data-bell-flash]").count()).toBe(0)

      app.command("cursor_left")
      app.command("cursor_left")
      expect(app.bell).toBe(true)
      expect(app.q("[data-bell-flash]").count()).toBe(1)

      app.command("cursor_down")
      expect(app.q("[data-bell-flash]").count()).toBe(0)
    })

    test("unhandled key triggers visual bell flash", () => {
      using app = createTestApp(item("board", item("col1", item("1a"))))
      app.press(";")
      expect(app.bell).toBe(true)
      expect(app.q("[data-bell-flash]").count()).toBe(1)
    })

    test("unhandled key bell clears on next valid key", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))
      app.press(";")
      expect(app.bell).toBe(true)

      app.command("cursor_down")
      expect(app.bell).toBe(false)
      expect(app.q("[data-bell-flash]").count()).toBe(0)
    })

    test("boundary bell fires on every boundary press", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))
      app.command("cursor_down")
      app.expect("#1b[data-cursor]").toExist()

      for (let i = 0; i < 5; i++) {
        app.command("cursor_down")
        expect(app.bell).toBe(true)
        expect(app.hasStatus).toBe(true)
      }
      app.expect("#1b[data-cursor]").toExist()
    })

    test("bell fires for each horizontal boundary direction", () => {
      using app = createTestApp(item("board", item("col1", item("1a"))))

      app.command("cursor_left")
      expect(app.bell).toBe(false)
      app.command("cursor_left")
      expect(app.bell).toBe(true)

      app.command("cursor_down")
      app.command("cursor_right")
      expect(app.bell).toBe(true)
    })

    test("bell fires for downward boundary", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))
      app.command("cursor_down")
      app.command("cursor_down")
      expect(app.bell).toBe(true)

      app.command("cursor_down")
      expect(app.bell).toBe(true)
    })
  })

  // Sub-block navigation (j/k inside a card)
  describe("Sub-block navigation", () => {
    test("click sub-block → j/k navigate siblings → k to parent card", () => {
      using app = createTestApp(
        item("board", item("Column", item("card", item("child-1"), item("child-2"), item("child-3")))),
        { cols: 80, rows: 24 },
      )

      const el = app.q("[id='child-1']")
      const box = el.boundingBox()!
      app.click(box.x + 1, box.y)
      app.expect("#child-1[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#child-2[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#child-3[data-cursor]").toExist()

      app.command("cursor_up")
      app.expect("#child-2[data-cursor]").toExist()

      app.command("cursor_up")
      app.expect("#child-1[data-cursor]").toExist()

      app.command("cursor_up")
      app.expect("#card[data-cursor]").toExist()
    })

    test("j from last sub-block jumps to next card", () => {
      using app = createTestApp(
        item("board", item("Column", item("card-a", item("a-child-1"), item("a-child-2")), item("card-b"))),
        { cols: 80, rows: 24 },
      )

      const el = app.q("[id='a-child-2']")
      const box = el.boundingBox()!
      app.click(box.x + 1, box.y)
      app.expect("#a-child-2[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#card-b[data-cursor]").toExist()
    })

    test("Enter on sub-block edits that block, not the card title", () => {
      using app = createTestApp(
        item("board", item("Column", item("card", item("child-1"), item("child-2"), item("child-3")))),
        { cols: 80, rows: 24 },
      )

      const el = app.q("[id='child-2']")
      const box = el.boundingBox()!
      app.click(box.x + 1, box.y)
      app.expect("#child-2[data-cursor]").toExist()

      app.press("Enter")

      expect(app).toContainText("INSERT")
      expect(app).toContainText("child-2")
    })

    test("clicking each child in a card selects the correct one (hitTest)", () => {
      using app = createTestApp(
        item("board", item("Column", item("card", item("child-1"), item("child-2"), item("child-3")))),
        { cols: 80, rows: 24 },
      )

      for (const id of ["child-1", "child-2", "child-3"]) {
        const el = app.q(`[id='${id}']`)
        expect(el.count(), `${id} should be rendered`).toBeGreaterThan(0)
        const box = el.boundingBox()!
        app.click(box.x + 1, box.y)
        app.expect(`#${id}[data-cursor]`).toExist()
      }
    })
  })

  // Outline nav (j/k inside a card's sub-items with depth-2+ descendants)
  describe("Outline navigation with grandchildren", () => {
    test("j/k traverse into grandchildren (depth 2+) when clicking sub-items", () => {
      using app = createTestApp(
        item(
          "board",
          item(
            "Column",
            item("card", item("section-a", item("grandchild-1"), item("grandchild-2")), item("section-b")),
          ),
        ),
        { cols: 80, rows: 24 },
      )
      app.expect("#card[data-cursor]").toExist()

      const el = app.q("[id='section-a']")
      const box = el.boundingBox()!
      app.click(box.x + 1, box.y)
      app.expect("#section-a[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#grandchild-1[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#grandchild-2[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#section-b[data-cursor]").toExist()

      app.command("cursor_up")
      app.expect("#grandchild-2[data-cursor]").toExist()

      app.command("cursor_up")
      app.expect("#grandchild-1[data-cursor]").toExist()

      app.command("cursor_up")
      app.expect("#section-a[data-cursor]").toExist()
    })
  })

  // Spatial block navigation (J/K — next/prev visible block in column)
  describe("Spatial block navigation (J/K)", () => {
    test("J walks through all visible blocks in document order", () => {
      using app = createTestApp(
        item("board", item("Column", item("card1", item("child1a"), item("child1b")), item("card2"))),
        { cols: 80, rows: 24 },
      )
      app.expect("#card1[data-cursor]").toExist()

      app.command("block_nav_down")
      app.expect("#child1a[data-cursor]").toExist()

      app.command("block_nav_down")
      app.expect("#child1b[data-cursor]").toExist()

      app.command("block_nav_down")
      app.expect("#card2[data-cursor]").toExist()
    })

    test("K walks backward through visible blocks", () => {
      using app = createTestApp(
        item("board", item("Column", item("card1", item("child1a"), item("child1b")), item("card2"))),
        { cols: 80, rows: 24 },
      )
      app.command("block_nav_down")
      app.command("block_nav_down")
      app.command("block_nav_down")
      app.expect("#card2[data-cursor]").toExist()

      app.command("block_nav_up")
      app.expect("#child1b[data-cursor]").toExist()

      app.command("block_nav_up")
      app.expect("#child1a[data-cursor]").toExist()

      app.command("block_nav_up")
      app.expect("#card1[data-cursor]").toExist()
    })

    test("J on leaf card moves to next card (no children to visit)", () => {
      using app = createTestApp(item("board", item("Column", item("card1"), item("card2"))), {
        cols: 80,
        rows: 24,
      })
      app.expect("#card1[data-cursor]").toExist()

      app.command("block_nav_down")
      app.expect("#card2[data-cursor]").toExist()
    })

    test("K from first card moves to column header", () => {
      using app = createTestApp(item("board", item("Column", item("card1"), item("card2"))), {
        cols: 80,
        rows: 24,
      })
      app.expect("#card1[data-cursor]").toExist()

      app.command("block_nav_up")
      app.expect("#Column[data-cursor]").toExist()
    })

    test("J/K are strict inverses — full spatial journey", () => {
      using app = createTestApp(
        item("board", item("Column", item("parent", item("child-a"), item("child-b")), item("sibling"))),
        { cols: 80, rows: 24 },
      )
      app.expect("#parent[data-cursor]").toExist()

      app.command("block_nav_down")
      app.expect("#child-a[data-cursor]").toExist()
      app.command("block_nav_down")
      app.expect("#child-b[data-cursor]").toExist()
      app.command("block_nav_down")
      app.expect("#sibling[data-cursor]").toExist()

      app.command("block_nav_down")
      app.expect("#sibling[data-cursor]").toExist()

      app.command("block_nav_up")
      app.expect("#child-b[data-cursor]").toExist()
      app.command("block_nav_up")
      app.expect("#child-a[data-cursor]").toExist()
      app.command("block_nav_up")
      app.expect("#parent[data-cursor]").toExist()
      app.command("block_nav_up")
      app.expect("#Column[data-cursor]").toExist()

      app.command("block_nav_up")
      app.expect("#Column[data-cursor]").toExist()
    })

    test("J/K with nested children traverses in DFS order", () => {
      using app = createTestApp(
        item("board", item("Column", item("card", item("child-1"), item("child-2"), item("child-3")))),
        { cols: 80, rows: 24 },
      )
      app.expect("#card[data-cursor]").toExist()

      app.command("block_nav_down")
      app.expect("#child-1[data-cursor]").toExist()
      app.command("block_nav_down")
      app.expect("#child-2[data-cursor]").toExist()
      app.command("block_nav_down")
      app.expect("#child-3[data-cursor]").toExist()

      app.command("block_nav_down")
      app.expect("#child-3[data-cursor]").toExist()

      app.command("block_nav_up")
      app.expect("#child-2[data-cursor]").toExist()
      app.command("block_nav_up")
      app.expect("#child-1[data-cursor]").toExist()
      app.command("block_nav_up")
      app.expect("#card[data-cursor]").toExist()
    })

    test("J traverses into grandchildren (depth 2+) when visible", () => {
      using app = createTestApp(
        item(
          "board",
          item(
            "Column",
            item("card", item("section-a", item("grandchild-1"), item("grandchild-2")), item("section-b")),
          ),
        ),
        { cols: 80, rows: 24 },
      )
      app.expect("#card[data-cursor]").toExist()

      app.command("block_nav_down")
      app.expect("#section-a[data-cursor]").toExist()

      app.command("block_nav_down")
      app.expect("#grandchild-1[data-cursor]").toExist()

      app.command("block_nav_down")
      app.expect("#grandchild-2[data-cursor]").toExist()

      app.command("block_nav_down")
      app.expect("#section-b[data-cursor]").toExist()
    })
  })

  // Regression: curswanty-regression
  const render80 = createRenderer({ cols: 80, rows: 24 })
  const render120 = createRenderer({ cols: 120, rows: 40 })

  describe("Regression: curswanty-regression — curswantY calculation", () => {
    test("headHeight should be 1 (title row), not full card height", () => {
      const registry = createGridNavigator()

      const nodes = item("board", item("col0", item("card0", item("child1"), item("child2"), item("child3"))))
      const repo = createFakeRepo({ nodes })

      renderBoardWithStore(repo, "board", {
        navigator: registry,
        render: render80,
      })

      const head = registry.getHead(0, 0)
      const pos = registry.getPosition(0, 0)!

      expect(head?.height).toBe(1)
      expect(pos.height).toBeGreaterThan(1)
      expect(head?.height).not.toBe(pos.height)
    })

    test("h/l navigation uses title midpoint, lands on closest card midpoint", () => {
      const registry = createGridNavigator()

      const nodes = item(
        "board",
        item("col0", item("tall0", item("c1"), item("c2"), item("c3"), item("c4"))),
        item("col1", item("tall1", item("cA"), item("cB"), item("cC")), item("short1")),
        item("col2", item("short2"), item("tall2", item("cX"), item("cY"), item("cZ"))),
      )
      const repo = createFakeRepo({ nodes })

      renderBoardWithStore(repo, "board", {
        columns: 120,
        rows: 40,
        navigator: registry,
        render: render120,
      })

      const curswantY = registry.getItemMidY(0, 0)

      expect(curswantY).toBeLessThan(10)

      const col1Result = registry.findItemAtY(1, curswantY)
      const col2Result = registry.findItemAtY(2, curswantY)

      expect(col1Result).toBe(0)
      expect(col2Result).toBe(0)
    })
  })
})

// =============================================================================
// Merged from keyboard-navigation.slow.test.tsx
// =============================================================================

describe("Merged from keyboard-navigation.slow.test.tsx", () => {
  describe("Keyboard Navigation: j/k (vertical)", () => {
    test("j moves cursor down to next card", () => {
      using app = createTestApp(
        item("board", item("col1", item("1a"), item("1b"), item("1c")), item("col2", item("2a"))),
      )

      app.expect("#1a[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#1b[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#1c[data-cursor]").toExist()
    })

    test("k moves cursor up to previous card", () => {
      using app = createTestApp(item.simpleBoard())

      app.command("cursor_down").command("cursor_down")
      app.expect("#1c[data-cursor]").toExist()

      app.command("cursor_up")
      app.expect("#1b[data-cursor]").toExist()

      app.command("cursor_up")
      app.expect("#1a[data-cursor]").toExist()
    })

    test("k at first card moves to column header", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))

      app.expect("#1a[data-cursor]").toExist()

      app.command("cursor_up")
      app.expect("#col1[data-cursor]").toExist()
    })

    test("k at column header moves to board title", () => {
      using app = createTestApp(item("board", item("col1", item("1a"))))

      app.command("cursor_up")
      app.expect("#col1[data-cursor]").toExist()

      app.command("cursor_up")
      app.expect("#board[data-cursor]").toExist()
    })

    test("j at column header moves to first card", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))

      app.command("cursor_up")
      app.expect("#col1[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#1a[data-cursor]").toExist()
    })

    test("j at board title moves to column header", () => {
      using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))))

      app.command("cursor_up").command("cursor_up")
      app.expect("#board[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#col1[data-cursor]").toExist()
    })
  })

  describe("Keyboard Navigation: h/l (horizontal)", () => {
    test("l moves cursor to next column", () => {
      using app = createTestApp(
        item(
          "board",
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a"), item("2b")),
          item("col3", item("3a")),
        ),
      )

      app.expect("#1a[data-cursor]").toExist()

      app.command("cursor_right")
      app.expect("#2a[data-cursor]").toExist()

      app.command("cursor_right")
      app.expect("#3a[data-cursor]").toExist()
    })

    test("h moves cursor to previous column", () => {
      using app = createTestApp(item.multiColBoard())

      app.command("cursor_right").command("cursor_right")
      app.expect("#3a[data-cursor]").toExist()

      app.command("cursor_left")
      app.expect("#2a[data-cursor]").toExist()

      app.command("cursor_left")
      app.expect("#1a[data-cursor]").toExist()
    })

    test("h at column header moves to previous column header", () => {
      using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))))

      app.command("cursor_right")
      app.command("cursor_up")
      app.expect("#col2[data-cursor]").toExist()

      app.command("cursor_left")
      app.expect("#col1[data-cursor]").toExist()
    })

    test("l at column header moves to next column header", () => {
      using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))))

      app.command("cursor_up")
      app.expect("#col1[data-cursor]").toExist()

      app.command("cursor_right")
      app.expect("#col2[data-cursor]").toExist()
    })
  })

  describe("Keyboard Navigation: boundary behavior", () => {
    test("j at last card rings bell and stays", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))

      app.command("cursor_down")
      app.expect("#1b[data-cursor]").toExist()

      app.command("cursor_down")
      expect(app.bell).toBe(true)
      app.expect("#1b[data-cursor]").toExist()
    })

    test("k at board level rings bell and stays", () => {
      using app = createTestApp(item("board", item("col1", item("1a"))))

      app.command("cursor_up").command("cursor_up")
      app.expect("#board[data-cursor]").toExist()

      app.command("cursor_up")
      expect(app.bell).toBe(true)
      app.expect("#board[data-cursor]").toExist()
    })

    test("h at first column card goes to header, then boundary rings bell", () => {
      using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))))

      app.expect("#1a[data-cursor]").toExist()

      app.command("cursor_left")
      expect(app.bell).toBe(false)
      app.expect("#col1[data-cursor]").toExist()

      app.command("cursor_left")
      expect(app.bell).toBe(true)
      app.expect("#col1[data-cursor]").toExist()
    })

    test("l at last column rings bell and stays", () => {
      using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))))

      app.command("cursor_right")
      app.expect("#2a[data-cursor]").toExist()

      app.command("cursor_right")
      expect(app.bell).toBe(true)
      app.expect("#2a[data-cursor]").toExist()
    })

    test("bell and status clear on next non-boundary keypress", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))

      app.command("cursor_down")
      app.expect("#1b[data-cursor]").toExist()

      app.command("cursor_down")
      expect(app.bell).toBe(true)
      expect(app.hasStatus).toBe(true)
      const status = app.getStatus()
      expect(status?.level).toBe("warning")
      expect(status?.message).toContain("Can't move")
      expect(app).toContainText("Can't move")

      app.command("cursor_up")
      app.expect("#1a[data-cursor]").toExist()
      expect(app.bell).toBe(false)
      expect(app.hasStatus).toBe(false)
      expect(app.getStatus()).toBeNull()
      expect(app).not.toContainText("Can't move")
    })

    test("h boundary status clears after pressing j", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))

      app.command("cursor_left")
      expect(app.bell).toBe(false)

      app.command("cursor_left")
      expect(app.bell).toBe(true)
      expect(app.hasStatus).toBe(true)
      expect(app.getStatus()?.message).toContain("Can't move")
      expect(app).toContainText("Can't move")

      app.command("cursor_down")
      app.expect("#1a[data-cursor]").toExist()
      expect(app.bell).toBe(false)
      expect(app.hasStatus).toBe(false)
      expect(app).not.toContainText("Can't move")
    })

    test("status clears after l, h, j, k sequence", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))

      app.command("cursor_right")
      app.expect("#2a[data-cursor]").toExist()

      app.command("cursor_right")
      expect(app.bell).toBe(true)
      expect(app).toContainText("Can't move")

      app.command("cursor_left")
      expect(app.bell).toBe(false)
      expect(app).not.toContainText("Can't move")

      app.command("cursor_left")
      expect(app.bell).toBe(false)

      app.command("cursor_left")
      expect(app.bell).toBe(true)
      expect(app).toContainText("Can't move")

      app.command("cursor_down")
      expect(app.bell).toBe(false)
      expect(app).not.toContainText("Can't move")

      app.command("cursor_up")
      expect(app.bell).toBe(false)
      expect(app).not.toContainText("Can't move")
    })

    test("navigation across multiple columns works correctly", () => {
      using app = createTestApp(item.multiColBoard())

      app.expect("#1a[data-cursor]").toExist()

      app.command("cursor_right")
      app.expect("#2a[data-cursor]").toExist()
      app.command("cursor_right")
      app.expect("#3a[data-cursor]").toExist()

      app.command("cursor_left")
      app.expect("#2a[data-cursor]").toExist()
      app.command("cursor_left")
      app.expect("#1a[data-cursor]").toExist()
    })
  })

  describe("Keyboard Navigation: scrolling behavior", () => {
    test("cursor stays on cards when navigating past visible area (scroll)", () => {
      const cards = Array.from({ length: 15 }, (_, i) => item(`card${i}`))

      using app = createTestApp(item("board", item("col1", ...cards)), { rows: 20 })

      app.expect("#card0[data-cursor]").toExist()

      for (let i = 1; i < 15; i++) {
        app.command("cursor_down")
        app.expect(`#card${i}[data-cursor]`).toExist()
        app.expect("#board[data-cursor]").not.toExist()
      }

      app.command("cursor_down")
      expect(app.bell).toBe(true)
      app.expect("#card14[data-cursor]").toExist()
    })

    test("cursor stays on cards when navigating up after scrolling down", () => {
      const cards = Array.from({ length: 15 }, (_, i) => item(`card${i}`))

      using app = createTestApp(item("board", item("col1", ...cards)), { rows: 20 })

      for (let i = 0; i < 14; i++) {
        app.command("cursor_down")
      }
      app.expect("#card14[data-cursor]").toExist()

      for (let i = 13; i >= 0; i--) {
        app.command("cursor_up")
        app.expect(`#card${i}[data-cursor]`).toExist()
        app.expect("#board[data-cursor]").not.toExist()
      }

      app.command("cursor_up")
      app.expect("#col1[data-cursor]").toExist()
    })
  })

  describe("Keyboard Navigation: arrow keys (same as hjkl)", () => {
    test("ArrowDown behaves like j", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))

      app.expect("#1a[data-cursor]").toExist()

      app.press("\x1b[B")
      app.expect("#1b[data-cursor]").toExist()
    })

    test("ArrowUp behaves like k", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b"))))

      app.command("cursor_down")
      app.expect("#1b[data-cursor]").toExist()

      app.press("\x1b[A")
      app.expect("#1a[data-cursor]").toExist()
    })

    test("ArrowRight behaves like l", () => {
      using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))))

      app.expect("#1a[data-cursor]").toExist()

      app.press("\x1b[C")
      app.expect("#2a[data-cursor]").toExist()
    })

    test("ArrowLeft behaves like h", () => {
      using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))))

      app.command("cursor_right")
      app.expect("#2a[data-cursor]").toExist()

      app.press("\x1b[D")
      app.expect("#1a[data-cursor]").toExist()
    })
  })

  describe("Keyboard Navigation: g·g/g·G (first/last)", () => {
    test("g·G moves to last card in column", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b"), item("1c"), item("1d"))))

      app.expect("#1a[data-cursor]").toExist()

      app.command("cursor_last")
      app.expect("#1d[data-cursor]").toExist()
    })

    test("g·g moves to first card in column", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b"), item("1c"), item("1d"))))

      app.command("cursor_last")
      app.expect("#1d[data-cursor]").toExist()

      app.command("cursor_first")
      app.expect("#1a[data-cursor]").toExist()
    })
  })

  describe("Keyboard Navigation: combined navigation", () => {
    test("navigate through board with multiple key sequences", () => {
      using app = createTestApp(
        item(
          "board",
          item("col1", item("1a"), item("1b"), item("1c")),
          item("col2", item("2a"), item("2b")),
          item("col3", item("3a"), item("3b"), item("3c"), item("3d")),
        ),
      )

      app.expect("#1a[data-cursor]").toExist()

      app.command("cursor_down")
      app.command("cursor_down")
      app.command("cursor_right")
      app.command("cursor_down")

      expect(app).toContainText("col2")
    })

    test("can navigate to any card using hjkl", () => {
      using app = createTestApp(
        item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"), item("2b"))),
      )

      app.command("cursor_right")
      app.command("cursor_down")
      app.expect("#2b[data-cursor]").toExist()

      app.command("cursor_left")
      app.command("cursor_first")
      app.expect("#1a[data-cursor]").toExist()
    })
  })

  describe("Keyboard Navigation: body card stickyY (h/l from body column)", () => {
    test("l from body card preserves stickyY into structural column", () => {
      using app = createTestApp(
        item(
          "board",
          item.p("p1"),
          item.p("p2"),
          item.p("p3"),
          item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        ),
        { rows: 30 },
      )

      app.expect("#p1[data-cursor]").toExist()

      app.command("cursor_down").command("cursor_down")
      app.expect("#p3[data-cursor]").toExist()

      app.command("cursor_right")

      const hasCursorOn1a = app.q("#1a[data-cursor]").count() > 0
      const hasCursorOn1b = app.q("#1b[data-cursor]").count() > 0
      const hasCursorOn1c = app.q("#1c[data-cursor]").count() > 0

      expect(hasCursorOn1a).toBe(false)
      expect(hasCursorOn1b || hasCursorOn1c).toBe(true)
    })

    test("l from body card with HR nodes navigates to correct position in next column", () => {
      using app = createTestApp(
        item(
          "board",
          item.p("p1"),
          item.hr("hr1"),
          item.p("p2"),
          item.hr("hr2"),
          item.p("p3"),
          item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        ),
        { rows: 30 },
      )

      app.command("cursor_down").command("cursor_down")
      app.expect("#p3[data-cursor]").toExist()

      app.command("cursor_right")
      const on1a = app.q("#1a[data-cursor]").count() > 0
      expect(on1a).toBe(false)
    })

    test("l from body card without prior j/k still captures stickyY", () => {
      using app = createTestApp(
        item(
          "board",
          item.p("p1"),
          item.p("p2"),
          item.p("p3"),
          item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        ),
        { rows: 30 },
      )

      app.expect("#p1[data-cursor]").toExist()

      app.command("cursor_right")

      app.expect("#1a[data-cursor]").toExist()
    })

    test("h from structural column back to body column preserves stickyY", () => {
      using app = createTestApp(
        item(
          "board",
          item.p("p1"),
          item.p("p2"),
          item.p("p3"),
          item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        ),
        { rows: 30 },
      )

      app.command("cursor_right")
      app.command("cursor_down").command("cursor_down")
      app.expect("#1c[data-cursor]").toExist()

      app.command("cursor_left")

      const hasCursorOnP1 = app.q("#p1[data-cursor]").count() > 0
      const hasCursorOnP2 = app.q("#p2[data-cursor]").count() > 0
      const hasCursorOnP3 = app.q("#p3[data-cursor]").count() > 0

      expect(hasCursorOnP1).toBe(false)
      expect(hasCursorOnP2 || hasCursorOnP3).toBe(true)
    })

    test("h from deep structural column to body column with HR nodes: index mismatch", () => {
      using app = createTestApp(
        item(
          "board",
          item.p("p1"),
          item.hr("hr1"),
          item.p("p2"),
          item.hr("hr2"),
          item.p("p3"),
          item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        ),
        { rows: 30 },
      )

      app.command("cursor_down").command("cursor_down")
      app.expect("#p3[data-cursor]").toExist()

      app.command("cursor_right")

      app.command("cursor_left")

      const hasCursorOnP3 = app.q("#p3[data-cursor]").count() > 0
      const hasCursorOnP2 = app.q("#p2[data-cursor]").count() > 0
      expect(hasCursorOnP3).toBe(true)
    })
  })

  describe("Keyboard Navigation: body card stickyY (round-trip)", () => {
    test("l then h round-trip preserves stickyY for body cards", () => {
      using app = createTestApp(
        item(
          "board",
          item.p("p1"),
          item.p("p2"),
          item.p("p3"),
          item.p("p4"),
          item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
        ),
        { rows: 30 },
      )

      app.command("cursor_down").command("cursor_down")
      app.expect("#p3[data-cursor]").toExist()

      app.command("cursor_right")
      const landedOn1a = app.q("#1a[data-cursor]").count() > 0
      expect(landedOn1a).toBe(false)

      app.command("cursor_left")
      const landedOnP1 = app.q("#p1[data-cursor]").count() > 0
      expect(landedOnP1).toBe(false)
    })

    test("stickyY preserved across multiple l presses through body and structural columns", () => {
      using app = createTestApp(
        item(
          "board",
          item.p("p1"),
          item.p("p2"),
          item.p("p3"),
          item("col1", item("1a"), item("1b"), item("1c"), item("1d"), item("1e")),
          item("col2", item("2a"), item("2b"), item("2c"), item("2d"), item("2e")),
        ),
        { rows: 30 },
      )

      app.command("cursor_down").command("cursor_down")
      app.expect("#p3[data-cursor]").toExist()

      app.command("cursor_right")
      const on1a = app.q("#1a[data-cursor]").count() > 0
      expect(on1a).toBe(false)

      app.command("cursor_right")
      const on2a = app.q("#2a[data-cursor]").count() > 0
      expect(on2a).toBe(false)
    })
  })

  describe("Keyboard Navigation: body card stickyY (within-column body)", () => {
    test("l from within-column body card preserves stickyY into next column", () => {
      using app = createTestApp(
        item(
          "board",
          item(
            "col1",
            item.p("body-p1"),
            item.p("body-p2"),
            item.p("body-p3"),
            item("sub1"),
            item("sub2"),
            item("sub3"),
          ),
          item("col2", item("2a"), item("2b"), item("2c"), item("2d"), item("2e")),
        ),
        { rows: 30 },
      )

      app.expect("#body-p1[data-cursor]").toExist()

      app.command("cursor_down").command("cursor_down")
      app.expect("#body-p3[data-cursor]").toExist()

      app.command("cursor_right")

      const hasCursorOn2a = app.q("#2a[data-cursor]").count() > 0

      expect(hasCursorOn2a).toBe(false)
    })
  })

  describe("Keyboard Navigation: z (zoom in)", () => {
    test("z zooms into cursor node, making it the root", () => {
      using app = createTestApp(
        item(
          "board",
          item("col1", item("1a", item("sub1")), item("1b", item("sub2")), item("1c", item("sub3"))),
          item("col2", item("2a", item("sub4"))),
        ),
      )

      app.expect("#1a[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#1b[data-cursor]").toExist()

      app.command("zoom_inwards")
      expect(app).toContainText("sub2")
    })

    test("z zoom into third card shows its children", () => {
      using app = createTestApp(
        item("board", item("col1", item("1a", item("sub1")), item("1b", item("sub2")), item("1c", item("sub3")))),
      )

      app.command("cursor_down").command("cursor_down")
      app.expect("#1c[data-cursor]").toExist()

      app.command("zoom_inwards")
      expect(app).toContainText("sub3")
    })
  })
})

// =============================================================================
// Merged from body-nav.slow.test.ts
// =============================================================================

describe("Merged from body-nav.slow.test.ts", () => {
  function makeViewTree(repo: Repo, rootId: string): ViewTreeProjection {
    const lens = createViewLens(repo, { rootId, foldDepths: new Map() })
    const tree = createViewTree()
    tree.sync(lens)
    return tree
  }

  function makeNavState(cursor: string, rootId: string, repo: Repo): NavState {
    const tree = makeViewTree(repo, rootId)
    return { cursor, rootId, foldDepths: new Map(), collapsedNodes: new Set(), tree }
  }

  function cursor(nodeId: string): string {
    return `[id="${nodeId}"][data-cursor]`
  }

  // Body content within a column: j/k navigation
  describe("body content within a column: j/k navigation", () => {
    it("j from column header enters first body card", () => {
      using app = createTestApp(
        item("board", item("col1", item.p("body-p1"), item.p("body-p2"), item("sub-section", item("task1")))),
      )

      app.expect(cursor("body-p1")).toExist()

      app.press("j")
      app.expect(cursor("body-p2")).toExist()
    })

    it("j navigates through body cards then to structural cards", () => {
      using app = createTestApp(
        item("board", item("col1", item.p("body-p1"), item.p("body-p2"), item("sub-section", item("task1")))),
      )

      app.expect(cursor("body-p1")).toExist()

      app.press("j")
      app.expect(cursor("body-p2")).toExist()

      app.press("j")
      app.expect(cursor("sub-section")).toExist()
    })

    it("k navigates back through body cards", () => {
      using app = createTestApp(
        item("board", item("col1", item.p("body-p1"), item.p("body-p2"), item("sub-section", item("task1")))),
      )

      app.press("j").press("j")
      app.expect(cursor("sub-section")).toExist()

      app.press("k")
      app.expect(cursor("body-p2")).toExist()

      app.press("k")
      app.expect(cursor("body-p1")).toExist()

      app.press("k")
      app.expect(cursor("col1")).toExist()
    })

    it("j/k works with multiple columns where one has body content", () => {
      using app = createTestApp(
        item(
          "board",
          item("col-with-body", item.p("intro"), item.p("details"), item("child1"), item("child2")),
          item("col-normal", item("task-a"), item("task-b")),
        ),
      )

      app.expect(cursor("intro")).toExist()

      app.press("j")
      app.expect(cursor("details")).toExist()

      app.press("j")
      app.expect(cursor("child1")).toExist()

      app.press("j")
      app.expect(cursor("child2")).toExist()

      app.press("k")
      app.expect(cursor("child1")).toExist()

      app.press("k")
      app.expect(cursor("details")).toExist()
    })

    it("body-only column: j/k through only body cards", () => {
      using app = createTestApp(
        item(
          "board",
          item("body-col", item.p("para1"), item.p("para2"), item.p("para3")),
          item("normal-col", item("task1")),
        ),
      )

      app.expect(cursor("para1")).toExist()

      app.press("j")
      app.expect(cursor("para2")).toExist()

      app.press("j")
      app.expect(cursor("para3")).toExist()

      app.press("j")
      expect(app.bell).toBe(true)

      app.press("k")
      app.expect(cursor("para2")).toExist()
    })
  })

  // Body content navigation (board-level body column)
  describe("body content navigation", () => {
    it("j moves down through body cards", () => {
      using app = createTestApp(item("board", item.p("para1"), item.p("para2"), item("col1", item("task1"))))

      app.expect("#para1[data-cursor]").toExist()

      app.press("j")
      app.expect("#para2[data-cursor]").toExist()
    })

    it("k moves up through body cards", () => {
      using app = createTestApp(item("board", item.p("para1"), item.p("para2"), item("col1", item("task1"))))

      app.press("j")
      app.expect("#para2[data-cursor]").toExist()

      app.press("k")
      app.expect("#para1[data-cursor]").toExist()
    })

    it("k from first body card goes to body column header, then board level", () => {
      using app = createTestApp(item("board", item.p("para1"), item("col1", item("task1"))))

      app.expect("#para1[data-cursor]").toExist()

      app.press("k")
      app.expect('[id="__body__board"][data-cursor]').toExist()

      app.press("k")
      app.expect("#board[data-cursor]").toExist()
    })

    it("j from last body card hits boundary", () => {
      using app = createTestApp(item("board", item.p("para1"), item("col1", item("task1"))))

      app.expect("#para1[data-cursor]").toExist()

      app.press("j")
      app.expect("#para1[data-cursor]").toExist()
    })

    it("l from body card navigates to structural column", () => {
      using app = createTestApp(
        item("board", item.p("body text"), item("col1", item("task1"), item("task2")), item("col2", item("task3"))),
      )

      app.expect("[id='body text'][data-cursor]").toExist()

      app.press("l")
      app.expect("#task1[data-cursor]").toExist()
    })

    it("navigation layer correctly classifies body nodes", () => {
      const nodes = item("board", item.p("body text"), item("col1", item("task1")))
      const repo = createFakeRepo({ nodes })

      const nav = createCardsViewNavigation()
      const registry = createGridNavigator()

      const navState = makeNavState("body text", "board", repo)

      const downTarget = nav.navigate("down", navState, repo, registry)
      expect(downTarget).toBeNull()

      const upTarget = nav.navigate("up", navState, repo, registry)
      expect(upTarget).toBe("__body__board")
    })

    it("navigation layer handles multiple body nodes", () => {
      const nodes = item("board", item.p("p1"), item.p("p2"), item.p("p3"), item("col1", item("task1")))
      const repo = createFakeRepo({ nodes })

      const nav = createCardsViewNavigation()
      const registry = createGridNavigator()

      expect(nav.navigate("down", makeNavState("p1", "board", repo), repo, registry)).toBe("p2")

      expect(nav.navigate("down", makeNavState("p2", "board", repo), repo, registry)).toBe("p3")

      expect(nav.navigate("down", makeNavState("p3", "board", repo), repo, registry)).toBeNull()

      expect(nav.navigate("up", makeNavState("p3", "board", repo), repo, registry)).toBe("p2")

      expect(nav.navigate("up", makeNavState("p1", "board", repo), repo, registry)).toBe("__body__board")
    })
  })

  // Body column navigation after zoom (km-nyxsp)
  describe("body column navigation after zoom", () => {
    it("l from body column header after zoom goes to structural column", () => {
      using app = createTestApp(
        item("board", item("root-section", item.p("body-text"), item("sub1", item("t1")), item("sub2", item("t2")))),
      )

      app.press("k")
      app.press("z")

      app.expect("#body-text[data-cursor]").toExist()

      app.press("k")
      app.expect('[id="__body__root-section"][data-cursor]').toExist()

      app.press("l")

      const cursorId = app.q("[data-cursor]").getAttribute("id")
      expect(cursorId).toBe("sub1")
    })

    it("l from body card after zoom goes to structural column", () => {
      using app = createTestApp(
        item("board", item("root4", item.p("body-p"), item("sec-x", item("tx1")), item("sec-y", item("ty1")))),
      )

      app.press("k")
      app.press("z")

      app.expect("#body-p[data-cursor]").toExist()

      app.press("l")

      const cursorId = app.q("[data-cursor]").getAttribute("id")
      expect(cursorId).not.toBe("body-p")
      expect(cursorId).not.toBe("root4")
    })
  })

  // Zoom into nodes with body content — cursor placement
  describe("zoom into node with body content: cursor placement", () => {
    it("zoom places cursor on first meaningful body card", () => {
      const nodes = item(
        "board",
        item(
          "col1",
          item("target-card", item.p("intro-text"), item.p("detail-text"), item("subsection1", item("task1"))),
        ),
      )
      const repo = createFakeRepo({ nodes })
      const driver = createBoardDriver(repo, "board")

      expect(driver.getState().selectedNodeId).toBe("target-card")

      driver.press("z")
      expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("col1")
      driver.press("z")
      expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("target-card")

      const cursorId = getActiveBoardPane(driver.store.getState())!.sel.node.cursor() as string | null
      expect(cursorId).toBe("intro-text")
    })

    it("zoom into node with HR body content still navigates", () => {
      const nodes = item(
        "board",
        item(
          "col1",
          item("section-with-hr", item.hr("hr1"), item.p("after-hr-text"), item("subsection", item("task1"))),
        ),
      )
      const repo = createFakeRepo({ nodes })
      const driver = createBoardDriver(repo, "board")

      driver.press("z")
      expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("col1")
      driver.press("z")
      expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("section-with-hr")

      const pane = getActiveBoardPane(driver.store.getState())!
      expect(pane.sel.node.cursor() as string | null).not.toBe("section-with-hr")
      expect(pane.sel.node.cursor() as string | null).not.toBeNull()
    })

    it("j/k works after zoom into node with body content", () => {
      using app = createTestApp(
        item(
          "board",
          item(
            "col1",
            item("target", item.p("body1"), item.p("body2"), item("sub1", item("t1")), item("sub2", item("t2"))),
          ),
        ),
      )

      app.press("z")
      app.press("z")

      app.expect(cursor("body1")).toExist()

      app.press("j")
      app.expect(cursor("body2")).toExist()

      app.press("j")
      expect(app.bell).toBe(true)
    })

    it("j from board level with body nodes skips to first column if body filtered", () => {
      const nodes = item(
        "board",
        item(
          "col1",
          item("section", item.hr("hr-only"), item("subsection1", item("task1")), item("subsection2", item("task2"))),
        ),
      )
      const repo = createFakeRepo({ nodes })
      const driver = createBoardDriver(repo, "board")

      driver.press("z")
      expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("col1")
      driver.press("z")
      expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("section")

      driver.press("k")
      driver.press("k")
      driver.press("k")

      driver.press("j")
      const afterJ = getActiveBoardPane(driver.store.getState())!
      expect(afterJ.sel.node.cursor() as string | null).not.toBe("section")
    })
  })

  // BUG REPRODUCER: body node filtered by meaningfulBody blocks navigation
  describe("BUG: empty body node blocks j/k navigation", () => {
    it("board-level j should skip filtered-out body nodes", () => {
      const nodes = item(
        "board",
        item(
          "col1",
          item("root-section", item.hr("hr-empty"), item("sec1", item("task1")), item("sec2", item("task2"))),
        ),
      )
      const repo = createFakeRepo({ nodes })
      const driver = createBoardDriver(repo, "board")

      driver.press("z")
      expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("col1")
      driver.press("z")
      expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("root-section")

      driver.press("k")
      driver.press("k")

      driver.press("j")
      const afterJ = getActiveBoardPane(driver.store.getState())!
      expect(afterJ.sel.node.cursor() as string | null).not.toBe("root-section")
      expect(afterJ.sel.node.cursor() as string | null).not.toBe("hr-empty")
    })

    it("zoom into node with empty first body child should not get stuck", () => {
      const nodes = item(
        "board",
        item("col1", item("target", item.hr("hr-first"), item("sub1", item("t1")), item("sub2", item("t2")))),
      )
      const repo = createFakeRepo({ nodes })
      const driver = createBoardDriver(repo, "board")

      driver.press("z")
      expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("col1")
      driver.press("z")
      expect(getActiveBoardPane(driver.store.getState())!.rootId).toBe("target")

      const paneState = getActiveBoardPane(driver.store.getState())!
      expect(paneState.sel.node.cursor() as string | null).not.toBe("hr-first")
      expect(paneState.sel.node.cursor() as string | null).not.toBe("target")
    })
  })

  // Real vault scenario: column with body content + structural cards
  describe("real vault scenario: zoom into section with mixed columns", () => {
    it("j/k works in column that has body + structural cards after zoom", () => {
      using app = createTestApp(
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

      app.press("z")
      app.press("z")

      app.press("l")
      app.expect(cursor("bd-beads-text")).toExist()

      app.press("j")
      app.expect(cursor("quick-ref")).toExist()

      app.press("j")
      app.expect(cursor("landing-sub")).toExist()

      app.press("k")
      app.expect(cursor("quick-ref")).toExist()

      app.press("k")
      app.expect(cursor("bd-beads-text")).toExist()
    })
  })

  // BUG: collapse on body column triggers __body__ repo lookup error
  describe("BUG: collapse on body column triggers __body__ repo lookup error", () => {
    test("pressing c on body column should not produce console.error about __body__", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      using app = createTestApp(item("board", item.p("body text here"), item("col1", item("A"))))

      app.press("v").press("c")

      const bodyErrors = errorSpy.mock.calls.filter((args) =>
        args.some((arg) => typeof arg === "string" && arg.includes("__body__")),
      )
      expect(bodyErrors, "should not log __body__ repo lookup error").toHaveLength(0)

      errorSpy.mockRestore()
    })

    test("pressing c on body column should produce a boundary bell (body is not collapsible)", () => {
      using app = createTestApp(item("board", item.p("body text here"), item("col1", item("A"))))

      app.press("v").press("c")
      expect(app.bell, "body column collapse should ring bell").toBe(true)
    })

    test("navigate to body column then collapse — key sequence c, l, c", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      using app = createTestApp(item("board", item.p("body text here"), item("col1", item("A"))))

      app.press("v").press("c")
      app.press("l")
      app.press("v").press("c")

      const bodyErrors = errorSpy.mock.calls.filter((args) =>
        args.some((arg) => typeof arg === "string" && arg.includes("__body__")),
      )
      expect(bodyErrors, "no __body__ errors during sequence c,l,c").toHaveLength(0)

      errorSpy.mockRestore()
    })
  })

  // Body Content Visual Tests
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

      expect(screenshot.length).toBeGreaterThan(0)
      expect(screenshot).toBeTruthy()
    })

    test("navigation with h/l moves between columns", async () => {
      const repo = createFakeRepo({ nodes: BODY_CONTENT_BOARD.nodes })
      board = await createBoardTest(repo)

      const initial = board.screenshot()
      expect(initial.length).toBeGreaterThan(0)

      board.press("l")
      const afterRight = board.screenshot()
      expect(afterRight.length).toBeGreaterThan(0)

      board.press("h")
      const afterLeft = board.screenshot()
      expect(afterLeft.length).toBeGreaterThan(0)

      board.press("l")
      board.press("l")
      const afterTwoRight = board.screenshot()
      expect(afterTwoRight.length).toBeGreaterThan(0)
    })

    test("navigation with j/k moves between cards", async () => {
      const repo = createFakeRepo({ nodes: BODY_CONTENT_BOARD.nodes })
      board = await createBoardTest(repo)

      board.press("l")

      board.press("j")
      const afterDown = board.screenshot()
      expect(afterDown.length).toBeGreaterThan(0)

      board.press("k")
      const afterUp = board.screenshot()
      expect(afterUp.length).toBeGreaterThan(0)
    })

    test("g (go top) navigates to first card", async () => {
      const repo = createFakeRepo({ nodes: BODY_CONTENT_BOARD.nodes })
      board = await createBoardTest(repo)

      board.press("l")

      board.press("j")
      board.press("j")
      const afterTwoDown = board.screenshot()

      board.press("g")
      board.press("g")
      const afterGoTop = board.screenshot()

      expect(afterTwoDown.length).toBeGreaterThan(0)
      expect(afterGoTop.length).toBeGreaterThan(0)
    })

    test("nested content expands correctly", async () => {
      const repo = createFakeRepo({ nodes: BODY_CONTENT_BOARD.nodes })
      board = await createBoardTest(repo)

      board.press("l")
      board.press("l")

      board.press("j")
      const beforeExpand = board.screenshot()

      board.press("enter")
      const afterExpand = board.screenshot()

      expect(beforeExpand.length).toBeGreaterThan(0)
      expect(afterExpand.length).toBeGreaterThan(0)
    })
  })

  // Body h/l navigation Y-position matching
  describe("body h/l navigation Y-position matching", () => {
    test("l from 3rd body card goes to Y-matched card in structural column", () => {
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
      app.press("j")
      app.press("j")
      app.expect("#body-3[data-cursor]").toExist()

      app.press("l")
      app.expect("#task-c[data-cursor]").toExist()
    })

    test("l from body-1 goes to task-a (both at top)", () => {
      using app = createTestApp(
        item("board", item.p("body-1"), item("col1", item("task-a"), item("task-b"), item("task-c"))),
        { rows: 40 },
      )

      app.expect("#body-1[data-cursor]").toExist()
      app.press("l")
      app.expect("#task-a[data-cursor]").toExist()
    })

    test("l from body card then h back preserves Y position", () => {
      using app = createTestApp(
        item(
          "board",
          item.p("bp-1"),
          item.p("bp-2"),
          item.p("bp-3"),
          item("s1", item("t-1"), item("t-2"), item("t-3")),
        ),
        { rows: 40 },
      )

      app.press("j")
      app.press("j")
      app.expect("#bp-3[data-cursor]").toExist()

      app.press("l")
      const rightTarget = app.q("[data-cursor]").getAttribute("id")
      expect(rightTarget).not.toBe("bp-1")

      app.press("h")
      const backTarget = app.q("[data-cursor]").getAttribute("id")
      expect(backTarget).toMatch(/^bp-/)
    })

    test("l from structural column card goes to next column at same Y", () => {
      using app = createTestApp(
        item(
          "board",
          item("col1", item("a1"), item("a2"), item("a3"), item("a4"), item("a5")),
          item("col2", item("b1"), item("b2"), item("b3"), item("b4"), item("b5")),
        ),
        { rows: 40 },
      )

      app.expect("#a1[data-cursor]").toExist()
      app.press("j")
      app.press("j")
      app.expect("#a3[data-cursor]").toExist()

      app.press("l")
      app.expect("#b3[data-cursor]").toExist()
    })

    test("h from structural column card into body column matches Y-position (km-tui.vbody-nav)", () => {
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

      app.press("l")
      app.expect("#task-a[data-cursor]").toExist()

      app.press("j").press("j")
      app.expect("#task-c[data-cursor]").toExist()

      app.press("h")
      app.expect("#body-3[data-cursor]").toExist()
    })

    test("h from structural column to body preserves Y across multiple hops (km-tui.vbody-nav)", () => {
      using app = createTestApp(
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

      app.press("l").press("l")
      app.expect("#u-1[data-cursor]").toExist()
      app.press("j").press("j").press("j")
      app.expect("#u-4[data-cursor]").toExist()

      app.press("h")
      app.expect("#t-4[data-cursor]").toExist()

      app.press("h")
      app.expect("#bp-4[data-cursor]").toExist()
    })

    test("h from deep structural card clamps to last body card (km-tui.vbody-nav)", () => {
      using app = createTestApp(
        item(
          "board",
          item.p("body-1"),
          item.p("body-2"),
          item("col1", item("t1"), item("t2"), item("t3"), item("t4"), item("t5"), item("t6"), item("t7"), item("t8")),
        ),
        { rows: 40 },
      )

      app.press("l")
      app.expect("#t1[data-cursor]").toExist()
      for (let i = 0; i < 7; i++) app.press("j")
      app.expect("#t8[data-cursor]").toExist()

      app.press("h")
      app.expect("#body-2[data-cursor]").toExist()
    })
  })

  // Body block spacing
  describe("Body block spacing", () => {
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
        const nodes = item("board", item("col1", item.p("line one\n\nline two\n\n\nline three"), item("task-a")))
        using app = createTestApp(nodes)

        const text = app.text
        expect(text).toContain("line one")
        expect(text).toContain("line two")
        expect(text).toContain("line three")

        const lines = text.split("\n")
        const sepIdx = lines.findIndex((l) => l.includes("───"))
        const contentLines = lines.slice(sepIdx + 1)

        const lineOneIdx = contentLines.findIndex((l) => l.includes("line one"))
        const lineTwoIdx = contentLines.findIndex((l) => l.includes("line two"))
        const lineThreeIdx = contentLines.findIndex((l) => l.includes("line three"))

        expect(lineTwoIdx).toBe(lineOneIdx + 1)
        expect(lineThreeIdx).toBe(lineTwoIdx + 1)
      })

      test("body blocks render with borders in cards view", () => {
        using app = createTestApp(boardWithBodyContent())

        const text = app.text
        expect(text).toContain("body paragraph one")
        expect(text).toContain("body paragraph two")

        expect(text).toMatch(/[╭╰]/)
      })
    })

    describe("columns view", () => {
      test("body blocks have no blank line between them", () => {
        using app = createTestApp(boardWithBodyContent(), { viewMode: "columns" })

        const text = app.text
        expect(text).toContain("body paragraph one")
        expect(text).toContain("body paragraph two")

        const lines = text.split("\n")
        const sepIdx = lines.findIndex((l) => l.includes("───"))
        const contentLines = lines.slice(sepIdx + 1)

        const paraOneIdx = contentLines.findIndex((l) => l.includes("body paragraph one"))
        const paraTwoIdx = contentLines.findIndex((l) => l.includes("body paragraph two"))

        expect(paraTwoIdx).toBe(paraOneIdx + 1)
      })

      test("body blocks have no borders in columns view", () => {
        using app = createTestApp(boardWithBodyContent(), { viewMode: "columns" })

        const text = app.text

        const lines = text.split("\n")
        const sepIdx = lines.findIndex((l) => l.includes("───"))
        const contentLines = lines.slice(sepIdx + 1)

        const paraOneIdx = contentLines.findIndex((l) => l.includes("body paragraph one"))

        if (paraOneIdx > 0) {
          const lineBefore = contentLines[paraOneIdx - 1]!
          expect(lineBefore).not.toMatch(/[╭╮╰╯]/)
        }
        const lineAfter = contentLines[paraOneIdx + 1]
        if (lineAfter) {
          expect(lineAfter).not.toMatch(/[╭╮╰╯]/)
        }
      })

      test("body blocks are compact and section cards recurse into their children", () => {
        using app = createTestApp(boardWithBodyContent(), { viewMode: "columns" })

        const text = app.text
        const lines = text.split("\n")
        const sepIdx = lines.findIndex((l) => l.includes("───"))
        const contentLines = lines.slice(sepIdx + 1)

        const paraOneIdx = contentLines.findIndex((l) => l.includes("body paragraph one"))
        const paraTwoIdx = contentLines.findIndex((l) => l.includes("body paragraph two"))
        // task-a is the section header row; use a tighter match so we skip
        // "task-a-child" which now renders below it after the parity fix.
        const taskAIdx = contentLines.findIndex((l) => /\btask-a\b/.test(l) && !l.includes("task-a-child"))
        const taskBIdx = contentLines.findIndex((l) => /\btask-b\b/.test(l) && !l.includes("task-b-child"))

        // Body blocks are compact (1 row apart).
        expect(paraTwoIdx - paraOneIdx).toBe(1)
        // Section headers take at least 2 rows because each now recurses into
        // its children (km-tui.view-mode-feature-parity).
        expect(taskBIdx - taskAIdx).toBeGreaterThanOrEqual(2)
        // Child of task-a is rendered between the two section headers.
        const taskAChildIdx = contentLines.findIndex((l) => l.includes("task-a-child"))
        expect(taskAChildIdx).toBeGreaterThan(taskAIdx)
        expect(taskAChildIdx).toBeLessThan(taskBIdx)
      })
    })
  })

  // Body content: vertical navigation (j/k) — file-based tests
  describe("Body content: vertical navigation (j/k)", () => {
    test("j navigates down through body cards", () => {
      using app = createTestApp(
        item.file("doc", item.p("intro-p"), item.p("second-p"), item.section("sec1", item("task1"), item("task2"))),
      )

      app.expect(cursor("intro-p")).toExist()

      app.press("j")
      app.expect(cursor("second-p")).toExist()
    })

    test("j at last body card hits boundary (cannot cross to structural column)", () => {
      using app = createTestApp(item.file("doc", item.p("intro"), item.section("sec1", item("task1"))))

      app.expect(cursor("intro")).toExist()

      app.press("j")
      expect(app.bell).toBe(true)
    })

    test("k at first body card moves to body column header, then board level", () => {
      using app = createTestApp(item.file("doc", item.p("intro"), item.section("sec1", item("task1"))))

      app.expect(cursor("intro")).toExist()

      app.press("k")
      app.expect('[id="__body__doc"][data-cursor]').toExist()

      app.press("k")
      app.expect(cursor("doc")).toExist()
    })

    test("k navigates up through body cards", () => {
      using app = createTestApp(
        item.file("doc", item.p("p1"), item.p("p2"), item.p("p3"), item.section("sec1", item("task1"))),
      )

      app.press("j").press("j")
      app.expect(cursor("p3")).toExist()

      app.press("k")
      app.expect(cursor("p2")).toExist()

      app.press("k")
      app.expect(cursor("p1")).toExist()

      app.press("k")
      app.expect('[id="__body__doc"][data-cursor]').toExist()

      app.press("k")
      app.expect(cursor("doc")).toExist()
    })
  })

  // Body content: horizontal navigation (h/l) — file-based tests
  describe("Body content: horizontal navigation (h/l)", () => {
    test("l from body card navigates to first structural column card", () => {
      using app = createTestApp(item.file("doc", item.p("intro"), item.section("sec1", item("task1"), item("task2"))))

      app.expect(cursor("intro")).toExist()

      app.press("l")
      app.expect(cursor("task1")).toExist()
    })

    test("h from structural column card navigates back to body", () => {
      using app = createTestApp(item.file("doc", item.p("intro"), item.section("sec1", item("task1"))))

      app.press("l")
      app.expect(cursor("task1")).toExist()

      app.press("h")
      app.expect(cursor("intro")).toExist()
    })

    test("h at body card goes to body column header, then boundary", () => {
      using app = createTestApp(item.file("doc", item.p("intro"), item.section("sec1", item("task1"))))

      app.expect(cursor("intro")).toExist()

      app.press("h")
      app.press("h")
      expect(app.bell).toBe(true)
    })

    test("l between structural columns works with body present", () => {
      using app = createTestApp(
        item.file("doc", item.p("intro"), item.section("sec1", item("task1")), item.section("sec2", item("task2"))),
      )

      app.press("l")
      app.expect(cursor("task1")).toExist()

      app.press("l")
      app.expect(cursor("task2")).toExist()

      app.press("h")
      app.expect(cursor("task1")).toExist()

      app.press("h")
      app.expect(cursor("intro")).toExist()
    })
  })

  // Body content: deep nesting
  describe("Body content: deep nesting", () => {
    test("j/k works in structural column when body column exists", () => {
      using app = createTestApp(
        item.file("doc", item.p("intro"), item.section("sec1", item("task1"), item("task2"), item("task3"))),
      )

      app.press("l")
      app.expect(cursor("task1")).toExist()

      app.press("j")
      app.expect(cursor("task2")).toExist()

      app.press("j")
      app.expect(cursor("task3")).toExist()

      app.press("k")
      app.expect(cursor("task2")).toExist()
    })

    test("k from structural card to column header to board", () => {
      using app = createTestApp(item.file("doc", item.p("intro"), item.section("sec1", item("task1"))))

      app.press("l")
      app.expect(cursor("task1")).toExist()

      app.press("k")
      app.expect(cursor("sec1")).toExist()

      app.press("k")
      app.expect(cursor("doc")).toExist()
    })
  })

  // Body content only (no sections)
  describe("Body content only (no sections)", () => {
    test("j/k through body-only file", () => {
      using app = createTestApp(item.file("doc", item.p("p1"), item.p("p2"), item.p("p3")))

      app.expect(cursor("p1")).toExist()

      app.press("j")
      app.expect(cursor("p2")).toExist()

      app.press("j")
      app.expect(cursor("p3")).toExist()

      app.press("j")
      expect(app.bell).toBe(true)

      app.press("k")
      app.expect(cursor("p2")).toExist()
    })

    test("h/l at body-only file hits boundary after column header", () => {
      using app = createTestApp(item.file("doc", item.p("p1"), item.p("p2")))

      app.expect(cursor("p1")).toExist()

      app.press("h")
      app.press("h")
      expect(app.bell).toBe(true)

      app.press("j")
      app.press("l")
      expect(app.bell).toBe(true)
    })
  })

  // Board-level j/k with body content
  describe("Board-level j/k with body content", () => {
    test("j from board level goes to first body card", () => {
      using app = createTestApp(
        item.file("doc", item.p("intro"), item.section("sec1", item("task1")), item.section("sec2", item("task2"))),
      )

      app.press("k")
      app.press("k")
      app.expect(cursor("doc")).toExist()

      app.press("j")
      app.expect(cursor("intro")).toExist()
    })

    test("j from board level goes to structural column when stickyX remembers it", () => {
      using app = createTestApp(
        item.file("doc", item.p("intro"), item.section("sec1", item("task1")), item.section("sec2", item("task2"))),
      )

      app.press("l")
      app.expect(cursor("task1")).toExist()

      app.press("k")
      app.expect(cursor("sec1")).toExist()

      app.press("k")
      app.expect(cursor("doc")).toExist()

      app.press("j")
      app.expect(cursor("sec1")).toExist()
    })

    test("j from board after navigating from body card up goes back to body", () => {
      using app = createTestApp(
        item.file("doc", item.p("intro"), item.p("detail"), item.section("sec1", item("task1"))),
      )

      app.expect(cursor("intro")).toExist()

      app.press("j")
      app.expect(cursor("detail")).toExist()

      app.press("k")
      app.expect(cursor("intro")).toExist()
      app.press("k")
      app.press("k")
      app.expect(cursor("doc")).toExist()

      app.press("j")
      app.expect(cursor("intro")).toExist()
    })
  })
})

// =============================================================================
// Merged from shift-cursor.test.ts
// =============================================================================

describe("Merged from shift-cursor.test.ts", () => {
  describe("km-tui.shift-cursor: column shift preserves cursor position", () => {
    test("opt+l shifts column right — cursor stays on same column header", () => {
      using app = createTestApp(item.multiColBoard())
      app.command("cursor_up")
      app.expect("#col1[data-cursor]").toExist()

      app.press("opt+l")

      app.expect("#col1[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#1a[data-cursor]").toExist()
    })

    test("opt+h shifts column left — cursor stays on same column header", () => {
      using app = createTestApp(item.multiColBoard())
      app.command("cursor_right")
      app.command("cursor_up")
      app.expect("#col2[data-cursor]").toExist()

      app.press("opt+h")

      app.expect("#col2[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#2a[data-cursor]").toExist()
    })

    test("opt+l shifts column right — pressing l from shifted column moves to next column", () => {
      using app = createTestApp(item.multiColBoard())
      app.command("cursor_up")
      app.expect("#col1[data-cursor]").toExist()

      app.press("opt+l")
      app.expect("#col1[data-cursor]").toExist()

      app.command("cursor_right")
      app.expect("#col3[data-cursor]").toExist()
    })

    test("opt+h shifts column left — pressing h from shifted column moves to previous column", () => {
      using app = createTestApp(item.multiColBoard())
      app.command("cursor_right")
      app.command("cursor_right")
      app.command("cursor_up")
      app.expect("#col3[data-cursor]").toExist()

      app.press("opt+h")
      app.expect("#col3[data-cursor]").toExist()

      app.command("cursor_left")
      app.expect("#col1[data-cursor]").toExist()
    })

    test("shift column right then down enters correct column's cards", () => {
      using app = createTestApp(
        item(
          "board",
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a"), item("2b")),
          item("col3", item("3a")),
        ),
      )
      app.command("cursor_up")
      app.expect("#col1[data-cursor]").toExist()

      app.press("opt+l")
      app.expect("#col1[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#1a[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#1b[data-cursor]").toExist()
    })

    test("shift column left then down enters correct column's cards", () => {
      using app = createTestApp(
        item("board", item("col1", item("1a")), item("col2", item("2a"), item("2b")), item("col3", item("3a"))),
      )
      app.command("cursor_right")
      app.command("cursor_up")
      app.expect("#col2[data-cursor]").toExist()

      app.press("opt+h")
      app.expect("#col2[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#2a[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#2b[data-cursor]").toExist()
    })

    test("opt+l visually reorders columns — all 3 columns visible", () => {
      using app = createTestApp(item.multiColBoard(), { cols: 120, rows: 24 })
      app.command("cursor_up")
      app.press("opt+l")

      const col1Box = app.q("#col1").boundingBox()
      const col2Box = app.q("#col2").boundingBox()
      const col3Box = app.q("#col3").boundingBox()
      expect(col1Box).not.toBeNull()
      expect(col2Box).not.toBeNull()
      expect(col3Box).not.toBeNull()
      expect(col2Box!.x).toBeLessThan(col1Box!.x)
      expect(col1Box!.x).toBeLessThan(col3Box!.x)
    })

    test("opt+h visually reorders columns — all 3 columns visible", () => {
      using app = createTestApp(item.multiColBoard(), { cols: 120, rows: 24 })
      app.command("cursor_right")
      app.command("cursor_up")
      app.press("opt+h")

      const col1Box = app.q("#col1").boundingBox()
      const col2Box = app.q("#col2").boundingBox()
      const col3Box = app.q("#col3").boundingBox()
      expect(col1Box).not.toBeNull()
      expect(col2Box).not.toBeNull()
      expect(col3Box).not.toBeNull()
      expect(col2Box!.x).toBeLessThan(col1Box!.x)
      expect(col1Box!.x).toBeLessThan(col3Box!.x)
    })

    test("multiple shifts preserve cursor and visual order", () => {
      using app = createTestApp(
        item(
          "board",
          item("col1", item("1a")),
          item("col2", item("2a")),
          item("col3", item("3a")),
          item("col4", item("4a")),
        ),
        { cols: 160, rows: 24 },
      )
      app.command("cursor_up")
      app.expect("#col1[data-cursor]").toExist()

      app.press("opt+l")
      app.expect("#col1[data-cursor]").toExist()
      app.press("opt+l")
      app.expect("#col1[data-cursor]").toExist()
      app.press("opt+l")
      app.expect("#col1[data-cursor]").toExist()

      const col1Box = app.q("#col1").boundingBox()
      const col2Box = app.q("#col2").boundingBox()
      const col3Box = app.q("#col3").boundingBox()
      const col4Box = app.q("#col4").boundingBox()
      expect(col1Box).not.toBeNull()
      expect(col2Box).not.toBeNull()
      expect(col3Box).not.toBeNull()
      expect(col4Box).not.toBeNull()
      expect(col2Box!.x).toBeLessThan(col3Box!.x)
      expect(col3Box!.x).toBeLessThan(col4Box!.x)
      expect(col4Box!.x).toBeLessThan(col1Box!.x)

      app.command("cursor_down")
      app.expect("#1a[data-cursor]").toExist()
    })

    test("shift right then left returns column to original position", () => {
      using app = createTestApp(item.multiColBoard(), { cols: 160, rows: 24 })
      app.command("cursor_up")
      app.expect("#col1[data-cursor]").toExist()

      const c1Before = app.q("#col1").boundingBox()!.x
      const c2Before = app.q("#col2").boundingBox()!.x

      app.press("opt+l")
      app.expect("#col1[data-cursor]").toExist()
      expect(app.q("#col1").boundingBox()!.x, "col1 moved right").toBeGreaterThan(c1Before)

      app.press("opt+h")
      app.expect("#col1[data-cursor]").toExist()
      expect(app.q("#col1").boundingBox()!.x, "col1 returned to original").toBe(c1Before)
      expect(app.q("#col2").boundingBox()!.x, "col2 returned to original").toBe(c2Before)
    })

    test("shift right twice then left once — column ends in middle", () => {
      using app = createTestApp(item.multiColBoard(), { cols: 160, rows: 24 })
      app.command("cursor_up")

      app.press("opt+l")
      app.press("opt+l")
      app.expect("#col1[data-cursor]").toExist()

      app.press("opt+h")
      app.expect("#col1[data-cursor]").toExist()

      const c1x = app.q("#col1").boundingBox()!.x
      const c2x = app.q("#col2").boundingBox()!.x
      const c3x = app.q("#col3").boundingBox()!.x
      expect(c2x).toBeLessThan(c1x)
      expect(c1x).toBeLessThan(c3x)
    })

    test("shift column with narrow viewport scrolls cursor into view", () => {
      using app = createTestApp(item.multiColBoard(), { cols: 80, rows: 24 })
      app.command("cursor_up")
      app.expect("#col1[data-cursor]").toExist()

      app.press("opt+l")

      app.expect("#col1[data-cursor]").toExist()
      const col1Box = app.q("#col1").boundingBox()
      expect(col1Box).not.toBeNull()
    })
  })

  // Shift-J single press range (km-cnn5z)
  describe("Shift-J single press range (km-cnn5z)", () => {
    test("single J from A selects both A and B", () => {
      using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

      app.press("shift+ArrowDown")

      const status = app.getStatus()
      expect(status).not.toBeNull()
      expect(status!.message).toContain("2")
    })

    test("batch toggle after single J affects both A and B", () => {
      using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

      app.repo.updateNode("A", { item: { task: { status: "todo", marker: "[ ]" } } })
      app.repo.updateNode("B", { item: { task: { status: "todo", marker: "[ ]" } } })
      app.repo.updateNode("C", { item: { task: { status: "todo", marker: "[ ]" } } })

      app.press("shift+ArrowDown")

      app.command("toggle_task_done")

      const statusA = app.repo.getNode("A")?.item?.task?.status
      const statusB = app.repo.getNode("B")?.item?.task?.status
      const statusC = app.repo.getNode("C")?.item?.task?.status

      expect(statusA).not.toBe("todo")
      expect(statusB).not.toBe("todo")
      expect(statusC).toBe("todo")
    })

    test("batch delete after single J removes both A and B", () => {
      using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

      app.press("shift+ArrowDown")

      app.press("Backspace")

      const children = app.repo.getChildren("col1").map((n) => n.id)
      expect(children).toEqual(["C"])
    })
  })

  describe("shift card boundary detection", () => {
    const singleCol = () => item("board", item("Col", item("a"), item("b"), item("c")))
    const twoCols = () => item("board", item("Col1", item("a")), item("Col2", item("b")))

    test.each([
      {
        name: "shift up at top card",
        fixture: singleCol,
        opts: { cols: 60, rows: 20 },
        nav: [],
        key: "opt+k",
        bell: true,
      },
      {
        name: "shift down at bottom card",
        fixture: () => item("board", item("Col", item("a"), item("b"))),
        opts: { cols: 60, rows: 20 },
        nav: ["j"],
        key: "opt+j",
        bell: true,
      },
      {
        name: "shift left at leftmost column",
        fixture: twoCols,
        opts: { cols: 80, rows: 20 },
        nav: [],
        key: "opt+h",
        bell: true,
      },
      {
        name: "shift right at rightmost column",
        fixture: twoCols,
        opts: { cols: 80, rows: 20 },
        nav: ["l"],
        key: "opt+l",
        bell: true,
      },
      {
        name: "shift down in middle succeeds (no bell)",
        fixture: singleCol,
        opts: { cols: 60, rows: 20 },
        nav: [],
        key: "opt+j",
        bell: false,
      },
      {
        name: "shift up at column header",
        fixture: twoCols,
        opts: { cols: 80, rows: 20 },
        nav: ["k"],
        key: "opt+k",
        bell: true,
      },
    ])("$name", ({ fixture, opts, nav, key, bell }) => {
      using app = createTestApp(fixture, opts)
      for (const k of nav) app.press(k)
      app.press(key)
      expect(app.bell).toBe(bell)
    })
  })
})

// =============================================================================
// Merged from cursor-prefetch.test.ts
// =============================================================================

describe("Merged from cursor-prefetch.test.ts", () => {
  // Cursor prefetch warms adjacent columns
  describe("cursor prefetch on horizontal navigation", () => {
    test("rapid h/l navigation across 5 columns lands on correct final position", () => {
      using app = createTestApp(
        item(
          "board",
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a"), item("2b")),
          item("col3", item("3a"), item("3b")),
          item("col4", item("4a"), item("4b")),
          item("col5", item("5a"), item("5b")),
        ),
        { cols: 120, rows: 20 },
      )

      app.expect("#1a[data-cursor]").toExist()

      app.command("cursor_right")
      app.command("cursor_right")
      app.command("cursor_right")
      app.command("cursor_right")
      app.expect("#5a[data-cursor]").toExist()

      app.command("cursor_left")
      app.command("cursor_left")
      app.command("cursor_left")
      app.command("cursor_left")
      app.expect("#1a[data-cursor]").toExist()
    })

    test("h/l navigation with mixed j/k between columns renders correctly", () => {
      using app = createTestApp(
        item(
          "board",
          item("col1", item("1a"), item("1b"), item("1c")),
          item("col2", item("2a"), item("2b"), item("2c")),
          item("col3", item("3a"), item("3b"), item("3c")),
        ),
        { cols: 100, rows: 20 },
      )

      app.command("cursor_down")
      app.expect("#1b[data-cursor]").toExist()

      app.command("cursor_right")
      expect(app.text).toContain("2a")
      expect(app.text).toContain("2b")

      app.command("cursor_right")
      expect(app.text).toContain("3a")

      app.command("cursor_left")
      app.command("cursor_left")
      expect(app.text).toContain("1a")
      expect(app.text).toContain("1b")
      expect(app.text).toContain("1c")
    })

    test("rapid l-l-h-l-h-h sequence preserves cursor and rendering", () => {
      using app = createTestApp(item.multiColBoard(), { cols: 120, rows: 20 })

      app.expect("#1a[data-cursor]").toExist()

      app.command("cursor_right")
      app.command("cursor_right")
      app.command("cursor_left")
      app.command("cursor_right")
      app.command("cursor_left")
      app.command("cursor_left")

      app.expect("#1a[data-cursor]").toExist()

      expect(app.text).toContain("col1")
      expect(app.text).toContain("col2")
    })

    test("prefetch fires after horizontal nav without errors", () => {
      using app = createTestApp(
        item(
          "board",
          item("col1", item("1a"), item("1b")),
          item("col2", item("2a"), item("2b")),
          item("col3", item("3a"), item("3b")),
        ),
        { cols: 100, rows: 20 },
      )

      app.command("cursor_right")
      app.expect("#2a[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#2b[data-cursor]").toExist()

      app.command("cursor_right")
      app.expect("#3b[data-cursor]").toExist()

      app.command("cursor_left")
      app.command("cursor_left")
      expect(app.text).toContain("1a")
    })

    test("horizontal nav across boundary doesn't cause errors", () => {
      using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))), {
        cols: 80,
        rows: 20,
      })

      app.command("cursor_right")
      app.expect("#2a[data-cursor]").toExist()

      app.command("cursor_right")
      app.expect("#2a[data-cursor]").toExist()

      app.command("cursor_left")
      app.expect("#1a[data-cursor]").toExist()

      app.command("cursor_left")
      app.expect("#col1[data-cursor]").toExist()

      app.command("cursor_left")
      app.expect("#col1[data-cursor]").toExist()
    })
  })

  // Multiple rapid mutations (repo.touch) don't crash
  describe("rapid repo.touch() coalescing", () => {
    test("5 rapid touch() calls don't crash the board", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))), {
        cols: 80,
        rows: 20,
      })

      app.expect("#1a[data-cursor]").toExist()
      expect(app).toContainText("1a")

      act(() => {
        app.repo.touch()
        app.repo.touch()
        app.repo.touch()
        app.repo.touch()
        app.repo.touch()
      })

      app.press("")

      expect(app).toContainText("1a")
      expect(app).toContainText("1b")
      expect(app).toContainText("2a")
    })

    test("touch() between navigation steps doesn't break cursor", () => {
      using app = createTestApp(
        item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"), item("2b"))),
        { cols: 80, rows: 20 },
      )

      app.expect("#1a[data-cursor]").toExist()

      app.command("cursor_down")
      app.expect("#1b[data-cursor]").toExist()

      act(() => {
        app.repo.touch()
      })
      app.press("")

      app.expect("#1b[data-cursor]").toExist()

      app.command("cursor_right")

      act(() => {
        app.repo.touch()
      })
      app.press("")

      expect(app).toContainText("col1")
      expect(app).toContainText("col2")
    })

    test("rapid touch() with no actual data changes preserves rendering", () => {
      using app = createTestApp(item("board", item("col1", item("task-1"), item("task-2"), item("task-3"))), {
        cols: 60,
        rows: 20,
      })

      expect(app).toContainText("task-1")
      expect(app).toContainText("task-2")
      expect(app).toContainText("task-3")

      act(() => {
        for (let i = 0; i < 10; i++) {
          app.repo.touch()
        }
      })
      app.press("")

      expect(app).toContainText("task-1")
      expect(app).toContainText("task-2")
      expect(app).toContainText("task-3")
    })

    test("touch() during horizontal navigation doesn't cause rendering issues", () => {
      using app = createTestApp(item.multiColBoard(), { cols: 120, rows: 20 })

      app.command("cursor_right")
      app.expect("#2a[data-cursor]").toExist()

      act(() => {
        app.repo.touch()
        app.repo.touch()
        app.repo.touch()
      })

      app.command("cursor_right")
      app.expect("#3a[data-cursor]").toExist()

      expect(app).toContainText("col2")
      expect(app).toContainText("col3")
    })
  })
})
