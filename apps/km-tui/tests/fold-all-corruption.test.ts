/**
 * Fold all / unfold all commands in cards view.
 *
 * Tests the z-prefix chord fold operations and Z (unfold all).
 * Note: standalone z has a 300ms chord timeout before resolving to fold_all,
 * so tests use zM (chord) for fold_all, zc/zo/za for node-level fold ops.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("fold-all-corruption", () => {
  test("zM (fold all chord) folds all cards in column", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item.folder("Parent", item("child-1"), item("child-2"))),
      ),
    )

    expect(board.screenshot()).toContain("child-1")

    // zM chord → fold_all (FOLD_LEVEL depth:1)
    board.press("z").press("M")

    expect(board.screenshot()).not.toContain("child-1")
    expect(board.screenshot()).not.toContain("child-2")
    // Parent title should still be readable
    expect(board.screenshot()).toContain("Parent")
  })

  test("zc folds a card, Z should unfold it", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item.folder("Parent", item("child-1"), item("child-2"))),
      ),
    )

    // Fold via zc chord
    board.press("z").press("c")

    // Children should be hidden
    expect(board.screenshot()).not.toContain("child-1")

    // Z (unfold all) should restore children
    board.press("Z")

    expect(board.screenshot()).toContain("child-1")
    expect(board.screenshot()).toContain("child-2")
  })

  test("za (toggle fold chord) folds current card and hides children", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item.folder("Parent", item("child-1"), item("child-2"))),
      ),
    )

    expect(board.screenshot()).toContain("child-1")

    // za chord → toggle_fold
    board.press("z").press("a")

    const folded = board.screenshot()
    expect(folded).not.toContain("child-1")
    expect(folded).not.toContain("child-2")
    expect(folded).toContain("Parent")
  })

  test("zo (unfold node chord) restores children after fold", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item.folder("Parent", item("child-1"), item("child-2"))),
      ),
    )

    // Fold with zc
    board.press("z").press("c")
    expect(board.screenshot()).not.toContain("child-1")

    // Unfold with zo
    board.press("z").press("o")

    const unfolded = board.screenshot()
    expect(unfolded).toContain("child-1")
    expect(unfolded).toContain("child-2")
  })

  test("Z unfolds all after individually folding multiple cards", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item(
          "col1",
          item.folder("Processing", item("sub-a"), item("sub-b")),
          item.folder("Review", item("sub-c")),
        ),
      ),
    )

    // Fold both cards individually with zc
    board.press("z").press("c")   // fold Processing
    board.press("j")              // move to Review
    board.press("z").press("c")   // fold Review

    expect(board.screenshot()).not.toContain("sub-a")
    expect(board.screenshot()).not.toContain("sub-c")

    // Z should unfold all
    board.press("Z")

    const after = board.screenshot()
    expect(after).toContain("sub-a")
    expect(after).toContain("sub-b")
    expect(after).toContain("sub-c")
  })
})
