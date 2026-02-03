/**
 * FakeRepo - Test Double for Repo
 *
 * In-memory Repo implementation for unit tests that don't need
 * real SQLite or file parsing. Uses canned data.
 */

import type { KNode, TaskStatus, Event } from "@km/core"
import type { Repo, RepoStats } from "../repo.ts"
import type { LoadError } from "../repo-loader.ts"
import type { Link } from "../db.ts"
import type { StepYield } from "../repo-loader.ts"
import type { Emitter, EventHub, FsSync } from "../emitter.ts"
import { ulid } from "ulid"

/**
 * Options for createFakeRepo
 */
export interface FakeRepoOptions {
  /** Path to report (default: "/fake/repo") */
  path?: string

  /** Initial nodes (can also add via addNode) */
  nodes?: KNode[]

  /** Initial links (for backlinks) */
  links?: Link[]

  /** Load errors to report */
  loadErrors?: LoadError[]

  /** Stats to report */
  stats?: Partial<RepoStats>
}

/**
 * Extended Repo interface with test helpers
 */
export interface FakeRepo extends Repo {
  /** Get all nodes (for test assertions) */
  getAllNodes(): KNode[]

  /** Get all links (for test assertions) */
  getAllLinks(): Link[]

  /** Reset to initial state */
  reset(): void
}

/**
 * Create a FakeRepo for testing.
 *
 * @example
 * // With canned data
 * const repo = createFakeRepo({
 *   nodes: [
 *     { id: "1", type: "section", content: "Tasks", parentId: null, ... },
 *     { id: "2", type: "task", content: "Do something", parentId: "1", ... },
 *   ],
 * });
 *
 * // Empty repo
 * const repo = createFakeRepo();
 * repo.addNode(null, { type: "section", content: "New section" });
 *
 * @param options - Configuration with initial data
 * @returns FakeRepo instance
 */
export function createFakeRepo(options: FakeRepoOptions = {}): FakeRepo {
  const path = options.path ?? "/fake/repo"
  const initialNodes = options.nodes ?? []
  const initialLinks = options.links ?? []
  const loadErrors = options.loadErrors ?? []
  const stats: RepoStats = {
    nodeCount: initialNodes.length,
    linkCount: initialLinks.length,
    duration: 0,
    ...options.stats,
  }

  // Internal state
  let nodes = new Map<string, KNode>()
  let links: Link[] = []
  let nextId = 1
  let closed = false

  // Initialize with provided data
  reset()

  // Create a no-op emitter for FakeRepo
  let fakeEventHub: EventHub | null = null
  let fakeFsSync: FsSync | null = null
  const fakeEmitter: Emitter = {
    kmDir: "/fake/.km",
    eventsPath: "/fake/.km/events.jsonl",
    emit(event) {
      // No-op emit for fake repo - just return a full event
      return { id: ulid(), ts: Date.now(), ...event } as Event
    },
    setEventHub(hub) {
      fakeEventHub = hub
    },
    setFsSync(sync) {
      fakeFsSync = sync
    },
    getEventHub() {
      return fakeEventHub
    },
    getFsSync() {
      return fakeFsSync
    },
    close() {
      fakeEventHub = null
      fakeFsSync = null
    },
  }

  const repo: FakeRepo = {
    path,
    mode: "memory" as const,
    loadErrors,

    get stats() {
      return { ...stats, nodeCount: nodes.size }
    },

    deferredFiles: [],
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    database: null as any,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    data: null as any,
    files: null,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    config: {} as any,
    emitter: fakeEmitter,

    sync() {
      // FakeRepo is in-memory, sync is a no-op
      return Promise.resolve({ fromFiles: 0, fromData: 0, conflicts: [] })
    },

    // --- Query operations ---

    needsRebuild() {
      return false // FakeRepo is in-memory, never needs rebuild
    },

    getNode(id) {
      ensureNotClosed()
      return nodes.get(id) ?? null
    },

    getChildren(parentId) {
      ensureNotClosed()
      return [...nodes.values()]
        .filter((n) => n.parent_id === parentId)
        .sort((a, b) => (a.parent_idx ?? 0) - (b.parent_idx ?? 0))
    },

    getChildCounts(parentIds) {
      ensureNotClosed()
      const counts = new Map<string, number>()
      for (const node of nodes.values()) {
        if (node.parent_id && parentIds.includes(node.parent_id)) {
          counts.set(node.parent_id, (counts.get(node.parent_id) ?? 0) + 1)
        }
      }
      return counts
    },

    getSubtree(nodeId) {
      ensureNotClosed()
      const result: KNode[] = []
      const queue = [nodeId]

      while (queue.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounds checked by loop condition
        const id = queue.shift()!
        const node = nodes.get(id)
        if (node) {
          result.push(node)
          const children = this.getChildren(id)
          queue.push(...children.map((c) => c.id))
        }
      }

      return result
    },

    getAncestors(nodeId) {
      ensureNotClosed()
      const result: KNode[] = []
      let current = nodes.get(nodeId)

      while (current?.parent_id) {
        const parent = nodes.get(current.parent_id)
        if (parent) {
          result.unshift(parent)
          current = parent
        } else {
          break
        }
      }

      return result
    },

    getAllTasks() {
      ensureNotClosed()
      return [...nodes.values()].filter((n) => n.type === "task")
    },

    getTasksByStatus(status) {
      ensureNotClosed()
      return [...nodes.values()].filter(
        (n) => n.type === "task" && n.task_status === status,
      )
    },

    search(query) {
      ensureNotClosed()
      const q = query.toLowerCase()
      return [...nodes.values()].filter(
        (n) =>
          n.content?.toLowerCase().includes(q) ||
          n.title?.toLowerCase().includes(q),
      )
    },

    query(expression) {
      ensureNotClosed()
      // Simple implementation: basic type filtering for tests
      // Full query language support is tested via real repo

      // Handle "type:X" queries
      const typeMatch = expression.match(/^type:(\w+)$/)
      if (typeMatch) {
        const type = typeMatch[1]
        return [...nodes.values()].filter((n) => n.type === type)
      }

      // Default: return all tasks (for backwards compatibility)
      return this.getAllTasks()
    },

    queryTasks(expression) {
      ensureNotClosed()
      // Simple implementation: filter query results to only tasks
      return this.query(expression).filter((n) => n.type === "task")
    },

    getLinksTo(targetId) {
      ensureNotClosed()
      const linkingIds = links
        .filter((l) => l.target_id === targetId)
        .map((l) => l.source_id)
      return [...nodes.values()].filter((n) => linkingIds.includes(n.id))
    },

    getBacklinks(nodeId) {
      ensureNotClosed()
      return links.filter((l) => l.target_id === nodeId)
    },

    getOutgoingLinks(sourceId) {
      ensureNotClosed()
      return links.filter((l) => l.source_id === sourceId)
    },

    resolveNode(query, _typeOrOptions) {
      ensureNotClosed()
      // Simple implementation: exact ID match or content match
      const byId = nodes.get(query)
      if (byId) return byId

      // Try content match
      for (const node of nodes.values()) {
        if (node.content?.includes(query) || node.title?.includes(query)) {
          return node
        }
      }
      return null
    },

    getRepoRootNode() {
      ensureNotClosed()
      // Find the folder node with no parent (repo root)
      for (const node of nodes.values()) {
        if (node.parent_id === null && node.type === "folder") {
          return node
        }
      }
      return null
    },

    // --- Mutation operations ---

    updateNode(id, changes) {
      ensureNotClosed()
      const node = nodes.get(id)
      if (!node) {
        throw new Error(`Node ${id} not found`)
      }
      nodes.set(id, { ...node, ...changes, id })
    },

    moveNode(id, newParentId, position) {
      ensureNotClosed()
      const node = nodes.get(id)
      if (!node) {
        throw new Error(`Node ${id} not found`)
      }
      nodes.set(id, { ...node, parent_id: newParentId, parent_idx: position })
    },

    deleteNode(id) {
      ensureNotClosed()
      nodes.delete(id)
      // Remove any links from/to this node
      links = links.filter((l) => l.source_id !== id && l.target_id !== id)
    },

    addNode(parentId, nodeData) {
      ensureNotClosed()
      const id = `fake-${nextId++}`
      const siblings = this.getChildren(parentId)
      const position = siblings.length
      const now = Date.now()

      // nodeData.type is required by the interface signature
      const node = {
        ...nodeData,
        id,
        parent_id: parentId,
        parent_idx: position,
        link_to: null,
        data: {},
        created_at: now,
        updated_at: now,
        version: "fake-0",
        task_status:
          nodeData.type === "task" ? ("todo" as TaskStatus) : undefined,
      } as KNode

      nodes.set(id, node)
      return id
    },

    cloneTask(sourceId, changes) {
      ensureNotClosed()
      const source = nodes.get(sourceId)
      if (source?.type !== "task") return null

      const id = `fake-${nextId++}`
      const now = Date.now()

      const cloned: KNode = {
        ...source,
        id,
        task_status: changes.task_status ?? "todo",
        task_mark: changes.task_mark ?? " ",
        content: changes.content ?? source.content,
        due_date: changes.due_date ?? source.due_date,
        scheduled_date: changes.scheduled_date ?? source.scheduled_date,
        parent_idx: (source.parent_idx ?? 0) + 0.001,
        data: { ...source.data, ...changes.data, recur_prev: sourceId },
        created_at: now,
        updated_at: now,
        ...changes,
      }

      nodes.set(id, cloned)
      return id
    },

    appendTaskToFile(_filePath, _content, _options) {
      ensureNotClosed()
      // No-op in fake repo - filesystem operations not supported
    },

    pathExists(_relativePath) {
      ensureNotClosed()
      // Always return false in fake repo
      return false
    },

    rawQuery<T = Record<string, unknown>>(
      sql: string,
      _params?: unknown[],
    ): T[] {
      ensureNotClosed()

      // Pattern: SELECT * FROM nodes (used by ProjectPicker)
      if (sql.trim() === "SELECT * FROM nodes") {
        return [...nodes.values()] as T[]
      }

      // Unknown query - throw helpful error
      // Note: Use getChildCounts() instead of rawQuery for child count batching
      throw new Error(
        `FakeRepo.rawQuery: unsupported query pattern: ${sql.slice(0, 100)}`,
      )
    },

    // --- Lifecycle ---

    watch() {
      ensureNotClosed()
      throw new Error("FakeRepo does not support watching")
    },

    *refresh(): Generator<StepYield, void, unknown> {
      ensureNotClosed()
      // No-op for fake repo - just yield a progress update
      yield { current: 1, total: 1 }
    },

    close() {
      closed = true
    },

    [Symbol.dispose]() {
      this.close()
    },

    // --- Test helpers ---

    getAllNodes() {
      return [...nodes.values()]
    },

    getAllLinks() {
      return [...links]
    },

    reset() {
      reset()
    },
  }

  return repo

  function reset() {
    nodes = new Map()
    links = [...initialLinks]
    nextId = 1
    closed = false

    for (const node of initialNodes) {
      nodes.set(node.id, { ...node })
    }
  }

  function ensureNotClosed() {
    if (closed) {
      throw new Error("Repo is closed")
    }
  }
}
