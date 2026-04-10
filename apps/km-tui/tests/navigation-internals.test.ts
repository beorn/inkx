/**
 * Navigation Internals — internal navigation mechanics
 *
 * Consolidated from:
 * - cursor-stability.spec.ts — cursor movement preserves content
 * - cursor-signals.test.ts — cursor signal updates, visibility, recovery
 * - virtual-nav.test.ts — spatial Y-position matching (stickyY, registry)
 */

import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { createGridNavigator } from "@km/board"
import { createFakeRepo } from "@km/storage"
import { createTestBoard, check } from "@km/tui/test"
import { item, createDriverTest, renderBoardWithStore } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"
import { stripAnsi } from "@silvery/test"
import { existsSync } from "fs"
import type { Repo } from "@km/storage"
import { runGenerator } from "@km/core"
import { createRepo, getChildren } from "@km/storage"
import { withDiagnostics } from "@silvery/ag-react"
import { createBoardDriver } from "../src/driver.ts"

// =============================================================================
// Merged from cursor-stability.spec.ts
// =============================================================================

describe("Merged from cursor-stability.spec.ts", () => {
  /**
   * Extract board content (everything except breadcrumb and status bar),
   * with border characters replaced by spaces.
   *
   * Body cards use border when selected, padding otherwise — both occupy
   * the same space so text positions are stable. Replacing borders with
   * spaces lets us compare positional stability, not decoration.
   */
  function getBoardContent(text: string): string {
    const lines = stripAnsi(text).split("\n")
    return lines
      .slice(1, -1)
      .map((line) => line.replace(/[╭╮╰╯│─]/g, " ").trimEnd())
      .join("\n")
  }

  /**
   * Check that board content is stable after cursor movement.
   * The breadcrumb and status bar can change, but columns/cards should not.
   */
  function expectBoardContentStable(before: string, after: string, action: string) {
    const contentBefore = getBoardContent(before)
    const contentAfter = getBoardContent(after)

    // If scrolling happened, content can legitimately change
    const scrolled =
      contentAfter.includes("▲") !== contentBefore.includes("▲") ||
      contentAfter.includes("▼") !== contentBefore.includes("▼") ||
      contentAfter.includes("+") !== contentBefore.includes("+") // "+N more" indicator

    if (!scrolled) {
      expect(contentAfter, `Board content changed after ${action} (no scroll)`).toBe(contentBefore)
    }
  }

  describe("Cursor movement preserves text content", () => {
    test("synthetic: j/k movement preserves text", () => {
      const board = createTestBoard(["Col > Task A", "Col > Task B", "Col > Task C"])

      const initial = board.text

      board.press("j")
      expectBoardContentStable(initial, board.text, "j")

      board.press("k")
      expectBoardContentStable(initial, board.text, "k (back)")

      check.all(board)
    })

    test("synthetic: level changes preserve text", () => {
      const board = createTestBoard(["Projects > Task A", "Projects > Task B"])

      const initial = board.text

      // Up to column level
      board.press("k")
      expectBoardContentStable(initial, board.text, "k to column")

      // Up to board level
      board.press("k")
      expectBoardContentStable(initial, board.text, "k to board")

      // Back down
      board.press("j")
      expectBoardContentStable(initial, board.text, "j to column")

      board.press("j")
      expectBoardContentStable(initial, board.text, "j to card")
    })
  })

  // Stable visual classification (km-tui.stable-visual-classification)
  describe("stable visual classification under cursor movement", () => {
    test("card with body+structural mix: cursor expand does not reclassify siblings", () => {
      using app = createTestApp(
        item(
          "board",
          item("col", item("parent", item("t1"), item("t2"), item("t3"), item("t4"), item.file("sec", item("s1")))),
        ),
        { cols: 100, rows: 30 },
      )

      const initialContent = getBoardContent(app.text)

      app.command("block_nav_down")
      const afterDescend = getBoardContent(app.text)

      app.command("block_nav_up")
      const backOnCard = getBoardContent(app.text)

      const taskPrefix = (content: string, id: string): string | null => {
        for (const line of content.split("\n")) {
          const idx = line.indexOf(id)
          if (idx > 0) return line.slice(0, idx)
        }
        return null
      }

      const initialPrefixes = {
        t1: taskPrefix(initialContent, "t1"),
        t2: taskPrefix(initialContent, "t2"),
        t3: taskPrefix(initialContent, "t3"),
      }
      expect(initialPrefixes.t1, "t1 visible before expansion").not.toBeNull()
      expect(initialPrefixes.t2, "t2 visible before expansion").not.toBeNull()
      expect(initialPrefixes.t3, "t3 visible before expansion").not.toBeNull()

      const expandedPrefixes = {
        t1: taskPrefix(afterDescend, "t1"),
        t2: taskPrefix(afterDescend, "t2"),
        t3: taskPrefix(afterDescend, "t3"),
      }
      expect(expandedPrefixes.t1, "t1 prefix stable on expand").toBe(initialPrefixes.t1)
      expect(expandedPrefixes.t2, "t2 prefix stable on expand").toBe(initialPrefixes.t2)
      expect(expandedPrefixes.t3, "t3 prefix stable on expand").toBe(initialPrefixes.t3)

      expect(backOnCard, "returning cursor restores initial rendering").toBe(initialContent)
    })
  })

  // Cursor stability after property mutations (km-tui.td-cursor-jump)
  describe("cursor stability after property set (km-tui.td-cursor-jump)", () => {
    test("sp (priority) preserves cursor on same card", () => {
      using app = createTestApp(
        item("board", item("col1", item.task("tA"), item.task("tB")), item("col2", item.task("tC"), item.task("tD"))),
      )

      app.command("cursor_down")
      app.expect("#tB[data-cursor]").toExist()

      app.command("set_priority")

      app.expect("#tB[data-cursor]").toExist()
    })

    test("sp preserves cursor when board has body content (virtual body column)", () => {
      using app = createTestApp(
        item.file(
          "myboard",
          item.p("description"),
          item.section("Todo", item.task("tA"), item.task("tB")),
          item.section("Done", item.task("tC")),
        ),
      )

      app.command("cursor_right")
      app.command("cursor_down")
      app.expect("#tB[data-cursor]").toExist()

      app.command("set_priority")

      app.expect("#tB[data-cursor]").toExist()
    })

    test("x (task status toggle) preserves cursor on same card", () => {
      using app = createTestApp(
        item("board", item("col1", item.task("tA"), item.task("tB")), item("col2", item.task("tC"))),
      )

      app.command("cursor_right")
      app.expect("#tC[data-cursor]").toExist()

      app.command("toggle_task_done")

      app.expect("#tC[data-cursor]").toExist()
    })

    test("x preserves cursor when board has body content", () => {
      using app = createTestApp(
        item.file(
          "myboard",
          item.p("intro"),
          item.section("Active", item.task("tA"), item.task("tB")),
          item.section("Done", item.task("tC")),
        ),
      )

      app.command("cursor_right")
      app.command("cursor_down")
      app.expect("#tB[data-cursor]").toExist()

      app.command("toggle_task_done")

      app.expect("#tB[data-cursor]").toExist()
    })

    test("undo/redo preserves cursor position", () => {
      using app = createTestApp(
        item("board", item("col1", item.task("tA"), item.task("tB")), item("col2", item.task("tC"))),
        { incremental: false },
      )

      app.command("cursor_down")
      app.expect("#tB[data-cursor]").toExist()

      app.command("set_priority")
      app.expect("#tB[data-cursor]").toExist()

      app.press("Control-z")
      app.expect("#tB[data-cursor]").toExist()

      app.press("Control-y")
      app.expect("#tB[data-cursor]").toExist()
    })
  })

  // Card borders after cursor navigation (cursor-border-overflow)
  function findCardBorderProblems(text: string): string[] {
    const lines = text.split("\n")
    const problems: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!

      const borderMatches = line.matchAll(/[╰╭]([^╯╮]+)[╯╮]/g)
      for (const match of borderMatches) {
        const content = match[1]!
        const withoutIndicators = content
          .replace(/[⋯▲▼]\s*\+?\d+\s*[⋯]?/g, "")
          .replace(/\+\d+\s*more/g, "")
          .replace(/[─━═\s]/g, "")
        if (/[a-zA-Z]/.test(withoutIndicators)) {
          problems.push(`line ${i}: text in border line: ${match[0].substring(0, 60)}`)
        }
      }
    }
    return problems
  }

  function assertCardBordersClean(text: string, label: string) {
    const problems = findCardBorderProblems(text)
    if (problems.length > 0) {
      throw new Error(`[${label}] Card border overflow:\n${problems.join("\n")}\n\nFull output:\n${text}`)
    }
  }

  function findBoardRoot(repo: Repo): string {
    const nodes = repo.query("type:folder")
    for (const node of nodes) {
      if (node.data?.is_repo_root) return node.id
    }
    for (const node of nodes) {
      const children = getChildren(repo.database, node.id)
      if (children.length > 0) return node.id
    }
    throw new Error("No suitable board root found in vault")
  }

  describe("card borders after cursor navigation (synthetic)", () => {
    for (const cols of [40, 60, 80, 100]) {
      test(`${cols}-col: borders clean after cursor right/left`, () => {
        using app = createTestApp(
          item(
            "board",
            item(
              "col1",
              item("AAAA BBBB CCCC DDDD EEEE FFFF GGGG HHHH IIII JJJJ KKKK LLLL"),
              item("example.com/path/to/some/resource/that/is/quite/long"),
              item("Short task 1"),
              item("Another medium-length task description here"),
            ),
            item("col2", item("Task in col2"), item("Second task in col2 with more detail")),
            item("col3", item("Col3 task with enough text to potentially cause issues"), item("Another col3 item")),
          ),
          { cols, rows: 24 },
        )

        assertCardBordersClean(app.text, `${cols} initial`)

        app.command("cursor_right")
        assertCardBordersClean(app.text, `${cols} right(1)`)

        app.command("cursor_right")
        assertCardBordersClean(app.text, `${cols} right(2)`)

        app.command("cursor_left")
        assertCardBordersClean(app.text, `${cols} left(1)`)

        app.command("cursor_left")
        assertCardBordersClean(app.text, `${cols} left(2)`)

        app.command("cursor_down")
        app.command("cursor_right")
        assertCardBordersClean(app.text, `${cols} down+right`)

        app.command("cursor_down")
        app.command("cursor_left")
        assertCardBordersClean(app.text, `${cols} down+left`)
      })
    }

    test("cursor right with deep card content at 80 cols", () => {
      using app = createTestApp(
        item(
          "board",
          item(
            "ref",
            item(
              "Health & Fitness",
              item("Runners World Heart Rate Training"),
              item("runnersworld.com/beginner/a208-12270/should-i-do-heart-rate-training"),
              item("The key is that you should be training in all of these zones at different intensities"),
              item("Zone 1"),
              item("Zone 2"),
              item("Zone 3"),
              item("Zone 4"),
              item("Zone 5"),
              item("Stretching"),
              item("Recommended"),
              item("Static stretch 3x30s 6 days per week"),
            ),
          ),
          item(
            "TaskNotes",
            item(
              "Tasks",
              item("T003: Arthur SSN Application"),
              item("T001: Guardianship for Arthur"),
              item("T005: HSA Setup"),
              item("T009: BMW DMV Issues"),
            ),
          ),
        ),
        { cols: 80, rows: 30 },
      )

      assertCardBordersClean(app.text, "deep initial")

      app.command("cursor_right")
      assertCardBordersClean(app.text, "deep right(1)")

      app.command("cursor_right")
      assertCardBordersClean(app.text, "deep right(2)")

      app.command("cursor_right")
      assertCardBordersClean(app.text, "deep right(3)")
    })
  })

  describe.skipIf(!process.env.TEST_VAULT)("card borders after cursor right (real vault)", () => {
    for (const cols of [40, 60, 80, 100, 120]) {
      test(`${cols}-col: borders clean after cursor right/left`, async () => {
        const vaultPath = process.env.TEST_VAULT!
        const repo = runGenerator(createRepo(vaultPath, { loadFiles: true }))
        const rootId = findBoardRoot(repo)

        const baseDriver = createBoardDriver(repo, rootId, {
          columns: cols,
          rows: 30,
        })

        const driver = withDiagnostics(baseDriver, {
          checkIncremental: true,
          checkStability: false,
          skipLines: [0, -1],
        })

        assertCardBordersClean(driver.text, `${cols} initial`)

        await driver.cmd.up!()
        await driver.cmd.up!()
        assertCardBordersClean(driver.text, `${cols} at board level`)

        await driver.cmd.right!()
        assertCardBordersClean(driver.text, `${cols} right(1)`)

        await driver.cmd.right!()
        assertCardBordersClean(driver.text, `${cols} right(2)`)

        await driver.cmd.right!()
        assertCardBordersClean(driver.text, `${cols} right(3)`)

        await driver.cmd.left!()
        assertCardBordersClean(driver.text, `${cols} left(1)`)

        await driver.cmd.left!()
        assertCardBordersClean(driver.text, `${cols} left(2)`)

        await driver.cmd.down!()
        await driver.cmd.down!()
        await driver.cmd.right!()
        assertCardBordersClean(driver.text, `${cols} down+right`)
      })
    }
  })

  // Cursor lost after j from column header with flat file items (km-3wk32)
  describe("cursor-lost-col-header-j (km-3wk32)", () => {
    test("j from column header selects first card (folder children - control)", () => {
      using app = createTestApp(
        item.root(
          "board",
          item("col-folders", item.folder("sub-a", item("item-a"))),
          item("col-tasks", item("task-1"), item("task-2")),
        ),
      )

      app.command("cursor_up")
      app.command("cursor_up")
      app.command("cursor_down")
      app.command("cursor_down")

      const cursor = app.q("[data-cursor]")
      expect(cursor.count()).toBe(1)
      expect(cursor.textContent()).toContain("sub-a")
    })

    test("j from column header selects first card (file children)", () => {
      using app = createTestApp(item.root("board", item("col-with-files", item.file("file1"), item.file("file2"))))

      app.command("cursor_up")
      app.command("cursor_up")
      app.command("cursor_down")
      app.command("cursor_down")

      const cursor = app.q("[data-cursor]")
      expect(cursor.count()).toBe(1)
      expect(cursor.textContent()).toContain("file1")
    })

    test("j from second column header selects first card (file children)", () => {
      using app = createTestApp(
        item.root(
          "board",
          item("col-folders", item.folder("sub-a", item("item-a"))),
          item("col-files", item.file("file1"), item.file("file2")),
        ),
      )

      app.command("cursor_up")
      app.command("cursor_up")
      app.command("cursor_down")
      app.command("cursor_right")
      app.command("cursor_down")

      const cursor = app.q("[data-cursor]")
      expect(cursor.count()).toBe(1)
      expect(cursor.textContent()).toContain("file1")
    })

    test("j from column header with mixed file/folder children", () => {
      using app = createTestApp(item.root("board", item("col-mixed", item.file("file-a"), item.folder("folder-b"))))

      app.command("cursor_up")
      app.command("cursor_up")
      app.command("cursor_down")
      app.command("cursor_down")

      const cursor = app.q("[data-cursor]")
      expect(cursor.count()).toBe(1)
      expect(cursor.textContent()).toContain("file-a")
    })

    test("j from column header with paragraph body content", () => {
      using app = createTestApp(item.root("board", item("col-body", item.p("para-1"), item.p("para-2"))))

      app.command("cursor_up")
      app.command("cursor_up")
      app.command("cursor_down")
      app.command("cursor_down")

      const cursor = app.q("[data-cursor]")
      expect(cursor.count()).toBe(1)
      expect(cursor.textContent()).toContain("para-1")
    })

    test("j from board level with body content lands on first body card", () => {
      using app = createTestApp(
        item.root(
          "board",
          item.p("intro text"),
          item("col1", item.file("file1"), item.file("file2")),
          item("col2", item("task1")),
        ),
      )

      app.command("cursor_up")
      app.command("cursor_down")

      const cursor = app.q("[data-cursor]")
      expect(cursor.count()).toBe(1)
      expect(cursor.textContent()).toContain("intro text")

      app.command("cursor_right")
      const cursor2 = app.q("[data-cursor]")
      expect(cursor2.textContent()).toContain("file1")
    })

    test("j from board level with code block before columns lands on code card", () => {
      using app = createTestApp(item.root("board", item.code("some code"), item("col1", item("task1"))))

      app.command("cursor_up")
      app.command("cursor_down")

      const cursor = app.q("[data-cursor]")
      expect(cursor.count()).toBe(1)
      expect(cursor.textContent()).toContain("some code")
    })

    test("j from board level with quote before columns lands on quote card", () => {
      using app = createTestApp(item.root("board", item.quote("a quote"), item("col1", item("task1"))))

      app.command("cursor_up")
      app.command("cursor_down")

      const cursor = app.q("[data-cursor]")
      expect(cursor.count()).toBe(1)
      expect(cursor.textContent()).toContain("a quote")
    })

    test("round-trip navigation preserves cursor for file children columns", () => {
      using app = createTestApp(
        item.root("board", item("col1", item.file("f1"), item.file("f2")), item("col2", item.file("f3"))),
      )

      app.command("cursor_down")
      expect(app.q("[data-cursor]").textContent()).toContain("f2")

      app.command("cursor_up")
      app.command("cursor_up")
      app.command("cursor_up")

      app.command("cursor_down")
      app.command("cursor_down")
      expect(app.q("[data-cursor]").textContent()).toContain("f1")
    })
  })
})

// =============================================================================
// Merged from cursor-signals.test.ts
// =============================================================================

describe("Merged from cursor-signals.test.ts", () => {
  // Navigation: cursor persists through all movement commands
  describe("cursor persistence through navigation", () => {
    test("j/k vertical navigation", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b"), item("1c"))), {
        incremental: false,
      })
      for (const key of ["j", "j", "j", "k", "k"]) {
        app.press(key)
        expect(app.state.cursor, "cursor must not be null").not.toBeNull()
      }
    })

    test("h/l horizontal navigation", () => {
      using app = createTestApp(
        item("board", item("col1", item("1a")), item("col2", item("2a")), item("col3", item("3a"))),
        { incremental: false },
      )
      for (const key of ["l", "l", "h", "h"]) {
        app.press(key)
        expect(app.state.cursor, "cursor must not be null").not.toBeNull()
      }
    })

    test("mixed j/k/h/l across 3 columns", () => {
      using app = createTestApp(
        item(
          "board",
          item("col1", item("1a"), item("1b"), item("1c")),
          item("col2", item("2a"), item("2b")),
          item("col3", item("3a")),
        ),
        { incremental: false },
      )
      for (const key of ["j", "j", "l", "j", "l", "k", "h", "h", "k", "k", "j", "j", "j"]) {
        app.press(key)
        expect(app.state.cursor, "cursor must not be null").not.toBeNull()
      }
    })

    test("boundary navigation (press past edges)", () => {
      using app = createTestApp(item("board", item("col1", item("1a"))), { incremental: false })
      for (const key of ["j", "j", "j", "j", "k", "k", "k", "k", "h", "h", "l", "l"]) {
        app.press(key)
        expect(app.state.cursor, "cursor must not be null").not.toBeNull()
      }
    })
  })

  // Fold/unfold: cursor stays on visible nodes
  describe("cursor persistence through fold/unfold", () => {
    test("fold hides children — cursor stays visible", () => {
      using app = createTestApp(item("board", item("col1", item("1a", item("sub1"), item("sub2")), item("1b"))), {
        incremental: false,
      })
      app.press("j")
      app.press("j")
      app.press("H")
      const c = app.state.cursor
      expect(c, "cursor must not be null").not.toBeNull()
      expect(c).not.toBe("sub1")
      expect(c).not.toBe("sub2")
    })

    test("fold then navigate — cursor valid", () => {
      using app = createTestApp(item("board", item("col1", item("1a", item("sub1")), item("1b"))), {
        incremental: false,
      })
      app.press("j")
      app.press("j")
      app.press("H")
      app.press("j")
      expect(app.state.cursor, "cursor must not be null").not.toBeNull()
      app.press("k")
      expect(app.state.cursor, "cursor must not be null").not.toBeNull()
    })
  })

  // Zoom: cursor valid through zoom in/out
  describe("cursor persistence through zoom", () => {
    test("zoom in + navigate", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b"), item("1c"))), {
        incremental: false,
      })
      app.press("j")
      app.command("zoom_inwards")
      for (const key of ["j", "j", "k"]) {
        app.press(key)
        expect(app.state.cursor, "cursor must not be null").not.toBeNull()
      }
    })

    test("zoom in then out", () => {
      using app = createTestApp(item("board", item("col1", item("1a")), item("col2", item("2a"))), {
        incremental: false,
      })
      app.press("j")
      app.command("zoom_inwards")
      app.press("j")
      expect(app.state.cursor, "cursor must not be null").not.toBeNull()
      app.command("zoom_outwards")
      expect(app.state.cursor, "cursor must not be null").not.toBeNull()
    })
  })

  // Hidden nodes: cursor skips them
  describe("cursor skips hidden nodes", () => {
    test("hidden column skipped during h/l navigation", () => {
      using app = createTestApp(
        item("board", item("col1", item("1a")), item("col2-hidden", item("2a")), item("col3", item("3a"))),
        { incremental: false },
      )
      app.withStore((s) => {
        const pane = s.workspace.panes.get("main") as any
        if (pane?.signals) pane.signals.hiddenNodeIds(new Set(["col2-hidden"]))
      })
      app.press("l")
      app.withStore((s) => {
        const c = s.sel.node.cursor() as string | null
        expect(c, "cursor must not be null").not.toBeNull()
        expect(c).not.toBe("col2-hidden")
        expect(c).not.toBe("2a")
      })
    })
  })

  // Characterization: cursor signal invariants after move
  describe("cursor signal invariants after move", () => {
    test("after j/k, cursor is on new node and not on old node", () => {
      using app = createTestApp(item("board", item("col1", item("1a"), item("1b"), item("1c"))), {
        incremental: false,
      })
      expect(app.state.cursor).toBe("1a")

      app.press("j")
      expect(app.state.cursor).toBe("1b")

      app.press("j")
      expect(app.state.cursor).toBe("1c")

      app.press("k")
      expect(app.state.cursor).toBe("1b")

      app.press("k")
      expect(app.state.cursor).toBe("1a")
    })

    test("cursorDescendant propagates — parent card visible when cursor is on child", () => {
      using app = createTestApp(
        item("board", item("col1", item.folder("Parent", item("child-a"), item("child-b")), item("sibling"))),
        { incremental: false },
      )
      expect(app.state.cursor, "cursor must not be null").not.toBeNull()

      app.press("j")
      app.press("j")
      app.press("j")

      expect(app.state.cursor, "cursor must not be null").not.toBeNull()

      app.expect("#Parent").toExist()
      expect(app.text).toContain("child-a")
    })

    test("cursor recovery when current node is deleted — moves to sibling", () => {
      using app = createTestApp(item("board", item("col1", item("task-a"), item("task-b"), item("task-c"))), {
        incremental: false,
      })
      app.press("j")
      expect(app.state.cursor).toBe("task-b")

      app.command("delete_node")

      const afterDelete = app.state.cursor
      expect(afterDelete, "cursor must not be null").not.toBeNull()
      expect(afterDelete).not.toBe("task-b")
      expect(["task-a", "task-c", "col1"]).toContain(afterDelete)

      const children = app.repo.getChildren("col1").map((n: { id: string }) => n.id)
      expect(children).not.toContain("task-b")
    })
  })
})

// =============================================================================
// Merged from virtual-nav.test.ts
// =============================================================================

describe("Merged from virtual-nav.test.ts", () => {
  // Structural column Y-position matching
  describe("spatial navigation: Y-position matching", () => {
    test("position registry is populated by layout notifications", () => {
      const { board, registry } = createDriverTest(
        () =>
          item(
            "board",
            item("ColA", item("A1"), item("A2"), item("A3")),
            item("ColB", item("B1"), item("B2"), item("B3")),
          ),
        { rows: 24, columns: 80 },
      )

      expect(registry.hasSection(0)).toBe(true)
      expect(registry.hasSection(1)).toBe(true)

      expect(registry.getItemCount(0)).toBe(3)
      expect(registry.getItemCount(1)).toBe(3)

      const a1Pos = registry.getPosition(0, 0)
      expect(a1Pos).toBeDefined()
      expect(a1Pos!.y).toBeGreaterThan(0)

      const a2Pos = registry.getPosition(0, 1)
      const a3Pos = registry.getPosition(0, 2)
      expect(a2Pos!.y).toBeGreaterThan(a1Pos!.y)
      expect(a3Pos!.y).toBeGreaterThan(a2Pos!.y)

      const b1Pos = registry.getPosition(1, 0)
      expect(b1Pos!.y).toBe(a1Pos!.y)

      void board
    })

    test("j then l: lands on Y-matched card, not first card", () => {
      const { board, registry } = createDriverTest(
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

      board.command("cursor_right")
      expect(registry.stickyY).not.toBeNull()

      const cursor = board.q("[data-cursor]").textContent()
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

      app.command("cursor_right")
      expect(app.q("[data-cursor]").textContent()).toContain("A1")

      app.command("cursor_down")
      app.command("cursor_down")
      app.command("cursor_down")
      expect(app.q("[data-cursor]").textContent()).toContain("A4")

      app.command("cursor_right")
      const cursor = app.q("[data-cursor]").textContent()
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

      app.command("cursor_right")
      app.command("cursor_down")
      app.command("cursor_down")
      expect(app.q("[data-cursor]").textContent()).toContain("B3")

      app.command("cursor_right")
      const cursor = app.q("[data-cursor]").textContent()
      expect(cursor).toContain("C3")
    })

    test("h preserves stickyY across multiple column hops", () => {
      const { board, registry } = createDriverTest(
        () =>
          item(
            "board",
            item("ColA", item("A1"), item("A2"), item("A3"), item("A4"), item("A5")),
            item("ColB", item("B1"), item("B2"), item("B3"), item("B4"), item("B5")),
            item("ColC", item("C1"), item("C2"), item("C3"), item("C4"), item("C5")),
          ),
        { rows: 24, columns: 120 },
      )

      board.command("cursor_down").command("cursor_down").command("cursor_down")
      expect(board.q("[data-cursor]").textContent()).toContain("A4")

      board.command("cursor_right")
      expect(board.q("[data-cursor]").textContent()).toContain("B4")

      board.command("cursor_right")
      expect(board.q("[data-cursor]").textContent()).toContain("C4")

      board.command("cursor_left")
      expect(board.q("[data-cursor]").textContent()).toContain("B4")

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

      for (let i = 0; i < 7; i++) app.command("cursor_down")
      expect(app.q("[data-cursor]").textContent()).toContain("A8")

      app.command("cursor_right")
      const cursor = app.q("[data-cursor]").textContent()
      expect(cursor).toContain("B3")
    })

    test("stickyY is cleared by vertical navigation (j/k)", () => {
      const { board, registry } = createDriverTest(
        () =>
          item(
            "board",
            item("ColA", item("A1"), item("A2"), item("A3")),
            item("ColB", item("B1"), item("B2"), item("B3")),
          ),
        { rows: 24, columns: 80 },
      )

      board.command("cursor_down").command("cursor_down")
      board.command("cursor_right")
      expect(registry.stickyY).not.toBeNull()

      board.command("cursor_up")
      expect(registry.stickyY).toBeNull()
    })

    test("h from first column goes to header then rings bell, l from last column rings bell", () => {
      using app = createTestApp(item("board", item("ColA", item("A1")), item("ColB", item("B1"))), {
        rows: 24,
        cols: 80,
      })

      app.command("cursor_left")
      expect(app.bell).toBe(false)
      app.expect("#ColA[data-cursor]").toExist()

      app.command("cursor_left")
      expect(app.bell).toBe(true)

      app.command("cursor_down")
      app.command("cursor_right")
      expect(app.q("[data-cursor]").textContent()).toContain("B1")

      app.command("cursor_right")
      expect(app.bell).toBe(true)
    })
  })

  // Virtual body column Y-position matching (km-tui.vbody-nav)
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

      app.command("cursor_down")
      app.command("cursor_down")
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
      app.command("cursor_right")
      app.command("cursor_right")
      app.command("cursor_down")
      app.command("cursor_down")
      app.expect("#b3[data-cursor]").toExist()

      app.command("cursor_left")
      const col1Target = app.q("[data-cursor]").getAttribute("id")
      expect(col1Target).toMatch(/^a/)

      app.command("cursor_left")
      const bodyTarget = app.q("[data-cursor]").getAttribute("id")
      expect(bodyTarget).toMatch(/^bp/)
    })

    test("h from scrolled structural column to unscrolled body: Y-mismatch from scroll offset", () => {
      const bodyCards = Array.from({ length: 10 }, (_, i) => item.p(`bp-${i + 1}`))
      const structCards = Array.from({ length: 10 }, (_, i) => item(`t-${i + 1}`))

      using app = createTestApp(item("board", ...bodyCards, item("col1", ...structCards)), {
        rows: 12,
        cols: 80,
      })

      app.expect("#bp-1[data-cursor]").toExist()

      app.command("cursor_right")
      expect(app.q("[data-cursor]").getAttribute("id")).toBe("t-1")

      app.command("cursor_down")
      app.command("cursor_down")
      app.command("cursor_down")
      app.command("cursor_down")
      app.expect("#t-5[data-cursor]").toExist()

      app.command("cursor_left")
      const bodyTarget = app.q("[data-cursor]").getAttribute("id")
      expect(bodyTarget).toMatch(/^bp-/)
      const bodyIdx = parseInt(bodyTarget!.replace("bp-", ""))
      expect(bodyIdx, `expected body card ~5, got ${bodyIdx}`).toBeGreaterThanOrEqual(4)
      expect(bodyIdx).toBeLessThanOrEqual(6)
    })

    test("scrolled structural col with unscrolled body: h should not overshoot", () => {
      const bodyCards = Array.from({ length: 3 }, (_, i) => item.p(`bp-${i + 1}`))
      const structCards = Array.from({ length: 30 }, (_, i) => item(`t-${i + 1}`))

      using app = createTestApp(item("board", ...bodyCards, item("col1", ...structCards)), {
        rows: 15,
        cols: 80,
      })

      app.expect("#bp-1[data-cursor]").toExist()

      app.command("cursor_right")
      for (let i = 0; i < 10; i++) app.command("cursor_down")
      const structId = app.q("[data-cursor]").getAttribute("id")
      expect(structId).toMatch(/^t-/)

      app.command("cursor_left")
      const bodyTarget = app.q("[data-cursor]").getAttribute("id")
      expect(bodyTarget).toMatch(/^bp-/)

      expect(["bp-1", "bp-2", "bp-3"]).toContain(bodyTarget)
    })
  })
})
