/**
 * Focused test: Duplicate node undo behavior
 *
 * Investigates whether the undo stack is populated after duplicate,
 * and whether undo actually fires deleteNode.
 */
import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

describe("Duplicate Undo Focus", () => {
  test("duplicate creates undo entry", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

    const before = repo.getChildren("col1").length
    expect(before).toBe(2)

    board.press("d") // Duplicate A
    const afterDup = repo.getChildren("col1").length
    expect(afterDup).toBe(3) // Confirms duplicate worked

    // Check that undo works on the repo level
    board.press("C-z")
    const afterUndo = repo.getChildren("col1").length

    // If this is 3, the undo didn't fire or deleteNode didn't work
    // If this is 2, the undo worked
    if (afterUndo === 3) {
      // Let's check what the undo stack looks like
      // The undo should have called repo.deleteNode(newId)
      // Maybe the issue is that the duplicate's ID changed or something

      // Check all children after undo to see if the node was truly deleted
      const children = repo.getChildren("col1")
      const contents = children.map((c) => c.content || c.id)
      // Report this as a bug
      expect.fail(
        `BUG: Duplicate undo didn't work. Children after undo: ${JSON.stringify(contents)}. ` +
          `Expected 2 children, got ${afterUndo}.`,
      )
    }
  })

  test("duplicate creates node with correct parent", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

    board.press("d") // Duplicate A
    const children = repo.getChildren("col1")
    expect(children.length).toBe(3)

    // All children should have col1 as parent
    for (const child of children) {
      expect(child.parent_id).toBe("col1")
    }

    // At least one should have content "A" (the duplicate should copy content)
    const aNodes = children.filter((c) => c.content === "A")
    expect(aNodes.length).toBe(2) // Original A + duplicate
  })
})
