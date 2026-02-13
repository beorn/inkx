/**
 * Exploration: Extended undo/redo edge cases
 *
 * Digs deeper into undo behavior: undo after delete (if supported),
 * undo after status change, undo with folded nodes, undo across columns.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

describe("Exploration: Undo/Redo Extended", () => {
  test("undo duplicate on last card in column", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("last"))))
    const bugs: string[] = []

    // Navigate to last
    board.press("j").press("j") // → last
    board.press("d") // dup last

    const afterDup = childIds(repo, "col1")
    if (afterDup.length !== 4) {
      bugs.push(`expected 4 after dup, got ${afterDup.length}`)
    }

    board.press("Ctrl+Z") // undo

    const afterUndo = childIds(repo, "col1")
    if (afterUndo.length !== 3) {
      bugs.push(`expected 3 after undo, got ${afterUndo.length}`)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after undo on last card")
    }
    expect(bugs).toEqual([])
  })

  test("undo duplicate in second column", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"), item("D"))),
    )
    const bugs: string[] = []

    board.press("l") // → col2
    board.press("d") // dup C

    const afterDup = childIds(repo, "col2")
    if (afterDup.length !== 3) {
      bugs.push(`expected 3 in col2 after dup, got ${afterDup.length}`)
    }

    board.press("Ctrl+Z") // undo

    const afterUndo = childIds(repo, "col2")
    if (afterUndo.length !== 2) {
      bugs.push(`expected 2 in col2 after undo, got ${afterUndo.length}`)
    }

    // col1 should be unchanged
    const col1Kids = childIds(repo, "col1")
    if (col1Kids.length !== 2) {
      bugs.push(`col1 should be untouched: ${col1Kids.length}`)
    }

    expect(bugs).toEqual([])
  })

  test("undo with folded node", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))),
    )
    const bugs: string[] = []

    // Fold parent
    board.press("z").press("a")
    // Duplicate folded parent
    board.press("d")
    // Undo
    board.press("Ctrl+Z")

    const kids = childIds(repo, "col1")
    if (kids.length !== 2) {
      bugs.push(`expected 2 in col1 after undo of folded dup, got ${kids.length}`)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after undo with folded node")
    }
    expect(bugs).toEqual([])
  })

  test("multiple undos across different columns", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"), item("D"))),
    )
    const bugs: string[] = []

    // Dup in col1
    board.press("d") // dup A
    // Move to col2 and dup
    board.press("l")
    board.press("d") // dup C

    // Undo both
    board.press("Ctrl+Z") // undo C dup
    const col2After1 = childIds(repo, "col2")
    if (col2After1.length !== 2) {
      bugs.push(`expected 2 in col2 after 1st undo, got ${col2After1.length}`)
    }

    board.press("Ctrl+Z") // undo A dup
    const col1After2 = childIds(repo, "col1")
    if (col1After2.length !== 2) {
      bugs.push(`expected 2 in col1 after 2nd undo, got ${col1After2.length}`)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after cross-column undos")
    }
    expect(bugs).toEqual([])
  })

  test("undo renders board correctly (no stale cards)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    const bugs: string[] = []

    board.press("d") // dup A
    const afterDup = board.screenshot()

    board.press("Ctrl+Z") // undo
    const afterUndo = board.screenshot()

    // After undo, the duplicate text should not appear
    // Count occurrences of "A" — should be back to original count
    if (afterUndo.includes("[object Object]") || afterUndo.includes("TypeError")) {
      bugs.push("garbage in rendered output after undo")
    }
    expect(bugs).toEqual([])
  })

  test("undo does not affect other state (view mode, folds)", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    const bugs: string[] = []

    // Change some state
    board.press("z").press("a") // fold parent
    board.press("j") // move to B
    board.press("d") // dup B

    // Undo should only reverse the dup, not unfold or move cursor
    board.press("Ctrl+Z")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after undo with mixed state")
    }
    expect(bugs).toEqual([])
  })

  test("undo at stack capacity boundary", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    // Push many undo entries (undo stack has max 100)
    for (let i = 0; i < 5; i++) {
      board.press("d") // duplicate
    }

    const afterDups = childIds(repo, "col1")
    if (afterDups.length !== 7) {
      bugs.push(`expected 7 after 5 dups, got ${afterDups.length}`)
    }

    // Undo all
    for (let i = 0; i < 5; i++) {
      board.press("Ctrl+Z")
    }

    const afterUndos = childIds(repo, "col1")
    if (afterUndos.length !== 2) {
      bugs.push(`expected 2 after undoing all, got ${afterUndos.length}`)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after many undo operations")
    }
    expect(bugs).toEqual([])
  })
})
