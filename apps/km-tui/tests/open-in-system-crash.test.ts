/**
 * Regression: pressing "o" (Open in System) crashes when repo.data is null.
 *
 * resolveNodeFsPath() accesses repo.data.getNode() without checking if
 * repo.data exists. In testEnv / embedded contexts, repo.data is null,
 * causing: TypeError: null is not an object (evaluating 'repo.data.getNode')
 *
 * Bug: km-otgyy
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Open in System (o key)", () => {
  test("pressing o does not crash when repo.data is null", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("task-a"), item("task-b")))
    )

    // Navigate to first card
    board.press("j")

    // This should NOT throw — it should handle missing repo.data gracefully
    expect(() => board.press("o")).not.toThrow()
  })

  test("pressing O (open in terminal) does not crash when repo.data is null", () => {
    const { board } = testEnv(() =>
      item("board", item("col", item("task-a"), item("task-b")))
    )

    board.press("j")

    // Same issue: handleOpenInTerminal also calls resolveNodeFsPath
    expect(() => board.press("O")).not.toThrow()
  })
})
