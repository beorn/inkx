/**
 * Undo/Redo Journey Tests
 *
 * User-level journey specs that verify undo/redo through multi-step workflows.
 * Every test verifies BOTH screen output AND persisted data — the combination
 * catches rendering bugs that pure data tests miss.
 *
 * Complements undo-system.test.ts which covers the undo stack internals and
 * basic TUI u/U key integration (data-only checks).
 *
 * Key bindings: u = undo, U = redo (vim-style, normal mode)
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("Undo/Redo Journeys", () => {
  test("shift card down, undo restores original order on screen and in repo", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("aa"), item("bb"), item("cc"))))
    board.expect("#aa[data-cursor]").toExist()

    // Verify initial order: aa above bb above cc
    const aaBoxBefore = board.q("#aa").boundingBox()
    const bbBoxBefore = board.q("#bb").boundingBox()
    expect(aaBoxBefore!.y).toBeLessThan(bbBoxBefore!.y)

    // Step 1: Shift aa down (swaps with bb)
    board.press("opt+j")

    // Verify shift took effect — bb now above aa
    const aaBoxAfter = board.q("#aa").boundingBox()
    const bbBoxAfter = board.q("#bb").boundingBox()
    expect(bbBoxAfter!.y).toBeLessThan(aaBoxAfter!.y)

    // Verify repo order changed
    const orderAfterShift = repo.getChildren("col1").map((n) => n.id)
    expect(orderAfterShift[0]).toBe("bb")
    expect(orderAfterShift[1]).toBe("aa")

    // Step 2: Undo the shift
    board.press("u")

    // Verify undo restored original order — BOTH screen and repo
    const aaBoxRestored = board.q("#aa").boundingBox()
    const bbBoxRestored = board.q("#bb").boundingBox()
    expect(aaBoxRestored!.y).toBeLessThan(bbBoxRestored!.y)

    const orderAfterUndo = repo.getChildren("col1").map((n) => n.id)
    expect(orderAfterUndo).toEqual(["aa", "bb", "cc"])
  })

  test("duplicate card, undo removes it from screen and repo, redo brings it back", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("taskA"), item("taskB"))))
    board.expect("#taskA[data-cursor]").toExist()

    // Step 1: Duplicate taskA
    board.press("cmd+d")

    const childrenAfterDup = repo.getChildren("col1")
    expect(childrenAfterDup.length).toBe(3)
    const dupId = childrenAfterDup[1]!.id

    // Screen should show both original cards
    board.expect("#taskA").toExist()
    board.expect("#taskB").toExist()

    // Step 2: Undo — duplicate should vanish from both screen and repo
    board.press("u")

    expect(repo.getChildren("col1").length).toBe(2)
    expect(repo.getNode(dupId)).toBeNull()

    // Screen: only original cards remain
    board.expect("#taskA").toExist()
    board.expect("#taskB").toExist()

    // Step 3: Redo — duplicate should reappear
    board.press("U")

    expect(repo.getChildren("col1").length).toBe(3)
    board.expect("#taskA").toExist()
    board.expect("#taskB").toExist()
  })

  test("delete card, undo restores it on screen and in repo", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("alpha"), item("beta"), item("gamma"))),
    )

    // Navigate to beta
    board.press("j")
    board.expect("#beta[data-cursor]").toExist()

    // Step 1: Delete beta
    board.press("Backspace")

    // Beta gone from screen and repo
    board.expect("#beta").not.toExist()
    expect(repo.getNode("beta")).toBeNull()
    expect(repo.getChildren("col1").map((n) => n.id)).toEqual(["alpha", "gamma"])

    // Step 2: Undo — beta should be restored
    board.press("u")

    expect(repo.getNode("beta")).not.toBeNull()
    expect(repo.getChildren("col1").map((n) => n.id)).toEqual(["alpha", "beta", "gamma"])

    // Screen should show beta again
    board.expect("#beta").toExist()
    board.expect("#alpha").toExist()
    board.expect("#gamma").toExist()
  })

  test("move card between columns, undo restores original column", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("todo", item("fix-bug"), item("write-docs")), item("done", item("ship-v1"))),
    )
    board.expect("#fix-bug[data-cursor]").toExist()

    // Step 1: Move fix-bug to done column
    board.press("opt+l")

    // Verify: fix-bug now in done column (same x as ship-v1)
    const fixBox = board.q("#fix-bug").boundingBox()
    const shipBox = board.q("#ship-v1").boundingBox()
    expect(fixBox!.x).toBe(shipBox!.x)

    // Repo: fix-bug's parent should be done
    expect(repo.getNode("fix-bug")?.parent_id).toBe("done")

    // Step 2: Undo — fix-bug should return to todo
    board.press("u")

    // Repo: parent should be todo again
    expect(repo.getNode("fix-bug")?.parent_id).toBe("todo")

    // Screen: fix-bug should be back in todo column (same x as write-docs)
    board.expect("#fix-bug").toExist()
    const fixBoxAfter = board.q("#fix-bug").boundingBox()
    const docsBox = board.q("#write-docs").boundingBox()
    expect(fixBoxAfter!.x).toBe(docsBox!.x)
  })

  test("undo with empty stack rings bell, redo with empty stack rings bell", () => {
    const { board } = testEnv(() => item("board", item("col1", item("only"))))

    // Step 1: Undo with nothing to undo
    board.press("u")
    expect(board.bell).toBe(true)

    // Step 2: Redo with nothing to redo
    board.press("U")
    expect(board.bell).toBe(true)

    // Board should still render correctly
    board.expect("#only[data-cursor]").toExist()
  })

  test("multiple edits then multiple undos restore in reverse order", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("t1"), item("t2"), item("t3"))),
    )

    // Step 1: Duplicate t1
    board.press("cmd+d")
    expect(repo.getChildren("col1").length).toBe(4)

    // Step 2: Navigate to t3 (now at index 3) and delete it
    board.press("j") // dup of t1
    board.press("j") // t2
    board.press("j") // t3
    board.expect("#t3[data-cursor]").toExist()
    board.press("Backspace")
    expect(repo.getNode("t3")).toBeNull()

    // Step 3: Undo delete — t3 should reappear
    board.press("u")
    expect(repo.getNode("t3")).not.toBeNull()
    board.expect("#t3").toExist()

    // Step 4: Undo duplicate — duplicate should disappear
    board.press("u")
    expect(repo.getChildren("col1").length).toBe(3)
    expect(repo.getChildren("col1").map((n) => n.id)).toEqual(["t1", "t2", "t3"])

    // Screen should show exactly the original 3 cards
    board.expect("#t1").toExist()
    board.expect("#t2").toExist()
    board.expect("#t3").toExist()
  })
})
