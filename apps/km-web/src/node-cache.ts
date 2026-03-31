/**
 * NodeCache — In-memory node store for the browser Repo proxy.
 *
 * Maintains two indexes:
 * - nodes: Map<id, KNode> for O(1) lookup
 * - childrenIndex: Map<parentId, KNode[]> sorted by parent_idx
 *
 * Hydrated from a server snapshot, provides synchronous reads
 * matching the Repo interface pattern from fake-repo.ts.
 */

import type { KNode } from "@km/core"

export interface NodeCache {
  /** Replace all data with new nodes */
  hydrate(nodes: KNode[]): void
  /** Apply incremental updates without full rebuild */
  applyDelta(updates: KNode[], removals: string[]): void
  /** Get a single node by ID */
  getNode(id: string): KNode | null
  /** Get multiple nodes by ID */
  getNodesBatch(ids: string[]): Map<string, KNode>
  /** Get children of a node, sorted by parent_idx */
  getChildren(parentId: string | null): KNode[]
  /** Get full subtree under a node (BFS) */
  getSubtree(nodeId: string): KNode[]
  /** Get ancestors from root to parent */
  getAncestors(nodeId: string): KNode[]
  /** Get child counts for multiple parents */
  getChildCounts(parentIds: string[]): Map<string, number>
  /** Get all nodes */
  getAllNodes(): KNode[]
  /** Get repo root node (parent_id null, type 'h', fstype 'folder') */
  getRepoRootNode(): KNode | null
}

export function createNodeCache(): NodeCache {
  let nodes = new Map<string, KNode>()
  let childrenIndex = new Map<string | null, KNode[]>()

  function rebuildChildrenIndex() {
    childrenIndex = new Map()
    for (const node of nodes.values()) {
      const pid = node.parent_id
      let arr = childrenIndex.get(pid)
      if (!arr) {
        arr = []
        childrenIndex.set(pid, arr)
      }
      arr.push(node)
    }
    // Sort each group by parent_idx
    for (const arr of childrenIndex.values()) {
      arr.sort((a, b) => (a.parent_idx ?? 0) - (b.parent_idx ?? 0))
    }
  }

  return {
    hydrate(incoming: KNode[]) {
      nodes = new Map()
      for (const node of incoming) {
        nodes.set(node.id, node)
      }
      rebuildChildrenIndex()
    },

    applyDelta(updates: KNode[], removals: string[]) {
      const affectedParents = new Set<string | null>()

      // Process removals
      for (const id of removals) {
        const existing = nodes.get(id)
        if (existing) {
          affectedParents.add(existing.parent_id)
          nodes.delete(id)
        }
      }

      // Process updates (add or replace)
      for (const node of updates) {
        const existing = nodes.get(node.id)
        if (existing && existing.parent_id !== node.parent_id) {
          // Parent changed — need to rebuild both old and new parent's children
          affectedParents.add(existing.parent_id)
        }
        affectedParents.add(node.parent_id)
        nodes.set(node.id, node)
      }

      // Rebuild only affected parent groups in children index
      for (const pid of affectedParents) {
        const children: KNode[] = []
        for (const node of nodes.values()) {
          if (node.parent_id === pid) children.push(node)
        }
        children.sort((a, b) => (a.parent_idx ?? 0) - (b.parent_idx ?? 0))
        childrenIndex.set(pid, children)
      }
    },

    getNode(id) {
      return nodes.get(id) ?? null
    },

    getNodesBatch(ids) {
      const result = new Map<string, KNode>()
      for (const id of ids) {
        const node = nodes.get(id)
        if (node) result.set(id, node)
      }
      return result
    },

    getChildren(parentId) {
      // km convention: null maps to "." for root-level nodes
      const pid = parentId ?? "."
      return childrenIndex.get(pid) ?? []
    },

    getSubtree(nodeId) {
      const result: KNode[] = []
      const queue = [nodeId]

      while (queue.length > 0) {
        const id = queue.shift()
        if (id === undefined) break
        const node = nodes.get(id)
        if (node) {
          result.push(node)
          const children = childrenIndex.get(id) ?? []
          queue.push(...children.map((c) => c.id))
        }
      }

      return result
    },

    getAncestors(nodeId) {
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

    getChildCounts(parentIds) {
      const counts = new Map<string, number>()
      for (const pid of parentIds) {
        const children = childrenIndex.get(pid)
        counts.set(pid, children?.length ?? 0)
      }
      return counts
    },

    getAllNodes() {
      return [...nodes.values()]
    },

    getRepoRootNode() {
      for (const node of nodes.values()) {
        if (node.parent_id === null && node.type === "h" && (node as Record<string, unknown>).fstype === "folder") {
          return node
        }
      }
      return null
    },
  }
}
