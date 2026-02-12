/**
 * Undo Duplicate Node
 *
 * Tests that pressing Ctrl+Z (undo) after `d` (duplicate) removes the duplicate.
 *
 * Covers:
 * - Duplicate creates a new sibling
 * - Undo removes the duplicate
 * - Undo with nothing to undo rings the bell (boundary)
 * - Multiple duplicate+undo cycles
 *
 * Note: Redo (Ctrl+Shift+Z) cannot be tested via testEnv because terminal ANSI
 * encoding doesn't distinguish Ctrl+Shift+Z from Ctrl+Z (both produce 0x1A).
 * Redo logic is tested via the undo-stack unit tests instead.
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"
import { createUndoStack } from "../src/undo-stack.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

describe("Undo duplicate node", () => {
  test("duplicate then undo removes the duplicate", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

    // Verify initial state
    expect(childIds(repo, "col1")).toEqual(["A", "B", "C"])

    // Press d to duplicate node A (cursor starts on first card)
    board.press("d")

    // Should now have 4 children — original A + duplicate + B + C
    const afterDup = childIds(repo, "col1")
    expect(afterDup).toHaveLength(4)
    expect(afterDup[0]).toBe("A")
    // The duplicate is between A and B
    const dupId = afterDup[1]!
    expect(afterDup[2]).toBe("B")
    expect(afterDup[3]).toBe("C")

    // Press Ctrl+Z to undo
    board.press("Control+z")

    // The duplicate should be removed
    expect(childIds(repo, "col1")).toEqual(["A", "B", "C"])
    // Verify the node is actually gone
    expect(repo.getNode(dupId)).toBeNull()
  })

  test("undo with nothing to undo rings bell", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"))))

    // Ctrl+Z with empty undo stack should ring bell
    board.press("Control+z")
    expect(board.bell).toBe(true)
  })

  test("multiple duplicates then multiple undos", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

    expect(childIds(repo, "col1")).toEqual(["A", "B"])

    // Duplicate A
    board.press("d")
    expect(childIds(repo, "col1")).toHaveLength(3)

    // Navigate to B (now at index 2) and duplicate it
    board.press("j") // to dup of A
    board.press("j") // to B
    board.press("d")
    expect(childIds(repo, "col1")).toHaveLength(4)

    // Undo last duplicate (B's duplicate)
    board.press("Control+z")
    expect(childIds(repo, "col1")).toHaveLength(3)

    // Undo first duplicate (A's duplicate)
    board.press("Control+z")
    expect(childIds(repo, "col1")).toEqual(["A", "B"])
  })
})

describe("UndoStack unit tests", () => {
  test("push and undo", () => {
    const stack = createUndoStack()
    let value = 0
    stack.push({
      label: "increment",
      undo: () => { value-- },
      redo: () => { value++ },
    })
    value++ // simulate the original action
    expect(value).toBe(1)

    stack.undo()
    expect(value).toBe(0)
  })

  test("push, undo, redo", () => {
    const stack = createUndoStack()
    let value = 0
    stack.push({
      label: "increment",
      undo: () => { value-- },
      redo: () => { value++ },
    })
    value++

    stack.undo()
    expect(value).toBe(0)

    stack.redo()
    expect(value).toBe(1)
  })

  test("undo clears redo history when new entry pushed", () => {
    const stack = createUndoStack()
    let value = 0
    stack.push({ label: "a", undo: () => { value-- }, redo: () => { value++ } })
    value++
    stack.push({ label: "b", undo: () => { value -= 10 }, redo: () => { value += 10 } })
    value += 10

    // Undo "b"
    stack.undo()
    expect(value).toBe(1)
    expect(stack.canRedo()).toBe(true)

    // Push new entry — should clear redo history
    stack.push({ label: "c", undo: () => { value -= 100 }, redo: () => { value += 100 } })
    value += 100
    expect(stack.canRedo()).toBe(false)
  })

  test("canUndo and canRedo", () => {
    const stack = createUndoStack()
    expect(stack.canUndo()).toBe(false)
    expect(stack.canRedo()).toBe(false)

    stack.push({ label: "x", undo: () => {}, redo: () => {} })
    expect(stack.canUndo()).toBe(true)
    expect(stack.canRedo()).toBe(false)

    stack.undo()
    expect(stack.canUndo()).toBe(false)
    expect(stack.canRedo()).toBe(true)
  })

  test("max size drops oldest entries", () => {
    const stack = createUndoStack(3)
    stack.push({ label: "1", undo: () => {}, redo: () => {} })
    stack.push({ label: "2", undo: () => {}, redo: () => {} })
    stack.push({ label: "3", undo: () => {}, redo: () => {} })
    expect(stack.size).toBe(3)

    stack.push({ label: "4", undo: () => {}, redo: () => {} })
    expect(stack.size).toBe(3)
    // Entry "1" should have been dropped
    expect(stack.canUndo()).toBe(true)
  })
})
