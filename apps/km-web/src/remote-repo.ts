/**
 * createRemoteRepo — Browser-side Repo proxy over WebSocket
 *
 * Connects to a serveRepo() server, hydrates an in-memory cache
 * from the initial snapshot, and provides synchronous Repo reads.
 * Mutations are fire-and-forget RPCs; the server pushes version
 * updates which trigger re-hydration.
 */

import type { KNode, TaskStatus } from "@km/core"
import { createNodeCache, type NodeCache } from "./node-cache.ts"

/** Subset of Repo that the canvas client needs */
export interface RepoLike {
  readonly version: number
  subscribe(callback: () => void): () => void
  getSnapshot(): number
  touch(): void
  getNode(id: string): KNode | null
  getNodesBatch(ids: string[]): Map<string, KNode>
  getChildren(parentId: string | null): KNode[]
  getSubtree(nodeId: string): KNode[]
  getAncestors(nodeId: string): KNode[]
  getAllTasks(): KNode[]
  getTasksByStatus(status: TaskStatus): KNode[]
  getChildCounts(parentIds: string[]): Map<string, number>
  getRepoRootNode(): KNode | null
  search(query: string): KNode[]
  resolveNode(query: string): KNode | null
  resolveByName(name: string): KNode | null
  getBacklinks(nodeId: string): { source_id: string; target_id: string }[]
  getLinksTo(targetId: string): KNode[]
  getOutgoingLinks(sourceId: string): { source_id: string; target_id: string }[]
  getRenameImpact(nodeId: string): { backlinks: unknown[]; childCount: number; ruleRefs: number; propRefs: number }
  updateNode(id: string, changes: Partial<KNode>): void
  moveNode(id: string, newParentId: string, position: number): void
  deleteNode(id: string): void
  addNode(parentId: string | null, node: Partial<KNode>): string
  preloadSubtree(rootId: string | null, maxDepth: number): void
  validateCache(): void
}

export interface RemoteRepo {
  /** Repo-compatible interface (synchronous reads from cache) */
  repo: RepoLike
  /** Close the WebSocket connection */
  close(): void
  /** Whether connected and hydrated */
  readonly ready: boolean
}

export interface RemoteRepoOptions {
  url: string
}

/**
 * Create a remote Repo that connects via WebSocket.
 * Resolves when the initial snapshot is received and cache is hydrated.
 */
export function createRemoteRepo(opts: RemoteRepoOptions): Promise<RemoteRepo> {
  const { url } = opts
  const cache: NodeCache = createNodeCache()
  const listeners = new Set<() => void>()
  let version = 0
  let rpcId = 0
  let ready = false
  let ws: WebSocket

  // Pending RPC responses
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
    }
  >()

  function notify() {
    for (const cb of listeners) cb()
  }

  function rpc(method: string, ...args: unknown[]): Promise<unknown> {
    const id = ++rpcId
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, args }))
    })
  }

  function rpcFireAndForget(method: string, ...args: unknown[]) {
    const id = ++rpcId
    ws.send(JSON.stringify({ id, method, args }))
    // Don't track — response is ignored
  }

  const repo: RepoLike = {
    get version() {
      return version
    },

    subscribe(callback: () => void) {
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    },

    getSnapshot() {
      return version
    },

    touch() {
      version++
      notify()
    },

    // ---- Reads (synchronous from cache) ----

    getNode: (id) => cache.getNode(id),
    getNodesBatch: (ids) => cache.getNodesBatch(ids),
    getChildren: (parentId) => cache.getChildren(parentId),
    getSubtree: (nodeId) => cache.getSubtree(nodeId),
    getAncestors: (nodeId) => cache.getAncestors(nodeId),
    getChildCounts: (parentIds) => cache.getChildCounts(parentIds),
    getRepoRootNode: () => cache.getRepoRootNode(),

    getAllTasks() {
      return cache.getAllNodes().filter((n) => n.item?.task?.status != null)
    },

    getTasksByStatus(status: TaskStatus) {
      return cache.getAllNodes().filter((n) => n.item?.task?.status === status)
    },

    search(query: string) {
      // Client-side text search (FTS5 is server-side, but basic search works)
      const q = query.toLowerCase()
      return cache
        .getAllNodes()
        .filter((n) => n.content?.toLowerCase().includes(q) || n.title?.toLowerCase().includes(q))
    },

    resolveNode(query: string) {
      // Simple: try ID first, then content match
      const byId = cache.getNode(query)
      if (byId) return byId
      for (const node of cache.getAllNodes()) {
        if (node.content?.includes(query) || node.title?.includes(query)) {
          return node
        }
      }
      return null
    },

    resolveByName(name: string) {
      const lower = name.toLowerCase().replace(/\.md$/i, "")
      for (const node of cache.getAllNodes()) {
        const nodeName = (node as unknown as Record<string, unknown>).name as string | undefined
        if (nodeName?.toLowerCase().replace(/\.md$/i, "") === lower) return node
      }
      return null
    },

    getBacklinks() {
      return [] // Links not cached — would need server RPC
    },

    getLinksTo() {
      return [] // Links not cached
    },

    getOutgoingLinks() {
      return [] // Links not cached
    },

    getRenameImpact() {
      return { backlinks: [], childCount: 0, ruleRefs: 0, propRefs: 0 }
    },

    // ---- Mutations (fire-and-forget over WebSocket) ----

    updateNode(id, changes) {
      rpcFireAndForget("updateNode", id, changes)
    },

    moveNode(id, newParentId, position) {
      rpcFireAndForget("moveNode", id, newParentId, position)
    },

    deleteNode(id) {
      rpcFireAndForget("deleteNode", id)
    },

    addNode(parentId, node) {
      // Generate a temporary client-side ID
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      rpcFireAndForget("addNode", parentId, { ...node, id: tempId })
      return tempId
    },

    // ---- No-ops ----

    preloadSubtree() {
      // All data is already in cache
    },

    validateCache() {
      // No validation needed for remote cache
    },
  }

  return new Promise<RemoteRepo>((resolve, reject) => {
    ws = new WebSocket(url)

    ws.onopen = () => {
      // Wait for snapshot before resolving
    }

    ws.onmessage = (event) => {
      const data = typeof event.data === "string" ? event.data : ""
      let msg: Record<string, unknown> = {}
      try {
        msg = JSON.parse(data) as Record<string, unknown>
      } catch {
        return
      }

      if (msg.type === "snapshot") {
        // Initial hydration or re-hydration
        cache.hydrate(msg.nodes as KNode[])
        version++
        notify()

        if (!ready) {
          ready = true
          resolve({
            repo,
            close,
            get ready() {
              return ready
            },
          })
        }
      } else if (msg.type === "delta") {
        // Incremental update — patch cache instead of full rebuild
        cache.applyDelta(msg.updates as KNode[], (msg.removals as string[]) ?? [])
        version++
        notify()
      } else if (typeof msg.id === "number") {
        // RPC response
        const handler = pending.get(msg.id as number)
        if (handler) {
          pending.delete(msg.id as number)
          if (msg.error) {
            handler.reject(new Error(msg.error as string))
          } else {
            // Deserialize Maps if needed
            // We don't track method names per RPC id, so just pass through
            handler.resolve(msg.result)
          }
        }
      }
    }

    ws.onerror = (event) => {
      if (!ready) {
        reject(new Error(`WebSocket connection failed: ${url}`))
      }
      console.error("km-web WebSocket error:", event)
    }

    ws.onclose = () => {
      ready = false
      // Clear pending RPCs
      for (const [, handler] of pending) {
        handler.reject(new Error("WebSocket closed"))
      }
      pending.clear()
    }
  })

  function close() {
    ready = false
    ws.close()
  }
}
