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
  mergeWithNext,
  getNodeText,
  setNodeText,
  getPreviousSibling,
  getNextSibling,
  detectPrefixConversion,
  backspaceDegradation,
} from "../src/block-ops.ts"

// =============================================================================
// Helpers
// =============================================================================

/** Create a repo with a parent outline item and task children for testing */
function setupTaskTree() {
  const repo = createTestRepo()

  // Create parent outline item (section)
  const parentId = repo.addNode(null, {
    type: "h",
    item: true,
    fstype: "mdsection",
    name: "Tasks",
    content: "Tasks",
  })

  // Create three task children (list items with task markers)
  const task1Id = repo.addNode(parentId, {
    type: "p",
    item: true,
    list_marker: "-",
    content: "- [ ] Alpha bravo",
    task_status: "todo",
    task_marker: "[ ]",
    parent_idx: 1,
  })

  const task2Id = repo.addNode(parentId, {
    type: "p",
    item: true,
    list_marker: "-",
    content: "- [ ] Charlie delta",
    task_status: "todo",
    task_marker: "[ ]",
    parent_idx: 2,
  })

  const task3Id = repo.addNode(parentId, {
    type: "p",
    item: true,
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
    type: "h",
    item: true,
    fstype: "mdsection",
    name: "Root",
    content: "Root",
  })

  const sec1Id = repo.addNode(rootId, {
    type: "h",
    item: true,
    fstype: "mdsection",
    name: "Section One",
    content: "Section One",
    parent_idx: 1,
  })

  const sec2Id = repo.addNode(rootId, {
    type: "h",
    item: true,
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
      type: "p",
      item: true,
      task_marker: "[ ]",
      content: "- [ ] Buy groceries",
    } as any
    expect(getNodeText(node)).toBe("Buy groceries")
  })

  test("returns outline item name", () => {
    const node = {
      type: "h",
      item: true,
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
      type: "p",
      item: true,
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
      type: "p",
      item: true,
      task_marker: "[ ]",
    } as any
    expect(setNodeText(node, "New text")).toBe("- [ ] New text")
  })

  test("preserves done task marker", () => {
    const node = {
      type: "p",
      item: true,
      task_marker: "[x]",
    } as any
    expect(setNodeText(node, "Done item")).toBe("- [x] Done item")
  })

  test("returns plain text for outline items", () => {
    const node = { type: "h", item: true } as any
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
    expect(before.type).toBe("p")
    expect(before.item).toBe(true)

    // New node should have " delta"
    const after = repo.getNode(result.afterId)!
    expect(getNodeText(after)).toBe(" delta")
    expect(after.type).toBe("p")
    expect(after.item).toBe(true)
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
      type: "p",
      item: true,
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

  test("split task inherits task_marker as [ ] and task_status as todo", () => {
    const { repo, parentId } = setupTaskTree()

    // Create a done task
    const doneId = repo.addNode(parentId, {
      type: "p",
      item: true,
      list_marker: "-",
      content: "- [x] Completed task here",
      task_status: "done",
      task_marker: "[x]",
      parent_idx: 4,
    })

    const result = splitNode(repo, doneId, 14) // after "Completed task"

    const after = repo.getNode(result.afterId)!
    expect(after.task_marker).toBe("[ ]")
    expect(after.task_status).toBe("todo")
    expect(after.item).toBe(true)
    expect(after.list_marker).toBe("-")
  })

  test("split node with data inherits data", () => {
    const repo = createTestRepo()

    const parentId = repo.addNode(null, {
      type: "h",
      item: true,
      fstype: "mdsection",
      name: "Parent",
      content: "Parent",
    })

    const nodeId = repo.addNode(parentId, {
      type: "p",
      item: true,
      list_marker: "-",
      content: "Hello World",
      data: { custom: "value", priority: "high" },
      parent_idx: 1,
    })

    const result = splitNode(repo, nodeId, 5)

    const after = repo.getNode(result.afterId)!
    expect(after.data).toEqual({ custom: "value", priority: "high" })
  })

  test("split node with priority/assigned_to inherits them", () => {
    const { repo, parentId } = setupTaskTree()

    const nodeId = repo.addNode(parentId, {
      type: "p",
      item: true,
      list_marker: "-",
      content: "- [ ] Task with metadata",
      task_status: "todo",
      task_marker: "[ ]",
      priority: "P1",
      assigned_to: "alice",
      parent_idx: 4,
    })

    const result = splitNode(repo, nodeId, 10)

    const after = repo.getNode(result.afterId)!
    expect(after.priority).toBe("P1")
    expect(after.assigned_to).toBe("alice")
  })

  test("split section in middle", () => {
    const { repo, sec1Id } = setupSectionTree()

    // "Section One" - split at offset 7 (after "Section")
    const result = splitNode(repo, sec1Id, 7)

    const before = repo.getNode(result.beforeId)!
    expect(before.content).toBe("Section")

    const after = repo.getNode(result.afterId)!
    expect(after.content).toBe(" One")
    expect(after.type).toBe("h")
    expect(after.item).toBe(true)
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
      type: "p",
      item: true,
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
      type: "p",
      item: true,
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
      type: "h",
      item: true,
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
      type: "h",
      item: true,
      fstype: "mdsection",
      name: "Root",
      content: "Root",
    })

    const childId = repo.addNode(rootId, {
      type: "p",
      item: true,
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
// mergeWithNext
// =============================================================================

describe("mergeWithNext", () => {
  test("next is empty with no children: deletes next", () => {
    const { repo, parentId, task2Id } = setupTaskTree()

    // Add empty task after task2
    const emptyId = repo.addNode(parentId, {
      type: "p",
      item: true,
      list_marker: "-",
      content: "- [ ] ",
      task_status: "todo",
      task_marker: "[ ]",
      parent_idx: 2.5,
    })

    const result = mergeWithNext(repo, task2Id)

    expect(result).not.toBeNull()
    expect(result!.survivorId).toBe(task2Id)
    expect(result!.cursorOffset).toBe(13) // "Charlie delta" length
    expect(repo.getNode(emptyId)).toBeNull()
  })

  test("next has content, no children: appends text and deletes next", () => {
    const { repo, task2Id, task3Id } = setupTaskTree()

    // task2 = "Charlie delta", task3 = "Echo foxtrot"
    const result = mergeWithNext(repo, task2Id)

    expect(result).not.toBeNull()
    expect(result!.survivorId).toBe(task2Id)
    expect(result!.cursorOffset).toBe(13) // "Charlie delta" length

    // task2 now has merged content
    const merged = repo.getNode(task2Id)!
    expect(getNodeText(merged)).toBe("Charlie deltaEcho foxtrot")

    // task3 is deleted
    expect(repo.getNode(task3Id)).toBeNull()
  })

  test("next has content and children: appends text and reparents children", () => {
    const { repo, task2Id, task3Id } = setupTaskTree()

    // Add children to task3
    const childId = repo.addNode(task3Id, {
      type: "p",
      item: true,
      list_marker: "-",
      content: "- [ ] Sub task",
      task_status: "todo",
      task_marker: "[ ]",
      parent_idx: 1,
    })

    const result = mergeWithNext(repo, task2Id)

    expect(result).not.toBeNull()
    expect(result!.survivorId).toBe(task2Id)
    expect(result!.cursorOffset).toBe(13) // "Charlie delta" length

    // task2 has merged content
    const merged = repo.getNode(task2Id)!
    expect(getNodeText(merged)).toBe("Charlie deltaEcho foxtrot")

    // task3's child is now under task2
    const task2Children = repo.getChildren(task2Id)
    expect(task2Children).toHaveLength(1)
    expect(task2Children[0]!.id).toBe(childId)

    // task3 is deleted
    expect(repo.getNode(task3Id)).toBeNull()
  })

  test("no next sibling: returns null", () => {
    const { repo, task3Id } = setupTaskTree()

    const result = mergeWithNext(repo, task3Id)
    expect(result).toBeNull()
  })

  test("non-existent node: returns null", () => {
    const { repo } = setupTaskTree()
    expect(mergeWithNext(repo, "nonexistent")).toBeNull()
  })

  test("preserves remaining sibling order", () => {
    const { repo, parentId, task1Id, task2Id, task3Id } = setupTaskTree()

    mergeWithNext(repo, task1Id)

    // task2 is deleted, task1 and task3 remain
    const children = repo.getChildren(parentId)
    expect(children).toHaveLength(2)
    expect(children[0]!.id).toBe(task1Id)
    expect(children[1]!.id).toBe(task3Id)
  })

  test("current node keeps its type and traits", () => {
    const { repo, task1Id, task2Id } = setupTaskTree()

    // Modify task2 to be a done task
    repo.updateNode(task2Id, {
      task_status: "done",
      task_marker: "[x]",
      content: "- [x] Charlie delta",
    })

    const result = mergeWithNext(repo, task1Id)

    // task1 (todo) survives, task2 (done) is consumed
    const survivor = repo.getNode(result!.survivorId)!
    expect(survivor.task_status).toBe("todo")
    expect(survivor.task_marker).toBe("[ ]")
  })

  test("works with section (h+item) nodes", () => {
    const { repo, sec1Id, sec2Id } = setupSectionTree()

    const result = mergeWithNext(repo, sec1Id)

    expect(result).not.toBeNull()
    expect(result!.survivorId).toBe(sec1Id)
    expect(result!.cursorOffset).toBe(11) // "Section One" length

    const merged = repo.getNode(sec1Id)!
    // h+item nodes use name field via getNodeText, but content is set via setNodeText
    expect(merged.content).toBe("Section OneSection Two")

    expect(repo.getNode(sec2Id)).toBeNull()
  })

  test("reparents children after existing children", () => {
    const { repo, task2Id, task3Id } = setupTaskTree()

    // Add a child to task2 (the surviving node)
    const existingChildId = repo.addNode(task2Id, {
      type: "p",
      item: true,
      list_marker: "-",
      content: "- [ ] Existing child",
      task_status: "todo",
      task_marker: "[ ]",
      parent_idx: 1,
    })

    // Add a child to task3 (the consumed node)
    const incomingChildId = repo.addNode(task3Id, {
      type: "p",
      item: true,
      list_marker: "-",
      content: "- [ ] Incoming child",
      task_status: "todo",
      task_marker: "[ ]",
      parent_idx: 1,
    })

    mergeWithNext(repo, task2Id)

    // Both children should be under task2
    const children = repo.getChildren(task2Id)
    expect(children).toHaveLength(2)
    expect(children[0]!.id).toBe(existingChildId)
    expect(children[1]!.id).toBe(incomingChildId)
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

// =============================================================================
// detectPrefixConversion
// =============================================================================

describe("detectPrefixConversion", () => {
  test("dash bullet: '- ' → p+item with marker '-'", () => {
    const result = detectPrefixConversion("- ")
    expect(result).not.toBeNull()
    expect(result!.prefixLength).toBe(2)
    expect(result!.nodeChanges.type).toBe("p")
    expect(result!.nodeChanges.item).toBe(true)
    expect(result!.nodeChanges.list_marker).toBe("-")
  })

  test("asterisk bullet: '* ' → p+item with marker '*'", () => {
    const result = detectPrefixConversion("* ")
    expect(result).not.toBeNull()
    expect(result!.nodeChanges.list_marker).toBe("*")
  })

  test("plus bullet: '+ ' → p+item with marker '+'", () => {
    const result = detectPrefixConversion("+ ")
    expect(result).not.toBeNull()
    expect(result!.nodeChanges.list_marker).toBe("+")
  })

  test("numbered list: '1. ' → p+item with marker '1.'", () => {
    const result = detectPrefixConversion("1. ")
    expect(result).not.toBeNull()
    expect(result!.prefixLength).toBe(3)
    expect(result!.nodeChanges.type).toBe("p")
    expect(result!.nodeChanges.item).toBe(true)
    expect(result!.nodeChanges.list_marker).toBe("1.")
  })

  test("numbered list: '42. ' → p+item with marker '42.'", () => {
    const result = detectPrefixConversion("42. ")
    expect(result).not.toBeNull()
    expect(result!.prefixLength).toBe(4)
    expect(result!.nodeChanges.list_marker).toBe("42.")
  })

  test("heading h1: '# ' → h+item section", () => {
    const result = detectPrefixConversion("# ")
    expect(result).not.toBeNull()
    expect(result!.nodeChanges.type).toBe("h")
    expect(result!.nodeChanges.item).toBe(true)
    expect(result!.nodeChanges.fstype).toBe("mdsection")
  })

  test("heading h2: '## ' → h+item section", () => {
    const result = detectPrefixConversion("## ")
    expect(result).not.toBeNull()
    expect(result!.nodeChanges.type).toBe("h")
    expect(result!.nodeChanges.item).toBe(true)
    expect(result!.nodeChanges.fstype).toBe("mdsection")
  })

  test("heading h3: '### ' → h+item section", () => {
    const result = detectPrefixConversion("### ")
    expect(result).not.toBeNull()
    expect(result!.nodeChanges.type).toBe("h")
    expect(result!.nodeChanges.item).toBe(true)
    expect(result!.nodeChanges.fstype).toBe("mdsection")
  })

  test("task todo: '[] ' → task marker [ ]", () => {
    const result = detectPrefixConversion("[] ")
    expect(result).not.toBeNull()
    expect(result!.nodeChanges.task_marker).toBe("[ ]")
    expect(result!.nodeChanges.task_status).toBe("todo")
  })

  test("task todo: '[ ] ' → task marker [ ]", () => {
    const result = detectPrefixConversion("[ ] ")
    expect(result).not.toBeNull()
    expect(result!.nodeChanges.task_marker).toBe("[ ]")
    expect(result!.nodeChanges.task_status).toBe("todo")
  })

  test("task done: '[x] ' → task marker [x]", () => {
    const result = detectPrefixConversion("[x] ")
    expect(result).not.toBeNull()
    expect(result!.nodeChanges.task_marker).toBe("[x]")
    expect(result!.nodeChanges.task_status).toBe("done")
  })

  test("task done: '[X] ' → task marker [x]", () => {
    const result = detectPrefixConversion("[X] ")
    expect(result).not.toBeNull()
    expect(result!.nodeChanges.task_marker).toBe("[x]")
    expect(result!.nodeChanges.task_status).toBe("done")
  })

  test("task wip: '[/] ' → task marker [/]", () => {
    const result = detectPrefixConversion("[/] ")
    expect(result).not.toBeNull()
    expect(result!.nodeChanges.task_marker).toBe("[/]")
    expect(result!.nodeChanges.task_status).toBe("wip")
  })

  test("task blocked: '[!] ' → task marker [!]", () => {
    const result = detectPrefixConversion("[!] ")
    expect(result).not.toBeNull()
    expect(result!.nodeChanges.task_marker).toBe("[!]")
    expect(result!.nodeChanges.task_status).toBe("blocked")
  })

  test("task dropped: '[-] ' → task marker [-]", () => {
    const result = detectPrefixConversion("[-] ")
    expect(result).not.toBeNull()
    expect(result!.nodeChanges.task_marker).toBe("[-]")
    expect(result!.nodeChanges.task_status).toBe("dropped")
  })

  test("quote: '> ' → quote type", () => {
    const result = detectPrefixConversion("> ")
    expect(result).not.toBeNull()
    expect(result!.nodeChanges.type).toBe("quote")
  })

  test("no match for partial prefix: '-'", () => {
    expect(detectPrefixConversion("-")).toBeNull()
  })

  test("no match for non-prefix content: 'hello '", () => {
    expect(detectPrefixConversion("hello ")).toBeNull()
  })

  test("no match for mid-content prefix: 'foo- '", () => {
    expect(detectPrefixConversion("foo- ")).toBeNull()
  })

  test("no match for more than 6 hashes: '####### '", () => {
    expect(detectPrefixConversion("####### ")).toBeNull()
  })
})

// =============================================================================
// backspaceDegradation
// =============================================================================

describe("backspaceDegradation", () => {
  test("strips task marker from task node", () => {
    const node = {
      type: "p",
      item: true,
      task_marker: "[ ]",
      task_status: "todo",
      list_marker: "-",
    } as any
    const result = backspaceDegradation(node)
    expect(result).not.toBeNull()
    expect(result!.task_marker).toBeUndefined()
    expect(result!.task_status).toBeUndefined()
    // list_marker and type should NOT be in the result (not stripped yet)
    expect(result!.type).toBeUndefined()
    expect(result!.list_marker).toBeUndefined()
  })

  test("converts p+item to p after task marker already stripped", () => {
    const node = {
      type: "p",
      item: true,
      list_marker: "-",
    } as any
    const result = backspaceDegradation(node)
    expect(result).not.toBeNull()
    expect(result!.type).toBe("p")
    expect(result!.list_marker).toBeUndefined()
  })

  test("converts h+item to p", () => {
    const node = {
      type: "h",
      item: true,
      fstype: "mdsection",
      name: "Heading",
    } as any
    const result = backspaceDegradation(node)
    expect(result).not.toBeNull()
    expect(result!.type).toBe("p")
    expect(result!.fstype).toBeUndefined()
  })

  test("converts quote to p", () => {
    const node = { type: "quote" } as any
    const result = backspaceDegradation(node)
    expect(result).not.toBeNull()
    expect(result!.type).toBe("p")
  })

  test("converts hr to p", () => {
    const node = { type: "hr" } as any
    const result = backspaceDegradation(node)
    expect(result).not.toBeNull()
    expect(result!.type).toBe("p")
  })

  test("returns null for plain paragraph (should merge)", () => {
    const node = { type: "p" } as any
    const result = backspaceDegradation(node)
    expect(result).toBeNull()
  })

  test("task with done marker strips task first", () => {
    const node = {
      type: "p",
      item: true,
      task_marker: "[x]",
      task_status: "done",
      list_marker: "-",
    } as any
    const result = backspaceDegradation(node)
    expect(result).not.toBeNull()
    expect(result!.task_marker).toBeUndefined()
    expect(result!.task_status).toBeUndefined()
    // Type should stay p — next backspace strips item trait
    expect(result!.type).toBeUndefined()
  })
})
