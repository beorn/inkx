/**
 * Outliner Reducer Tests — TEA state machine for outliner operations.
 *
 * Tests each action type for correct state transitions and effect emission.
 * Uses createTestRepo() for an in-memory Repo that satisfies TreeMutator.
 */

import { describe, test, expect } from "vitest"
import { createTestRepo } from "@km/storage"
import { getEditableText } from "../src/block-ops.ts"
import {
  applyTreeAction,
  captureTreeState,
  type TreeAction,
  type TreeEffect,
  type TreeState,
} from "../src/outliner-reducer.ts"

// =============================================================================
// Helpers
// =============================================================================

type TestRepo = ReturnType<typeof createTestRepo>

/** Create a flat list: parent > [A, B, C] as list items. */
function setupFlatList() {
  const repo = createTestRepo()
  const parentId = repo.addNode(null, {
    type: "h",
    item: {},
    fstype: "mdsection",
    name: "Parent",
    content: "Parent",
  })
  const aId = repo.addNode(parentId, {
    type: "p",
    item: { list: "-" },
    content: "Alpha",
    parent_idx: 1,
  })
  const bId = repo.addNode(parentId, {
    type: "p",
    item: { list: "-" },
    content: "Bravo",
    parent_idx: 2,
  })
  const cId = repo.addNode(parentId, {
    type: "p",
    item: { list: "-" },
    content: "Charlie",
    parent_idx: 3,
  })
  const state = captureTreeState(repo, [null], bId, 0)
  return { repo, parentId, aId, bId, cId, state }
}

/** Create nested tree: root > [sectionA > [child1, child2], sectionB]. */
function setupNestedTree() {
  const repo = createTestRepo()
  const rootId = repo.addNode(null, {
    type: "h",
    item: {},
    fstype: "mdsection",
    name: "Root",
    content: "Root",
  })
  const sectionAId = repo.addNode(rootId, {
    type: "h",
    item: {},
    fstype: "mdsection",
    name: "Section A",
    content: "Section A",
    parent_idx: 1,
  })
  const child1Id = repo.addNode(sectionAId, {
    type: "p",
    item: { list: "-" },
    content: "Child 1",
    parent_idx: 1,
  })
  const child2Id = repo.addNode(sectionAId, {
    type: "p",
    item: { list: "-" },
    content: "Child 2",
    parent_idx: 2,
  })
  const sectionBId = repo.addNode(rootId, {
    type: "h",
    item: {},
    fstype: "mdsection",
    name: "Section B",
    content: "Section B",
    parent_idx: 2,
  })
  const state = captureTreeState(repo, [null], child1Id, 0)
  return { repo, rootId, sectionAId, child1Id, child2Id, sectionBId, state }
}

/** Find an effect by type in the effects array. */
function findEffect<T extends TreeEffect["type"]>(
  effects: TreeEffect[],
  type: T,
): Extract<TreeEffect, { type: T }> | undefined {
  return effects.find((e) => e.type === type) as Extract<TreeEffect, { type: T }> | undefined
}

/** Check that an effect of the given type exists. */
function hasEffect(effects: TreeEffect[], type: TreeEffect["type"]): boolean {
  return effects.some((e) => e.type === type)
}

// =============================================================================
// INDENT
// =============================================================================

describe("INDENT action", () => {
  test("indents second child under first child", () => {
    const { repo, aId, bId, state } = setupFlatList()
    const action: TreeAction = { type: "INDENT", nodeId: bId }

    const [newState, effects] = applyTreeAction(repo, state, action)

    // B is now child of A
    const bNode = newState.nodes.get(bId)!
    expect(bNode.parent_id).toBe(aId)

    // Effects: node_moved + persist
    expect(hasEffect(effects, "node_moved")).toBe(true)
    expect(hasEffect(effects, "persist")).toBe(true)
    expect(hasEffect(effects, "bell")).toBe(false)
  })

  test("first child indent is no-op with bell", () => {
    const { repo, aId, parentId, state } = setupFlatList()
    const action: TreeAction = { type: "INDENT", nodeId: aId }

    const [newState, effects] = applyTreeAction(repo, state, action)

    // A unchanged
    const aNode = newState.nodes.get(aId)!
    expect(aNode.parent_id).toBe(parentId)

    // Bell emitted, no persist
    expect(hasEffect(effects, "bell")).toBe(true)
    expect(hasEffect(effects, "persist")).toBe(false)
  })

  test("nonexistent node indent emits bell", () => {
    const { repo, state } = setupFlatList()
    const action: TreeAction = { type: "INDENT", nodeId: "nonexistent" }

    const [_, effects] = applyTreeAction(repo, state, action)
    expect(hasEffect(effects, "bell")).toBe(true)
  })
})

// =============================================================================
// OUTDENT
// =============================================================================

describe("OUTDENT action", () => {
  test("nested child outdents to grandparent level", () => {
    const { repo, rootId, child1Id, state } = setupNestedTree()
    const action: TreeAction = { type: "OUTDENT", nodeId: child1Id }

    const [newState, effects] = applyTreeAction(repo, state, action)

    // child1 is now child of rootId
    const child1 = newState.nodes.get(child1Id)!
    expect(child1.parent_id).toBe(rootId)

    expect(hasEffect(effects, "node_moved")).toBe(true)
    expect(hasEffect(effects, "persist")).toBe(true)
  })

  test("root-level node cannot outdent — bell", () => {
    const { repo, sectionAId, state } = setupNestedTree()
    const action: TreeAction = { type: "OUTDENT", nodeId: sectionAId }

    const [_, effects] = applyTreeAction(repo, state, action)
    expect(hasEffect(effects, "bell")).toBe(true)
    expect(hasEffect(effects, "persist")).toBe(false)
  })
})

// =============================================================================
// INDENT + OUTDENT compose to identity
// =============================================================================

describe("INDENT then OUTDENT = identity", () => {
  test("indent then outdent restores original parent", () => {
    const { repo, parentId, bId, state } = setupFlatList()

    // Indent B under A
    const [stateAfterIndent, _] = applyTreeAction(repo, state, { type: "INDENT", nodeId: bId })
    expect(stateAfterIndent.nodes.get(bId)!.parent_id).not.toBe(parentId)

    // Outdent B back
    const [stateAfterOutdent, __] = applyTreeAction(repo, stateAfterIndent, {
      type: "OUTDENT",
      nodeId: bId,
    })
    expect(stateAfterOutdent.nodes.get(bId)!.parent_id).toBe(parentId)
  })
})

// =============================================================================
// MOVE_UP
// =============================================================================

describe("MOVE_UP action", () => {
  test("moves node before its previous sibling", () => {
    const { repo, parentId, aId, bId, state } = setupFlatList()

    // B is at index 2, A is at index 1. Move B up.
    const [newState, effects] = applyTreeAction(repo, state, { type: "MOVE_UP", nodeId: bId })

    // B should now have a smaller parent_idx than A
    const bNode = newState.nodes.get(bId)!
    const aNode = newState.nodes.get(aId)!
    expect(bNode.parent_idx).toBeLessThan(aNode.parent_idx)

    expect(hasEffect(effects, "node_moved")).toBe(true)
    expect(hasEffect(effects, "persist")).toBe(true)
  })

  test("first child cannot move up — bell", () => {
    const { repo, aId, state } = setupFlatList()
    const [_, effects] = applyTreeAction(repo, state, { type: "MOVE_UP", nodeId: aId })
    expect(hasEffect(effects, "bell")).toBe(true)
    expect(hasEffect(effects, "persist")).toBe(false)
  })
})

// =============================================================================
// MOVE_DOWN
// =============================================================================

describe("MOVE_DOWN action", () => {
  test("moves node after its next sibling", () => {
    const { repo, bId, cId, state } = setupFlatList()

    const [newState, effects] = applyTreeAction(repo, state, { type: "MOVE_DOWN", nodeId: bId })

    // B should now have a larger parent_idx than C
    const bNode = newState.nodes.get(bId)!
    const cNode = newState.nodes.get(cId)!
    expect(bNode.parent_idx).toBeGreaterThan(cNode.parent_idx)

    expect(hasEffect(effects, "node_moved")).toBe(true)
    expect(hasEffect(effects, "persist")).toBe(true)
  })

  test("last child cannot move down — bell", () => {
    const { repo, cId, state } = setupFlatList()
    const [_, effects] = applyTreeAction(repo, state, { type: "MOVE_DOWN", nodeId: cId })
    expect(hasEffect(effects, "bell")).toBe(true)
    expect(hasEffect(effects, "persist")).toBe(false)
  })
})

// =============================================================================
// MOVE_UP + MOVE_DOWN compose to identity
// =============================================================================

describe("MOVE_UP then MOVE_DOWN = identity", () => {
  test("move up then move down restores original order", () => {
    const { repo, bId, state } = setupFlatList()

    // Capture original positions
    const origB = state.nodes.get(bId)!
    const origParentIdx = origB.parent_idx

    // Move B up, then back down
    const [midState, _] = applyTreeAction(repo, state, { type: "MOVE_UP", nodeId: bId })
    const [finalState, __] = applyTreeAction(repo, midState, { type: "MOVE_DOWN", nodeId: bId })

    // B should be back at its original relative position
    // (parent_idx values may differ but ordering should be restored)
    const siblings = repo.getChildren(origB.parent_id!)
    const bIdx = siblings.findIndex((s) => s.id === bId)
    expect(bIdx).toBe(1) // B was originally at index 1 (0-based)
  })
})

// =============================================================================
// SPLIT_BLOCK
// =============================================================================

describe("SPLIT_BLOCK action", () => {
  test("splits at cursor middle", () => {
    const { repo, bId, state } = setupFlatList()
    const action: TreeAction = { type: "SPLIT_BLOCK", nodeId: bId, cursorOffset: 3 }

    const [newState, effects] = applyTreeAction(repo, state, action)

    // Find the split effect
    const splitEffect = findEffect(effects, "node_split")
    expect(splitEffect).toBeDefined()
    expect(splitEffect!.beforeId).toBe(bId)

    // Before node has "Bra", after node has "vo"
    const beforeNode = repo.getNode(splitEffect!.beforeId)!
    const afterNode = repo.getNode(splitEffect!.afterId)!
    expect(getEditableText(beforeNode)).toBe("Bra")
    expect(getEditableText(afterNode)).toBe("vo")

    // Focus moved to the new node
    expect(newState.focusedNodeId).toBe(splitEffect!.afterId)
    expect(newState.cursorOffset).toBe(0)

    // Persistence emitted
    expect(hasEffect(effects, "persist")).toBe(true)
  })

  test("split at end creates empty sibling after", () => {
    const { repo, bId, parentId, state } = setupFlatList()
    const action: TreeAction = { type: "SPLIT_BLOCK", nodeId: bId, cursorOffset: 5 }

    const [newState, effects] = applyTreeAction(repo, state, action)

    const splitEffect = findEffect(effects, "node_split")!
    expect(splitEffect.beforeId).toBe(bId)

    const afterNode = repo.getNode(splitEffect.afterId)!
    expect(getEditableText(afterNode)).toBe("")
    expect(afterNode.parent_id).toBe(parentId)
  })

  test("focus effect points to new node", () => {
    const { repo, bId, state } = setupFlatList()
    const [_, effects] = applyTreeAction(repo, state, {
      type: "SPLIT_BLOCK",
      nodeId: bId,
      cursorOffset: 3,
    })

    const focusEffect = findEffect(effects, "focus")
    expect(focusEffect).toBeDefined()
    expect(focusEffect!.cursorOffset).toBe(0)
  })
})

// =============================================================================
// MERGE_BLOCK (backward)
// =============================================================================

describe("MERGE_BLOCK backward", () => {
  test("merges plain p with previous sibling", () => {
    const { repo, aId, bId, state } = setupFlatList()
    // Make both plain paragraphs (no item trait)
    repo.updateNode(aId, { item: undefined, content: "Alpha" })
    repo.updateNode(bId, { item: undefined, content: "Bravo" })
    // Recapture state after changes
    const freshState = captureTreeState(repo, [null], bId, 0)

    const [newState, effects] = applyTreeAction(repo, freshState, {
      type: "MERGE_BLOCK",
      nodeId: bId,
      direction: "backward",
    })

    // Focus on survivor with correct cursor offset
    const focusEffect = findEffect(effects, "focus")
    expect(focusEffect).toBeDefined()
    expect(focusEffect!.cursorOffset).toBe(5) // "Alpha" length

    // Persistence emitted
    expect(hasEffect(effects, "persist")).toBe(true)
  })

  test("degradation (strip task) does not delete the node", () => {
    const repo = createTestRepo()
    const parentId = repo.addNode(null, { type: "h", item: {}, name: "P" })
    const taskId = repo.addNode(parentId, {
      type: "p",
      item: { list: "-", task: { marker: "[ ]", status: "todo" } },
      content: "- [ ] My task",
      parent_idx: 1,
    })
    const state = captureTreeState(repo, [null], taskId, 0)

    const [newState, effects] = applyTreeAction(repo, state, {
      type: "MERGE_BLOCK",
      nodeId: taskId,
      direction: "backward",
    })

    // Node still exists (degradation, not deletion)
    expect(newState.nodes.has(taskId)).toBe(true)
    // Task trait stripped
    const node = repo.getNode(taskId)!
    expect(node.item?.task).toBeUndefined()
    expect(node.item).toBeDefined() // still an item
  })

  test("no previous sibling and no parent — bell", () => {
    const repo = createTestRepo()
    const rootId = repo.addNode(null, { type: "p", content: "Root" })
    const state = captureTreeState(repo, [null], rootId, 0)

    const [_, effects] = applyTreeAction(repo, state, {
      type: "MERGE_BLOCK",
      nodeId: rootId,
      direction: "backward",
    })
    expect(hasEffect(effects, "bell")).toBe(true)
  })
})

// =============================================================================
// MERGE_BLOCK (forward)
// =============================================================================

describe("MERGE_BLOCK forward", () => {
  test("merges with next sibling's text", () => {
    const { repo, bId, cId, state } = setupFlatList()

    const [newState, effects] = applyTreeAction(repo, state, {
      type: "MERGE_BLOCK",
      nodeId: bId,
      direction: "forward",
    })

    // B now has merged text
    const bNode = repo.getNode(bId)!
    expect(getEditableText(bNode)).toBe("BravoCharlie")

    // C is deleted
    expect(repo.getNode(cId)).toBeNull()

    // Focus on survivor at original text end
    const focusEffect = findEffect(effects, "focus")
    expect(focusEffect).toBeDefined()
    expect(focusEffect!.nodeId).toBe(bId)
    expect(focusEffect!.cursorOffset).toBe(5) // "Bravo" length

    expect(hasEffect(effects, "persist")).toBe(true)
  })

  test("last child forward merge — bell (no next sibling)", () => {
    const { repo, cId, state } = setupFlatList()

    const [_, effects] = applyTreeAction(repo, state, {
      type: "MERGE_BLOCK",
      nodeId: cId,
      direction: "forward",
    })
    expect(hasEffect(effects, "bell")).toBe(true)
    expect(hasEffect(effects, "persist")).toBe(false)
  })
})

// =============================================================================
// INSERT_NODE
// =============================================================================

describe("INSERT_NODE action", () => {
  test("creates a new node under the specified parent", () => {
    const { repo, parentId, state } = setupFlatList()
    const action: TreeAction = {
      type: "INSERT_NODE",
      parentId,
      props: { type: "p", item: { list: "-" }, content: "Delta", parent_idx: 4 },
    }

    const [newState, effects] = applyTreeAction(repo, state, action)

    // New node created
    const createdEffect = findEffect(effects, "node_created")
    expect(createdEffect).toBeDefined()

    const newNode = repo.getNode(createdEffect!.nodeId)!
    expect(newNode.parent_id).toBe(parentId)
    expect(getEditableText(newNode)).toBe("Delta")

    // Focus moved to new node
    expect(newState.focusedNodeId).toBe(createdEffect!.nodeId)
    expect(hasEffect(effects, "persist")).toBe(true)
  })
})

// =============================================================================
// DELETE_NODE
// =============================================================================

describe("DELETE_NODE action", () => {
  test("deletes a node and focuses next sibling", () => {
    const { repo, bId, cId, state } = setupFlatList()
    const action: TreeAction = { type: "DELETE_NODE", nodeId: bId }

    const [newState, effects] = applyTreeAction(repo, state, action)

    // B is gone
    expect(repo.getNode(bId)).toBeNull()
    expect(newState.nodes.has(bId)).toBe(false)

    // Focus moved to next sibling (C)
    expect(newState.focusedNodeId).toBe(cId)

    expect(hasEffect(effects, "node_deleted")).toBe(true)
    expect(hasEffect(effects, "persist")).toBe(true)
  })

  test("deletes last child and focuses previous sibling", () => {
    const { repo, bId, cId, state } = setupFlatList()
    const action: TreeAction = { type: "DELETE_NODE", nodeId: cId }

    const [newState, effects] = applyTreeAction(repo, state, action)

    expect(repo.getNode(cId)).toBeNull()
    // Focus should go to B (previous sibling, since C was last)
    expect(newState.focusedNodeId).toBe(bId)
  })

  test("deletes only child and focuses parent", () => {
    const repo = createTestRepo()
    const parentId = repo.addNode(null, { type: "h", item: {}, name: "P" })
    const childId = repo.addNode(parentId, { type: "p", item: {}, content: "Only" })
    const state = captureTreeState(repo, [null], childId, 0)

    const [newState, effects] = applyTreeAction(repo, state, {
      type: "DELETE_NODE",
      nodeId: childId,
    })

    expect(repo.getNode(childId)).toBeNull()
    expect(newState.focusedNodeId).toBe(parentId)
  })

  test("deleting nonexistent node emits bell", () => {
    const { repo, state } = setupFlatList()
    const [_, effects] = applyTreeAction(repo, state, {
      type: "DELETE_NODE",
      nodeId: "nonexistent",
    })
    expect(hasEffect(effects, "bell")).toBe(true)
  })
})

// =============================================================================
// captureTreeState
// =============================================================================

describe("captureTreeState", () => {
  test("captures all nodes in the tree", () => {
    const { repo, parentId, aId, bId, cId } = setupFlatList()
    const state = captureTreeState(repo, [null])

    expect(state.nodes.has(parentId)).toBe(true)
    expect(state.nodes.has(aId)).toBe(true)
    expect(state.nodes.has(bId)).toBe(true)
    expect(state.nodes.has(cId)).toBe(true)
  })

  test("preserves focus state", () => {
    const { repo, bId } = setupFlatList()
    const state = captureTreeState(repo, [null], bId, 3)

    expect(state.focusedNodeId).toBe(bId)
    expect(state.cursorOffset).toBe(3)
  })

  test("default focus is null/0", () => {
    const { repo } = setupFlatList()
    const state = captureTreeState(repo, [null])

    expect(state.focusedNodeId).toBeNull()
    expect(state.cursorOffset).toBe(0)
  })
})

// =============================================================================
// Effect correctness
// =============================================================================

describe("effect correctness", () => {
  test("successful actions always emit persist", () => {
    const { repo, bId, state } = setupFlatList()
    const actions: TreeAction[] = [
      { type: "INDENT", nodeId: bId },
      { type: "SPLIT_BLOCK", nodeId: bId, cursorOffset: 2 },
    ]

    // Test indent
    const [_, indentEffects] = applyTreeAction(repo, state, actions[0]!)
    expect(hasEffect(indentEffects, "persist")).toBe(true)
  })

  test("failed actions never emit persist", () => {
    const { repo, aId, state } = setupFlatList()
    // First child can't indent
    const [_, effects] = applyTreeAction(repo, state, { type: "INDENT", nodeId: aId })
    expect(hasEffect(effects, "persist")).toBe(false)
  })

  test("node_moved effect carries correct from/to parent", () => {
    const { repo, parentId, aId, bId, state } = setupFlatList()
    const [_, effects] = applyTreeAction(repo, state, { type: "INDENT", nodeId: bId })

    const moveEffect = findEffect(effects, "node_moved")!
    expect(moveEffect.nodeId).toBe(bId)
    expect(moveEffect.fromParentId).toBe(parentId)
    expect(moveEffect.toParentId).toBe(aId)
  })
})
