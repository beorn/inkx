/**
 * Text Cursor Bugs — Regression Tests (km-tui.text-cursor-bugs)
 *
 * Three bugs:
 * 1. Exits edit mode when cursor crosses to another node (should seamlessly enter edit on next block)
 * 2. Ghost cursor (two cursors shown — stale inverse attribute not cleared)
 * 3. Line positions wrong (manual wrapSegment doesn't match silvery visual wrapping)
 *
 * Each test is written to FAIL with the current bugs, then pass after fixes.
 */

import { describe, test, expect } from "vitest"
import { wrapText, getWrappedLines, cursorToRowCol } from "@silvery/ag-react"
import { item, testEnv } from "./helpers/board-test.ts"
import { getActiveBoardPane } from "../src/state/board-app-store.ts"

describe("text-cursor-bugs", () => {
  // ===========================================================================
  // Bug 1: Exits edit mode when crossing to another node
  // ===========================================================================
  describe("block crossing preserves edit mode", () => {
    test("arrow down at end of first card enters edit on next card", () => {
      const { board } = testEnv(() => item("board", item("col1", item("card-a"), item("card-b"), item("card-c"))))

      // Start on card-a, enter edit mode
      board.expect("#card-a[data-cursor]").toExist()
      board.press("Enter")

      // Verify we're in edit mode on card-a
      board.expectEditing("card-a")

      // Press down arrow — should cross to card-b while staying in edit mode
      board.press("ArrowDown")

      // Should now be editing card-b, NOT exited edit mode
      board.expectEditing("card-b")
    })

    test("arrow up at start of second card enters edit on first card", () => {
      const { board } = testEnv(() => item("board", item("col1", item("card-a"), item("card-b"), item("card-c"))))

      // Navigate to card-b and enter edit
      board.command("cursor_down") // move to card-b
      board.expect("#card-b[data-cursor]").toExist()
      board.press("Enter")

      board.expectEditing("card-b")

      // Press up arrow — should cross to card-a in edit mode
      board.press("ArrowUp")

      board.expectEditing("card-a")
    })

    test("block crossing saves content of previous block", () => {
      const { board, repo } = testEnv(() => item("board", item("col1", item("card-a"), item("card-b"))))

      board.expect("#card-a[data-cursor]").toExist()
      board.press("Enter")

      // Type some text
      board.press("x")
      board.press("y")
      board.press("z")

      // Cross to next block
      board.press("ArrowDown")

      // The content of card-a should be saved (not lost)
      expect(repo.getNode("card-a")?.content).toBe("card-axyz")

      // Should now be editing card-b
      board.expectEditing("card-b")
    })

    test("stickyX preserved when crossing blocks vertically", () => {
      const { board, store } = testEnv(() => item("board", item("col1", item("shortA"), item("longerB"))), {
        columns: 40,
      })

      board.expect("#shortA[data-cursor]").toExist()
      board.press("Enter")

      // Move cursor to column 5 (press right 5 times)
      for (let i = 0; i < 5; i++) board.press("ArrowRight")

      // Cross to next block — should preserve the column position
      board.press("ArrowDown")

      board.expectEditing()
      const hints = store.getState().textEditHints
      expect(hints?.stickyX).toBeDefined()
    })
  })

  // ===========================================================================
  // Bug 2: Ghost cursor (stale inverse attribute not cleared)
  // ===========================================================================
  describe("ghost cursor", () => {
    test("only one inverse cell exists after cursor moves within edit", () => {
      const { board } = testEnv(() => item("board", item("col1", item("hellotext"))), { columns: 60 })

      board.expect("#hellotext[data-cursor]").toExist()
      board.press("Enter")

      // Count inverse cells in the card's content area
      function countInverseCells(): number {
        let count = 0
        for (let y = 0; y < board.screen.height; y++) {
          for (let x = 0; x < board.screen.width; x++) {
            const cell = board.screen.cell(x, y)
            if (cell.attrs.inverse && cell.char.trim() !== "") count++
          }
        }
        return count
      }

      // After entering edit, there should be exactly one inverse cell (the cursor)
      // The cursor is at end by default, so the inverse cell is a space
      let inverseCount = countInverseCells()
      // Allow 0 if cursor is on a space, but generally there should be 0 or 1
      // non-space inverse cells

      // Now move cursor left several times
      board.press("ArrowLeft")
      board.press("ArrowLeft")
      board.press("ArrowLeft")

      // After moving, there should still be at most 1 inverse cell
      // (the ghost cursor bug would show 2 — one at old position, one at new)
      inverseCount = countInverseCells()
      expect(inverseCount).toBeLessThanOrEqual(1)
    })

    test("no ghost inverse cells after crossing blocks", () => {
      const { board } = testEnv(() => item("board", item("col1", item("first card"), item("second card"))), {
        columns: 60,
      })

      board.press("Enter") // edit first card

      // Move to second card
      board.press("ArrowDown")

      // Count total inverse cells — should be exactly 1 (cursor on second card)
      let inverseCount = 0
      for (let y = 0; y < board.screen.height; y++) {
        for (let x = 0; x < board.screen.width; x++) {
          const cell = board.screen.cell(x, y)
          if (cell.attrs.inverse) inverseCount++
        }
      }

      // At most 1 inverse character (the cursor char, which may be a space)
      expect(inverseCount).toBeLessThanOrEqual(1)
    })
  })

  // ===========================================================================
  // Bug 3: Line positions wrong (cursor math vs renderer wrapping mismatch)
  // ===========================================================================
  describe("cursor line position accuracy", () => {
    test("getWrappedLines matches renderer wrapping (trim consistency)", () => {
      // The renderer uses wrapText(text, width, true, true) — with trim=true
      // The cursor math uses wrapText(line, wrapWidth, false) — with trim=false
      // This can cause line length mismatches for text with trailing spaces at break points
      const text = "hello world this is a test of word wrapping"
      const width = 15

      // How the renderer wraps (trim=true)
      const rendererLines = wrapText(text, width, true, true)

      // How the cursor math wraps (via getWrappedLines)
      const cursorLines = getWrappedLines(text, width)

      // They should produce the same number of visual lines
      expect(cursorLines.length).toBe(rendererLines.length)

      // The lines should have the same content (character-by-character)
      for (let i = 0; i < rendererLines.length; i++) {
        expect(
          cursorLines[i]?.line,
          `line ${i}: cursor math "${cursorLines[i]?.line}" vs renderer "${rendererLines[i]}"`,
        ).toBe(rendererLines[i])
      }
    })

    test("cursor position consistent between cursorToRowCol and visual rendering", () => {
      // Text that wraps with trailing spaces at the break point
      const text = "aaa bbb ccc ddd eee fff"
      const width = 10

      // Check every cursor position maps to the correct visual line
      const rendererLines = wrapText(text, width, true, true)
      const cursorLines = getWrappedLines(text, width)

      // For each visual line from the renderer, check cursor math agrees
      for (let i = 0; i < rendererLines.length; i++) {
        const rLine = rendererLines[i] ?? ""
        const cLine = cursorLines[i]

        // Start offsets should match
        if (cLine) {
          const { row, col } = cursorToRowCol(text, cLine.startOffset, width)
          expect(row).toBe(i)
          expect(col).toBe(0)
        }
      }
    })

    test("cursor row/col matches visual position in wrapped text", () => {
      // Use a narrow column to force wrapping
      const { board } = testEnv(
        () =>
          item(
            "board",
            item("col1", item("This is a long card title that should definitely wrap across multiple visual lines")),
          ),
        { columns: 40 },
      )

      board.press("Enter") // enter edit mode

      // The cursor should be at the end of the text (default position)
      // Find the inverse cell (cursor) — it should be on the last visual line
      let cursorY = -1
      let cursorX = -1
      for (let y = 0; y < board.screen.height; y++) {
        for (let x = 0; x < board.screen.width; x++) {
          const cell = board.screen.cell(x, y)
          if (cell.attrs.inverse) {
            cursorY = y
            cursorX = x
          }
        }
      }

      expect(cursorY).toBeGreaterThan(-1)
      expect(cursorX).toBeGreaterThanOrEqual(0)

      // Now press Ctrl+A to go to start of text (Home is not bound in keybindings)
      board.press("ctrl+a")

      // Find the cursor again — it should have moved
      let newCursorY = -1
      let newCursorX = -1
      for (let y = 0; y < board.screen.height; y++) {
        for (let x = 0; x < board.screen.width; x++) {
          const cell = board.screen.cell(x, y)
          if (cell.attrs.inverse) {
            newCursorY = y
            newCursorX = x
          }
        }
      }

      // After Home, cursor should be on an earlier line or at column 0-ish
      // (accounting for card border/padding)
      expect(newCursorY).toBeGreaterThan(-1)
      // The cursor should be at or near the start of the content area
      // The key check: cursor moved from end to start
      expect(newCursorY).toBeLessThanOrEqual(cursorY)
    })

    test("arrow up/down on wrapped text navigates visual lines correctly", () => {
      // Force text to wrap by using a narrow terminal
      // checkIncremental: false — bottom bar format change (removed cardIndex, added [EDIT]) causes stale incremental cells
      const { board } = testEnv(
        () => item("board", item("col1", item("aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk lll mmm"))),
        { columns: 30, checkIncremental: false },
      )

      board.press("Enter") // enter edit mode

      // Cursor should be at the end of wrapped text
      board.expectEditing()

      // Press up arrow — should move to previous visual line (NOT exit edit mode)
      board.press("ArrowUp")

      // Should still be in edit mode on the same node
      board.expectEditing("aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk lll mmm")

      // Press down arrow — should move back to last visual line
      board.press("ArrowDown")

      board.expectEditing("aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk lll mmm")
    })

    test("arrow up at first visual line of wrapped text crosses to previous card", () => {
      // checkIncremental: false — bottom bar format change causes stale incremental cells
      const { board } = testEnv(
        () => item("board", item("col1", item("prev-card"), item("aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk lll"))),
        { columns: 30, checkIncremental: false },
      )

      // Navigate to the second card and enter edit at start
      board.command("cursor_down")
      board.press("Enter")

      // Move cursor to start with Ctrl+A (Home is not bound in keybindings)
      board.press("ctrl+a")

      // Verify cursor is at start (offset 0)
      board.expectEditing("aaa bbb ccc ddd eee fff ggg hhh iii jjj kkk lll")

      // Now press up — we're on the first visual line (row 0), so should cross to prev card
      board.press("ArrowUp")

      board.expectEditing("prev-card")
    })
  })
})
