/**
 * Undo Stack — Additional Coverage
 *
 * Supplements undo-redo.slow.spec.ts with tests for:
 * - copyFoldState: deep copy semantics (no shared references)
 * - cursor restoration on undo/redo
 * - foldState restoration on undo/redo
 * - clear() resets everything
 * - undo/redo result shape
 * - edge cases: multiple undos past empty, redo after clear
 */

import { describe, test, expect } from "vitest"
import { createUndoStack, copyFoldState, type FoldState } from "../src/undo-stack.ts"

// =============================================================================
// copyFoldState
// =============================================================================

describe("copyFoldState", () => {
  test("creates a deep copy with no shared references", () => {
    const original: FoldState = {
      foldDepths: new Map([
        ["a", 1],
        ["b", 2],
      ]),
      collapsedNodes: new Set(["c", "d"]),
    }

    const copy = copyFoldState(original)

    // Values are equal
    expect(copy.foldDepths).toEqual(original.foldDepths)
    expect(copy.collapsedNodes).toEqual(original.collapsedNodes)

    // But not the same reference
    expect(copy.foldDepths).not.toBe(original.foldDepths)
    expect(copy.collapsedNodes).not.toBe(original.collapsedNodes)

    // Mutating copy doesn't affect original
    copy.foldDepths.set("e", 3)
    copy.collapsedNodes.add("f")
    expect(original.foldDepths.has("e")).toBe(false)
    expect(original.collapsedNodes.has("f")).toBe(false)
  })

  test("handles empty state", () => {
    const empty: FoldState = {
      foldDepths: new Map(),
      collapsedNodes: new Set(),
    }
    const copy = copyFoldState(empty)
    expect(copy.foldDepths.size).toBe(0)
    expect(copy.collapsedNodes.size).toBe(0)
  })
})

// =============================================================================
// Cursor restoration
// =============================================================================

describe("cursor restoration", () => {
  test("undo returns cursor from entry", () => {
    const stack = createUndoStack()
    stack.push({
      label: "move",
      undo: () => {},
      redo: () => {},
      cursor: "node-before",
    })

    const result = stack.undo()
    expect(result.ok).toBe(true)
    expect(result.cursor).toBe("node-before")
  })

  test("undo returns null cursor when entry has no cursor", () => {
    const stack = createUndoStack()
    stack.push({
      label: "move",
      undo: () => {},
      redo: () => {},
    })

    const result = stack.undo()
    expect(result.ok).toBe(true)
    expect(result.cursor).toBeUndefined()
  })

  test("redo does not return cursor (by design)", () => {
    const stack = createUndoStack()
    stack.push({
      label: "move",
      undo: () => {},
      redo: () => {},
      cursor: "node-before",
    })

    stack.undo()
    const result = stack.redo()
    expect(result.ok).toBe(true)
    // Redo returns label but cursor is not part of redo result
    expect(result.cursor).toBeUndefined()
  })
})

// =============================================================================
// Fold state restoration
// =============================================================================

describe("fold state restoration", () => {
  test("undo returns foldStateBefore", () => {
    const foldBefore: FoldState = {
      foldDepths: new Map([["a", 1]]),
      collapsedNodes: new Set(["b"]),
    }
    const foldAfter: FoldState = {
      foldDepths: new Map([["a", 2]]),
      collapsedNodes: new Set(),
    }

    const stack = createUndoStack()
    stack.push({
      label: "fold",
      undo: () => {},
      redo: () => {},
      foldStateBefore: foldBefore,
      foldStateAfter: foldAfter,
    })

    const result = stack.undo()
    expect(result.foldState).toBe(foldBefore)
  })

  test("redo returns foldStateAfter", () => {
    const foldBefore: FoldState = {
      foldDepths: new Map([["a", 1]]),
      collapsedNodes: new Set(["b"]),
    }
    const foldAfter: FoldState = {
      foldDepths: new Map([["a", 2]]),
      collapsedNodes: new Set(),
    }

    const stack = createUndoStack()
    stack.push({
      label: "fold",
      undo: () => {},
      redo: () => {},
      foldStateBefore: foldBefore,
      foldStateAfter: foldAfter,
    })

    stack.undo()
    const result = stack.redo()
    expect(result.foldState).toBe(foldAfter)
  })
})

// =============================================================================
// clear()
// =============================================================================

describe("clear", () => {
  test("clear resets size to 0", () => {
    const stack = createUndoStack()
    stack.push({ label: "a", undo: () => {}, redo: () => {} })
    stack.push({ label: "b", undo: () => {}, redo: () => {} })
    expect(stack.size).toBe(2)

    stack.clear()
    expect(stack.size).toBe(0)
    expect(stack.canUndo()).toBe(false)
    expect(stack.canRedo()).toBe(false)
  })

  test("undo after clear returns not-ok", () => {
    const stack = createUndoStack()
    stack.push({ label: "a", undo: () => {}, redo: () => {} })
    stack.clear()

    const result = stack.undo()
    expect(result.ok).toBe(false)
  })

  test("redo after clear returns not-ok", () => {
    const stack = createUndoStack()
    stack.push({ label: "a", undo: () => {}, redo: () => {} })
    stack.undo()
    // There's redo history now
    expect(stack.canRedo()).toBe(true)

    stack.clear()
    const result = stack.redo()
    expect(result.ok).toBe(false)
  })
})

// =============================================================================
// UndoResult shape
// =============================================================================

describe("UndoResult", () => {
  test("undo result includes label", () => {
    const stack = createUndoStack()
    stack.push({ label: "Delete card", undo: () => {}, redo: () => {} })

    const result = stack.undo()
    expect(result.ok).toBe(true)
    expect(result.label).toBe("Delete card")
  })

  test("redo result includes label", () => {
    const stack = createUndoStack()
    stack.push({ label: "Move card", undo: () => {}, redo: () => {} })
    stack.undo()

    const result = stack.redo()
    expect(result.ok).toBe(true)
    expect(result.label).toBe("Move card")
  })

  test("failed undo returns no label or cursor", () => {
    const stack = createUndoStack()
    const result = stack.undo()
    expect(result.ok).toBe(false)
    expect(result.label).toBeUndefined()
    expect(result.cursor).toBeUndefined()
  })

  test("failed redo returns no label", () => {
    const stack = createUndoStack()
    const result = stack.redo()
    expect(result.ok).toBe(false)
    expect(result.label).toBeUndefined()
  })
})

// =============================================================================
// Edge cases
// =============================================================================

describe("undo stack edge cases", () => {
  test("multiple undos past empty are no-ops", () => {
    const stack = createUndoStack()
    let value = 0
    stack.push({
      label: "inc",
      undo: () => {
        value--
      },
      redo: () => {
        value++
      },
    })
    value++

    stack.undo()
    expect(value).toBe(0)

    // Additional undos should be no-ops
    expect(stack.undo().ok).toBe(false)
    expect(stack.undo().ok).toBe(false)
    expect(value).toBe(0)
  })

  test("multiple redos past end are no-ops", () => {
    const stack = createUndoStack()
    let value = 0
    stack.push({
      label: "inc",
      undo: () => {
        value--
      },
      redo: () => {
        value++
      },
    })
    value++

    stack.undo()
    stack.redo()
    expect(value).toBe(1)

    // Additional redos should be no-ops
    expect(stack.redo().ok).toBe(false)
    expect(stack.redo().ok).toBe(false)
    expect(value).toBe(1)
  })

  test("push after undo truncates redo history (new branch)", () => {
    const stack = createUndoStack()
    const log: string[] = []

    stack.push({ label: "A", undo: () => log.push("undo-A"), redo: () => log.push("redo-A") })
    stack.push({ label: "B", undo: () => log.push("undo-B"), redo: () => log.push("redo-B") })
    stack.push({ label: "C", undo: () => log.push("undo-C"), redo: () => log.push("redo-C") })

    // Undo C and B
    stack.undo() // undo-C
    stack.undo() // undo-B

    // Push D — should truncate C and B from redo
    stack.push({ label: "D", undo: () => log.push("undo-D"), redo: () => log.push("redo-D") })
    expect(stack.canRedo()).toBe(false)
    expect(stack.size).toBe(2) // A + D

    // Redo should not bring back B or C
    expect(stack.redo().ok).toBe(false)
  })
})
