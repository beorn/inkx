/**
 * Property-based fuzz tests for node diffing
 *
 * Invariants tested:
 * 1. Bijective ID mapping — no two new nodes map to the same existing node
 * 2. Self-diff produces no changes — diffNodes(nodes, nodes) yields zero adds/removes
 * 3. Ordinal stability — ordinal normalization is idempotent
 * 4. Coverage — every input node appears in matched, added, or removed
 */

import { test, describe, expect, gen, take, type SeededRandom } from "vimonkey"
import { diffNodes } from "../../src/watch/handlers/node-differ.ts"
import type { KNode, TaskMarker } from "@km/core"

// ---------------------------------------------------------------------------
// Node generators
// ---------------------------------------------------------------------------

const CHILD_TYPES = ["p", "h", "code", "quote"] as const
const TASK_STATUSES = ["todo", "wip", "blocked", "done", "dropped", null] as const
const TASK_MARKERS = ["[ ]", "[x]", "[/]", "[!]", "[-]", undefined] as const

let nodeIdCounter = 0

function makeNode(overrides: Partial<KNode> & { id: string; type: string }): KNode {
  return {
    parent_id: null,
    parent_idx: 0,
    embed_source: null,
    fs_path: undefined,
    fs_ino: undefined,
    md_pos: undefined,
    item: undefined,
    assigned_to: undefined,
    due_at: undefined,
    start_at: undefined,
    priority: undefined,
    content: undefined,
    content_hash: undefined,
    data: {},
    created_at: Date.now(),
    updated_at: Date.now(),
    version: "v1",
    ...overrides,
  }
}

function nextId(prefix: string): string {
  return `${prefix}-${++nodeIdCounter}`
}

function randomFileNode(rng: SeededRandom, id: string): KNode {
  return makeNode({
    id,
    type: "h",
    item: {},
    fstype: "mdfile",
    parent_idx: 0,
    content: rng.bool(0.5) ? `File ${rng.int(1, 100)}` : undefined,
    title: rng.bool(0.5) ? `Title ${rng.int(1, 100)}` : undefined,
  })
}

function randomChildNode(rng: SeededRandom, id: string, parentId: string, parentIdx: number): KNode {
  const type = rng.pick(CHILD_TYPES)
  const isItem = type === "h" || rng.bool(0.5)
  const hasTask = isItem && rng.bool(0.4)

  return makeNode({
    id,
    type,
    item: isItem
      ? hasTask
        ? {
            task: {
              status: rng.pick(TASK_STATUSES) ?? "todo",
              marker: (rng.pick(TASK_MARKERS) ?? "[ ]") as TaskMarker,
            },
          }
        : {}
      : undefined,
    parent_id: parentId,
    parent_idx: parentIdx,
    content: rng.bool(0.7) ? `Content ${rng.int(1, 1000)}` : undefined,
    title: type === "h" && rng.bool(0.5) ? `Section ${rng.int(1, 100)}` : undefined,
    md_pos: rng.bool(0.3) ? rng.int(0, 10000) : undefined,
    priority: rng.bool(0.2) ? `P${rng.int(1, 5)}` : undefined,
    data: rng.bool(0.3) ? { tags: [`tag-${rng.int(1, 10)}`] } : {},
  })
}

/** Generate a tree of nodes: one file node + random children (flat or nested) */
function generateNodeTree(rng: SeededRandom, prefix: string): KNode[] {
  const nodes: KNode[] = []
  const fileId = nextId(`${prefix}-file`)
  nodes.push(randomFileNode(rng, fileId))

  const childCount = rng.int(0, 8)
  const parentIds = [fileId]

  for (let i = 0; i < childCount; i++) {
    const parentId = rng.bool(0.6) ? fileId : rng.pick(parentIds)
    const childId = nextId(`${prefix}-node`)
    const parentIdx = rng.bool(0.3) ? rng.float() * 10 : i

    const child = randomChildNode(rng, childId, parentId, parentIdx)
    nodes.push(child)

    if (child.type === "h" && child.item) {
      parentIds.push(childId)
    }
  }

  return nodes
}

/**
 * Generate a "new" version of nodes — simulates re-parsing a file.
 * Keeps structural similarity but with different IDs (like a parser would produce).
 */
function generateNewVersion(rng: SeededRandom, existing: KNode[]): KNode[] {
  const idRemap = new Map<string, string>()
  const newNodes: KNode[] = []

  for (const node of existing) {
    const newId = nextId("new")
    idRemap.set(node.id, newId)

    const remappedParentId = node.parent_id ? (idRemap.get(node.parent_id) ?? node.parent_id) : null
    const mutate = rng.bool(0.3)

    newNodes.push(
      makeNode({
        ...node,
        id: newId,
        parent_id: remappedParentId,
        content: mutate && rng.bool(0.5) ? `Modified ${rng.int(1, 1000)}` : node.content,
        item: node.item
          ? {
              ...node.item,
              ...(node.item.task
                ? {
                    task: {
                      ...node.item.task,
                      status: mutate && rng.bool(0.3) ? (rng.pick(TASK_STATUSES) ?? "todo") : node.item.task.status,
                    },
                  }
                : {}),
            }
          : node.item,
        parent_idx: node.parent_id ? existing.filter((n) => n.parent_id === node.parent_id).indexOf(node) : 0,
      }),
    )
  }

  // Optionally add extra new nodes
  if (rng.bool(0.3)) {
    const fileNode = newNodes.find((n) => isFileNode(n))
    if (fileNode) {
      const extraCount = rng.int(1, 3)
      for (let i = 0; i < extraCount; i++) {
        newNodes.push(randomChildNode(rng, nextId("new-extra"), fileNode.id, newNodes.length + i))
      }
    }
  }

  // Optionally remove some non-file nodes
  if (rng.bool(0.2)) {
    const removeIdx = newNodes.findIndex((n, idx) => idx > 0 && !isFileNode(n))
    if (removeIdx > 0) {
      newNodes.splice(removeIdx, 1)
    }
  }

  return newNodes
}

function isFileNode(n: KNode): boolean {
  return n.type === "h" && !!n.item && (n.fstype === "file" || n.fstype === "mdfile")
}

// ---------------------------------------------------------------------------
// Wrapper types — gen() flattens raw arrays, so we wrap in objects
// ---------------------------------------------------------------------------

interface NodeTreeCase {
  nodes: KNode[]
}

interface DiffCase {
  existing: KNode[]
  newNodes: KNode[]
}

interface OrdinalCase {
  existing: KNode[]
  base: KNode[]
  scaled: KNode[]
}

interface FracCase {
  intNodes: KNode[]
  fracNodes: KNode[]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Node Differ Fuzz: Bijective ID Mapping", () => {
  test.fuzz("no two new nodes map to the same existing node", async () => {
    const cases = gen(({ random }): DiffCase => {
      const existing = generateNodeTree(random, "old")
      const newNodes = generateNewVersion(random, existing)
      return { existing, newNodes }
    })

    for await (const { existing, newNodes } of take(cases, 200)) {
      const result = diffNodes(existing, newNodes)

      const mappedExistingIds = new Set<string>()
      for (const [, existingId] of result.idMap) {
        expect.soft(mappedExistingIds.has(existingId)).toBe(false)
        mappedExistingIds.add(existingId)
      }
    }
  })
})

describe("Node Differ Fuzz: Self-Diff Identity", () => {
  test.fuzz("diffing nodes against themselves produces no adds or removes", async () => {
    const cases = gen(
      ({ random }): NodeTreeCase => ({
        nodes: generateNodeTree(random, "self"),
      }),
    )

    for await (const { nodes } of take(cases, 200)) {
      const result = diffNodes(nodes, nodes)

      const created = result.changes.filter((c) => c.type === "created")
      const deleted = result.changes.filter((c) => c.type === "deleted")

      expect.soft(created).toHaveLength(0)
      expect.soft(deleted).toHaveLength(0)
    }
  })

  test.fuzz("self-diff maps every non-file node to itself", async () => {
    const cases = gen(
      ({ random }): NodeTreeCase => ({
        nodes: generateNodeTree(random, "selfmap"),
      }),
    )

    for await (const { nodes } of take(cases, 200)) {
      const result = diffNodes(nodes, nodes)

      for (const node of nodes.filter((n) => !isFileNode(n))) {
        expect.soft(result.idMap.get(node.id)).toBe(node.id)
      }

      const fileNode = nodes.find((n) => isFileNode(n))
      if (fileNode) {
        expect.soft(result.idMap.get(fileNode.id)).toBe(fileNode.id)
      }
    }
  })
})

describe("Node Differ Fuzz: Coverage", () => {
  test.fuzz("every existing non-file node is either matched or deleted", async () => {
    const cases = gen(({ random }): DiffCase => {
      const existing = generateNodeTree(random, "cov-old")
      const newNodes = generateNewVersion(random, existing)
      return { existing, newNodes }
    })

    for await (const { existing, newNodes } of take(cases, 200)) {
      const result = diffNodes(existing, newNodes)

      const matchedExistingIds = new Set(result.idMap.values())
      const deletedIds = new Set(result.changes.filter((c) => c.type === "deleted").map((c) => c.nodeId))

      for (const node of existing.filter((n) => !isFileNode(n))) {
        const covered = matchedExistingIds.has(node.id) || deletedIds.has(node.id)
        expect.soft(covered).toBe(true)
      }
    }
  })

  test.fuzz("every new non-file node is either matched or created", async () => {
    const cases = gen(({ random }): DiffCase => {
      const existing = generateNodeTree(random, "cov2-old")
      const newNodes = generateNewVersion(random, existing)
      return { existing, newNodes }
    })

    for await (const { existing, newNodes } of take(cases, 200)) {
      const result = diffNodes(existing, newNodes)

      const matchedNewIds = new Set(result.idMap.keys())
      const createdIds = new Set(result.changes.filter((c) => c.type === "created").map((c) => c.node?.id))

      for (const node of newNodes.filter((n) => !isFileNode(n))) {
        const covered = matchedNewIds.has(node.id) || createdIds.has(node.id)
        expect.soft(covered).toBe(true)
      }
    }
  })
})

describe("Node Differ Fuzz: Ordinal Stability", () => {
  test.fuzz("ordinal-normalized indices produce same diff regardless of index scale", async () => {
    const cases = gen(({ random }): OrdinalCase => {
      const existing = generateNodeTree(random, "ord")
      const base = generateNewVersion(random, existing)

      // Scale all indices by the SAME constant factor — preserves relative order
      const scaleFactor = random.int(2, 100)
      const scaled: KNode[] = base.map((n) =>
        makeNode({
          ...n,
          parent_idx: n.parent_idx * scaleFactor,
        }),
      )

      return { existing, base, scaled }
    })

    for await (const { existing, base, scaled } of take(cases, 200)) {
      const resultBase = diffNodes(existing, base)
      const resultScaled = diffNodes(existing, scaled)

      const countByType = (changes: typeof resultBase.changes) => ({
        created: changes.filter((c) => c.type === "created").length,
        updated: changes.filter((c) => c.type === "updated").length,
        deleted: changes.filter((c) => c.type === "deleted").length,
      })

      expect.soft(countByType(resultScaled.changes)).toEqual(countByType(resultBase.changes))
    }
  })

  test.fuzz("fractional vs integer indices with same order produce same matches", async () => {
    const cases = gen(({ random }): FracCase => {
      const fileId = nextId("frac-file")
      const file = randomFileNode(random, fileId)
      const childCount = random.int(2, 6)

      const intNodes: KNode[] = [file]
      for (let i = 0; i < childCount; i++) {
        intNodes.push(randomChildNode(random, nextId("frac-int"), fileId, i))
      }

      const fracNodes: KNode[] = [file]
      for (let i = 0; i < childCount; i++) {
        const base = intNodes[i + 1]!
        fracNodes.push(
          makeNode({
            ...base,
            id: nextId("frac-frac"),
            parent_idx: i + 0.5,
          }),
        )
      }

      return { intNodes, fracNodes }
    })

    for await (const { intNodes, fracNodes } of take(cases, 200)) {
      const resultInt = diffNodes(intNodes, intNodes)
      const resultFrac = diffNodes(intNodes, fracNodes)

      expect.soft(resultFrac.idMap.size).toBe(resultInt.idMap.size)
    }
  })
})

describe("Node Differ Fuzz: Empty and Degenerate Cases", () => {
  test.fuzz("empty vs random nodes — all new nodes are created", async () => {
    const cases = gen(
      ({ random }): NodeTreeCase => ({
        nodes: generateNodeTree(random, "empty"),
      }),
    )

    for await (const { nodes } of take(cases, 100)) {
      const result = diffNodes([], nodes)

      const nonFileNodes = nodes.filter((n) => !isFileNode(n))
      const created = result.changes.filter((c) => c.type === "created")
      expect.soft(created.length).toBe(nonFileNodes.length)
    }
  })

  test.fuzz("random nodes vs empty — all existing non-file nodes are deleted", async () => {
    const cases = gen(
      ({ random }): NodeTreeCase => ({
        nodes: generateNodeTree(random, "del"),
      }),
    )

    for await (const { nodes } of take(cases, 100)) {
      const result = diffNodes(nodes, [])

      const nonFileNodes = nodes.filter((n) => !isFileNode(n))
      const deleted = result.changes.filter((c) => c.type === "deleted")
      expect.soft(deleted.length).toBe(nonFileNodes.length)
    }
  })
})
