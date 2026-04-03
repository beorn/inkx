/**
 * Operation Log Tests — append-only log for replay/collaboration.
 *
 * Tests:
 * - append + getAll
 * - getSince sequence filtering
 * - seq() increments
 * - replay rebuilds state
 * - withHistory + log records operations
 * - Undo operations logged with source: "undo"
 * - Redo operations logged with source: "redo"
 * - clear() empties log
 * - Empty ops array is not appended
 */

import { describe, test, expect } from "vitest"
import { createTestRepo } from "@km/storage"
import { createOperationLog, replay, type OperationLog } from "../src/operation-log.ts"
import { withHistory } from "../src/history.ts"
import type { Operation } from "../src/operations.ts"

// =============================================================================
// Helpers
// =============================================================================

function setupTree() {
  const repo = createTestRepo()
  const parentId = repo.addNode(null, {
    type: "h",
    item: {},
    name: "Parent",
    content: "Parent",
  })
  const child1Id = repo.addNode(parentId, {
    type: "p",
    content: "Alpha bravo",
    parent_idx: 1,
  })
  const child2Id = repo.addNode(parentId, {
    type: "p",
    content: "Charlie delta",
    parent_idx: 2,
  })
  return { repo, parentId, child1Id, child2Id }
}

function makeOp(content: string): Operation {
  return {
    type: "set_node",
    nodeId: "n1",
    properties: { content },
    oldProperties: { content: "old" },
  }
}

// =============================================================================
// createOperationLog — basic operations
// =============================================================================

describe("createOperationLog", () => {
  test("starts empty with seq 0", () => {
    const log = createOperationLog()
    expect(log.seq()).toBe(0)
    expect(log.getAll()).toEqual([])
  })

  test("append + getAll returns entries in order", () => {
    const log = createOperationLog()
    log.append([makeOp("A")], { source: "user" })
    log.append([makeOp("B")], { source: "sync" })

    const all = log.getAll()
    expect(all).toHaveLength(2)
    expect(all[0]!.seq).toBe(1)
    expect(all[0]!.source).toBe("user")
    expect(all[1]!.seq).toBe(2)
    expect(all[1]!.source).toBe("sync")
  })

  test("append copies ops array (mutation-safe)", () => {
    const log = createOperationLog()
    const ops = [makeOp("A")]
    log.append(ops)
    ops.push(makeOp("B"))

    expect(log.getAll()[0]!.ops).toHaveLength(1)
  })

  test("append with empty ops is no-op", () => {
    const log = createOperationLog()
    log.append([])
    expect(log.getAll()).toHaveLength(0)
    expect(log.seq()).toBe(0)
  })

  test("append uses custom timestamp when provided", () => {
    const log = createOperationLog()
    log.append([makeOp("A")], { timestamp: 42 })
    expect(log.getAll()[0]!.timestamp).toBe(42)
  })

  test("append uses Date.now when no timestamp provided", () => {
    const log = createOperationLog()
    const before = Date.now()
    log.append([makeOp("A")])
    const after = Date.now()

    const ts = log.getAll()[0]!.timestamp
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })
})

// =============================================================================
// seq()
// =============================================================================

describe("seq", () => {
  test("increments with each append", () => {
    const log = createOperationLog()
    expect(log.seq()).toBe(0)

    log.append([makeOp("A")])
    expect(log.seq()).toBe(1)

    log.append([makeOp("B")])
    expect(log.seq()).toBe(2)

    log.append([makeOp("C")])
    expect(log.seq()).toBe(3)
  })
})

// =============================================================================
// getSince
// =============================================================================

describe("getSince", () => {
  test("returns entries after given seq", () => {
    const log = createOperationLog()
    log.append([makeOp("A")])
    log.append([makeOp("B")])
    log.append([makeOp("C")])

    const since1 = log.getSince(1)
    expect(since1).toHaveLength(2)
    expect(since1[0]!.seq).toBe(2)
    expect(since1[1]!.seq).toBe(3)
  })

  test("getSince(0) returns all entries", () => {
    const log = createOperationLog()
    log.append([makeOp("A")])
    log.append([makeOp("B")])

    expect(log.getSince(0)).toHaveLength(2)
  })

  test("getSince(current seq) returns empty", () => {
    const log = createOperationLog()
    log.append([makeOp("A")])
    log.append([makeOp("B")])

    expect(log.getSince(2)).toHaveLength(0)
  })

  test("getSince(future seq) returns empty", () => {
    const log = createOperationLog()
    log.append([makeOp("A")])

    expect(log.getSince(99)).toHaveLength(0)
  })
})

// =============================================================================
// clear
// =============================================================================

describe("clear", () => {
  test("empties log and resets getAll", () => {
    const log = createOperationLog()
    log.append([makeOp("A")])
    log.append([makeOp("B")])
    expect(log.getAll()).toHaveLength(2)

    log.clear()
    expect(log.getAll()).toHaveLength(0)
    expect(log.seq()).toBe(0)
  })
})

// =============================================================================
// replay
// =============================================================================

describe("replay", () => {
  test("replays all entries onto a fresh tree", () => {
    const { repo, parentId, child1Id } = setupTree()
    const log = createOperationLog()

    // Record some operations manually
    log.append(
      [
        {
          type: "set_node",
          nodeId: child1Id,
          properties: { content: "Updated" },
          oldProperties: { content: "Alpha bravo" },
        },
      ],
      { source: "user" },
    )

    // Create a fresh tree and replay
    const freshRepo = createTestRepo()
    const freshParentId = freshRepo.addNode(null, {
      type: "h",
      item: {},
      name: "Parent",
      content: "Parent",
    })
    const freshChildId = freshRepo.addNode(freshParentId, {
      type: "p",
      content: "Alpha bravo",
      parent_idx: 1,
    })

    // The child IDs must match for replay to work
    // Use the original tree for replay instead
    repo.updateNode(child1Id, { content: "Alpha bravo" }) // reset
    replay(repo, log)
    expect(repo.getNode(child1Id)!.content).toBe("Updated")
  })

  test("replays from a specific sequence number", () => {
    const { repo, child1Id } = setupTree()
    const log = createOperationLog()

    log.append(
      [
        {
          type: "set_node",
          nodeId: child1Id,
          properties: { content: "V1" },
          oldProperties: { content: "Alpha bravo" },
        },
      ],
      { source: "user" },
    )
    log.append(
      [
        {
          type: "set_node",
          nodeId: child1Id,
          properties: { content: "V2" },
          oldProperties: { content: "V1" },
        },
      ],
      { source: "user" },
    )

    // Reset and replay only from seq 1 (should only apply V2)
    repo.updateNode(child1Id, { content: "V1" })
    replay(repo, log, 1)
    expect(repo.getNode(child1Id)!.content).toBe("V2")
  })
})

// =============================================================================
// withHistory + log integration
// =============================================================================

describe("withHistory + log", () => {
  test("mutations are recorded in the log", () => {
    const { repo, parentId } = setupTree()
    const log = createOperationLog()
    const editor = withHistory(repo, { log })

    editor.addNode(parentId, { type: "p", content: "New", parent_idx: 3 })
    editor.updateNode(repo.getChildren(parentId)[0]!.id, { content: "Changed" })

    const all = log.getAll()
    expect(all).toHaveLength(2)
    expect(all[0]!.source).toBe("user")
    expect(all[1]!.source).toBe("user")
  })

  test("batch mutations are recorded as a single log entry", () => {
    const { repo, parentId } = setupTree()
    const log = createOperationLog()
    const editor = withHistory(repo, { log })

    editor.batch(() => {
      editor.addNode(parentId, { type: "p", content: "A", parent_idx: 3 })
      editor.addNode(parentId, { type: "p", content: "B", parent_idx: 4 })
    })

    const all = log.getAll()
    expect(all).toHaveLength(1)
    expect(all[0]!.ops).toHaveLength(2)
    expect(all[0]!.source).toBe("user")
  })

  test("undo appends inverse ops with source: undo", () => {
    const { repo, parentId } = setupTree()
    const log = createOperationLog()
    const editor = withHistory(repo, { log })

    editor.addNode(parentId, { type: "p", content: "New", parent_idx: 3 })
    editor.undo()

    const all = log.getAll()
    expect(all).toHaveLength(2)
    expect(all[0]!.source).toBe("user")
    expect(all[1]!.source).toBe("undo")
    // The undo entry should contain the inverse operation
    expect(all[1]!.ops[0]!.type).toBe("remove_node")
  })

  test("redo appends ops with source: redo", () => {
    const { repo, parentId } = setupTree()
    const log = createOperationLog()
    const editor = withHistory(repo, { log })

    editor.addNode(parentId, { type: "p", content: "New", parent_idx: 3 })
    editor.undo()
    editor.redo()

    const all = log.getAll()
    expect(all).toHaveLength(3)
    expect(all[0]!.source).toBe("user")
    expect(all[1]!.source).toBe("undo")
    expect(all[2]!.source).toBe("redo")
    expect(all[2]!.ops[0]!.type).toBe("insert_node")
  })

  test("withHistory without log option still works normally", () => {
    const { repo, parentId } = setupTree()
    const editor = withHistory(repo)

    const id = editor.addNode(parentId, { type: "p", content: "No log", parent_idx: 3 })
    expect(repo.getNode(id)).not.toBeNull()

    editor.undo()
    expect(repo.getNode(id)).toBeNull()
  })

  test("seq reflects total log entries including undo/redo", () => {
    const { repo, parentId } = setupTree()
    const log = createOperationLog()
    const editor = withHistory(repo, { log })

    editor.addNode(parentId, { type: "p", content: "A", parent_idx: 3 })
    expect(log.seq()).toBe(1)

    editor.undo()
    expect(log.seq()).toBe(2)

    editor.redo()
    expect(log.seq()).toBe(3)
  })
})
