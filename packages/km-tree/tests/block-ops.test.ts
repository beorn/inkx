/**
 * Block Operations Tests - Split and Merge
 *
 * Tests for pure tree operations: splitNode, mergeWithPrevious.
 * Uses createTestRepo for an in-memory Repo that satisfies TreeMutator.
 */

import { describe, test, expect } from "vitest"
import { createTestRepo } from "@km/storage"
import {
  splitNode,
  mergeWithPrevious,
  getNodeText,
  setNodeText,
  getPreviousSibling,
  getNextSibling,
} from "../src/block-ops.ts"

// =============================================================================
// Helpers
// =============================================================================

/** Create a repo with a parent outline item and task children for testing */
function setupTaskTree() {
  const repo = createTestRepo()

  // Create parent outline item (section)
  const parentId = repo.addNode(null, {
    type: "oi",
    fstype: "mdsection",
    name: "Tasks",
    content: "Tasks",
  })

  // Create three task children (list items with task markers)
  const task1Id = repo.addNode(parentId, {
    type: "li",
    list_marker: "-",
    content: "- [ ] Alpha bravo",
    task_status: "todo",
    task_marker: "[ ]",
    parent_idx: 1,
  })

  const task2Id = repo.addNode(parentId, {
    type: "li",
    list_marker: "-",
    content: "- [ ] Charlie delta",
    task_status: "todo",
    task_marker: "[ ]",
    parent_idx: 2,
  })

  const task3Id = repo.addNode(parentId, {
    type: "li",
    list_marker: "-",
    content: "- [ ] Echo foxtrot",
    task_status: "todo",
    task_marker: "[ ]",
    parent_idx: 3,
  })

  return { repo, parentId, task1Id, task2Id, task3Id }
}

/** Create a repo with nested outline items for testing */
function setupSectionTree() {
  const repo = createTestRepo()

  const rootId = repo.addNode(null, {
    type: "oi",
    fstype: "mdsection",
    name: "Root",
    content: "Root",
  })

  const sec1Id = repo.addNode(rootId, {
    type: "oi",
    fstype: "mdsection",
    name: "Section One",
    content: "Section One",
    parent_idx: 1,
  })

  const sec2Id = repo.addNode(rootId, {
    type: "oi",
    fstype: "mdsection",
    name: "Section Two",
    content: "Section Two",
    parent_idx: 2,
  })

  return { repo, rootId, sec1Id, sec2Id }
}

// =============================================================================
// getNodeText / setNodeText
// =============================================================================

describe("getNodeText", () => {
  test("returns task content without checkbox prefix", () => {
    const node = {
      type: "li",
      task_marker: "[ ]",
      content: "- [ ] Buy groceries",
    } as any
    expect(getNodeText(node)).toBe("Buy groceries")
  })

  test("returns outline item name", () => {
    const node = {
      type: "oi",
      name: "My Section",
      content: "My Section",
    } as any
    expect(getNodeText(node)).toBe("My Section")
  })

  test("returns content for other types", () => {
    const node = { type: "p", content: "Hello world" } as any
    expect(getNodeText(node)).toBe("Hello world")
  })

  test("handles done task marker", () => {
    const node = {
      type: "li",
      task_marker: "[x]",
      content: "- [x] Completed item",
    } as any
    expect(getNodeText(node)).toBe("Completed item")
  })

  test("handles null content", () => {
    const node = { type: "p", content: null } as any
    expect(getNodeText(node)).toBe("")
  })
})

describe("setNodeText", () => {
  test("wraps task text with checkbox prefix", () => {
    const node = {
      type: "li",
      task_marker: "[ ]",
    } as any
    expect(setNodeText(node, "New text")).toBe("- [ ] New text")
  })

  test("preserves done task marker", () => {
    const node = {
      type: "li",
      task_marker: "[x]",
    } as any
    expect(setNodeText(node, "Done item")).toBe("- [x] Done item")
  })

  test("returns plain text for outline items", () => {
    const node = { type: "oi" } as any
    expect(setNodeText(node, "Section Name")).toBe("Section Name")
  })

  test("returns plain text for other types", () => {
    const node = { type: "p" } as any
    expect(setNodeText(node, "Paragraph")).toBe("Paragraph")
  })
})

// =============================================================================
// splitNode
// =============================================================================

describe("splitNode", () => {
  test("split task in middle creates two tasks", () => {
    const { repo, parentId, task2Id } = setupTaskTree()

    // "Charlie delta" - split at offset 7 (after "Charlie")
    const result = splitNode(repo, task2Id, 7)

    expect(result.beforeId).toBe(task2Id)

    // Original node should have "Charlie"
    const before = repo.getNode(result.beforeId)!
    expect(getNodeText(before)).toBe("Charlie")
    expect(before.type).toBe("li")

    // New node should have " delta"
    const after = repo.getNode(result.afterId)!
    expect(getNodeText(after)).toBe(" delta")
    expect(after.type).toBe("li")
    expect(after.task_status).toBe("todo")

    // Both should be children of the parent
    const children = repo.getChildren(parentId)
    expect(children).toHaveLength(4) // was 3, now 4
    const ids = children.map((c) => c.id)
    expect(ids.indexOf(result.beforeId)).toBeLessThan(ids.indexOf(result.afterId))
  })

  test("split at start creates empty node before", () => {
    const { repo, parentId, task2Id } = setupTaskTree()

    const result = splitNode(repo, task2Id, 0)

    // Original node should be empty
    const before = repo.getNode(result.beforeId)!
    expect(getNodeText(before)).toBe("")

    // New node should have full text
    const after = repo.getNode(result.afterId)!
    expect(getNodeText(after)).toBe("Charlie delta")

    // 4 children total
    const children = repo.getChildren(parentId)
    expect(children).toHaveLength(4)
  })

  test("split at end creates empty node after", () => {
    const { repo, parentId, task2Id } = setupTaskTree()

    const result = splitNode(repo, task2Id, 13) // "Charlie delta" = 13 chars

    // Original node keeps full text
    const before = repo.getNode(result.beforeId)!
    expect(getNodeText(before)).toBe("Charlie delta")

    // New node is empty
    const after = repo.getNode(result.afterId)!
    expect(getNodeText(after)).toBe("")

    const children = repo.getChildren(parentId)
    expect(children).toHaveLength(4)
  })

  test("split moves children to new node", () => {
    const { repo, task2Id } = setupTaskTree()

    // Add children to task2
    const childId = repo.addNode(task2Id, {
      type: "li",
      list_marker: "-",
      content: "- [ ] Sub task",
      task_status: "todo",
      task_marker: "[ ]",
      parent_idx: 1,
    })

    const result = splitNode(repo, task2Id, 7)

    // Children should now be under the new (after) node
    const afterChildren = repo.getChildren(result.afterId)
    expect(afterChildren).toHaveLength(1)
    expect(afterChildren[0]!.id).toBe(childId)

    // Original node should have no children
    const beforeChildren = repo.getChildren(result.beforeId)
    expect(beforeChildren).toHaveLength(0)
  })

  test("split section in middle", () => {
    const { repo, sec1Id } = setupSectionTree()

    // "Section One" - split at offset 7 (after "Section")
    const result = splitNode(repo, sec1Id, 7)

    const before = repo.getNode(result.beforeId)!
    expect(before.content).toBe("Section")

    const after = repo.getNode(result.afterId)!
    expect(after.content).toBe(" One")
    expect(after.type).toBe("oi")
  })

  test("new node sort order is between current and next sibling", () => {
    const { repo, task1Id, task2Id, task3Id } = setupTaskTree()

    const result = splitNode(repo, task2Id, 5)

    const after = repo.getNode(result.afterId)!
    const task2 = repo.getNode(task2Id)!
    const task3 = repo.getNode(task3Id)!

    // New node sort order should be between task2 and task3
    expect(after.parent_idx).toBeGreaterThan(task2.parent_idx)
    expect(after.parent_idx).toBeLessThan(task3.parent_idx)
  })

  test("split last sibling places new node after", () => {
    const { repo, task3Id } = setupTaskTree()

    const result = splitNode(repo, task3Id, 4)

    const after = repo.getNode(result.afterId)!
    const task3 = repo.getNode(task3Id)!

    expect(after.parent_idx).toBeGreaterThan(task3.parent_idx)
  })

  test("throws on non-existent node", () => {
    const { repo } = setupTaskTree()
    expect(() => splitNode(repo, "nonexistent", 5)).toThrow("node not found")
  })

  test("clamps offset to valid range", () => {
    const { repo, task2Id } = setupTaskTree()

    // Offset beyond text length should clamp
    const result = splitNode(repo, task2Id, 999)

    const before = repo.getNode(result.beforeId)!
    expect(getNodeText(before)).toBe("Charlie delta")

    const after = repo.getNode(result.afterId)!
    expect(getNodeText(after)).toBe("")
  })

  test("negative offset clamps to 0", () => {
    const { repo, task2Id } = setupTaskTree()

    const result = splitNode(repo, task2Id, -5)

    const before = repo.getNode(result.beforeId)!
    expect(getNodeText(before)).toBe("")

    const after = repo.getNode(result.afterId)!
    expect(getNodeText(after)).toBe("Charlie delta")
  })
})

// =============================================================================
// mergeWithPrevious
// =============================================================================

describe("mergeWithPrevious", () => {
  test("empty node with previous: deletes node, cursor to prev", () => {
    const { repo, parentId } = setupTaskTree()

    // Add empty task after task1
    const emptyId = repo.addNode(parentId, {
      type: "li",
      list_marker: "-",
      content: "- [ ] ",
      task_status: "todo",
      task_marker: "[ ]",
      parent_idx: 1.5,
    })

    const childrenBefore = repo.getChildren(parentId)
    const prevId = childrenBefore.find((c) => c.parent_idx < 1.5 && c.id !== emptyId)?.id

    const result = mergeWithPrevious(repo, emptyId)

    expect(result).not.toBeNull()
    expect(result!.survivorId).toBe(prevId)
    expect(repo.getNode(emptyId)).toBeNull()
  })

  test("content node, childless prev: merges content", () => {
    const { repo, task1Id, task2Id } = setupTaskTree()

    // task1 = "Alpha bravo", task2 = "Charlie delta"
    const result = mergeWithPrevious(repo, task2Id)

    expect(result).not.toBeNull()
    expect(result!.survivorId).toBe(task2Id)
    expect(result!.cursorOffset).toBe(11) // "Alpha bravo" length

    // task2 now has merged content
    const merged = repo.getNode(task2Id)!
    expect(getNodeText(merged)).toBe("Alpha bravoCharlie delta")

    // task1 is deleted
    expect(repo.getNode(task1Id)).toBeNull()
  })

  test("content node, prev has children: becomes last child of prev", () => {
    const { repo, task1Id, task2Id } = setupTaskTree()

    // Add a child to task1
    repo.addNode(task1Id, {
      type: "li",
      list_marker: "-",
      content: "- [ ] Sub task",
      task_status: "todo",
      task_marker: "[ ]",
      parent_idx: 1,
    })

    const result = mergeWithPrevious(repo, task2Id)

    expect(result).not.toBeNull()
    expect(result!.survivorId).toBe(task2Id)
    expect(result!.cursorOffset).toBe(0)

    // task2 should now be a child of task1
    const task2 = repo.getNode(task2Id)!
    expect(task2.parent_id).toBe(task1Id)
  })

  test("first child: outdent to parent's sibling", () => {
    const { repo, rootId, sec1Id } = setupSectionTree()

    // Add a child to sec1
    const childId = repo.addNode(sec1Id, {
      type: "oi",
      fstype: "mdsection",
      name: "Child",
      content: "Child",
      parent_idx: 1,
    })

    const result = mergeWithPrevious(repo, childId)

    expect(result).not.toBeNull()
    expect(result!.survivorId).toBe(childId)

    // Child should now be a sibling of sec1 (under rootId)
    const child = repo.getNode(childId)!
    expect(child.parent_id).toBe(rootId)
  })

  test("first child outdents to virtual root", () => {
    const repo = createTestRepo()

    // Single root node with child
    const rootId = repo.addNode(null, {
      type: "oi",
      fstype: "mdsection",
      name: "Root",
      content: "Root",
    })

    const childId = repo.addNode(rootId, {
      type: "li",
      list_marker: "-",
      content: "- [ ] Only child",
      task_status: "todo",
      task_marker: "[ ]",
      parent_idx: 1,
    })

    // rootId's parent is "." (the virtual root)
    // Outdenting should move child to be a sibling of rootId under "."
    const result = mergeWithPrevious(repo, childId)

    expect(result).not.toBeNull()
    expect(result!.survivorId).toBe(childId)

    const child = repo.getNode(childId)!
    // Child should now be under "." (the virtual root), same as rootId
    expect(child.parent_id).toBe(".")
  })

  test("non-existent node returns null", () => {
    const { repo } = setupTaskTree()
    expect(mergeWithPrevious(repo, "nonexistent")).toBeNull()
  })

  test("merge preserves remaining sibling order", () => {
    const { repo, parentId, task1Id, task2Id, task3Id } = setupTaskTree()

    mergeWithPrevious(repo, task2Id)

    // task1 is deleted, task2 and task3 remain
    const children = repo.getChildren(parentId)
    expect(children).toHaveLength(2)
    expect(children[0]!.id).toBe(task2Id)
    expect(children[1]!.id).toBe(task3Id)
  })
})

// =============================================================================
// getPreviousSibling / getNextSibling
// =============================================================================

describe("getPreviousSibling", () => {
  test("returns previous sibling", () => {
    const { repo, task1Id, task2Id } = setupTaskTree()
    const prev = getPreviousSibling(repo, task2Id)
    expect(prev?.id).toBe(task1Id)
  })

  test("returns null for first child", () => {
    const { repo, task1Id } = setupTaskTree()
    const prev = getPreviousSibling(repo, task1Id)
    expect(prev).toBeNull()
  })

  test("returns null for non-existent node", () => {
    const { repo } = setupTaskTree()
    expect(getPreviousSibling(repo, "nonexistent")).toBeNull()
  })
})

describe("getNextSibling", () => {
  test("returns next sibling", () => {
    const { repo, task2Id, task3Id } = setupTaskTree()
    const next = getNextSibling(repo, task2Id)
    expect(next?.id).toBe(task3Id)
  })

  test("returns null for last child", () => {
    const { repo, task3Id } = setupTaskTree()
    const next = getNextSibling(repo, task3Id)
    expect(next).toBeNull()
  })

  test("returns null for non-existent node", () => {
    const { repo } = setupTaskTree()
    expect(getNextSibling(repo, "nonexistent")).toBeNull()
  })
})
