/**
 * Clipboard Operations
 *
 * Tests for Ctrl+C (copy), Ctrl+X (cut), and Ctrl+V (paste).
 *
 * Covers:
 * - Copy single node, paste creates duplicate
 * - Cut single node, paste moves it
 * - Copy allows repeated paste (clipboard preserved)
 * - Cut clears clipboard after paste (one-time)
 * - Multi-selection copy/cut/paste
 * - Paste into different column
 * - Paste with nothing in clipboard rings bell
 * - Undo reverses paste
 */

import { describe, test, expect } from "vitest"
import { testEnv, item } from "./helpers/board-test.ts"

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

function childContents(
  repo: { getChildren(id: string): { id: string; content?: string | null }[] },
  parentId: string,
): (string | null | undefined)[] {
  return repo.getChildren(parentId).map((n) => n.content)
}

describe("Clipboard operations", () => {
  test("copy single node and paste creates duplicate", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

    expect(childIds(repo, "col1")).toEqual(["A", "B", "C"])

    // Copy node A (cursor starts on first card)
    board.press("Control+c")

    // Paste after A
    board.press("Control+v")

    // Should now have 4 children — A, copy of A, B, C
    const after = childIds(repo, "col1")
    expect(after).toHaveLength(4)
    expect(after[0]).toBe("A")
    // The copy is after A (index 1)
    expect(after[2]).toBe("B")
    expect(after[3]).toBe("C")

    // The copy should have same content
    const copyNode = repo.getNode(after[1]!)
    expect(copyNode?.content).toBe("A")
  })

  test("cut single node and paste moves it", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

    expect(childIds(repo, "col1")).toEqual(["A", "B", "C"])

    // Cut node A
    board.press("Control+x")

    // Navigate to C (now B is first, so j goes to C which is second)
    board.press("j") // to B
    board.press("j") // to C

    // Paste after C
    board.press("Control+v")

    // A should now be after C: B, C, A
    const after = childContents(repo, "col1")
    expect(after).toEqual(["B", "C", "A"])
  })

  test("copy allows repeated paste", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

    // Copy A
    board.press("Control+c")

    // Paste twice
    board.press("Control+v")
    board.press("Control+v")

    // Should have A, copy1, copy2, B
    const children = repo.getChildren("col1")
    expect(children).toHaveLength(4)
    expect(children[0]?.content).toBe("A")
    // Both copies have same content as A
    expect(children[1]?.content).toBe("A")
    expect(children[2]?.content).toBe("A")
    expect(children[3]?.content).toBe("B")
  })

  test("cut clears clipboard after paste", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

    // Cut A
    board.press("Control+x")

    // Navigate to B (now first after cut moved cursor)
    board.press("j") // to B

    // Paste after B
    board.press("Control+v")

    // Try to paste again — should bell (clipboard cleared after cut paste)
    board.press("Control+v")
    expect(board.bell).toBe(true)
  })

  test("paste with empty clipboard rings bell", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"))))

    board.press("Control+v")
    expect(board.bell).toBe(true)
  })

  test("copy with multi-selection", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

    // Select A and B using Shift+J (extend selection down)
    board.press("J") // extends selection to include A and B

    // Copy selection
    board.press("Control+c")

    // Navigate to C
    board.press("j")

    // Paste after C
    board.press("Control+v")

    // Should have A, B, C, copy-of-A, copy-of-B
    const children = repo.getChildren("col1")
    expect(children).toHaveLength(5)
    expect(children[0]?.content).toBe("A")
    expect(children[1]?.content).toBe("B")
    expect(children[2]?.content).toBe("C")
    expect(children[3]?.content).toBe("A")
    expect(children[4]?.content).toBe("B")
  })

  test("paste into different column", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2", item("X"))))

    // Copy A
    board.press("Control+c")

    // Navigate to col2
    board.press("l")

    // Paste after X
    board.press("Control+v")

    // col1 should be unchanged
    expect(childIds(repo, "col1")).toEqual(["A", "B"])

    // col2 should have X + copy of A
    const col2Children = repo.getChildren("col2")
    expect(col2Children).toHaveLength(2)
    expect(col2Children[0]?.content).toBe("X")
    expect(col2Children[1]?.content).toBe("A")
  })

  test("undo reverses paste", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

    // Copy A and paste
    board.press("Control+c")
    board.press("Control+v")

    expect(repo.getChildren("col1")).toHaveLength(3)

    // Undo
    board.press("Control+z")

    expect(childIds(repo, "col1")).toEqual(["A", "B"])
  })

  test("undo reverses cut+paste (restores original position)", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

    // Cut A, navigate to C, paste
    board.press("Control+x")
    board.press("j") // to B
    board.press("j") // to C
    board.press("Control+v")

    // Now B, C, A
    expect(childContents(repo, "col1")).toEqual(["B", "C", "A"])

    // Undo — A should go back to original position
    board.press("Control+z")
    expect(childContents(repo, "col1")).toEqual(["A", "B", "C"])
  })

  test("copy on empty column rings bell", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A")), item("col2")))

    // Navigate to col2 (empty column — cursor on column header)
    board.press("l")

    // Copy should fail — no card to copy
    board.press("Control+c")
    expect(board.bell).toBe(true)
  })
})
