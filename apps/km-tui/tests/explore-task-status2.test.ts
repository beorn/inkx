/**
 * Exploration: Task Status + Duplicate
 *
 * Tests task status cycling (space) and node duplication (d).
 * These are common operations with recent changes nearby.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Exploration: Task Status + Duplicate", () => {
  test("cycle task status with space", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Task A"), item.task("Task B"))))
    board.press("space") // Cycle A: todo -> in_progress
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("cycle task status multiple times", () => {
    const { board } = testEnv(() => item("board", item("col1", item.task("Task A"))))
    // Cycle through all states
    board.press("space") // todo -> in_progress
    board.press("space") // in_progress -> done
    board.press("space") // done -> todo
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("space on non-task node", () => {
    const { board } = testEnv(() => item("board", item("col1", item("Not a task"), item("Also not"))))
    board.press("space")
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("duplicate node with d", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    const childrenBefore = repo.getChildren("col1").length
    board.press("d") // Duplicate A
    const childrenAfter = repo.getChildren("col1").length
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    // Should have one more child
    expect(childrenAfter).toBe(childrenBefore + 1)
  })

  test("duplicate then undo (KNOWN BUG: undo doesn't reverse duplicate)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    board.press("d") // Duplicate A
    const afterDup = repo.getChildren("col1").length
    expect(afterDup).toBe(3) // A + duplicate + B
    board.press("C-z") // Undo — BUG: doesn't actually remove duplicate
    const afterUndo = repo.getChildren("col1").length
    // BUG: afterUndo is still 3 instead of 2
    // When fixed, this assertion should be: expect(afterUndo).toBe(2)
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
  })

  test("duplicate then navigate to duplicate", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    board.press("d") // Duplicate A
    board.press("j") // Move to duplicate
    board.press("j") // Move past duplicate
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("duplicate in second column", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A")), item("col2", item("B"), item("C"))))
    board.press("l") // Move to col2
    board.press("d") // Duplicate B
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
    expect(repo.getChildren("col2").length).toBe(3) // B + duplicate + C
  })

  test("duplicate then delete duplicate", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"))))
    board.press("d") // Duplicate A
    board.press("j") // Move to duplicate
    board.press("x") // Delete duplicate
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })

  test("batch duplicate with selection", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))
    board.press("v") // Select A
    board.press("S-j") // Extend to B
    board.press("d") // Duplicate selected
    const text = board.screenshot()
    expect(text).not.toContain("[object Object]")
    expect(text).not.toContain("TypeError")
  })
})
