// testEnv FREEZE bucket — see km-all.test-system bead. Reason: store.getState().undoStack/undoHandle (fold/collapse tests)
/**
 * Undo/Redo Tests
 *
 * Covers:
 * - Undo stack internals (push, undo, redo, max size)
 * - Inverse computation (add↔remove, move, update)
 * - Undoable repo (auto-recording, batch operations, cursor restoration)
 * - TUI integration (u/U keys, duplicate undo/redo, cursor restore)
 * - User-level journey specs with BOTH screen + persistence verification
 *
 * Consolidated from:
 * - undo-system.test.ts (stack internals, undoable repo, TUI u/U integration)
 * - undo-redo.slow.spec.ts (journey tests with screen + data checks)
 */

import { describe, test, it, expect } from "vitest"
import { createFakeRepo } from "@km/storage"
import type { KNode } from "@km/core"
import { createUndoStack } from "../src/undo-stack.ts"
import { createUndoableRepo } from "../src/undo/undoable-repo.ts"
import { invertTreeOp } from "../src/undo/operations.ts"
import { item, testEnv } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// =============================================================================
// Helpers
// =============================================================================

/** Create a minimal undoable repo for unit tests */
function setup(nodes?: KNode[]) {
  const rawRepo = createFakeRepo({ nodes })
  const undoStack = createUndoStack()
  const { repo, handle } = createUndoableRepo(rawRepo, undoStack)
  return { repo, rawRepo, handle, undoStack }
}

/** Create a board-shaped repo with a root + column + cards */
function setupBoard() {
  const nodes = item("board", item("col1", item("task-a"), item("task-b"), item("task-c")))
  return setup(nodes)
}

function childIds(repo: { getChildren(id: string): { id: string }[] }, parentId: string): string[] {
  return repo.getChildren(parentId).map((n) => n.id)
}

// =============================================================================
// UndoStack unit tests
// =============================================================================

describe("UndoStack unit tests", () => {
  test("push and undo", () => {
    const stack = createUndoStack()
    let value = 0
    stack.push({
      label: "increment",
      undo: () => {
        value--
      },
      redo: () => {
        value++
      },
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

    stack.redo()
    expect(value).toBe(1)
  })

  test("undo clears redo history when new entry pushed", () => {
    const stack = createUndoStack()
    let value = 0
    stack.push({
      label: "a",
      undo: () => {
        value--
      },
      redo: () => {
        value++
      },
    })
    value++
    stack.push({
      label: "b",
      undo: () => {
        value -= 10
      },
      redo: () => {
        value += 10
      },
    })
    value += 10

    // Undo "b"
    stack.undo()
    expect(value).toBe(1)
    expect(stack.canRedo()).toBe(true)

    // Push new entry — should clear redo history
    stack.push({
      label: "c",
      undo: () => {
        value -= 100
      },
      redo: () => {
        value += 100
      },
    })
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

// =============================================================================
// Inverse computation
// =============================================================================

describe("invertTreeOp", () => {
  test("add_node inverts to remove_node", () => {
    const inv = invertTreeOp({
      type: "add_node",
      nodeId: "n1",
      parentId: "p1",
      parentIdx: 0,
      snapshot: { id: "n1", type: "p", item: {} } as Partial<KNode>,
    })
    expect(inv.type).toBe("remove_node")
    expect(inv.nodeId).toBe("n1")
  })

  test("remove_node inverts to add_node", () => {
    const inv = invertTreeOp({
      type: "remove_node",
      nodeId: "n1",
      parentId: "p1",
      parentIdx: 5,
      snapshot: { id: "n1", type: "p", item: {} } as KNode,
      descendants: [],
    })
    expect(inv.type).toBe("add_node")
    if (inv.type === "add_node") {
      expect(inv.parentId).toBe("p1")
      expect(inv.parentIdx).toBe(5)
    }
  })

  test("move_node inverts by swapping from/to", () => {
    const inv = invertTreeOp({
      type: "move_node",
      nodeId: "n1",
      fromParentId: "p1",
      fromIdx: 2,
      toParentId: "p2",
      toIdx: 7,
    })
    expect(inv.type).toBe("move_node")
    if (inv.type === "move_node") {
      expect(inv.fromParentId).toBe("p2")
      expect(inv.fromIdx).toBe(7)
      expect(inv.toParentId).toBe("p1")
      expect(inv.toIdx).toBe(2)
    }
  })

  test("update_node inverts by swapping before/after", () => {
    const inv = invertTreeOp({
      type: "update_node",
      nodeId: "n1",
      before: { priority: "P1" },
      after: { priority: "P3" },
    })
    expect(inv.type).toBe("update_node")
    if (inv.type === "update_node") {
      expect(inv.before).toEqual({ priority: "P3" })
      expect(inv.after).toEqual({ priority: "P1" })
    }
  })
})

// =============================================================================
// Undoable repo: add -> undo
// =============================================================================

describe("undo: add node", () => {
  test("add -> undo removes the node", () => {
    const { repo, handle } = setupBoard()

    // Add a new node
    const newId = repo.addNode("col1", {
      type: "p",
      item: { task: { marker: "[ ]", status: "todo" } },
      content: "new-task",
    })

    // Verify it exists
    expect(repo.getNode(newId)).not.toBeNull()
    expect(repo.getChildren("col1").length).toBe(4) // 3 + 1

    // Undo
    const result = handle.undo()
    expect(result.ok).toBe(true)

    // Node should be gone
    expect(repo.getNode(newId)).toBeNull()
    expect(repo.getChildren("col1").length).toBe(3)
  })

  test("add -> undo -> redo restores the node", () => {
    const { repo, handle } = setupBoard()

    const newId = repo.addNode("col1", {
      type: "p",
      item: { task: { marker: "[ ]", status: "todo" } },
      content: "new-task",
    })

    handle.undo()
    expect(repo.getNode(newId)).toBeNull()

    handle.redo()
    // After redo, a node with the same properties should exist
    // Note: the ID might differ on re-add, so check by content
    const children = repo.getChildren("col1")
    expect(children.length).toBe(4)
    const restored = children.find((n) => n.content === "new-task")
    expect(restored).toBeTruthy()
  })
})

// =============================================================================
// Undoable repo: delete -> undo
// =============================================================================

describe("undo: delete node", () => {
  test("delete -> undo restores the node with all properties", () => {
    const { repo, handle } = setupBoard()

    // Set some properties on task-a
    repo.updateNode("task-a", {
      priority: "P2",
      due_at: "2026-03-15",
      item: { task: { status: "wip", marker: "[/]" } },
    })

    // Clear the undo stack (we don't want to undo the updateNode)
    handle.stack.clear()

    // Snapshot the node before deletion
    const before = repo.getNode("task-a")
    expect(before).not.toBeNull()
    expect(before!.priority).toBe("P2")

    // Delete it
    repo.deleteNode("task-a")
    expect(repo.getNode("task-a")).toBeNull()
    expect(repo.getChildren("col1").length).toBe(2)

    // Undo
    const result = handle.undo()
    expect(result.ok).toBe(true)

    // Node should be back with all properties
    const restored = repo.getNode("task-a")
    expect(restored).not.toBeNull()
    expect(restored!.priority).toBe("P2")
    expect(restored!.due_at).toBe("2026-03-15")
    expect(restored!.item?.task?.status).toBe("wip")
    expect(repo.getChildren("col1").length).toBe(3)
  })

  test("delete -> undo -> redo removes the node again", () => {
    const { repo, handle } = setupBoard()

    repo.deleteNode("task-a")
    handle.undo()
    expect(repo.getNode("task-a")).not.toBeNull()

    handle.redo()
    expect(repo.getNode("task-a")).toBeNull()
    expect(repo.getChildren("col1").length).toBe(2)
  })
})

// =============================================================================
// Undoable repo: move -> undo
// =============================================================================

describe("undo: move node", () => {
  test("move -> undo restores original position", () => {
    const nodes = item("board", item("col1", item("task-a"), item("task-b")), item("col2"))
    const { repo, handle } = setup(nodes)

    // task-a is under col1
    expect(repo.getNode("task-a")?.parent_id).toBe("col1")
    const originalIdx = repo.getNode("task-a")?.parent_idx ?? 0

    // Move task-a to col2
    repo.moveNode("task-a", "col2", 0)
    expect(repo.getNode("task-a")?.parent_id).toBe("col2")

    // Undo
    handle.undo()
    const restored = repo.getNode("task-a")
    expect(restored?.parent_id).toBe("col1")
    expect(restored?.parent_idx).toBe(originalIdx)
  })

  test("move -> undo -> redo moves it again", () => {
    const nodes = item("board", item("col1", item("task-a")), item("col2"))
    const { repo, handle } = setup(nodes)

    repo.moveNode("task-a", "col2", 5)
    handle.undo()
    expect(repo.getNode("task-a")?.parent_id).toBe("col1")

    handle.redo()
    expect(repo.getNode("task-a")?.parent_id).toBe("col2")
  })
})

// =============================================================================
// Undoable repo: update -> undo
// =============================================================================

describe("undo: update node", () => {
  test("update -> undo restores old values", () => {
    const { repo, handle } = setupBoard()

    // Original state
    expect(repo.getNode("task-a")?.priority).toBeUndefined()

    // Update
    repo.updateNode("task-a", { priority: "P1", due_at: "2026-04-01" })
    expect(repo.getNode("task-a")?.priority).toBe("P1")
    expect(repo.getNode("task-a")?.due_at).toBe("2026-04-01")

    // Undo
    handle.undo()
    expect(repo.getNode("task-a")?.priority).toBeUndefined()
    expect(repo.getNode("task-a")?.due_at).toBeUndefined()
  })

  test("update -> undo -> redo re-applies the changes", () => {
    const { repo, handle } = setupBoard()

    repo.updateNode("task-a", { priority: "P3" })
    handle.undo()
    expect(repo.getNode("task-a")?.priority).toBeUndefined()

    handle.redo()
    expect(repo.getNode("task-a")?.priority).toBe("P3")
  })
})

// =============================================================================
// Batch operations
// =============================================================================

describe("undo: batch operations", () => {
  test("batch groups multiple mutations into single undo entry", () => {
    const { repo, handle, undoStack } = setupBoard()

    handle.startBatch("test batch")

    repo.updateNode("task-a", { priority: "P1" })
    repo.updateNode("task-b", { priority: "P2" })
    repo.updateNode("task-c", { priority: "P3" })

    handle.endBatch()

    // Only one undo entry for all three updates
    expect(undoStack.size).toBe(1)

    // All three have priorities
    expect(repo.getNode("task-a")?.priority).toBe("P1")
    expect(repo.getNode("task-b")?.priority).toBe("P2")
    expect(repo.getNode("task-c")?.priority).toBe("P3")

    // Single undo reverts all three
    handle.undo()
    expect(repo.getNode("task-a")?.priority).toBeUndefined()
    expect(repo.getNode("task-b")?.priority).toBeUndefined()
    expect(repo.getNode("task-c")?.priority).toBeUndefined()
  })

  test("batch redo restores all mutations", () => {
    const { repo, handle } = setupBoard()

    handle.startBatch("multi-update")
    repo.updateNode("task-a", { priority: "P1" })
    repo.moveNode("task-b", "col1", 99)
    handle.endBatch()

    handle.undo()
    expect(repo.getNode("task-a")?.priority).toBeUndefined()

    handle.redo()
    expect(repo.getNode("task-a")?.priority).toBe("P1")
  })

  test("empty batch does not push to stack", () => {
    const { handle, undoStack } = setupBoard()

    handle.startBatch("empty")
    handle.endBatch()

    expect(undoStack.size).toBe(0)
  })
})

// =============================================================================
// Stack behavior
// =============================================================================

describe("undo: stack behavior", () => {
  test("new edit after undo clears redo stack", () => {
    const { repo, handle, undoStack } = setupBoard()

    // Push two entries
    repo.updateNode("task-a", { priority: "P1" })
    repo.updateNode("task-b", { priority: "P2" })
    expect(undoStack.size).toBe(2)

    // Undo one
    handle.undo()
    expect(undoStack.canRedo()).toBe(true)

    // New edit should clear redo
    repo.updateNode("task-c", { priority: "P3" })
    expect(undoStack.canRedo()).toBe(false)
    expect(undoStack.size).toBe(2) // first entry + new entry (second was truncated)
  })

  test("max stack size respected", () => {
    const maxSize = 5
    const rawRepo = createFakeRepo({ nodes: item("board", item("col1", item("task"))) })
    const stack = createUndoStack(maxSize)
    const { repo } = createUndoableRepo(rawRepo, stack)

    // Push more entries than maxSize
    for (let i = 0; i < 10; i++) {
      repo.updateNode("task", { priority: `P${(i % 4) + 1}` })
    }

    expect(stack.size).toBe(maxSize)
  })

  test("undo with nothing to undo returns ok:false", () => {
    const { handle } = setupBoard()
    const result = handle.undo()
    expect(result.ok).toBe(false)
  })

  test("redo with nothing to redo returns ok:false", () => {
    const { handle } = setupBoard()
    const result = handle.redo()
    expect(result.ok).toBe(false)
  })
})

// =============================================================================
// Cursor restoration
// =============================================================================

describe("undo: cursor restoration", () => {
  test("undo restores cursorBefore", () => {
    const { repo, handle, undoStack } = setupBoard()

    handle.setCursor("task-a")
    repo.updateNode("task-b", { priority: "P2" })
    handle.setCursorAfter("task-b")

    const result = handle.undo()
    expect(result.ok).toBe(true)
    expect(result.cursor).toBe("task-a")
  })

  test("auto-batch records cursor per mutation", () => {
    const { repo, handle, undoStack } = setupBoard()

    // First mutation with cursor
    handle.setCursor("task-a")
    repo.updateNode("task-a", { priority: "P1" })

    // Second mutation with different cursor
    handle.setCursor("task-b")
    repo.updateNode("task-b", { priority: "P2" })

    // Undo second
    const result2 = handle.undo()
    expect(result2.cursor).toBe("task-b")

    // Undo first
    const result1 = handle.undo()
    expect(result1.cursor).toBe("task-a")
  })
})

// =============================================================================
// Delete with descendants -> undo restores subtree
// =============================================================================

describe("undo: delete with descendants", () => {
  test("delete node with children -> undo restores entire subtree", () => {
    const nodes = item("board", item("col1", item("parent", item("child-a"), item("child-b")), item("sibling")))
    const { repo, handle } = setup(nodes)

    // parent has 2 children
    expect(repo.getChildren("parent").length).toBe(2)

    // Delete children first, then parent (as executeBatchDelete does)
    handle.startBatch("delete parent and children")
    repo.deleteNode("child-a")
    repo.deleteNode("child-b")
    repo.deleteNode("parent")
    handle.endBatch()

    expect(repo.getNode("parent")).toBeNull()
    expect(repo.getNode("child-a")).toBeNull()
    expect(repo.getNode("child-b")).toBeNull()

    // Undo restores everything
    handle.undo()
    expect(repo.getNode("parent")).not.toBeNull()
    expect(repo.getNode("child-a")).not.toBeNull()
    expect(repo.getNode("child-b")).not.toBeNull()
    expect(repo.getChildren("parent").length).toBe(2)
  })
})

// =============================================================================
// TUI integration: u/U keys
// =============================================================================

describe("undo: TUI integration", () => {
  test("u undoes the last operation", () => {
    using app = createTestApp(item("board", item("col1", item("task-a"), item("task-b"))))

    // Duplicate task-a
    app.press("cmd+d")

    // Should have 3 cards now
    const childrenAfterDup = app.repo.getChildren("col1")
    expect(childrenAfterDup.length).toBe(3)

    // u to undo (vim-style)
    app.command("undo")

    // Should be back to 2 cards
    const childrenAfterUndo = app.repo.getChildren("col1")
    expect(childrenAfterUndo.length).toBe(2)
  })

  test("U redoes the last undone operation", () => {
    using app = createTestApp(item("board", item("col1", item("task-a"), item("task-b"))))

    // Duplicate
    app.press("cmd+d")
    expect(app.repo.getChildren("col1").length).toBe(3)

    // Undo
    app.command("undo")
    expect(app.repo.getChildren("col1").length).toBe(2)

    // Redo (U = redo)
    app.command("redo")
    expect(app.repo.getChildren("col1").length).toBe(3)
  })

  test("undo shows operation label in status bar", () => {
    using app = createTestApp(item("board", item("col1", item("task-a"), item("task-b"))))

    // Duplicate to create an undoable operation
    app.press("cmd+d")

    // Undo — status bar should show what was undone
    app.command("undo")
    expect(app.text).toContain("Undo: Add")
  })

  test("redo shows operation label in status bar", () => {
    using app = createTestApp(item("board", item("col1", item("task-a"), item("task-b"))))

    app.press("cmd+d")
    app.command("undo")

    // Redo — status bar should show what was redone
    app.command("redo")
    expect(app.text).toContain("Redo: Add")
  })

  test("undo shows batch label for multi-mutation operations", () => {
    using app = createTestApp(item("board", item("col1", item("task-a"), item("task-b"), item("task-c"))))

    // Delete is a batched operation with label "Delete"
    app.press("Backspace")

    app.command("undo")
    expect(app.text).toContain("Undo: Delete")
  })
})

// =============================================================================
// Undo duplicate node
// =============================================================================

describe("Undo duplicate node", () => {
  test("duplicate then undo removes the duplicate", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"))))

    // Verify initial state
    expect(childIds(app.repo, "col1")).toEqual(["A", "B", "C"])

    // Press d to duplicate node A (cursor starts on first card)
    app.press("cmd+d")

    // Should now have 4 children — original A + duplicate + B + C
    const afterDup = childIds(app.repo, "col1")
    expect(afterDup).toHaveLength(4)
    expect(afterDup[0]).toBe("A")
    // The duplicate is between A and B
    const dupId = afterDup[1]!
    expect(afterDup[2]).toBe("B")
    expect(afterDup[3]).toBe("C")

    // Press u to undo
    app.command("undo")

    // The duplicate should be removed
    expect(childIds(app.repo, "col1")).toEqual(["A", "B", "C"])
    // Verify the node is actually gone
    expect(app.repo.getNode(dupId)).toBeNull()
  })

  test("undo with nothing to undo rings bell", () => {
    using app = createTestApp(item("board", item("col1", item("A"))))

    // u with empty undo stack should ring bell
    app.command("undo")
    expect(app.bell).toBe(true)
  })

  test("multiple duplicates then multiple undos", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"))))

    expect(childIds(app.repo, "col1")).toEqual(["A", "B"])

    // Duplicate A
    app.press("cmd+d")
    expect(childIds(app.repo, "col1")).toHaveLength(3)

    // Navigate to B (now at index 2) and duplicate it
    app.command("cursor_down") // to dup of A
    app.command("cursor_down") // to B
    app.press("cmd+d")
    expect(childIds(app.repo, "col1")).toHaveLength(4)

    // Undo last duplicate (B's duplicate)
    app.command("undo")
    expect(childIds(app.repo, "col1")).toHaveLength(3)

    // Undo first duplicate (A's duplicate)
    app.command("undo")
    expect(childIds(app.repo, "col1")).toEqual(["A", "B"])
  })
})

// =============================================================================
// Undo cursor restore (TUI)
// =============================================================================

describe("undo cursor restore", () => {
  it("restores cursor to original card after duplicate + undo", () => {
    using app = createTestApp(item("board", item("col1", item("task-a"), item("task-b"), item("task-c"))))

    // Cursor starts on task-a. Move to task-b.
    app.command("cursor_down")
    app.expect("#task-b[data-cursor]").toExist()

    // Duplicate task-b (key: d)
    app.press("cmd+d")
    // After duplicate, cursor moves to the new duplicate (task-b copy)
    // The original task-b should still be visible
    app.expect("#task-b").toExist()

    // Undo
    app.command("undo")

    // After undo, cursor should be back on task-b (not at root or lost)
    app.expect("#task-b[data-cursor]").toExist()
  })

  it("restores cursor when undoing duplicate of first card", () => {
    using app = createTestApp(item("board", item("col1", item("first"), item("second"))))

    // Cursor starts on first card
    app.expect("#first[data-cursor]").toExist()

    // Duplicate first card
    app.press("cmd+d")

    // Undo
    app.command("undo")

    // Cursor should be back on first card
    app.expect("#first[data-cursor]").toExist()
  })
})

// =============================================================================
// Redo duplicate broken (km-wacsx)
// =============================================================================

describe("redo-duplicate-broken (km-wacsx)", () => {
  test("redo after undo restores the duplicated node", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"))))

    // Baseline: 2 children
    expect(app.repo.getChildren("col1").map((n) => n.id)).toEqual(["A", "B"])

    // Duplicate A -> 3 children
    app.press("cmd+d")
    expect(app.repo.getChildren("col1")).toHaveLength(3)

    // Undo -> back to 2
    app.command("undo")
    expect(app.repo.getChildren("col1")).toHaveLength(2)

    // Redo -> should be back to 3
    app.command("redo")
    expect(app.repo.getChildren("col1")).toHaveLength(3)
  })

  test("rapid undo/redo cycle preserves duplicate", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"))))

    app.press("cmd+d") // dup -> 3
    app.command("undo") // undo -> 2
    app.command("redo") // redo -> 3
    app.command("undo") // undo -> 2
    app.command("redo") // redo -> 3

    expect(app.repo.getChildren("col1")).toHaveLength(3)
  })
})

// =============================================================================

// =============================================================================
// Undo fold/collapse state (km-tui.undo-collapse-state)
// =============================================================================

describe("undo: fold/collapse state", () => {
  // FREEZE: needs store.getState().undoStack / undoHandle — all tests in this describe
  // TODO: fold operations don't create undo entries yet — FOLD_NODE/UNFOLD_NODE
  // use applyFoldEffects which runs board effects but doesn't push to undo stack.
  // TOGGLE_COLLAPSE does have undo support (see board-actions.ts line ~916).
  test.skip("fold operation records undo entry", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col1", item("parent", item("child-a")), item("sibling"))),
    )

    const initialSize = store.getState().undoStack.size

    // Fold parent — cursor starts on parent card
    board.command("fold_more")

    // Verify undo stack grew (operation was recorded)
    expect(store.getState().undoStack.size).toBeGreaterThan(initialSize)
    expect(store.getState().undoHandle.canUndo()).toBe(true)
  })

  test.skip("undo of fold restores fold state", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col1", item("parent", item("child-a")), item("sibling"))),
    )

    // Fold parent — cursor starts on parent card
    board.command("fold_more")

    const stackSizeBeforeUndo = store.getState().undoStack.size
    expect(store.getState().undoHandle.canUndo()).toBe(true)

    // Undo fold
    board.command("undo")

    // Verify undo was processed
    const stackSizeAfterUndo = store.getState().undoStack.size
    expect(stackSizeAfterUndo).toBeLessThanOrEqual(stackSizeBeforeUndo)
  })

  test.skip("redo of fold restores fold state", () => {
    const { board, store } = testEnv(() =>
      item("board", item("col1", item("parent", item("child-a")), item("sibling"))),
    )

    // Fold parent — cursor starts on parent card
    board.command("fold_more")

    // Undo fold
    board.command("undo")
    expect(store.getState().undoHandle.canRedo()).toBe(true)

    // Redo fold
    board.command("redo")

    // Verify redo worked
    expect(store.getState().undoHandle.canRedo()).toBe(false)
  })

  test("collapse operation records undo entry", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("A"), item("B")), item("col2")))

    const initialSize = store.getState().undoStack.size

    // Collapse column (navigate and press x)
    board.command("cursor_right")
    board.press("x") // toggle_collapse

    // Verify undo stack grew
    expect(store.getState().undoStack.size).toBeGreaterThan(initialSize)
    expect(store.getState().undoHandle.canUndo()).toBe(true)
  })

  test.skip("multiple fold operations each create undo entries", () => {
    const { board, store } = testEnv(() => item("board", item("col1", item("p1", item("c1")), item("p2", item("c2")))))

    const initialSize = store.getState().undoStack.size

    // Fold p1 — cursor starts on p1
    board.command("fold_more")
    const after1 = store.getState().undoStack.size

    // Navigate to p2, fold it
    board.command("cursor_down")
    board.command("fold_more")
    const after2 = store.getState().undoStack.size

    // Each fold should have created an entry
    expect(after1).toBeGreaterThan(initialSize)
    expect(after2).toBeGreaterThan(after1)

    // Should be able to undo both
    board.command("undo")
    expect(store.getState().undoHandle.canUndo()).toBe(true)
    board.command("undo")
    // After two undos, depends on initial state
  })
})

// =============================================================================
// Characterization: delete + undo signal interaction
// =============================================================================

describe("delete/undo cursor signal interaction", () => {
  test("delete card → cursor moves to sibling; undo → card restored + cursor valid", () => {
    using app = createTestApp(item("board", item("col1", item("task-a"), item("task-b"), item("task-c"))))

    // Move to task-b
    app.command("cursor_down")
    expect(app.state.cursor).toBe("task-b")

    // Delete task-b
    app.command("delete_node")

    // Card should be removed from repo
    const childrenAfterDelete = app.repo.getChildren("col1").map((n: { id: string }) => n.id)
    expect(childrenAfterDelete).not.toContain("task-b")

    // Cursor should be on a valid sibling
    expect(app.state.cursor).not.toBeNull()
    expect(app.state.cursor).not.toBe("task-b")

    // Undo restores the card
    app.command("undo")
    const childrenAfterUndo = app.repo.getChildren("col1").map((n: { id: string }) => n.id)
    expect(childrenAfterUndo).toContain("task-b")

    // Cursor should be valid after undo
    expect(app.state.cursor).not.toBeNull()
  })

  test("delete first card → cursor moves to next card", () => {
    using app = createTestApp(item("board", item("col1", item("first"), item("second"), item("third"))))

    // Cursor starts on first card
    expect(app.state.cursor).toBe("first")

    // Delete first
    app.command("delete_node")
    expect(app.repo.getChildren("col1").map((n: { id: string }) => n.id)).not.toContain("first")

    // Cursor should move to a remaining card
    expect(app.state.cursor).not.toBeNull()
    expect(app.state.cursor).not.toBe("first")
  })

  test("delete last card → cursor moves to previous card", () => {
    using app = createTestApp(item("board", item("col1", item("alpha"), item("beta"), item("gamma"))))

    // Navigate to last card
    app.command("cursor_down") // beta
    app.command("cursor_down") // gamma
    expect(app.state.cursor).toBe("gamma")

    // Delete last card
    app.command("delete_node")
    expect(app.repo.getChildren("col1").map((n: { id: string }) => n.id)).not.toContain("gamma")

    // Cursor should be on a remaining card (not null, not gamma)
    expect(app.state.cursor).not.toBeNull()
    expect(app.state.cursor).not.toBe("gamma")
  })

  test("delete + undo cycle preserves children count", () => {
    using app = createTestApp(item("board", item("col1", item("A"), item("B"), item("C"), item("D"))))

    const initialCount = app.repo.getChildren("col1").length
    expect(initialCount).toBe(4)

    // Delete A
    app.command("delete_node")
    expect(app.repo.getChildren("col1").length).toBe(3)

    // Undo
    app.command("undo")
    expect(app.repo.getChildren("col1").length).toBe(4)

    // Delete again and undo again — cycle should be stable
    app.command("delete_node")
    expect(app.repo.getChildren("col1").length).toBe(3)
    app.command("undo")
    expect(app.repo.getChildren("col1").length).toBe(4)
  })
})
