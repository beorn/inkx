/**
 * Enter During Edit — Bug Reproduction
 *
 * BUG: TEXT_CONFIRM (Enter during editing) creates a new sibling node
 * and enters edit mode on it, instead of just saving and exiting.
 *
 * Symptoms:
 * - Every Enter during editing creates an empty node
 * - Content typed before Enter is NOT saved (save() doesn't persist)
 * - User gets trapped in edit mode on the new empty node
 * - Multiple Enters create multiple empty nodes
 *
 * Root cause: TEXT_CONFIRM in board-actions.ts calls:
 *   1. blockEditTargetRef.current?.save()
 *   2. ctx.setUI({ inlineEditBlock: null })
 *   3. handleAddNodeAfter(ctx) — creates new sibling + enters edit
 *
 * The save() call isn't persisting (possibly stale ref or timing issue),
 * and the user never intended to create a new node — just confirm the edit.
 */

import { describe, test, expect } from "vitest"
import { item, testEnv } from "./helpers/board-test.ts"

describe("Enter during edit — bugs", () => {
  test("BUG: Enter during edit does not save content", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    board.press("Enter") // enter edit mode on 1a
    board.press("X") // type "X" → content should be "1aX"
    board.press("Enter") // confirm edit

    // BUG: content is "1a" (not "1aX") — save() didn't persist
    expect(repo.getNode("1a")?.content).toBe("1aX")
  })

  test("BUG: Enter during edit creates unwanted new node", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    // Before: 2 children
    expect(repo.getChildren("col1")).toHaveLength(2)

    board.press("Enter") // enter edit mode
    board.press("Enter") // confirm edit (no changes)

    // BUG: 3 children — a new empty node was created
    // Expected: still 2 children (Enter should just save + exit)
    expect(repo.getChildren("col1")).toHaveLength(2)
  })

  test("BUG: multiple Enters create multiple empty nodes", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("1a"))),
    )

    expect(repo.getChildren("col1")).toHaveLength(1)

    board.press("Enter") // enter edit
    board.press("Enter") // confirm → creates node 1
    board.press("Enter") // creates node 2
    board.press("Enter") // creates node 3

    // BUG: 4 children (1 original + 3 empty nodes)
    // Expected: 1 child (just saved and exited)
    expect(repo.getChildren("col1")).toHaveLength(1)
  })

  test("BUG: after Enter-confirm, cursor trapped in edit mode", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"), item("1c"))),
    )

    board.press("Enter") // edit 1a
    board.press("Enter") // confirm

    // After confirming, should be in normal mode. j should navigate to 1b.
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
  })

  test("Escape properly exits edit without side effects", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("1a"), item("1b"))),
    )

    expect(repo.getChildren("col1")).toHaveLength(2)

    board.press("Enter") // edit 1a
    board.press("X") // type
    board.press("Escape") // cancel

    // No new nodes created
    expect(repo.getChildren("col1")).toHaveLength(2)

    // Content unchanged (cancelled)
    expect(repo.getNode("1a")?.content).toBe("1a")

    // Back in normal mode
    board.press("j")
    board.expect("#1b[data-cursor]").toExist()
  })
})
