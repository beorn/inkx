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
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

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
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

    expect(childIds(app.repo, "col1")).toEqual(["A", "B", "C"])

    // Copy node A (cursor starts on first card)
    app.press("y")

    // Paste after A
    app.press("p")

    // Should now have 4 children — A, copy of A, B, C
    const after = childIds(app.repo, "col1")
    expect(after).toHaveLength(4)
    expect(after[0]).toBe("A")
    // The copy is after A (index 1)
    expect(after[2]).toBe("B")
    expect(after[3]).toBe("C")

    // The copy should have same content
    const copyNode = app.repo.getNode(after[1]!)
    expect(copyNode?.content).toBe("A")
  })

  test("cut single node and paste moves it", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

    expect(childIds(app.repo, "col1")).toEqual(["A", "B", "C"])

    // Cut node A
    app.press("d")

    // Navigate to C (now B is first, so j goes to C which is second)
    app.command("cursor_down") // to B
    app.command("cursor_down") // to C

    // Paste after C
    app.press("p")

    // A should now be after C: B, C, A
    const after = childContents(app.repo, "col1")
    expect(after).toEqual(["B", "C", "A"])
  })

  test("copy allows repeated paste", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"))))

    // Copy A
    app.press("y")

    // Paste twice
    app.press("p")
    app.press("p")

    // Should have A, copy1, copy2, B
    const children = app.repo.getChildren("col1")
    expect(children).toHaveLength(4)
    expect(children[0]?.content).toBe("A")
    // Both copies have same content as A
    expect(children[1]?.content).toBe("A")
    expect(children[2]?.content).toBe("A")
    expect(children[3]?.content).toBe("B")
  })

  test("cut clears clipboard after paste", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"))), { incremental: false })

    // Cut A
    app.press("d")

    // Navigate to B (now first after cut moved cursor)
    app.command("cursor_down") // to B

    // Paste after B
    app.press("p")

    // Try to paste again — should bell (clipboard cleared after cut paste)
    app.press("p")
    expect(app.bell).toBe(true)
  })

  test("paste with empty clipboard rings bell", () => {
    using app = createTestApp(item("board", item("col1", item("A"))))

    app.press("p")
    expect(app.bell).toBe(true)
  })

  test("copy with multi-selection", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))), {
      incremental: false,
    })

    // Select A and B using Shift+J (extend selection down)
    app.press("shift+ArrowDown") // extends selection to include A and B

    // Copy selection
    app.press("y")

    // Navigate to C
    app.command("cursor_down")

    // Paste after C
    app.press("p")

    // Should have A, B, C, copy-of-A, copy-of-B
    const children = app.repo.getChildren("col1")
    expect(children).toHaveLength(5)
    expect(children[0]?.content).toBe("A")
    expect(children[1]?.content).toBe("B")
    expect(children[2]?.content).toBe("C")
    expect(children[3]?.content).toBe("A")
    expect(children[4]?.content).toBe("B")
  })

  test("paste into different column", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B")), item("col2", item("X"))))

    // Copy A
    app.press("y")

    // Navigate to col2
    app.command("cursor_right")

    // Paste after X
    app.press("p")

    // col1 should be unchanged
    expect(childIds(app.repo, "col1")).toEqual(["A", "B"])

    // col2 should have X + copy of A
    const col2Children = app.repo.getChildren("col2")
    expect(col2Children).toHaveLength(2)
    expect(col2Children[0]?.content).toBe("X")
    expect(col2Children[1]?.content).toBe("A")
  })

  test("undo reverses paste", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"))), {
      incremental: false,
    })

    // Copy A and paste
    app.press("y")
    app.press("p")

    expect(app.repo.getChildren("col1")).toHaveLength(3)

    // Undo
    app.command("undo")

    expect(childIds(app.repo, "col1")).toEqual(["A", "B"])
  })

  test("undo reverses cut+paste (restores original position)", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))), {
      incremental: false,
    })

    // Cut A, navigate to C, paste
    app.press("d")
    app.command("cursor_down") // to B
    app.command("cursor_down") // to C
    app.press("p")

    // Now B, C, A
    expect(childContents(app.repo, "col1")).toEqual(["B", "C", "A"])

    // Undo — A should go back to original position
    app.command("undo")
    expect(childContents(app.repo, "col1")).toEqual(["A", "B", "C"])
  })

  test("copy on empty column copies the column heading", () => {
    using app = createTestApp(item("board", item("col1", item("A")), item("col2")), {
      incremental: false,
    })

    // Navigate to col2 (empty column — cursor on column heading node)
    app.command("cursor_right")

    // Copy works — cursor is on column heading (tree-level selection)
    app.press("y")
    expect(app.bell).toBe(false)
  })
})
