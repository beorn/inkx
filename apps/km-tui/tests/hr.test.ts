/**
 * HR node tests: borderless rendering, content-based detection, visual display, and editing.
 *
 * HR nodes (type: "hr" from markdown thematic breaks, or items with content
 * matching ---, ***, ___) render as centered content between horizontal line
 * padding. Unselected HR cards use padding (no border) for layout stability.
 * Selected HR cards get a yellow round border. HR cards in edit mode fall
 * through to normal body block rendering with a round border.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { TC } from "./helpers/theme.ts"
import type { KNode } from "@km/core"
import { stripAnsi } from "@silvery/ag-react"

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
    symlink_to: null,
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
  test("HR card renders with padding (no border) when unselected", () => {
    const { board } = testEnv(() => item("board", item("col", item("task1"), item.hr("my-hr"), item("task2"))))

    // HR should have padding (no border) when unselected
    board.expectNodeNoBorder("my-hr")
  })

  test("selected body card has border, unselected neighbor has dim border", () => {
    const { board } = testEnv(() => item("board", item("col", item("task1"), item.hr("my-hr"), item("task2"))))
    // task1 is selected — should have a border
    board.expectNodeBorder("task1")
    // task2 is unselected — should have dim border
    board.expectNodeBorder("task2")
  })

  test("HR renders centered content (---) within card width", () => {
    const { board } = testEnv(() => item("board", item("col", item.hr("my-hr"))))
    // Use nodeBox to find the HR's actual position
    const hrBox = board.screen.nodeBox("my-hr")
    expect(hrBox, "HR node should be visible").not.toBeNull()
    if (hrBox) {
      // HR content "---" is centered with spaces — find it in the row
      let rowText = ""
      for (let x = hrBox.x; x < hrBox.x + hrBox.width; x++) {
        rowText += board.screen.cell(x, hrBox.y).char
      }
      expect(rowText).toContain("---")
    }
  })

  test("selected HR is yellow", () => {
    const { board } = testEnv(() => item("board", item("col", item.hr("my-hr"))))
    // HR should be selected by default (first card)
    const hrBox = board.screen.nodeBox("my-hr")
    expect(hrBox, "HR node should be visible").not.toBeNull()
    if (hrBox) {
      // Find the "---" content within the centered row
      let dashX = -1
      for (let x = hrBox.x; x < hrBox.x + hrBox.width; x++) {
        if (board.screen.cell(x, hrBox.y).char === "-") {
          dashX = x
          break
        }
      }
      expect(dashX, "HR should contain dash characters").toBeGreaterThanOrEqual(0)
      const cell = board.screen.cell(dashX, hrBox.y)
      // Should be $selected when selected
      expect(cell.fg, "selected HR should be $selected").toBe(TC.$selected)
      expect(cell.attrs.dim, "selected HR should not be dim").toBeFalsy()
    }
  })

  test("unselected HR is dimmed", () => {
    const { board } = testEnv(() => item("board", item("col", item("task1"), item.hr("my-hr"))))
    // task1 is selected by default, HR is not selected
    const hrBox = board.screen.nodeBox("my-hr")
    expect(hrBox, "HR node should be visible").not.toBeNull()
    if (hrBox) {
      // Find the "---" content within the centered row
      let dashX = -1
      for (let x = hrBox.x; x < hrBox.x + hrBox.width; x++) {
        if (board.screen.cell(x, hrBox.y).char === "-") {
          dashX = x
          break
        }
      }
      expect(dashX, "HR should contain dash characters").toBeGreaterThanOrEqual(0)
      const cell = board.screen.cell(dashX, hrBox.y)
      expect(cell.attrs.dim, "unselected HR should be dim").toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// Content-based detection
// ---------------------------------------------------------------------------

describe("HR content-based detection", () => {
  const hrContents = ["---", "***", "___", "-----"] as const

  for (const content of hrContents) {
    test(`HR content '${content}' renders as line with no border when unselected`, () => {
      const { board } = testEnv(() => item("board", item("Col", hrWithContent("hr-node", content), item("other"))), {
        columns: 60,
        rows: 20,
      })
      board.expectScreen("─")
      board.command("cursor_down")
      // After moving cursor away, HR is unselected — uses padding, no border
      board.expectNodeNoBorder("hr-node")
    })
  }

  test("standard HR (type=hr, no content) renders as line with no border when unselected", () => {
    const { board } = testEnv(() => item("board", item("Col", item.hr("my-hr"), item("other"))), {
      columns: 60,
      rows: 20,
    })
    board.expectScreen("─")
    board.command("cursor_down")
    // After moving cursor away, HR is unselected — uses padding, no border
    board.expectNodeNoBorder("my-hr")
  })

  const nonHrContents = [
    { content: "---f", label: "modified HR" },
    { content: "--- some text", label: "HR with trailing text" },
  ] as const

  for (const { content, label } of nonHrContents) {
    test(`${label} '${content}' does not render as HR line`, () => {
      const { board } = testEnv(() => item("board", item("Col", hrWithContent("edited-hr", content), item("other"))), {
        columns: 60,
        rows: 20,
      })
      const text = stripAnsi(board.screenshot())
      expect(text).toContain(content)
      board.expectNodeBorder("edited-hr")
    })
  }
})

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

describe("HR display", () => {
  test("HR node (type=hr) renders with centered content and ─ padding", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("task-above"), item.hr("my-hr-node"), item("task-below"))),
      { columns: 60, rows: 20 },
    )

    const text = stripAnsi(board.screenshot())
    // The HR should have ─ padding and show default content (---)
    expect(text).toContain("─")
    expect(text).toContain("---")
    // Normal items should also be visible
    expect(text).toContain("task-above")
    expect(text).toContain("task-below")
    // HR should NOT show its node ID
    expect(text).not.toContain("my-hr-node")
  })

  test("item with content '---' renders showing its content", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task-above"), item("---"), item("task-below"))), {
      columns: 60,
      rows: 20,
    })

    const text = stripAnsi(board.screenshot())
    // Should show the raw HR content
    expect(text).toContain("---")
  })

  test("HR line is muted when cursor is NOT on it", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("task-above"), item.hr("hr-node"), item("task-below"))),
      { columns: 60, rows: 20 },
    )

    // Cursor starts on task-above, HR should not be highlighted
    // HR content "---" is rendered with default text color (not selected)
    const hrBox = board.screen.nodeBox("hr-node")
    expect(hrBox, "HR node should be visible").not.toBeNull()
    if (hrBox) {
      let dashX = -1
      for (let x = hrBox.x; x < hrBox.x + hrBox.width; x++) {
        if (board.screen.cell(x, hrBox.y).char === "-") {
          dashX = x
          break
        }
      }
      expect(dashX, "HR should contain dash characters").toBeGreaterThanOrEqual(0)
      const cell = board.screen.cell(dashX, hrBox.y)
      // Not selected: should NOT have $selected foreground
      expect(cell.fg, "non-selected HR should not be $selected").not.toBe(TC.$selected)
    }
  })

  test("HR card gets selection styling when cursor IS on it", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("task-above"), item.hr("hr-node"), item("task-below"))),
      { columns: 60, rows: 20 },
    )

    // Move cursor down to the HR node
    board.command("cursor_down")

    // The cursor should be on the HR node
    board.expect("#hr-node[data-cursor]").toExist()

    // The HR node has ─ characters visible in the output
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("─")
  })

  test("non-HR content like '---foo' does NOT trigger HR rendering", () => {
    const { board } = testEnv(() => item("board", item("col1", item("---foo"))), { columns: 60, rows: 20 })

    const text = stripAnsi(board.screenshot())
    // Should show the literal content
    expect(text).toContain("---foo")
  })

  test("item with content '***' renders showing its content", () => {
    const { board } = testEnv(() => item("board", item("col1", item("***"))), { columns: 60, rows: 20 })

    const text = stripAnsi(board.screenshot())
    expect(text).toContain("***")
  })

  test("item with content '___' renders showing its content", () => {
    const { board } = testEnv(() => item("board", item("col1", item("___"))), { columns: 60, rows: 20 })

    const text = stripAnsi(board.screenshot())
    expect(text).toContain("___")
  })

  test("pressing Enter on HR enters edit mode showing raw content", () => {
    const { board } = testEnv(() => item("board", item("col1", item.hr("my-hr"), item("task-below"))), {
      columns: 60,
      rows: 20,
    })

    // Cursor starts on HR (first card in column)
    board.expect("#my-hr[data-cursor]").toExist()

    // HR initially renders as horizontal line
    let text = stripAnsi(board.screenshot())
    expect(text).toContain("─")

    // Press Enter to edit — should enter edit mode
    board.press("Enter")

    // Should NOT ring the bell (editing is allowed)
    expect(board.bell).toBe(false)

    // After Escape, HR should render as horizontal line again
    board.press("Escape")
    text = stripAnsi(board.screenshot())
    expect(text).toContain("─")
  })

  test("HR edit mode: Escape returns to line rendering", () => {
    const { board } = testEnv(
      () => item("board", item("col1", item("task-above"), item.hr("my-hr"), item("task-below"))),
      { columns: 60, rows: 20 },
    )

    // Move to HR
    board.command("cursor_down")
    board.expect("#my-hr[data-cursor]").toExist()

    // Enter edit mode
    board.press("Enter")

    // Escape back
    board.press("Escape")

    // Should be back on the HR with line rendering
    board.expect("#my-hr[data-cursor]").toExist()
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("─")
  })
})

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

describe("HR editing", () => {
  test("Enter on HR node enters edit mode and accepts keyboard input", () => {
    const { board } = testEnv(() => item("board", item("col1", item.hr("my-hr"), item("task-below"))), {
      columns: 60,
      rows: 20,
    })

    // Cursor starts on the HR node
    board.expect("#my-hr[data-cursor]").toExist()

    // Press Enter to enter edit mode
    board.press("Enter")

    // Should not ring the bell (editing is allowed)
    expect(board.bell).toBe(false)

    // HR should now be in edit mode — typing should work
    board.press("h")
    board.press("e")
    board.press("l")
    board.press("l")
    board.press("o")

    // The typed text should be visible on screen
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("hello")
  })

  test("Enter on HR opens edit with '---' as initial content", () => {
    const { board } = testEnv(() => item("board", item("col1", item.hr("my-hr"), item("task-below"))), {
      columns: 60,
      rows: 20,
    })

    board.expect("#my-hr[data-cursor]").toExist()
    board.press("Enter")

    // The edit field should show '---' (the default HR content)
    const text = stripAnsi(board.screenshot())
    expect(text).toContain("---")
  })

  test("Escape after entering edit on HR saves and returns to HR display", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item.hr("my-hr"), item("task-below"))), {
      columns: 60,
      rows: 20,
    })

    board.expect("#my-hr[data-cursor]").toExist()

    // Enter edit mode
    board.press("Enter")

    // The edit field should show "---"
    const editText = stripAnsi(board.screenshot())
    expect(editText).toContain("---")

    // Escape saves and exits (Escape = save, not cancel)
    board.press("Escape")

    // Content should be saved as "---" (HR's display text)
    expect(repo.getNode("my-hr")?.content).toBe("---")

    // HR should still render correctly
    const text = stripAnsi(board.screenshot())
    // After saving "---", the node has content so it renders as text, not HR line
    expect(text).toContain("---")
  })

  test("j/k navigation still works after Enter then Escape on HR", () => {
    const { board } = testEnv(() => item("board", item("col1", item.hr("my-hr"), item("task-below"))), {
      columns: 60,
      rows: 20,
    })

    board.expect("#my-hr[data-cursor]").toExist()

    // Enter then Escape (round-trip)
    board.press("Enter")
    board.press("Escape")

    // Cursor should be back on HR
    board.expect("#my-hr[data-cursor]").toExist()

    // j should navigate to the next card
    board.command("cursor_down")
    board.expect("#task-below[data-cursor]").toExist()
  })

  test("HR renders as bordered card during edit mode", () => {
    const { board } = testEnv(() => item("board", item("col1", item.hr("my-hr"), item("task-below"))), {
      columns: 60,
      rows: 20,
    })

    // Move cursor away — unselected HR uses padding, no border
    board.command("cursor_down")
    board.expectNodeNoBorder("my-hr")

    // Move back and enter edit mode
    board.command("cursor_up")
    board.press("Enter")

    // During edit: HR should show as bordered card (round border)
    board.expectNodeBorder("my-hr")
  })

  test("HR edit mode: no colored background fills the row", () => {
    const { board } = testEnv(() => item("board", item("col1", item.hr("my-hr"), item("task-below"))), {
      columns: 40,
      rows: 12,
    })

    board.press("Enter") // Enter edit mode

    // Check that the edit row doesn't have a colored background flooding the card.
    // The cursor should be a single inverse cell, not a row-wide colored fill.
    const screen = board.screen
    const hrNode = board.q("#my-hr")
    const box = hrNode.boundingBox()
    expect(box).not.toBeNull()

    if (box) {
      // Check cells on the edit row (first row inside the border = box.y)
      // After the "---" text + cursor, remaining cells should have no background color
      let coloredCells = 0
      let inverseCells = 0
      for (let x = box.x; x < box.x + box.width; x++) {
        const cell = screen.cell(x, box.y)
        if (cell && cell.bg && cell.bg !== 0) {
          coloredCells++
        }
        if ((cell.attrs as Record<string, unknown>)?.inverse) {
          inverseCells++
        }
      }
      // Allow a few cells for the cursor (inverse) and prefix, but not the whole row
      expect(coloredCells).toBeLessThan(box.width / 2)
      // Only the cursor char should be inverse, not the whole row
      expect(inverseCells, "only cursor char inverse").toBeLessThanOrEqual(1)
    }
  })
})
