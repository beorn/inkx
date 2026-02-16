/**
 * Fold Count Color Bug Reproduction & Fix
 *
 * Bug: When outline depth changes, the child count color of a node
 * changes inconsistently. At one depth the count is dim+gray (nearly
 * invisible), at another it's bold+white (very prominent).
 *
 * Fix: The count is now always gray, never dimmed, never bold.
 * Bold gray renders as bright/white on real terminals (ANSI bold brightens
 * colors), so bold must be avoided for consistent color.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

/**
 * Find the child count cell on a given row.
 * Looks for a number preceded by whitespace near the end of the row.
 */
function findCountCell(
  board: ReturnType<typeof testEnv>["board"],
  row: number,
): { x: number; y: number; char: string; fg: unknown; bg: unknown; attrs: Record<string, unknown> } | null {
  const rowText = board.screen.row(row)
  // The count is at the right end of content area, before any border char
  const match = rowText.match(/\s(\d+)\s*[│]?\s*$/)
  if (match?.index === undefined) return null
  const countX = match.index + 1 // skip leading space
  const cell = board.screen.cell(countX, row)
  return { x: countX, y: row, char: cell.char, fg: cell.fg, bg: cell.bg, attrs: cell.attrs as Record<string, unknown> }
}

describe("fold count color", () => {
  describe("nested node with children (depth 1)", () => {
    function createBoard() {
      return testEnv(
        () =>
          item(
            "board",
            item(
              "col1",
              item(
                "parent-card",
                item("Essential Commands", item("cmd1"), item("cmd2"), item("cmd3")),
              ),
            ),
          ),
        { columns: 80, rows: 24 },
      )
    }

    test("count is gray, not dim, when children visible (outline depth 2)", () => {
      const { board } = createBoard()

      // At default outline depth 2: Essential Commands at depth 1
      // depth(1) < 2 => children visible
      const ecRow = board.screen.findRow("Essential Commands")
      expect(ecRow, "Essential Commands row").toBeGreaterThanOrEqual(0)

      const countCell = findCountCell(board, ecRow)
      expect(countCell, "count cell found").not.toBeNull()
      expect(countCell!.char).toBe("3")

      // Count should be gray (fg=8), NOT dim, NOT bold
      expect(countCell!.fg, "fg=8 (gray)").toBe(8)
      expect(countCell!.attrs.dim, "not dim").toBeFalsy()
      expect(countCell!.attrs.bold, "not bold when children visible").toBeFalsy()
    })

    test("count is gray, not bold, when children hidden (outline depth 1)", () => {
      const { board } = createBoard()
      board.press("<") // decrease to depth 1

      // At outline depth 1: Essential Commands at depth 1
      // depth(1) < 1 is FALSE => children hidden
      const ecRow = board.screen.findRow("Essential Commands")
      expect(ecRow, "Essential Commands row").toBeGreaterThanOrEqual(0)

      const countCell = findCountCell(board, ecRow)
      expect(countCell, "count cell found").not.toBeNull()
      expect(countCell!.char).toBe("3")

      // Count should be gray (fg=8), NOT dim, NOT bold (bold gray = white)
      expect(countCell!.fg, "fg=8 (gray)").toBe(8)
      expect(countCell!.attrs.dim, "not dim").toBeFalsy()
      expect(countCell!.attrs.bold, "not bold (bold gray = white)").toBeFalsy()
    })

    test("count is never dimmed regardless of outline depth", () => {
      const { board } = createBoard()

      // Depth 2: children visible
      const ecRow2 = board.screen.findRow("Essential Commands")
      const cell2 = findCountCell(board, ecRow2)
      expect(cell2).not.toBeNull()

      // Depth 1: children hidden
      board.press("<")
      const ecRow1 = board.screen.findRow("Essential Commands")
      const cell1 = findCountCell(board, ecRow1)
      expect(cell1).not.toBeNull()

      // Neither state should be dimmed
      expect(cell1!.attrs.dim, "not dim at depth 1").toBeFalsy()
      expect(cell2!.attrs.dim, "not dim at depth 2").toBeFalsy()

      // Both should have gray fg
      expect(cell1!.fg, "gray at depth 1").toBe(8)
      expect(cell2!.fg, "gray at depth 2").toBe(8)

      // Never bold (bold gray = bright white on terminals)
      expect(cell1!.attrs.bold, "not bold at depth 1").toBeFalsy()
      expect(cell2!.attrs.bold, "not bold at depth 2").toBeFalsy()
    })
  })

  describe("column header count with ownColor", () => {
    function createColorBoard() {
      // Two columns: col-colored (cyan) and col-other.
      // Navigate cursor to col-other so col-colored is unselected.
      const nodes = item(
        "board",
        item("col-colored", item("c1"), item("c2"), item("c3")),
        item("col-other", item("other-task")),
      )
      // Set color on the column node
      nodes.find((n) => n.id === "col-colored")!.rules = { color: "cyan" } as any
      return testEnv(() => nodes, { columns: 80, rows: 24 })
    }

    test("column header count is gray, not ownColor, when column unselected", () => {
      const { board } = createColorBoard()

      // Move cursor to col-other so col-colored is unselected
      board.press("l")

      // Find the header row containing "col-colored"
      const headerRow = board.screen.findRow("col-colored")
      expect(headerRow, "header row found").toBeGreaterThanOrEqual(0)

      // Find the "3" count in the first column (left half of screen).
      // With 80 cols and 2 columns, col-colored is in the first ~40 chars.
      const rowText = board.screen.row(headerRow)
      const halfWidth = Math.floor(80 / 2)
      const leftHalf = rowText.slice(0, halfWidth)
      const countMatch = leftHalf.match(/(\d+)\s*$/)
      expect(countMatch, "count digit found in col-colored header").not.toBeNull()
      const countX = countMatch!.index!

      const cell = board.screen.cell(countX, headerRow)
      expect(cell.char).toBe("3")

      // Count should be gray (fg=8), not cyan (ownColor)
      expect(cell.fg, "fg=8 (gray), not ownColor").toBe(8)
      expect(cell.attrs.dim, "not dim").toBeFalsy()
    })
  })
})
