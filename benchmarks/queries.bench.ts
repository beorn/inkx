/**
 * Database Query Benchmarks
 *
 * Measures performance of core database query operations across different repo sizes.
 * Uses real SQLite (in-memory) via withTestEnv for accurate query performance.
 *
 * Run: bun run bench
 *
 * These benchmarks help identify:
 * - Query scaling characteristics
 * - Index effectiveness
 * - Batch operation efficiency
 */

import { bench, describe, beforeAll, afterAll } from "vitest"
import {
  withTestEnvSync,
  getNode,
  getChildren,
  getAncestors,
  getChildCountsBatch,
  getAllNodes,
  search,
  getSubtree,
} from "@km/storage"

// Helper to safely get array element (avoids non-null assertion lint errors)
function at<T>(arr: T[], index: number): T {
  const item = arr[index]
  if (item === undefined) throw new Error(`Index ${index} out of bounds`)
  return item
}
import type { Database } from "bun:sqlite"

// ============================================================================
// Test Data Generators
// ============================================================================

interface TestRepo {
  db: Database
  rootId: string
  nodeIds: string[]
  leafIds: string[]
  cleanup: () => void
}

/**
 * Create a flat list of nodes (tasks under a single parent)
 */
function createFlatRepo(nodeCount: number): TestRepo {
  return withTestEnvSync(({ db, data }) => {
    const rootId = data.addNode(null, { type: "h", item: {}, fstype: "mdfile", content: "root.md" })
    const nodeIds: string[] = [rootId]
    const leafIds: string[] = []

    for (let i = 0; i < nodeCount; i++) {
      const id = data.addNode(rootId, {
        type: "p",
        item: { list: "-", task: { marker: "[ ]", status: "todo" } },
        content: `Task ${i + 1} with some content #tag${i % 10}`,
      })
      nodeIds.push(id)
      leafIds.push(id)
    }

    return {
      db,
      rootId,
      nodeIds,
      leafIds,
      cleanup: () => db.close(),
    }
  })
}

/**
 * Create a tree with depth and branching factor
 */
function createTreeRepo(depth: number, branchFactor: number): TestRepo {
  return withTestEnvSync(({ db, data }) => {
    const rootId = data.addNode(null, { type: "h", item: {}, fstype: "mdfile", content: "root.md" })
    const nodeIds: string[] = [rootId]
    const leafIds: string[] = []

    function createChildren(parentId: string, currentDepth: number): void {
      if (currentDepth >= depth) {
        leafIds.push(parentId)
        return
      }

      for (let i = 0; i < branchFactor; i++) {
        const isLeafLevel = currentDepth === depth - 1
        const id = data.addNode(parentId, {
          type: isLeafLevel ? "p" : "h",
          item: {},
          ...(isLeafLevel ? { list_marker: "-", task_marker: "[ ]" } : { fstype: "mdsection" }),
          content: `Node at depth ${currentDepth}, branch ${i}`,
        } as Record<string, unknown>)
        nodeIds.push(id)
        createChildren(id, currentDepth + 1)
      }
    }

    createChildren(rootId, 0)

    return {
      db,
      rootId,
      nodeIds,
      leafIds,
      cleanup: () => db.close(),
    }
  })
}

// ============================================================================
// Benchmarks
// ============================================================================

describe("Query Benchmarks - Flat List", () => {
  let small: TestRepo
  let medium: TestRepo
  let large: TestRepo

  beforeAll(() => {
    small = createFlatRepo(100) // 100 nodes
    medium = createFlatRepo(500) // 500 nodes
    large = createFlatRepo(2000) // 2000 nodes
  })

  afterAll(() => {
    small.cleanup()
    medium.cleanup()
    large.cleanup()
  })

  describe("getNode (single lookup)", () => {
    bench("100 nodes - lookup middle", () => {
      const midIndex = Math.floor(small.nodeIds.length / 2)
      getNode(small.db, at(small.nodeIds, midIndex))
    })

    bench("500 nodes - lookup middle", () => {
      const midIndex = Math.floor(medium.nodeIds.length / 2)
      getNode(medium.db, at(medium.nodeIds, midIndex))
    })

    bench("2000 nodes - lookup middle", () => {
      const midIndex = Math.floor(large.nodeIds.length / 2)
      getNode(large.db, at(large.nodeIds, midIndex))
    })
  })

  describe("getChildren (list children)", () => {
    bench("100 nodes - get all children", () => {
      getChildren(small.db, small.rootId)
    })

    bench("500 nodes - get all children", () => {
      getChildren(medium.db, medium.rootId)
    })

    bench("2000 nodes - get all children", () => {
      getChildren(large.db, large.rootId)
    })
  })

  describe("getAllNodes (full scan)", () => {
    bench("100 nodes", () => {
      getAllNodes(small.db)
    })

    bench("500 nodes", () => {
      getAllNodes(medium.db)
    })

    bench("2000 nodes", () => {
      getAllNodes(large.db)
    })
  })

  describe("search (FTS)", () => {
    bench("100 nodes - search 'Task'", () => {
      search(small.db, "Task")
    })

    bench("500 nodes - search 'Task'", () => {
      search(medium.db, "Task")
    })

    bench("2000 nodes - search 'Task'", () => {
      search(large.db, "Task")
    })

    bench("2000 nodes - search '#tag5'", () => {
      search(large.db, "#tag5")
    })
  })
})

describe("Query Benchmarks - Tree Structure", () => {
  let shallow: TestRepo // depth=2, branch=10 = ~110 nodes
  let medium: TestRepo // depth=3, branch=5 = ~155 nodes
  let deep: TestRepo // depth=5, branch=3 = ~363 nodes

  beforeAll(() => {
    shallow = createTreeRepo(2, 10)
    medium = createTreeRepo(3, 5)
    deep = createTreeRepo(5, 3)
  })

  afterAll(() => {
    shallow.cleanup()
    medium.cleanup()
    deep.cleanup()
  })

  describe("getAncestors (path to root)", () => {
    bench("depth=2 - leaf to root", () => {
      getAncestors(shallow.db, at(shallow.leafIds, 0))
    })

    bench("depth=3 - leaf to root", () => {
      getAncestors(medium.db, at(medium.leafIds, 0))
    })

    bench("depth=5 - leaf to root", () => {
      getAncestors(deep.db, at(deep.leafIds, 0))
    })
  })

  describe("getSubtree (full subtree)", () => {
    bench("depth=2 - full tree", () => {
      getSubtree(shallow.db, shallow.rootId)
    })

    bench("depth=3 - full tree", () => {
      getSubtree(medium.db, medium.rootId)
    })

    bench("depth=5 - full tree", () => {
      getSubtree(deep.db, deep.rootId)
    })
  })

  describe("getChildCountsBatch (batch counts)", () => {
    bench("depth=2 - count all parents", () => {
      // Get non-leaf node IDs (parents)
      const parentIds = shallow.nodeIds.filter(
        (id) => !shallow.leafIds.includes(id),
      )
      getChildCountsBatch(shallow.db, parentIds)
    })

    bench("depth=3 - count all parents", () => {
      const parentIds = medium.nodeIds.filter(
        (id) => !medium.leafIds.includes(id),
      )
      getChildCountsBatch(medium.db, parentIds)
    })

    bench("depth=5 - count all parents", () => {
      const parentIds = deep.nodeIds.filter((id) => !deep.leafIds.includes(id))
      getChildCountsBatch(deep.db, parentIds)
    })
  })
})

describe("Query Benchmarks - Batch Operations", () => {
  let repo: TestRepo

  beforeAll(() => {
    repo = createFlatRepo(1000)
  })

  afterAll(() => {
    repo.cleanup()
  })

  describe("getNode - multiple lookups", () => {
    bench("10 sequential lookups", () => {
      for (let i = 0; i < 10; i++) {
        getNode(repo.db, at(repo.nodeIds, i * 100))
      }
    })

    bench("50 sequential lookups", () => {
      for (let i = 0; i < 50; i++) {
        getNode(repo.db, at(repo.nodeIds, i * 20))
      }
    })

    bench("100 sequential lookups", () => {
      for (let i = 0; i < 100; i++) {
        getNode(repo.db, at(repo.nodeIds, i * 10))
      }
    })
  })

  describe("getChildCountsBatch - scaling", () => {
    bench("batch of 10", () => {
      getChildCountsBatch(repo.db, repo.nodeIds.slice(0, 10))
    })

    bench("batch of 50", () => {
      getChildCountsBatch(repo.db, repo.nodeIds.slice(0, 50))
    })

    bench("batch of 100", () => {
      getChildCountsBatch(repo.db, repo.nodeIds.slice(0, 100))
    })
  })
})
