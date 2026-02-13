/**
 * Exploration: Undo/redo (Ctrl+Z / Ctrl+Y)
 *
 * Tests the new undo/redo system. Currently only duplicate pushes undo entries.
 * Verifies: duplicate+undo, redo after undo, multiple undos, undo at boundary,
 * redo truncation after new action.
 *
 * NOTE: Uses Ctrl+Y for redo (not Ctrl+Shift+Z) because legacy terminal mode
 * cannot distinguish Ctrl+Z from Ctrl+Shift+Z (both produce \x1a).
 * BUG: Ctrl+Shift+Z silently undoes (instead of redo) in non-Kitty terminals.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

describe("Exploration: Undo/Redo", () => {
  test("duplicate then undo removes the duplicate", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    const before = childIds(repo, "col1")
    expect(before).toEqual(["A", "B", "C"])

    // Duplicate A
    board.press("d")

    const afterDup = childIds(repo, "col1")
    if (afterDup.length !== 4) {
      bugs.push(`expected 4 children after dup, got ${afterDup.length}`)
    }

    // Undo
    board.press("Ctrl+Z")

    const afterUndo = childIds(repo, "col1")
    if (afterUndo.length !== 3) {
      bugs.push(`expected 3 children after undo, got ${afterUndo.length}: ${afterUndo.join(",")}`)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage in output after undo")
    }
    expect(bugs).toEqual([])
  })

  test("undo then redo restores the duplicate", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    const bugs: string[] = []

    board.press("d") // duplicate A
    board.press("Ctrl+Z") // undo

    const afterUndo = childIds(repo, "col1")
    if (afterUndo.length !== 2) {
      bugs.push(`expected 2 after undo, got ${afterUndo.length}`)
    }

    board.press("Ctrl+Y") // redo

    const afterRedo = childIds(repo, "col1")
    if (afterRedo.length !== 3) {
      bugs.push(`expected 3 after redo, got ${afterRedo.length}`)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after redo")
    }
    expect(bugs).toEqual([])
  })

  test("multiple duplicates then multiple undos", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    const bugs: string[] = []

    board.press("d") // dup A (3 children)
    board.press("j") // move to next
    board.press("d") // dup again (4 children)

    const afterDups = childIds(repo, "col1")
    if (afterDups.length !== 4) {
      bugs.push(`expected 4 after 2 dups, got ${afterDups.length}`)
    }

    board.press("Ctrl+Z") // undo second dup
    const after1Undo = childIds(repo, "col1")
    if (after1Undo.length !== 3) {
      bugs.push(`expected 3 after 1st undo, got ${after1Undo.length}`)
    }

    board.press("Ctrl+Z") // undo first dup
    const after2Undo = childIds(repo, "col1")
    if (after2Undo.length !== 2) {
      bugs.push(`expected 2 after 2nd undo, got ${after2Undo.length}`)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after multiple undos")
    }
    expect(bugs).toEqual([])
  })

  test("undo at boundary does not crash (nothing to undo)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    const bugs: string[] = []

    // Press undo with no history
    board.press("Ctrl+Z")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after undo with empty history")
    }
    expect(bugs).toEqual([])
  })

  test("redo at boundary does not crash (nothing to redo)", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    const bugs: string[] = []

    // Press redo with no redo history
    board.press("Ctrl+Y")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after redo with nothing to redo")
    }
    expect(bugs).toEqual([])
  })

  test("new action after undo truncates redo history", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C"))),
    )
    const bugs: string[] = []

    board.press("d") // dup A (4 children)
    board.press("Ctrl+Z") // undo (back to 3)

    // Now do a different action — should truncate redo
    board.press("j") // move to B
    board.press("d") // dup B

    // Redo should NOT bring back old A-dup
    board.press("Ctrl+Y")

    const kids = childIds(repo, "col1")
    // After: dup A, undo, dup B = 4 children. Redo should do nothing (truncated).
    if (kids.length !== 4) {
      bugs.push(`expected 4 children, got ${kids.length}: ${kids.join(",")}`)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after redo-truncation scenario")
    }
    expect(bugs).toEqual([])
  })

  test("undo after navigation still works", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"))),
    )
    const bugs: string[] = []

    board.press("d") // dup A
    board.press("l") // navigate to col2
    board.press("j") // navigate down
    board.press("Ctrl+Z") // undo should still remove the dup from col1

    const col1Kids = childIds(repo, "col1")
    if (col1Kids.length !== 2) {
      bugs.push(`expected 2 in col1 after undo, got ${col1Kids.length}`)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after undo from different column")
    }
    expect(bugs).toEqual([])
  })

  test("undo + redo rapid sequence", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"))),
    )
    const bugs: string[] = []

    board.press("d") // dup
    board.press("Ctrl+Z") // undo
    board.press("Ctrl+Y") // redo
    board.press("Ctrl+Z") // undo again
    board.press("Ctrl+Y") // redo again

    const kids = childIds(repo, "col1")
    if (kids.length !== 3) {
      bugs.push(`expected 3 after rapid undo/redo, got ${kids.length}`)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after rapid undo/redo")
    }
    expect(bugs).toEqual([])
  })
})
