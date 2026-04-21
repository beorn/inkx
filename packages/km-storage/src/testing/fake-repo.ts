/**
 * FakeRepo - Test Double for Repo
 *
 * In-memory Repo implementation for unit tests that don't need
 * real SQLite or file parsing. Uses canned data.
 */
/* oxlint-disable complexity/complexity -- Test helper — setup complexity is acceptable */

import { KNode, type Change } from "@km/core"
import { normalizeLinkHref } from "@km/markdown"
import type { Repo, RepoStats } from "../repo/repo.ts"
import type { LoadError } from "../repo/loader.ts"
import type { KLink } from "../db/db.ts"
import type { StepYield } from "../repo/loader.ts"
import type { Emitter, ChangeHub } from "../emitter.ts"
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
  links?: KLink[]

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
  getAllLinks(): KLink[]

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
 *     { id: "1", type: "h", item: {}, fstype: "mdsection", content: "Tasks", parentId: null, ... },
 *     { id: "2", type: "p", item: { list: "-", task: { marker: "[ ]", status: "todo" } }, content: "Do something", parentId: "1", ... },
 *   ],
 * });
 *
 * // Empty repo
 * const repo = createFakeRepo();
 * repo.addNode(null, { type: "h", item: {}, fstype: "mdsection", content: "New section" });
 *
 * @param options - Configuration with initial data
 * @returns FakeRepo instance
 */

/**
 * Compute the canonical href a node would be referenced by. Matches the
 * real Repo's `backlinksForNodeId`: prefers `node.name`, falls back to
 * `node.fs_path` (stripped of `./` and `.md`).
 */
function fakeHrefForNode(node: KNode): string | null {
  if (node.name) return normalizeLinkHref("wiki", node.name)
  if (node.fs_path) {
    const stem = node.fs_path.replace(/^\.\//, "").replace(/\.md$/, "")
    if (stem) return normalizeLinkHref("wiki", stem)
  }
  return null
}

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
  let links: KLink[] = []
  let nextId = 1
  let closed = false
  let mutationVersion = 0
  const listeners = new Set<() => void>()
  function notifyListeners() {
    for (const cb of listeners) cb()
  }

  // Initialize with provided data
  reset()

  // Create a mutation-aware emitter for FakeRepo
  let fakeChangeHub: ChangeHub | null = null

  function applyToNodes(event: Change): void {
    switch (event.type) {
      case "node_created": {
        const id = (event.data?.id as string) ?? event.target ?? ulid()
        const parent_id = (event.data?.parent_id as string) ?? null
        nodes.set(id, {
          id,
          type: ((event.data?.type as string) ?? "p") as KNode["type"],
          item: (event.data?.item ?? {}) as KNode["item"],
          fstype: (event.data?.fstype as KNode["fstype"]) ?? undefined,
          content: (event.data?.content as string) ?? "",
          title: (event.data?.title as string) ?? "",
          parent_id,
          parent_idx: (event.data?.parent_idx as number) ?? 0,
          embed_of: null,
          data: {},
          created_at: event.ts,
          updated_at: event.ts,
          version: "fake",
        })
        break
      }
      case "node_updated": {
        const node = nodes.get(event.target ?? "")
        if (node && event.data) {
          nodes.set(node.id, { ...node, ...event.data, id: node.id, updated_at: event.ts })
        }
        break
      }
      case "node_moved": {
        const node = nodes.get(event.target ?? "")
        if (node && event.data) {
          nodes.set(node.id, {
            ...node,
            parent_id: (event.data.parent_id as string) ?? node.parent_id,
            parent_idx: (event.data.parent_idx as number) ?? node.parent_idx,
            updated_at: event.ts,
          })
        }
        break
      }
      case "node_deleted": {
        nodes.delete(event.target ?? "")
        break
      }
    }
    mutationVersion++
    notifyListeners()
  }

  const fakeEmitter: Emitter = {
    kmDir: "/fake/.km",
    changesPath: "/fake/.km/changes.jsonl",
    apply(event) {
      const full = { id: ulid(), ts: Date.now(), ...event } as Change
      applyToNodes(full)
      return full
    },
    commit(event) {
      const full = { id: ulid(), ts: Date.now(), ...event } as Change
      applyToNodes(full)
      return full
    },
    onApply() {
      return () => {}
    },
    setChangeHub(hub) {
      fakeChangeHub = hub
    },
    getChangeHub() {
      return fakeChangeHub
    },
    close() {
      fakeChangeHub = null
    },
  }

  const repo: FakeRepo = {
    path,
    mode: "memory" as const,
    loadErrors,

    get version() {
      return mutationVersion
    },
    set version(v: number) {
      mutationVersion = v
    },
    subscribe(callback: () => void) {
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    },
    getSnapshot() {
      return mutationVersion
    },
    touch() {
      mutationVersion++
      for (const cb of listeners) cb()
    },

    get stats() {
      return { ...stats, nodeCount: nodes.size }
    },

    deferredFiles: [],
    unexploredDirs: [],
    async expandDirectory() {
      return { nodeCount: 0, linkCount: 0, newUnexploredDirs: [] }
    },
    async *expandAll() {
      // No-op for fake repo
    },
    async reconcileAsync() {
      // No-op for fake repo — tests don't manage a real filesystem to reconcile.
      return { changes: 0, deferredFiles: [], errors: [], duration: 0 }
    },
    withDeferredFs(fn) {
      return fn()
    },
    syncToFs() {
      // No-op for fake repo
    },
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    database: null as any,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    data: null as any,
    files: null,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    config: {} as any,
    emitter: fakeEmitter,

    // Change application (delegates to fakeEmitter)
    apply(event, options?) {
      return fakeEmitter.apply(event, options)
    },
    commit(event, options?) {
      return fakeEmitter.commit(event, options)
    },

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

    getNodesBatch(ids) {
      ensureNotClosed()
      const result = new Map<string, KNode>()
      for (const id of ids) {
        const node = nodes.get(id)
        if (node) result.set(id, node)
      }
      return result
    },

    getChildren(parentId) {
      ensureNotClosed()
      return [...nodes.values()]
        .filter((n) => n.parent_id === parentId)
        .sort((a, b) => (a.parent_idx ?? 0) - (b.parent_idx ?? 0))
    },

    getChildIds(parentId) {
      return this.getChildren(parentId).map((n) => n.id)
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

    preloadSubtree(_rootId: string | null, _maxDepth: number) {
      // No-op for fake repo — children are already in memory
    },
    validateCache() {
      // No-op for fake repo — no caching layer
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
      return [...nodes.values()].filter((n) => n.item?.task != null)
    },

    getTasksByStatus(status) {
      ensureNotClosed()
      return [...nodes.values()].filter((n) => n.item?.task != null && n.item.task.status === status)
    },

    search(query) {
      ensureNotClosed()
      const q = query.toLowerCase()
      return [...nodes.values()].filter(
        (n) => n.content?.toLowerCase().includes(q) || n.title?.toLowerCase().includes(q),
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
      return this.query(expression).filter((n) => n.item?.task != null)
    },

    getLinksTo(targetId) {
      ensureNotClosed()
      const target = nodes.get(targetId)
      if (!target) return []
      const href = fakeHrefForNode(target)
      if (!href) return []
      const linkingIds = links.filter((l) => l.href === href).map((l) => l.host_id)
      return [...nodes.values()].filter((n) => linkingIds.includes(n.id))
    },

    getBacklinks(nodeId) {
      ensureNotClosed()
      const target = nodes.get(nodeId)
      if (!target) return []
      const href = fakeHrefForNode(target)
      return href ? links.filter((l) => l.href === href) : []
    },

    getRenameImpact(nodeId) {
      ensureNotClosed()
      const target = nodes.get(nodeId)
      const href = target ? fakeHrefForNode(target) : null
      const backlinks = href ? links.filter((l) => l.href === href) : []
      const children = [...nodes.values()].filter((n) => n.parent_id === nodeId)
      return { backlinks, childCount: children.length, ruleRefs: 0, propRefs: 0 }
    },

    getOutgoingLinks(sourceId) {
      ensureNotClosed()
      return links.filter((l) => l.host_id === sourceId)
    },

    resolveNode(query, _typeOrOptions) {
      ensureNotClosed()
      // Simple implementation: exact ID match or content match
      const byId = nodes.get(query)
      if (byId) return byId

      // Try fs_path match (relative path lookup, like real repo's smart-resolver)
      for (const node of nodes.values()) {
        if (node.fs_path === query) return node
      }

      // Try block_id match (strip ^ prefix for block references)
      const blockQuery = query.startsWith("^") ? query.slice(1) : query
      if (/^\d{5,}$/.test(blockQuery)) {
        for (const node of nodes.values()) {
          if (node.block_id === blockQuery) return node
        }
      }

      // Try content match
      for (const node of nodes.values()) {
        if (node.content?.includes(query) || node.title?.includes(query)) {
          return node
        }
      }
      return null
    },

    resolveByName(name: string) {
      ensureNotClosed()
      const lower = name.toLowerCase().replace(/\.md$/i, "")
      for (const node of nodes.values()) {
        const nodeName = node.name?.toLowerCase().replace(/\.md$/i, "")
        if (nodeName === lower) return node
      }
      return null
    },

    getRepoRootNode() {
      ensureNotClosed()
      // Find the folder node with no parent (repo root)
      for (const node of nodes.values()) {
        if (node.parent_id === null && KNode.isOutline(node) && node.fstype === "folder") {
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
      mutationVersion++
      notifyListeners()
    },

    moveNode(id, newParentId, position) {
      ensureNotClosed()
      const node = nodes.get(id)
      if (!node) {
        throw new Error(`Node ${id} not found`)
      }
      nodes.set(id, { ...node, parent_id: newParentId, parent_idx: position })
      mutationVersion++
      notifyListeners()
    },

    deleteNode(id) {
      ensureNotClosed()
      const deletedHref = (() => {
        const node = nodes.get(id)
        return node ? fakeHrefForNode(node) : null
      })()
      nodes.delete(id)
      // Remove link rows hosted by this node. Backlinks to this node are
      // left intact (they'll surface as broken at runtime resolution under
      // the v4 links schema) unless we can compute the target's href.
      links = links.filter((l) => l.host_id !== id && (deletedHref == null || l.href !== deletedHref))
      mutationVersion++
      notifyListeners()
    },

    addNode(parentId, nodeData) {
      ensureNotClosed()
      const id = nodeData.id ?? `fake-${nextId++}`
      const siblings = this.getChildren(parentId)
      const position = siblings.length
      const now = Date.now()

      // nodeData.type is required by the interface signature
      const node = {
        ...nodeData,
        id,
        parent_id: parentId,
        parent_idx: nodeData.parent_idx ?? position,
        embed_of: null,
        data: nodeData.data ?? {},
        created_at: now,
        updated_at: now,
        version: "fake-0",
        item: nodeData.item,
      } as KNode

      nodes.set(id, node)
      mutationVersion++
      notifyListeners()
      return id
    },

    cloneTask(sourceId, changes) {
      ensureNotClosed()
      const source = nodes.get(sourceId)
      if (!source?.item?.task) return null

      const id = `fake-${nextId++}`
      const now = Date.now()

      const newItem = changes.item ?? source.item
      const cloned: KNode = {
        ...source,
        id,
        item: {
          ...newItem,
          task: {
            marker: newItem?.task?.marker ?? "[ ]",
            status: newItem?.task?.status ?? "todo",
          },
        },
        content: changes.content ?? source.content,
        due_at: changes.due_at ?? source.due_at,
        start_at: changes.start_at ?? source.start_at,
        parent_idx: (source.parent_idx ?? 0) + 0.001,
        data: { ...source.data, ...changes.data, recur_prev: sourceId },
        created_at: now,
        updated_at: now,
        ...changes,
      }

      nodes.set(id, cloned)
      return id
    },

    renameNode(id, newContent, onProgress) {
      ensureNotClosed()
      const node = nodes.get(id)
      if (!node) return
      const oldName = node.name ?? ""
      const newName = newContent.replace(/^- \[.\]\s*/, "")

      // Mirror real repo: when data.name is set (frontmatter title override),
      // it takes priority in getNodeDisplayName and must be updated too.
      const nextData =
        node.data && typeof node.data === "object" && "name" in (node.data as Record<string, unknown>)
          ? { ...(node.data as Record<string, unknown>), name: newName }
          : node.data
      this.updateNode(id, { content: newContent, name: newName, data: nextData })

      if (!oldName || oldName === newName) return

      const oldHref = fakeHrefForNode(node)
      const backlinks = oldHref ? links.filter((l) => l.href === oldHref) : []
      const escapedOld = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const pattern = new RegExp(`(\\!?\\[\\[)${escapedOld}(\\|[^\\]]+)?(\\]\\])`, "gi")

      let updated = 0
      for (const link of backlinks) {
        const sourceNode = nodes.get(link.host_id)
        if (!sourceNode?.content) continue
        const updatedContent = sourceNode.content.replace(pattern, `$1${newName}$2$3`)
        if (updatedContent !== sourceNode.content) {
          this.updateNode(link.host_id, { content: updatedContent })
        }
        updated++
        onProgress?.({ updated, total: backlinks.length })
      }
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

    rawQuery<T = Record<string, unknown>>(sql: string, _params?: unknown[]): T[] {
      ensureNotClosed()

      // Pattern: SELECT * FROM nodes (used by Picker loaders)
      if (sql.trim() === "SELECT * FROM nodes") {
        return [...nodes.values()] as T[]
      }

      // Unknown query - throw helpful error
      // Note: Use getChildCounts() instead of rawQuery for child count batching
      throw new Error(`FakeRepo.rawQuery: unsupported query pattern: ${sql.slice(0, 100)}`)
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

  // FakeRepo implements DataStore methods directly — self-reference for repo.data access
  Object.defineProperty(repo, "data", { get: () => repo, enumerable: true })
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
