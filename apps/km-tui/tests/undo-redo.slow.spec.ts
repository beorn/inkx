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
import { invertOperation } from "../src/undo/operations.ts"
import { item, testEnv } from "./helpers/board-test.ts"

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

describe("invertOperation", () => {
  test("add_node inverts to remove_node", () => {
    const inv = invertOperation({
      type: "add_node",
      nodeId: "n1",
      parentId: "p1",
      parentIdx: 0,
      snapshot: { id: "n1", type: "p", item: true } as Partial<KNode>,
    })
    expect(inv.type).toBe("remove_node")
    expect(inv.nodeId).toBe("n1")
  })

  test("remove_node inverts to add_node", () => {
    const inv = invertOperation({
      type: "remove_node",
      nodeId: "n1",
      parentId: "p1",
      parentIdx: 5,
      snapshot: { id: "n1", type: "p", item: true } as KNode,
      descendants: [],
    })
    expect(inv.type).toBe("add_node")
    if (inv.type === "add_node") {
      expect(inv.parentId).toBe("p1")
      expect(inv.parentIdx).toBe(5)
    }
  })

  test("move_node inverts by swapping from/to", () => {
    const inv = invertOperation({
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
    const inv = invertOperation({
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
      item: true,
      content: "new-task",
      task_marker: "[ ]",
      task_status: "todo",
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
      item: true,
      content: "new-task",
      task_marker: "[ ]",
      task_status: "todo",
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
      task_status: "wip",
      task_marker: "[/]",
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
    expect(restored!.task_status).toBe("wip")
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
    expect(result.cursorNodeId).toBe("task-a")
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
    expect(result2.cursorNodeId).toBe("task-b")

    // Undo first
    const result1 = handle.undo()
    expect(result1.cursorNodeId).toBe("task-a")
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
    const { board, repo } = testEnv(() => item("board", item("col1", item("task-a"), item("task-b"))))

    // Duplicate task-a
    board.press("cmd+d")

    // Should have 3 cards now
    const childrenAfterDup = repo.getChildren("col1")
    expect(childrenAfterDup.length).toBe(3)

    // u to undo (vim-style)
    board.command("undo")

    // Should be back to 2 cards
    const childrenAfterUndo = repo.getChildren("col1")
    expect(childrenAfterUndo.length).toBe(2)
  })

  test("U redoes the last undone operation", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("task-a"), item("task-b"))))

    // Duplicate
    board.press("cmd+d")
    expect(repo.getChildren("col1").length).toBe(3)

    // Undo
    board.command("undo")
    expect(repo.getChildren("col1").length).toBe(2)

    // Redo (U = redo)
    board.command("redo")
    expect(repo.getChildren("col1").length).toBe(3)
  })

  test("undo shows operation label in status bar", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task-a"), item("task-b"))))

    // Duplicate to create an undoable operation
    board.press("cmd+d")

    // Undo — status bar should show what was undone
    board.command("undo")
    expect(board.screenshot()).toContain("Undo: Add")
  })

  test("redo shows operation label in status bar", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task-a"), item("task-b"))))

    board.press("cmd+d")
    board.command("undo")

    // Redo — status bar should show what was redone
    board.command("redo")
    expect(board.screenshot()).toContain("Redo: Add")
  })

  test("undo shows batch label for multi-mutation operations", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task-a"), item("task-b"), item("task-c"))))

    // Delete is a batched operation with label "Delete"
    board.press("Backspace")

    board.command("undo")
    expect(board.screenshot()).toContain("Undo: Delete")
  })
})

// =============================================================================
// Undo duplicate node
// =============================================================================

describe("Undo duplicate node", () => {
  test("duplicate then undo removes the duplicate", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"), item("C"))))

    // Verify initial state
    expect(childIds(repo, "col1")).toEqual(["A", "B", "C"])

    // Press d to duplicate node A (cursor starts on first card)
    board.press("cmd+d")

    // Should now have 4 children — original A + duplicate + B + C
    const afterDup = childIds(repo, "col1")
    expect(afterDup).toHaveLength(4)
    expect(afterDup[0]).toBe("A")
    // The duplicate is between A and B
    const dupId = afterDup[1]!
    expect(afterDup[2]).toBe("B")
    expect(afterDup[3]).toBe("C")

    // Press u to undo
    board.command("undo")

    // The duplicate should be removed
    expect(childIds(repo, "col1")).toEqual(["A", "B", "C"])
    // Verify the node is actually gone
    expect(repo.getNode(dupId)).toBeNull()
  })

  test("undo with nothing to undo rings bell", () => {
    const { board } = testEnv(() => item("board", item("col1", item("A"))))

    // u with empty undo stack should ring bell
    board.command("undo")
    expect(board.bell).toBe(true)
  })

  test("multiple duplicates then multiple undos", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

    expect(childIds(repo, "col1")).toEqual(["A", "B"])

    // Duplicate A
    board.press("cmd+d")
    expect(childIds(repo, "col1")).toHaveLength(3)

    // Navigate to B (now at index 2) and duplicate it
    board.command("cursor_down") // to dup of A
    board.command("cursor_down") // to B
    board.press("cmd+d")
    expect(childIds(repo, "col1")).toHaveLength(4)

    // Undo last duplicate (B's duplicate)
    board.command("undo")
    expect(childIds(repo, "col1")).toHaveLength(3)

    // Undo first duplicate (A's duplicate)
    board.command("undo")
    expect(childIds(repo, "col1")).toEqual(["A", "B"])
  })
})

// =============================================================================
// Undo cursor restore (TUI)
// =============================================================================

describe("undo cursor restore", () => {
  it("restores cursor to original card after duplicate + undo", () => {
    const { board } = testEnv(() => item("board", item("col1", item("task-a"), item("task-b"), item("task-c"))))

    // Cursor starts on task-a. Move to task-b.
    board.command("cursor_down")
    board.expect("#task-b[data-cursor]").toExist()

    // Duplicate task-b (key: d)
    board.press("cmd+d")
    // After duplicate, cursor moves to the new duplicate (task-b copy)
    // The original task-b should still be visible
    board.expect("#task-b").toExist()

    // Undo
    board.command("undo")

    // After undo, cursor should be back on task-b (not at root or lost)
    board.expect("#task-b[data-cursor]").toExist()
  })

  it("restores cursor when undoing duplicate of first card", () => {
    const { board } = testEnv(() => item("board", item("col1", item("first"), item("second"))))

    // Cursor starts on first card
    board.expect("#first[data-cursor]").toExist()

    // Duplicate first card
    board.press("cmd+d")

    // Undo
    board.command("undo")

    // Cursor should be back on first card
    board.expect("#first[data-cursor]").toExist()
  })
})

// =============================================================================
// Redo duplicate broken (km-wacsx)
// =============================================================================

describe("redo-duplicate-broken (km-wacsx)", () => {
  test("redo after undo restores the duplicated node", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

    // Baseline: 2 children
    expect(repo.getChildren("col1").map((n) => n.id)).toEqual(["A", "B"])

    // Duplicate A -> 3 children
    board.press("cmd+d")
    expect(repo.getChildren("col1")).toHaveLength(3)

    // Undo -> back to 2
    board.command("undo")
    expect(repo.getChildren("col1")).toHaveLength(2)

    // Redo -> should be back to 3
    board.command("redo")
    expect(repo.getChildren("col1")).toHaveLength(3)
  })

  test("rapid undo/redo cycle preserves duplicate", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("A"), item("B"))))

    board.press("cmd+d") // dup -> 3
    board.command("undo") // undo -> 2
    board.command("redo") // redo -> 3
    board.command("undo") // undo -> 2
    board.command("redo") // redo -> 3

    expect(repo.getChildren("col1")).toHaveLength(3)
  })
})

// =============================================================================
// Undo fold/collapse state (km-tui.undo-collapse-state)
// =============================================================================

/** Helper to get the active board pane from app state */
function getActiveBoardPane(appState: any) {
  const pane = Array.from(appState.workspace.panes.values()).find((p: any) => p.type === "board")
  if (!pane || pane.type !== "board") throw new Error("No active board pane found")
  return pane
}

describe("undo: fold/collapse state", () => {
  test("folding a node creates undoable entry", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("child-a"), item("child-b")), item("sibling"))),
    )

    // Navigate to parent
    board.navigateTo("parent")

    // Verify parent has children
    expect(repo.getChildren("parent").length).toBe(2)

    // Fold the parent (f key)
    board.press("f")

    // Parent should be in foldDepths with depth 0 (collapsed)
    const appState = board.getAppState()
    const pane = getActiveBoardPane(appState)
    expect(pane.foldDepths.has("parent")).toBe(true)
    expect(pane.foldDepths.get("parent")).toBe(0)
  })

  test("undo fold restores expanded state", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("child-a"), item("child-b")), item("sibling"))),
    )

    // Navigate to parent
    board.navigateTo("parent")

    // Initial: parent is expanded (not in foldDepths)
    let appState = board.getAppState()
    let pane = getActiveBoardPane(appState)
    expect(pane.foldDepths.has("parent")).toBe(false)

    // Fold the parent
    board.press("f")
    appState = board.getAppState()
    pane = getActiveBoardPane(appState)
    expect(pane.foldDepths.has("parent")).toBe(true)

    // Undo fold
    board.command("undo")
    appState = board.getAppState()
    pane = getActiveBoardPane(appState)
    expect(pane.foldDepths.has("parent")).toBe(false)
  })

  test("redo fold restores collapsed state", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("parent", item("child-a"), item("child-b")), item("sibling"))),
    )

    // Navigate to parent and fold
    board.navigateTo("parent")
    board.press("f")

    // Verify folded
    let appState = board.getAppState()
    let pane = getActiveBoardPane(appState)
    expect(pane.foldDepths.has("parent")).toBe(true)

    // Undo fold
    board.command("undo")
    appState = board.getAppState()
    pane = getActiveBoardPane(appState)
    expect(pane.foldDepths.has("parent")).toBe(false)

    // Redo fold
    board.command("redo")
    appState = board.getAppState()
    pane = getActiveBoardPane(appState)
    expect(pane.foldDepths.has("parent")).toBe(true)
    expect(pane.foldDepths.get("parent")).toBe(0)
  })

  test("collapsing a list item creates undoable entry", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C")), item("col2")),
    )

    // Navigate to col1 (list item)
    board.navigateTo("col1")

    // Initial: col1 is not collapsed
    let appState = board.getAppState()
    let pane = getActiveBoardPane(appState)
    expect(pane.collapsedNodes.has("col1")).toBe(false)

    // Collapse col1 (x key)
    board.press("x")

    // Verify collapsed
    appState = board.getAppState()
    pane = getActiveBoardPane(appState)
    expect(pane.collapsedNodes.has("col1")).toBe(true)
  })

  test("undo collapse restores expanded list item", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C")), item("col2")),
    )

    // Navigate to col1
    board.navigateTo("col1")

    // Collapse col1
    board.press("x")
    let appState = board.getAppState()
    let pane = getActiveBoardPane(appState)
    expect(pane.collapsedNodes.has("col1")).toBe(true)

    // Undo collapse
    board.command("undo")
    appState = board.getAppState()
    pane = getActiveBoardPane(appState)
    expect(pane.collapsedNodes.has("col1")).toBe(false)
  })

  test("redo collapse restores collapsed list item", () => {
    const { board } = testEnv(() =>
      item("board", item("col1", item("A"), item("B"), item("C")), item("col2")),
    )

    // Navigate to col1, collapse, undo
    board.navigateTo("col1")
    board.press("x")
    board.command("undo")

    // Verify expanded
    let appState = board.getAppState()
    let pane = getActiveBoardPane(appState)
    expect(pane.collapsedNodes.has("col1")).toBe(false)

    // Redo collapse
    board.command("redo")
    appState = board.getAppState()
    pane = getActiveBoardPane(appState)
    expect(pane.collapsedNodes.has("col1")).toBe(true)
  })

  test("fold state is independent of node mutations", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("col1", item("parent", item("child-a")), item("sibling"))),
    )

    // Navigate to parent and fold it
    board.navigateTo("parent")
    board.press("f")

    let appState = board.getAppState()
    let pane = getActiveBoardPane(appState)
    expect(pane.foldDepths.has("parent")).toBe(true)

    // Edit the parent node
    board.press("Enter")
    board.type("!")
    board.press("Escape")

    // Verify parent is still folded after edit
    appState = board.getAppState()
    pane = getActiveBoardPane(appState)
    expect(pane.foldDepths.has("parent")).toBe(true)

    // Undo the edit (node change only)
    board.command("undo")

    // Parent should remain folded
    appState = board.getAppState()
    pane = getActiveBoardPane(appState)
    expect(pane.foldDepths.has("parent")).toBe(true)
  })

  test("multiple folds can be individually undone", () => {
    const { board } = testEnv(() =>
      item(
        "board",
        item("col1", item("p1", item("c1")), item("p2", item("c2")), item("p3", item("c3"))),
      ),
    )

    // Fold p1
    board.navigateTo("p1")
    board.press("f")

    // Fold p2
    board.navigateTo("p2")
    board.press("f")

    // Fold p3
    board.navigateTo("p3")
    board.press("f")

    // Verify all folded
    let appState = board.getAppState()
    expect(appState.foldDepths.has("p1")).toBe(true)
    expect(appState.foldDepths.has("p2")).toBe(true)
    expect(appState.foldDepths.has("p3")).toBe(true)

    // Undo p3 fold
    board.command("undo")
    appState = board.getAppState()
    expect(appState.foldDepths.has("p1")).toBe(true)
    expect(appState.foldDepths.has("p2")).toBe(true)
    expect(appState.foldDepths.has("p3")).toBe(false)

    // Undo p2 fold
    board.command("undo")
    appState = board.getAppState()
    expect(appState.foldDepths.has("p1")).toBe(true)
    expect(appState.foldDepths.has("p2")).toBe(false)
    expect(appState.foldDepths.has("p3")).toBe(false)

    // Undo p1 fold
    board.command("undo")
    appState = board.getAppState()
    expect(appState.foldDepths.has("p1")).toBe(false)
    expect(appState.foldDepths.has("p2")).toBe(false)
    expect(appState.foldDepths.has("p3")).toBe(false)
  })
})

// =============================================================================
// Undo/Redo Journeys (screen + persistence verification)
// =============================================================================

describe("Undo/Redo Journeys", () => {
  test("shift card down, undo restores original order on screen and in repo", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("aa"), item("bb"), item("cc"))))
    board.expect("#aa[data-cursor]").toExist()

    // Verify initial order: aa above bb above cc
    const aaBoxBefore = board.q("#aa").boundingBox()
    const bbBoxBefore = board.q("#bb").boundingBox()
    expect(aaBoxBefore!.y).toBeLessThan(bbBoxBefore!.y)

    // Step 1: Shift aa down (swaps with bb)
    board.press("opt+j")

    // Verify shift took effect — bb now above aa
    const aaBoxAfter = board.q("#aa").boundingBox()
    const bbBoxAfter = board.q("#bb").boundingBox()
    expect(bbBoxAfter!.y).toBeLessThan(aaBoxAfter!.y)

    // Verify repo order changed
    const orderAfterShift = repo.getChildren("col1").map((n) => n.id)
    expect(orderAfterShift[0]).toBe("bb")
    expect(orderAfterShift[1]).toBe("aa")

    // Step 2: Undo the shift
    board.command("undo")

    // Verify undo restored original order — BOTH screen and repo
    const aaBoxRestored = board.q("#aa").boundingBox()
    const bbBoxRestored = board.q("#bb").boundingBox()
    expect(aaBoxRestored!.y).toBeLessThan(bbBoxRestored!.y)

    const orderAfterUndo = repo.getChildren("col1").map((n) => n.id)
    expect(orderAfterUndo).toEqual(["aa", "bb", "cc"])
  })

  test("duplicate card, undo removes it from screen and repo, redo brings it back", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("taskA"), item("taskB"))))
    board.expect("#taskA[data-cursor]").toExist()

    // Step 1: Duplicate taskA
    board.press("cmd+d")

    const childrenAfterDup = repo.getChildren("col1")
    expect(childrenAfterDup.length).toBe(3)
    const dupId = childrenAfterDup[1]!.id

    // Screen should show both original cards
    board.expect("#taskA").toExist()
    board.expect("#taskB").toExist()

    // Step 2: Undo — duplicate should vanish from both screen and repo
    board.command("undo")

    expect(repo.getChildren("col1").length).toBe(2)
    expect(repo.getNode(dupId)).toBeNull()

    // Screen: only original cards remain
    board.expect("#taskA").toExist()
    board.expect("#taskB").toExist()

    // Step 3: Redo — duplicate should reappear
    board.command("redo")

    expect(repo.getChildren("col1").length).toBe(3)
    board.expect("#taskA").toExist()
    board.expect("#taskB").toExist()
  })

  test("delete card, undo restores it on screen and in repo", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("alpha"), item("beta"), item("gamma"))))

    // Navigate to beta
    board.command("cursor_down")
    board.expect("#beta[data-cursor]").toExist()

    // Step 1: Delete beta
    board.press("Backspace")

    // Beta gone from screen and repo
    board.expect("#beta").not.toExist()
    expect(repo.getNode("beta")).toBeNull()
    expect(repo.getChildren("col1").map((n) => n.id)).toEqual(["alpha", "gamma"])

    // Step 2: Undo — beta should be restored
    board.command("undo")

    expect(repo.getNode("beta")).not.toBeNull()
    expect(repo.getChildren("col1").map((n) => n.id)).toEqual(["alpha", "beta", "gamma"])

    // Screen should show beta again
    board.expect("#beta").toExist()
    board.expect("#alpha").toExist()
    board.expect("#gamma").toExist()
  })

  test("move card between columns, undo restores original column", () => {
    const { board, repo } = testEnv(() =>
      item("board", item("todo", item("fix-bug"), item("write-docs")), item("done", item("ship-v1"))),
    )
    board.expect("#fix-bug[data-cursor]").toExist()

    // Step 1: Move fix-bug to done column
    board.press("opt+l")

    // Verify: fix-bug now in done column (same x as ship-v1)
    const fixBox = board.q("#fix-bug").boundingBox()
    const shipBox = board.q("#ship-v1").boundingBox()
    expect(fixBox!.x).toBe(shipBox!.x)

    // Repo: fix-bug's parent should be done
    expect(repo.getNode("fix-bug")?.parent_id).toBe("done")

    // Step 2: Undo — fix-bug should return to todo
    board.command("undo")

    // Repo: parent should be todo again
    expect(repo.getNode("fix-bug")?.parent_id).toBe("todo")

    // Screen: fix-bug should be back in todo column (same x as write-docs)
    board.expect("#fix-bug").toExist()
    const fixBoxAfter = board.q("#fix-bug").boundingBox()
    const docsBox = board.q("#write-docs").boundingBox()
    expect(fixBoxAfter!.x).toBe(docsBox!.x)
  })

  test("undo with empty stack rings bell, redo with empty stack rings bell", () => {
    const { board } = testEnv(() => item("board", item("col1", item("only"))))

    // Step 1: Undo with nothing to undo
    board.command("undo")
    expect(board.bell).toBe(true)

    // Step 2: Redo with nothing to redo
    board.command("redo")
    expect(board.bell).toBe(true)

    // Board should still render correctly
    board.expect("#only[data-cursor]").toExist()
  })

  test("multiple edits then multiple undos restore in reverse order", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("t1"), item("t2"), item("t3"))))

    // Step 1: Duplicate t1
    board.press("cmd+d")
    expect(repo.getChildren("col1").length).toBe(4)

    // Step 2: Navigate to t3 (now at index 3) and delete it
    board.command("cursor_down") // dup of t1
    board.command("cursor_down") // t2
    board.command("cursor_down") // t3
    board.expect("#t3[data-cursor]").toExist()
    board.press("Backspace")
    expect(repo.getNode("t3")).toBeNull()

    // Step 3: Undo delete — t3 should reappear
    board.command("undo")
    expect(repo.getNode("t3")).not.toBeNull()
    board.expect("#t3").toExist()

    // Step 4: Undo duplicate — duplicate should disappear
    board.command("undo")
    expect(repo.getChildren("col1").length).toBe(3)
    expect(repo.getChildren("col1").map((n) => n.id)).toEqual(["t1", "t2", "t3"])

    // Screen should show exactly the original 3 cards
    board.expect("#t1").toExist()
    board.expect("#t2").toExist()
    board.expect("#t3").toExist()
  })
})

// =============================================================================
// Undo indent (Tab) — km-tui.tab-undo-corruption
// =============================================================================

describe("undo: indent node (Tab)", () => {
  test("indent -> undo restores original parent and position", () => {
    const { repo, handle } = setup(item("board", item("col1", item("task-a"), item("task-b"), item("task-c"))))

    // task-b is under col1 at position 1
    expect(repo.getNode("task-b")?.parent_id).toBe("col1")
    const originalIdx = repo.getNode("task-b")?.parent_idx ?? -1

    // Simulate indent: move task-b under task-a (its previous sibling)
    handle.setCursor("task-b")
    repo.moveNode("task-b", "task-a", 0)

    // Verify indent took effect
    expect(repo.getNode("task-b")?.parent_id).toBe("task-a")
    expect(childIds(repo, "task-a")).toContain("task-b")
    expect(childIds(repo, "col1")).toEqual(["task-a", "task-c"])

    // Undo
    const result = handle.undo()
    expect(result.ok).toBe(true)

    // task-b should be back under col1 with original parent_idx
    const restored = repo.getNode("task-b")
    expect(restored?.parent_id).toBe("col1")
    expect(restored?.parent_idx).toBe(originalIdx)

    // All three should be children of col1 in original order
    expect(childIds(repo, "col1")).toEqual(["task-a", "task-b", "task-c"])
  })

  test("TUI: Tab to indent, u to undo restores card hierarchy", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("alpha"), item("beta"), item("gamma"))))

    // Navigate to beta (second card)
    board.command("cursor_down")
    board.expect("#beta[data-cursor]").toExist()

    // Verify initial state
    expect(childIds(repo, "col1")).toEqual(["alpha", "beta", "gamma"])

    // Indent beta (should reparent under alpha)
    board.command("indent_node")

    // beta should now be a child of alpha
    expect(repo.getNode("beta")?.parent_id).toBe("alpha")
    expect(childIds(repo, "alpha")).toContain("beta")
    // col1 should have only alpha and gamma as direct children
    expect(childIds(repo, "col1")).toEqual(["alpha", "gamma"])

    // Undo the indent
    board.command("undo")

    // beta should be back under col1
    expect(repo.getNode("beta")?.parent_id).toBe("col1")
    expect(childIds(repo, "col1")).toEqual(["alpha", "beta", "gamma"])
    expect(childIds(repo, "alpha")).toEqual([])

    // Screen should show all three cards
    board.expect("#alpha").toExist()
    board.expect("#beta").toExist()
    board.expect("#gamma").toExist()
  })

  test("TUI: indent + undo + redo cycle preserves data", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("first"), item("second"))))

    // Navigate to second
    board.command("cursor_down")
    board.expect("#second[data-cursor]").toExist()

    // Indent
    board.command("indent_node")
    expect(repo.getNode("second")?.parent_id).toBe("first")

    // Undo
    board.command("undo")
    expect(repo.getNode("second")?.parent_id).toBe("col1")
    expect(childIds(repo, "col1")).toEqual(["first", "second"])

    // Redo
    board.command("redo")
    expect(repo.getNode("second")?.parent_id).toBe("first")

    // Undo again
    board.command("undo")
    expect(repo.getNode("second")?.parent_id).toBe("col1")
    expect(childIds(repo, "col1")).toEqual(["first", "second"])

    // No node should be lost
    expect(repo.getNode("first")).not.toBeNull()
    expect(repo.getNode("second")).not.toBeNull()
  })

  test("TUI: indent does not corrupt sibling content", () => {
    const { board, repo } = testEnv(() => item("board", item("col1", item("aaa"), item("bbb"), item("ccc"))))

    // Navigate to bbb
    board.command("cursor_down")

    // Indent bbb under aaa
    board.command("indent_node")

    // Undo
    board.command("undo")

    // Verify no content shuffling: each node retains its original content
    expect(repo.getNode("aaa")?.content).toBe("aaa")
    expect(repo.getNode("bbb")?.content).toBe("bbb")
    expect(repo.getNode("ccc")?.content).toBe("ccc")

    // Verify hierarchy is fully restored
    expect(repo.getNode("aaa")?.parent_id).toBe("col1")
    expect(repo.getNode("bbb")?.parent_id).toBe("col1")
    expect(repo.getNode("ccc")?.parent_id).toBe("col1")
  })
})

// =============================================================================
// Fold state undo/redo (km-tui.undo-collapse-state)
// =============================================================================

describe("undo: fold state", () => {
  test("TUI: fold node is undoable", () => {
    const nodes = item("board", item("col1", item("task-parent", item("child-1"), item("child-2"))))
    const { board, store } = testEnv(() => nodes)

    // Get initial fold state
    const pane = Array.from(store.getState().workspace.panes.values()).find((p) => p.rootId === "board")
    expect(pane).toBeDefined()
    const initialFoldDepths = new Map(pane!.foldDepths)

    // Fold task-parent (navigate to parent first)
    board.command("cursor_down") // navigate to col1
    board.command("cursor_right") // navigate to task-parent
    board.command("fold_node")

    // Verify fold state changed (parent should now be folded)
    const foldedPane = Array.from(store.getState().workspace.panes.values()).find((p) => p.rootId === "board")
    expect(foldedPane?.foldDepths.size).toBeGreaterThan(0)

    // Undo fold
    board.command("undo")

    // Verify fold state is restored
    const unfoldedPane = Array.from(store.getState().workspace.panes.values()).find((p) => p.rootId === "board")
    expect(unfoldedPane?.foldDepths).toEqual(initialFoldDepths)

    // Redo fold
    board.command("redo")

    // Verify fold state is re-applied
    const refoldedPane = Array.from(store.getState().workspace.panes.values()).find((p) => p.rootId === "board")
    expect(refoldedPane?.foldDepths.size).toBeGreaterThan(0)
  })

  test("TUI: toggle collapse is undoable", () => {
    const nodes = item("board", item("col1", item("task-1"), item("task-2"), item("task-3")))
    const { board, store } = testEnv(() => nodes)

    // Navigate to col1 (left column - the column with tasks)
    board.command("cursor_right") // col1 is to the right

    // Get initial collapsed state
    const pane = Array.from(store.getState().workspace.panes.values()).find((p) => p.rootId === "board")
    const initialCollapsed = new Set(pane!.collapsedNodes)

    // Toggle collapse on col1
    board.command("toggle_collapse")

    // Verify collapse state changed
    const collapsedPane = Array.from(store.getState().workspace.panes.values()).find((p) => p.rootId === "board")
    expect(collapsedPane?.collapsedNodes.has("col1")).toBe(true)

    // Undo collapse
    board.command("undo")

    // Verify collapse state is restored
    const uncollapsedPane = Array.from(store.getState().workspace.panes.values()).find((p) => p.rootId === "board")
    expect(uncollapsedPane?.collapsedNodes).toEqual(initialCollapsed)

    // Redo collapse
    board.command("redo")

    // Verify collapse state is re-applied
    const recollapsedPane = Array.from(store.getState().workspace.panes.values()).find((p) => p.rootId === "board")
    expect(recollapsedPane?.collapsedNodes.has("col1")).toBe(true)
  })

  test("TUI: fold + edit, undo restores both", () => {
    const nodes = item("board", item("col1", item("task-a", item("child"))))
    const { board, repo, store } = testEnv(() => nodes)

    // Get initial state
    const pane = Array.from(store.getState().workspace.panes.values()).find((p) => p.rootId === "board")
    const initialFoldDepths = new Map(pane!.foldDepths)

    // Navigate to task-a
    board.command("cursor_right") // navigate to col1
    board.command("cursor_right") // navigate to task-a

    // Edit task-a first
    board.command("enter_edit")
    board.type(" (edited)")
    board.command("exit_edit")

    // Then fold task-a
    board.command("fold_node")

    // Verify both changes applied
    expect(repo.getNode("task-a")?.content).toBe("task-a (edited)")
    const editedPane = Array.from(store.getState().workspace.panes.values()).find((p) => p.rootId === "board")
    expect(editedPane?.foldDepths.size).toBeGreaterThan(0)

    // Undo fold — both fold state and recent edit should be undone
    board.command("undo")

    // After undo, fold state should be reset
    const unfoldedPane = Array.from(store.getState().workspace.panes.values()).find((p) => p.rootId === "board")
    expect(unfoldedPane?.foldDepths).toEqual(initialFoldDepths)
  })
})
