/**
 * HR node tests: borderless rendering, content-based detection, visual display, and editing.
 *
 * HR nodes (type: "hr" from markdown thematic breaks, or items with content
 * matching ---, ***, ___) render as centered content between horizontal line
 * padding. Body blocks (HR, prose, virtual cards) are flat — no border, no
 * outline, no per-block bg. Selection signaling comes from the column-level
 * tint and the cursor inverse row in TreeNode. HR edit mode also stays
 * borderless and routes through the normal body block path.
 */

import { describe, test, expect } from "vitest"
import { createDriverTest, item } from "./helpers/board-test.ts"
import { createTestApp, type CellInfo } from "./helpers/test-app.ts"
import { TC } from "./helpers/theme.ts"
import type { KNode } from "@km/core"

/** Deep-compare cell bg/fg (RGB objects) to a TC constant */
function colorEquals(a: CellInfo["fg"], b: { r: number; g: number; b: number }): boolean {
  if (a === null || a === undefined || typeof a === "number") return false
  return (
    typeof a === "object" &&
    (a as { r: number; g: number; b: number }).r === b.r &&
    (a as { r: number; g: number; b: number }).g === b.g &&
    (a as { r: number; g: number; b: number }).b === b.b
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an HR-typed node with custom content (simulates edited HR) */
function hrWithContent(id: string, content: string): KNode[] {
  const node: KNode = {
    id,
    type: "hr",
    content,
    data: {},
    parent_id: null,
    parent_idx: 0,
    embed_of: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
  }
  return [node]
}

// ---------------------------------------------------------------------------
// Borderless rendering
// ---------------------------------------------------------------------------

describe("HR borderless rendering", () => {
  // FREEZE: needs expectNodeNoBorder (not on createTestApp)
  test("HR card renders with padding (no border) when unselected", () => {
    const { board } = createDriverTest(() => item("board", item("col", item("task1"), item.hr("my-hr"), item("task2"))))
    board.expectNodeNoBorder("my-hr")
  })

  test("body cards around an HR render without borders", () => {
    const { board } = createDriverTest(() => item("board", item("col", item("task1"), item.hr("my-hr"), item("task2"))))
    // Body cards (task1/task2) are flat prose — no border, ever.
    board.expectNodeNoBorder("task1")
    board.expectNodeNoBorder("task2")
  })

  test("HR renders centered content (---) within card width", () => {
    using app = createTestApp(item("board", item("col", item.hr("my-hr"))))
    const hrBox = app.screen.nodeBox("my-hr")
    expect(hrBox, "HR node should be visible").not.toBeNull()
    if (hrBox) {
      let rowText = ""
      for (let x = hrBox.x; x < hrBox.x + hrBox.width; x++) {
        rowText += app.screen.cell(x, hrBox.y).char
      }
      expect(rowText).toContain("---")
    }
  })

  test("selected HR is yellow", () => {
    using app = createTestApp(item("board", item("col", item.hr("my-hr"))))
    const hrBox = app.screen.nodeBox("my-hr")
    expect(hrBox, "HR node should be visible").not.toBeNull()
    if (hrBox) {
      let dashX = -1
      for (let x = hrBox.x; x < hrBox.x + hrBox.width; x++) {
        if (app.screen.cell(x, hrBox.y).char === "-") {
          dashX = x
          break
        }
      }
      expect(dashX, "HR should contain dash characters").toBeGreaterThanOrEqual(0)
      const cell = app.screen.cell(dashX, hrBox.y)
      expect(colorEquals(cell.fg, TC.$selected), "selected HR should be $selected").toBe(true)
      expect(cell.dim, "selected HR should not be dim").toBeFalsy()
    }
  })

  test("unselected HR is muted", () => {
    using app = createTestApp(item("board", item("col", item("task1"), item.hr("my-hr"))))
    const hrBox = app.screen.nodeBox("my-hr")
    expect(hrBox, "HR node should be visible").not.toBeNull()
    if (hrBox) {
      let dashX = -1
      for (let x = hrBox.x; x < hrBox.x + hrBox.width; x++) {
        if (app.screen.cell(x, hrBox.y).char === "-") {
          dashX = x
          break
        }
      }
      expect(dashX, "HR should contain dash characters").toBeGreaterThanOrEqual(0)
      const cell = app.screen.cell(dashX, hrBox.y)
      // $fg-muted replaces deprecated dim attribute — same visual intent,
      // resolves to pre-dimmed hex at truecolor. Tracking: km-silvery.delete-dim-dimcolor.
      expect(colorEquals(cell.fg, TC["$fg-muted"]), "unselected HR should be $fg-muted").toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Content-based detection
// ---------------------------------------------------------------------------

describe("HR content-based detection", () => {
  const hrContents = ["---", "***", "___", "-----"] as const

  // FREEZE: needs expectNodeNoBorder (not on createTestApp)
  for (const content of hrContents) {
    test(`HR content '${content}' renders as line with no border when unselected`, () => {
      const { board } = createDriverTest(
        () => item("board", item("Col", hrWithContent("hr-node", content), item("other"))),
        {
          columns: 60,
          rows: 20,
        },
      )
      board.expectScreen("─")
      board.command("cursor_down")
      board.expectNodeNoBorder("hr-node")
    })
  }

  // FREEZE: needs expectNodeNoBorder (not on createTestApp)
  test("standard HR (type=hr, no content) renders as line with no border when unselected", () => {
    const { board } = createDriverTest(() => item("board", item("Col", item.hr("my-hr"), item("other"))), {
      columns: 60,
      rows: 20,
    })
    board.expectScreen("─")
    board.command("cursor_down")
    board.expectNodeNoBorder("my-hr")
  })

  const nonHrContents = [
    { content: "---f", label: "modified HR" },
    { content: "--- some text", label: "HR with trailing text" },
  ] as const

  for (const { content, label } of nonHrContents) {
    test(`${label} '${content}' does not render as HR line`, () => {
      using app = createTestApp(item("board", item("Col", hrWithContent("edited-hr", content), item("other"))), {
        cols: 60,
        rows: 20,
      })
      // The literal content is rendered (no HR substitution) — body card stays
      // borderless, so we only assert the text shows up verbatim.
      expect(app.text).toContain(content)
    })
  }
})

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

describe("HR display", () => {
  test("HR node (type=hr) renders with centered content and ─ padding", () => {
    using app = createTestApp(
      item("board", item("col1", item("task-above"), item.hr("my-hr-node"), item("task-below"))),
      { cols: 60, rows: 20 },
    )

    expect(app.text).toContain("─")
    expect(app.text).toContain("---")
    expect(app.text).toContain("task-above")
    expect(app.text).toContain("task-below")
    expect(app.text).not.toContain("my-hr-node")
  })

  test("item with content '---' renders showing its content", () => {
    using app = createTestApp(item("board", item("col1", item("task-above"), item("---"), item("task-below"))), {
      cols: 60,
      rows: 20,
    })

    expect(app.text).toContain("---")
  })

  test("HR line is muted when cursor is NOT on it", () => {
    using app = createTestApp(item("board", item("col1", item("task-above"), item.hr("hr-node"), item("task-below"))), {
      cols: 60,
      rows: 20,
    })

    const hrBox = app.screen.nodeBox("hr-node")
    expect(hrBox, "HR node should be visible").not.toBeNull()
    if (hrBox) {
      let dashX = -1
      for (let x = hrBox.x; x < hrBox.x + hrBox.width; x++) {
        if (app.screen.cell(x, hrBox.y).char === "-") {
          dashX = x
          break
        }
      }
      expect(dashX, "HR should contain dash characters").toBeGreaterThanOrEqual(0)
      const cell = app.screen.cell(dashX, hrBox.y)
      expect(colorEquals(cell.fg, TC.$selected), "non-selected HR should not be $selected").toBe(false)
    }
  })

  test("HR card gets selection styling when cursor IS on it", () => {
    using app = createTestApp(item("board", item("col1", item("task-above"), item.hr("hr-node"), item("task-below"))), {
      cols: 60,
      rows: 20,
    })

    app.command("cursor_down")
    app.expect("#hr-node[data-cursor]").toExist()
    expect(app.text).toContain("─")
  })

  test("non-HR content like '---foo' does NOT trigger HR rendering", () => {
    using app = createTestApp(item("board", item("col1", item("---foo"))), { cols: 60, rows: 20 })
    expect(app.text).toContain("---foo")
  })

  test("item with content '***' renders showing its content", () => {
    using app = createTestApp(item("board", item("col1", item("***"))), { cols: 60, rows: 20 })
    expect(app.text).toContain("***")
  })

  test("item with content '___' renders showing its content", () => {
    using app = createTestApp(item("board", item("col1", item("___"))), { cols: 60, rows: 20 })
    expect(app.text).toContain("___")
  })

  test("pressing Enter on HR enters edit mode showing raw content", () => {
    using app = createTestApp(item("board", item("col1", item.hr("my-hr"), item("task-below"))), {
      cols: 60,
      rows: 20,
    })

    app.expect("#my-hr[data-cursor]").toExist()
    expect(app.text).toContain("─")

    app.press("Enter")
    expect(app.bell).toBe(false)

    app.press("Escape")
    expect(app.text).toContain("─")
  })

  test("HR edit mode: Escape returns to line rendering", () => {
    using app = createTestApp(item("board", item("col1", item("task-above"), item.hr("my-hr"), item("task-below"))), {
      cols: 60,
      rows: 20,
    })

    app.command("cursor_down")
    app.expect("#my-hr[data-cursor]").toExist()

    app.press("Enter")
    app.press("Escape")

    app.expect("#my-hr[data-cursor]").toExist()
    expect(app.text).toContain("─")
  })
})

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

describe("HR editing", () => {
  test("Enter on HR node enters edit mode and accepts keyboard input", () => {
    using app = createTestApp(item("board", item("col1", item.hr("my-hr"), item("task-below"))), {
      cols: 60,
      rows: 20,
    })

    app.expect("#my-hr[data-cursor]").toExist()
    app.press("Enter")
    expect(app.bell).toBe(false)

    app.press("h")
    app.press("e")
    app.press("l")
    app.press("l")
    app.press("o")

    expect(app.text).toContain("hello")
  })

  test("Enter on HR opens edit with '---' as initial content", () => {
    using app = createTestApp(item("board", item("col1", item.hr("my-hr"), item("task-below"))), {
      cols: 60,
      rows: 20,
    })

    app.expect("#my-hr[data-cursor]").toExist()
    app.press("Enter")

    expect(app.text).toContain("---")
  })

  test("Escape after entering edit on HR saves and returns to HR display", () => {
    using app = createTestApp(item("board", item("col1", item.hr("my-hr"), item("task-below"))), {
      cols: 60,
      rows: 20,
    })

    app.expect("#my-hr[data-cursor]").toExist()

    app.press("Enter")
    expect(app.text).toContain("---")

    app.press("Escape")

    expect(app.repo.getNode("my-hr")?.content).toBe("---")
    expect(app.text).toContain("---")
  })

  test("j/k navigation still works after Enter then Escape on HR", () => {
    using app = createTestApp(item("board", item("col1", item.hr("my-hr"), item("task-below"))), {
      cols: 60,
      rows: 20,
    })

    app.expect("#my-hr[data-cursor]").toExist()

    app.press("Enter")
    app.press("Escape")

    app.expect("#my-hr[data-cursor]").toExist()

    app.command("cursor_down")
    app.expect("#task-below[data-cursor]").toExist()
  })

  // FREEZE: needs expectNodeNoBorder (not on createTestApp)
  test("HR remains borderless in edit mode (flat body block)", () => {
    const { board } = createDriverTest(() => item("board", item("col1", item.hr("my-hr"), item("task-below"))), {
      columns: 60,
      rows: 20,
    })

    board.command("cursor_down")
    board.expectNodeNoBorder("my-hr")

    board.command("cursor_up")
    board.press("Enter")

    // Body blocks (HR included) stay flat in edit mode — no border.
    board.expectNodeNoBorder("my-hr")
  })

  test("HR edit mode: no colored background fills the row", () => {
    using app = createTestApp(item("board", item("col1", item.hr("my-hr"), item("task-below"))), {
      cols: 40,
      rows: 12,
    })

    app.press("Enter")

    const hrNode = app.q("#my-hr")
    const box = hrNode.boundingBox()
    expect(box).not.toBeNull()

    if (box) {
      let coloredCells = 0
      let inverseCells = 0
      for (let x = box.x; x < box.x + box.width; x++) {
        const cell = app.screen.cell(x, box.y)
        if (cell && cell.bg && cell.bg !== 0) {
          coloredCells++
        }
        if (cell.inverse) {
          inverseCells++
        }
      }
      expect(coloredCells).toBeLessThan(box.width / 2)
      expect(inverseCells, "only cursor char inverse").toBeLessThanOrEqual(1)
    }
  })
})
