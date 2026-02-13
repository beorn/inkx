/**
 * Exploration: Interaction combinations — tests that combine multiple recent features.
 *
 * Covers: undo + fold, undo + selection, detail pane + fold, virtual skip + fold,
 * batch ops + undo, help overlay during selection, etc.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

describe("Exploration: Interaction Combinations", () => {
  test("duplicate then fold then undo", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))),
    )
    const bugs: string[] = []

    board.press("d") // dup parent
    board.press("z").press("a") // fold
    board.press("Ctrl+Z") // undo dup

    const kids = childIds(repo, "col1")
    if (kids.length !== 2) {
      bugs.push(`expected 2 after dup+fold+undo, got ${kids.length}`)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after dup+fold+undo combo")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane open then fold node", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    const bugs: string[] = []

    board.press(" ") // open detail pane on parent
    board.press("Escape") // close detail pane
    board.press("z").press("a") // fold parent

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after detail pane + fold")
    }
    expect(bugs).toEqual([])
  })

  test("fold then open detail pane on folded node", () => {
    const { board } = testEnv(() => item("board", item("col1", item("parent", item("c1"), item("c2")), item("B"))))
    const bugs: string[] = []

    board.press("z").press("a") // fold parent
    board.press(" ") // open detail pane on folded parent

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after fold + detail pane")
    }
    expect(bugs).toEqual([])
  })

  test("selection then help overlay then back", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    const bugs: string[] = []

    board.press("J") // start selection
    board.press("?") // open help (should not break selection)
    board.press("Escape") // close help

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after selection + help overlay")
    }
    expect(bugs).toEqual([])
  })

  test("undo then view mode change", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const bugs: string[] = []

    board.press("d") // dup
    board.press("Ctrl+Z") // undo
    board.press("2") // switch to columns view
    board.press("1") // back to cards

    const kids = childIds(repo, "col1")
    if (kids.length !== 2) {
      bugs.push(`expected 2 after undo + view switch, got ${kids.length}`)
    }

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after undo + view mode change")
    }
    expect(bugs).toEqual([])
  })

  test("batch delete then undo (if supported)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))
    const bugs: string[] = []

    board.press("j") // → B
    board.press("J") // select B→C
    board.press("Backspace") // delete B, C

    const afterDel = childIds(repo, "col1")
    // Note: batch delete may or may not push undo entries
    // This test just verifies no crash
    board.press("Ctrl+Z") // try undo

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after batch delete + undo attempt")
    }
    expect(bugs).toEqual([])
  })

  test("fold all then navigate", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("p1", item("c1")), item("p2", item("c2")), item("p3", item("c3")))),
    )
    const bugs: string[] = []

    // Fold all (Z key)
    board.press("Z")

    // Navigate
    board.press("j")
    board.press("j")
    board.press("k")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after fold-all + navigation")
    }
    expect(bugs).toEqual([])
  })

  test("unfold all then navigate", () => {
    const { board } = testEnv(() => item("board", item("col1", item("p1", item("c1")), item("p2", item("c2")))))
    const bugs: string[] = []

    // Fold then unfold
    board.press("Z") // fold all
    board.press("z") // unfold all (lowercase z)

    board.press("j")
    board.press("j")
    board.press("j")
    board.press("k")

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after unfold-all + navigation")
    }
    expect(bugs).toEqual([])
  })

  test("detail pane + navigation + fold + undo sequence", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("parent", item("c1"), item("c2")), item("B"))),
    )
    const bugs: string[] = []

    board.press("d") // dup A
    board.press("j") // → next
    board.press(" ") // detail pane
    board.press("Escape") // close detail
    board.press("j") // → parent
    board.press("z").press("a") // fold
    board.press("Ctrl+Z") // undo dup

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after complex interaction sequence")
    }
    expect(bugs).toEqual([])
  })

  test("column collapse then undo", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("A"), item("B")), item("col2", item("C"), item("D"))),
    )
    const bugs: string[] = []

    board.press("c") // collapse col1
    board.press("d") // dup (wherever cursor lands)
    board.press("Ctrl+Z") // undo

    const text = board.screenshot()
    if (text.includes("[object Object]") || text.includes("TypeError")) {
      bugs.push("garbage after collapse + dup + undo")
    }
    expect(bugs).toEqual([])
  })
})
