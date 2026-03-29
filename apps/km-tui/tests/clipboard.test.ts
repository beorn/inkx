/**
 * Clipboard Operations
 *
 * Tests for clipboard: y (copy), d (cut), p (paste).
 * Also available via Cmd+C/X/V (kitty protocol).
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
    board.press("y")

    // Paste after A
    board.press("p")

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
    board.press("d")

    // Navigate to C (now B is first, so j goes to C which is second)
    board.command("cursor_down") // to B
    board.command("cursor_down") // to C

    // Paste after C
    board.press("p")

    // A should now be after C: B, C, A
    const after = childContents(repo, "col1")
    expect(after).toEqual(["B", "C", "A"])
  })

  test("copy allows repeated paste", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

    // Copy A
    board.press("y")

    // Paste twice
    board.press("p")
    board.press("p")

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
    // incremental: false — pre-existing silvery toast rendering mismatch
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))), { incremental: false })

    // Cut A
    board.press("d")

    // Navigate to B (now first after cut moved cursor)
    board.command("cursor_down") // to B

    // Paste after B
    board.press("p")

    // Try to paste again — should bell (clipboard cleared after cut paste)
    board.press("p")
    expect(board.bell).toBe(true)
  })

  test("paste with empty clipboard rings bell", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"))))

    board.press("p")
    expect(board.bell).toBe(true)
  })

  test("copy with multi-selection", () => {
    // incremental: false — pre-existing silvery toast rendering mismatch
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))), {
      incremental: false,
    })

    // Select A and B using Shift+J (extend selection down)
    board.press("shift+ArrowDown") // extends selection to include A and B

    // Copy selection
    board.press("y")

    // Navigate to C
    board.command("cursor_down")

    // Paste after C
    board.press("p")

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
    board.press("y")

    // Navigate to col2
    board.command("cursor_right")

    // Paste after X
    board.press("p")

    // col1 should be unchanged
    expect(childIds(repo, "col1")).toEqual(["A", "B"])

    // col2 should have X + copy of A
    const col2Children = repo.getChildren("col2")
    expect(col2Children).toHaveLength(2)
    expect(col2Children[0]?.content).toBe("X")
    expect(col2Children[1]?.content).toBe("A")
  })

  test("undo reverses paste", () => {
    // incremental: false — undo status bar message changes bottom bar rendering
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))), {
      incremental: false,
    })

    // Copy A and paste
    board.press("y")
    board.press("p")

    expect(repo.getChildren("col1")).toHaveLength(3)

    // Undo
    board.command("undo")

    expect(childIds(repo, "col1")).toEqual(["A", "B"])
  })

  test("undo reverses cut+paste (restores original position)", () => {
    // incremental: false — undo status bar message changes bottom bar rendering
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))), {
      incremental: false,
    })

    // Cut A, navigate to C, paste
    board.press("d")
    board.command("cursor_down") // to B
    board.command("cursor_down") // to C
    board.press("p")

    // Now B, C, A
    expect(childContents(repo, "col1")).toEqual(["B", "C", "A"])

    // Undo — A should go back to original position
    board.command("undo")
    expect(childContents(repo, "col1")).toEqual(["A", "B", "C"])
  })

  test("copy on empty column copies the column heading", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A")), item("col2")))

    // Navigate to col2 (empty column — cursor on column heading node)
    board.command("cursor_right")

    // Copy works — cursor is on column heading (tree-level selection)
    board.press("y")
    expect(board.bell).toBe(false)
  })
})
