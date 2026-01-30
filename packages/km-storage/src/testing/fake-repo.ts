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
 * Internal state for a FakeRepo instance
 */
interface FakeRepoState {
  nodes: Map<string, KNode>
  links: Link[]
  nextId: number
  closed: boolean
  readonly initialNodes: KNode[]
  readonly initialLinks: Link[]
}

/**
 * Create initial state from options
 */
function createState(options: FakeRepoOptions): FakeRepoState {
  const state: FakeRepoState = {
    nodes: new Map(),
    links: [],
    nextId: 1,
    closed: false,
    initialNodes: options.nodes ?? [],
    initialLinks: options.links ?? [],
  }
  resetState(state)
  return state
}

/**
 * Reset state to initial values
 */
function resetState(state: FakeRepoState): void {
  state.nodes = new Map()
  state.links = [...state.initialLinks]
  state.nextId = 1
  state.closed = false

  for (const node of state.initialNodes) {
    state.nodes.set(node.id, { ...node })
  }
}

/**
 * Throw if repo is closed
 */
function ensureNotClosed(state: FakeRepoState): void {
  if (state.closed) {
    throw new Error("Repo is closed")
  }
}

/**
 * Create no-op emitter for FakeRepo
 */
function createFakeEmitter(): Emitter {
  let fakeEventHub: EventHub | null = null
  let fakeFsSync: FsSync | null = null

  return {
    kmDir: "/fake/.km",
    eventsPath: "/fake/.km/events.jsonl",
    emit(event) {
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
}

/**
 * Get children of a node, sorted by parent_idx
 */
function getChildrenFromState(
  state: FakeRepoState,
  parentId: string | null,
): KNode[] {
  return [...state.nodes.values()]
    .filter((n) => n.parent_id === parentId)
    .sort((a, b) => (a.parent_idx ?? 0) - (b.parent_idx ?? 0))
}

/**
 * Create query operations for the repo
 */
function createQueryOperations(state: FakeRepoState) {
  return {
    getNode(id: string): KNode | null {
      ensureNotClosed(state)
      return state.nodes.get(id) ?? null
    },

    getChildren(parentId: string | null): KNode[] {
      ensureNotClosed(state)
      return getChildrenFromState(state, parentId)
    },

    getChildCounts(parentIds: string[]): Map<string, number> {
      ensureNotClosed(state)
      const counts = new Map<string, number>()
      for (const node of state.nodes.values()) {
        if (node.parent_id && parentIds.includes(node.parent_id)) {
          counts.set(node.parent_id, (counts.get(node.parent_id) ?? 0) + 1)
        }
      }
      return counts
    },

    getSubtree(nodeId: string): KNode[] {
      ensureNotClosed(state)
      const result: KNode[] = []
      const queue = [nodeId]

      while (queue.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- bounds checked by loop condition
        const id = queue.shift()!
        const node = state.nodes.get(id)
        if (node) {
          result.push(node)
          const children = getChildrenFromState(state, id)
          queue.push(...children.map((c) => c.id))
        }
      }

      return result
    },

    getAncestors(nodeId: string): KNode[] {
      ensureNotClosed(state)
      const result: KNode[] = []
      let current = state.nodes.get(nodeId)

      while (current?.parent_id) {
        const parent = state.nodes.get(current.parent_id)
        if (parent) {
          result.unshift(parent)
          current = parent
        } else {
          break
        }
      }

      return result
    },

    getAllTasks(): KNode[] {
      ensureNotClosed(state)
      return [...state.nodes.values()].filter((n) => n.type === "task")
    },

    getTasksByStatus(status: TaskStatus): KNode[] {
      ensureNotClosed(state)
      return [...state.nodes.values()].filter(
        (n) => n.type === "task" && n.task_status === status,
      )
    },

    search(query: string): KNode[] {
      ensureNotClosed(state)
      const q = query.toLowerCase()
      return [...state.nodes.values()].filter(
        (n) =>
          n.content?.toLowerCase().includes(q) ||
          n.title?.toLowerCase().includes(q),
      )
    },

    query(expression: string): KNode[] {
      ensureNotClosed(state)
      const typeMatch = expression.match(/^type:(\w+)$/)
      if (typeMatch) {
        const type = typeMatch[1]
        return [...state.nodes.values()].filter((n) => n.type === type)
      }
      return this.getAllTasks()
    },

    getLinksTo(targetId: string): KNode[] {
      ensureNotClosed(state)
      const linkingIds = state.links
        .filter((l) => l.target_id === targetId)
        .map((l) => l.source_id)
      return [...state.nodes.values()].filter((n) => linkingIds.includes(n.id))
    },

    getBacklinks(nodeId: string): Link[] {
      ensureNotClosed(state)
      return state.links.filter((l) => l.target_id === nodeId)
    },

    getOutgoingLinks(sourceId: string): Link[] {
      ensureNotClosed(state)
      return state.links.filter((l) => l.source_id === sourceId)
    },

    resolveNode(query: string, _typeOrOptions?: unknown): KNode | null {
      ensureNotClosed(state)
      const byId = state.nodes.get(query)
      if (byId) return byId

      for (const node of state.nodes.values()) {
        if (node.content?.includes(query) || node.title?.includes(query)) {
          return node
        }
      }
      return null
    },
  }
}

/**
 * Create mutation operations for the repo
 */
function createMutationOperations(state: FakeRepoState) {
  return {
    updateNode(id: string, changes: Partial<KNode>): void {
      ensureNotClosed(state)
      const node = state.nodes.get(id)
      if (!node) {
        throw new Error(`Node ${id} not found`)
      }
      state.nodes.set(id, { ...node, ...changes, id })
    },

    moveNode(id: string, newParentId: string | null, position: number): void {
      ensureNotClosed(state)
      const node = state.nodes.get(id)
      if (!node) {
        throw new Error(`Node ${id} not found`)
      }
      state.nodes.set(id, {
        ...node,
        parent_id: newParentId,
        parent_idx: position,
      })
    },

    deleteNode(id: string): void {
      ensureNotClosed(state)
      state.nodes.delete(id)
      state.links = state.links.filter(
        (l) => l.source_id !== id && l.target_id !== id,
      )
    },

    addNode(
      parentId: string | null,
      nodeData: Partial<KNode> & { type: string },
    ): string {
      ensureNotClosed(state)
      const id = `fake-${state.nextId++}`
      const siblings = getChildrenFromState(state, parentId)
      const position = siblings.length
      const now = Date.now()

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

      state.nodes.set(id, node)
      return id
    },

    cloneTask(sourceId: string, changes: Partial<KNode>): string | null {
      ensureNotClosed(state)
      const source = state.nodes.get(sourceId)
      if (source?.type !== "task") return null

      const id = `fake-${state.nextId++}`
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

      state.nodes.set(id, cloned)
      return id
    },

    appendTaskToFile(
      _filePath: string,
      _content: string,
      _options?: unknown,
    ): void {
      ensureNotClosed(state)
      // No-op in fake repo - filesystem operations not supported
    },

    pathExists(_relativePath: string): boolean {
      ensureNotClosed(state)
      return false
    },

    rawQuery<T = Record<string, unknown>>(
      sql: string,
      _params?: unknown[],
    ): T[] {
      ensureNotClosed(state)

      if (sql.trim() === "SELECT * FROM nodes") {
        return [...state.nodes.values()] as T[]
      }

      throw new Error(
        `FakeRepo.rawQuery: unsupported query pattern: ${sql.slice(0, 100)}`,
      )
    },
  }
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
  const loadErrors = options.loadErrors ?? []
  const baseStats: RepoStats = {
    nodeCount: (options.nodes ?? []).length,
    linkCount: (options.links ?? []).length,
    duration: 0,
    ...options.stats,
  }

  const state = createState(options)
  const emitter = createFakeEmitter()
  const queryOps = createQueryOperations(state)
  const mutationOps = createMutationOperations(state)

  const repo: FakeRepo = {
    get path() {
      return path
    },

    get mode() {
      return "memory" as const
    },

    get loadErrors() {
      return loadErrors
    },

    get stats() {
      return { ...baseStats, nodeCount: state.nodes.size }
    },

    get deferredFiles() {
      return []
    },

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- FakeRepo returns null as any for database stub
    get database() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
      return null as any
    },

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- FakeRepo returns null as any for data stub
    get data() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
      return null as any
    },

    get files() {
      return null
    },

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- FakeRepo returns empty object as any for config stub
    get config() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
      return {} as any
    },

    get emitter(): Emitter {
      return emitter
    },

    sync() {
      return Promise.resolve({ fromFiles: 0, fromData: 0, conflicts: [] })
    },

    needsRebuild() {
      return false
    },

    // Query operations
    ...queryOps,

    // Mutation operations
    ...mutationOps,

    // Lifecycle
    watch() {
      ensureNotClosed(state)
      throw new Error("FakeRepo does not support watching")
    },

    *refresh(): Generator<StepYield, void, unknown> {
      ensureNotClosed(state)
      yield { current: 1, total: 1 }
    },

    close() {
      state.closed = true
    },

    [Symbol.dispose]() {
      this.close()
    },

    // Test helpers
    getAllNodes() {
      return [...state.nodes.values()]
    },

    getAllLinks() {
      return [...state.links]
    },

    reset() {
      resetState(state)
    },
  }

  return repo
}
