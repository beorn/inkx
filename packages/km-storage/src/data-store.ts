/**
 * DataStore Interface - Indexed Tree of Nodes
 *
 * DataStore is the pure tree interface that most code uses.
 * It abstracts over different storage backends (SQLite, Maps, etc.)
 *
 * Key principles:
 * - Pure tree operations (getNode, getChildren, addNode, etc.)
 * - No internal exposure (database, blobs, events)
 * - Infrastructure code uses capability interfaces when needed
 *
 * See: docs/00-principles.md
 */

import { Database } from "bun:sqlite"
import type { KNode } from "@km/core"
import { ulid } from "ulid"
import { SCHEMA } from "./db/schema.ts"
import {
  getNode as dbGetNode,
  getNodesBatch as dbGetNodesBatch,
  getChildren as dbGetChildren,
  getAllNodes as dbGetAllNodes,
} from "./db/queries/index.ts"
import { createDbOps } from "./db/ops.ts"
import type { Emitter } from "./emitter.ts"
import { search as dbSearch } from "./db/queries/full-text-search.ts"

// =============================================================================
// Core Interface
// =============================================================================

/**
 * DataStore - the pure tree interface.
 *
 * Most code works with just this interface. It provides:
 * - Query operations (getNode, getChildren, search)
 * - Mutation operations (addNode, updateNode, deleteNode, moveNode)
 *
 * Implementations may provide additional capabilities via intersection types.
 */
export interface DataStore extends Disposable {
  // --- Query operations ---

  /** Get a single node by ID */
  getNode(id: string): KNode | null

  /** Get multiple nodes by ID in a single query */
  getNodesBatch(ids: string[]): Map<string, KNode>

  /** Get children of a node (null for root-level nodes) */
  getChildren(parentId: string | null): KNode[]

  /** Get child IDs of a node (null for root-level nodes) — structural read without full node hydration */
  getChildIds(parentId: string | null): readonly string[]

  /** Get all nodes in the store */
  getAllNodes(): KNode[]

  /** Full-text search (km query language) */
  search(query: string): KNode[]

  // --- Mutation operations ---

  /**
   * Add a new node under a parent.
   * @param parentId - Parent node ID (null for root level)
   * @param node - Node data (id generated if not provided)
   * @returns The created node's ID
   */
  addNode(parentId: string | null, node: Partial<KNode>): string

  /** Update a node's properties */
  updateNode(id: string, changes: Partial<KNode>): void

  /** Delete a node */
  deleteNode(id: string): void

  /** Move a node to a new parent with new sort order */
  moveNode(id: string, newParentId: string, position: number): void

  // --- Lifecycle ---

  /** Close and release resources */
  close(): void
}

// =============================================================================
// Capability Interfaces (for infrastructure code)
// =============================================================================

/**
 * Change-sourced capability - provides access to change log and rebuild.
 * Use for infrastructure code that needs to replay or inspect changes.
 */
export interface ChangeSourced {
  /** Change log for replaying/inspecting changes */
  readonly changeLog: ChangeLog
  /** Rebuild state from changes */
  rebuild(): Promise<void>
}

/**
 * Database capability - provides raw SQLite access.
 * Use for infrastructure code that needs direct queries.
 */
export interface HasDatabase {
  /** Raw SQLite database instance */
  readonly database: Database
}

/**
 * Change log interface for change-sourced stores.
 */
export interface ChangeLog {
  append(change: StoreChange): void
  read(): AsyncIterable<StoreChange>
  getLastChangeId(): string | null
}

/**
 * Store change for change sourcing.
 */
export interface StoreChange {
  id: string
  type: string
  timestamp: number
  data: Record<string, unknown>
}

// =============================================================================
// Composed Types
// =============================================================================

/** DataStore backed by SQLite with change sourcing */
export type DBDataStore = DataStore & ChangeSourced & HasDatabase

/** Pure in-memory DataStore (fastest, for testing) */
export type MapDataStore = DataStore

// =============================================================================
// Factory: createMapDataStore
// =============================================================================

/**
 * Create a pure in-memory DataStore using Maps.
 *
 * This is the fastest DataStore implementation - no SQLite, no disk I/O.
 * Ideal for unit tests that need tree operations without database overhead.
 *
 * @example
 * const data = createMapDataStore()
 * const id = data.addNode(null, { type: "p", item: { list: "-", task: { marker: "[ ]", status: "todo" } }, content: "Test" })
 * const node = data.getNode(id)
 *
 * @returns MapDataStore (pure DataStore, no extras)
 */
export function createMapDataStore(): MapDataStore {
  const nodes = new Map<string, KNode>()
  let closed = false

  return {
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
      const pid = parentId ?? "."
      const children: KNode[] = []
      for (const node of nodes.values()) {
        if (node.parent_id === pid) {
          children.push(node)
        }
      }
      return children.sort((a, b) => (a.parent_idx ?? 0) - (b.parent_idx ?? 0))
    },

    getChildIds(parentId) {
      return this.getChildren(parentId).map((n) => n.id)
    },

    getAllNodes() {
      return Array.from(nodes.values())
    },

    search(query) {
      const q = query.toLowerCase()
      const results: KNode[] = []
      for (const node of nodes.values()) {
        const content = (node.content ?? "").toLowerCase()
        const title = (node.title ?? "").toLowerCase()
        if (content.includes(q) || title.includes(q)) {
          results.push(node)
        }
      }
      return results
    },

    addNode(parentId, nodeData) {
      const now = Date.now()
      const id = nodeData.id ?? ulid()

      const node: KNode = {
        ...nodeData,
        id,
        type: nodeData.type ?? "p",
        parent_id: parentId ?? ".",
        parent_idx: nodeData.parent_idx ?? now,
        item: nodeData.item,
        data: nodeData.data ?? {},
        created_at: now,
        updated_at: now,
        version: nodeData.version ?? id,
      }

      nodes.set(id, node)
      return id
    },

    updateNode(id, changes) {
      const node = nodes.get(id)
      if (!node) return

      const updated: KNode = {
        ...node,
        ...changes,
        id, // Preserve ID
        updated_at: Date.now(),
      }
      nodes.set(id, updated)
    },

    deleteNode(id) {
      nodes.delete(id)
    },

    moveNode(id, newParentId, position) {
      const node = nodes.get(id)
      if (!node) return

      const updated: KNode = {
        ...node,
        parent_id: newParentId,
        parent_idx: position,
        updated_at: Date.now(),
      }
      nodes.set(id, updated)
    },

    close() {
      if (closed) return
      closed = true
      nodes.clear()
    },

    [Symbol.dispose]() {
      this.close()
    },
  }
}

// =============================================================================
// Factory: createMemDataStore
// =============================================================================

/**
 * Create a DataStore backed by SQLite in-memory database.
 *
 * This provides real SQLite queries without disk I/O.
 * Useful for tests that need SQL behavior but not persistence.
 *
 * @example
 * const data = createMemDataStore()
 * const id = data.addNode(null, { type: "p", item: { list: "-", task: { marker: "[ ]", status: "todo" } }, content: "Test" })
 * // Full SQL queries work (search, etc.)
 *
 * @returns DBDataStore (DataStore + HasDatabase)
 */
export function createMemDataStore(): DataStore & HasDatabase {
  const db = new Database(":memory:")

  // Initialize schema
  db.run(SCHEMA)

  // Memory mode - no emitter, direct SQL
  const ops = createDbOps(db)
  let closed = false

  return {
    database: db,

    getNode(id) {
      return dbGetNode(db, id)
    },

    getNodesBatch(ids) {
      return dbGetNodesBatch(db, ids)
    },

    getChildren(parentId) {
      return dbGetChildren(db, parentId)
    },

    getChildIds(parentId) {
      return this.getChildren(parentId).map((n) => n.id)
    },

    getAllNodes() {
      return dbGetAllNodes(db)
    },

    search(query) {
      return dbSearch(db, query)
    },

    addNode(parentId, node) {
      return ops.addNode(parentId, node)
    },

    updateNode(id, changes) {
      ops.updateNode(id, changes)
    },

    deleteNode(id) {
      ops.deleteNode(id)
    },

    moveNode(id, newParentId, position) {
      ops.moveNode(id, newParentId, position)
    },

    close() {
      if (closed) return
      closed = true
      db.close()
    },

    [Symbol.dispose]() {
      this.close()
    },
  }
}

// =============================================================================
// Factory: createDBDataStore
// =============================================================================

/** Options for createDBDataStore */
export interface DBDataStoreOptions {
  /** Optional emitter for disk mode (events emitted instead of direct SQL) */
  emitter?: Emitter
}

/**
 * Create a DataStore from an existing database instance.
 *
 * This is the low-level factory for infrastructure code that manages
 * its own database lifecycle. Most code should use createMemDataStore()
 * or createDiskDataStore() instead.
 *
 * @param db - SQLite database instance (caller manages lifecycle)
 * @param options - Optional emitter for disk mode
 * @returns DataStore + HasDatabase (no event sourcing - caller manages)
 */
export function createDBDataStore(db: Database, options?: DBDataStoreOptions): DataStore & HasDatabase {
  // Create ops with optional emitter - if emitter provided, events are emitted
  const ops = createDbOps(db, options?.emitter)
  let closed = false

  return {
    database: db,

    getNode(id) {
      return dbGetNode(db, id)
    },

    getNodesBatch(ids) {
      return dbGetNodesBatch(db, ids)
    },

    getChildren(parentId) {
      return dbGetChildren(db, parentId)
    },

    getChildIds(parentId) {
      return this.getChildren(parentId).map((n) => n.id)
    },

    getAllNodes() {
      return dbGetAllNodes(db)
    },

    search(query) {
      return dbSearch(db, query)
    },

    addNode(parentId, node) {
      return ops.addNode(parentId, node)
    },

    updateNode(id, changes) {
      ops.updateNode(id, changes)
    },

    deleteNode(id) {
      ops.deleteNode(id)
    },

    moveNode(id, newParentId, position) {
      ops.moveNode(id, newParentId, position)
    },

    close() {
      if (closed) return
      closed = true
      // Note: caller manages db lifecycle, we don't close it
    },

    [Symbol.dispose]() {
      this.close()
    },
  }
}
