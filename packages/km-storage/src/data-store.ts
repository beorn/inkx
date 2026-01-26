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
 * See: docs/adr/002-domain-objects-refactor.md
 */

import { Database } from "bun:sqlite"
import type { KNode } from "@km/core"
import { ulid } from "ulid"
import { SCHEMA } from "./schema.ts"
import {
  getNode as dbGetNode,
  getChildren as dbGetChildren,
  getAllNodes as dbGetAllNodes,
} from "./db-queries/index.ts"
import {
  addNode as dbAddNode,
  updateNode as dbUpdateNode,
  deleteNode as dbDeleteNode,
  moveNode as dbMoveNode,
} from "./db-ops.ts"
import { search as dbSearch } from "./db-queries/full-text-search.ts"

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

  /** Get children of a node (null for root-level nodes) */
  getChildren(parentId: string | null): KNode[]

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
 * Event-sourced capability - provides access to event log and rebuild.
 * Use for infrastructure code that needs to replay or inspect events.
 */
export interface EventSourced {
  /** Event log for replaying/inspecting events */
  readonly events: EventLog
  /** Rebuild state from events */
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
 * Event log interface for event-sourced stores.
 */
export interface EventLog {
  append(event: StoreEvent): void
  read(): AsyncIterable<StoreEvent>
  getLastEventId(): string | null
}

/**
 * Store event for event sourcing.
 */
export interface StoreEvent {
  id: string
  type: string
  timestamp: number
  data: Record<string, unknown>
}

// =============================================================================
// Composed Types
// =============================================================================

/** DataStore backed by SQLite with event sourcing */
export type DBDataStore = DataStore & EventSourced & HasDatabase

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
 * const id = data.addNode(null, { type: "task", content: "Test" })
 * const node = data.getNode(id)
 *
 * @returns MapDataStore (pure DataStore, no extras)
 */
export function createMapDataStore(): MapDataStore {
  const nodes = new Map<string, KNode>()
  let closed = false

  return {
    getNode(id) {
      ensureOpen()
      return nodes.get(id) ?? null
    },

    getChildren(parentId) {
      ensureOpen()
      const children: KNode[] = []
      for (const node of nodes.values()) {
        if (node.parent_id === parentId) {
          children.push(node)
        }
      }
      return children.sort((a, b) => (a.parent_idx ?? 0) - (b.parent_idx ?? 0))
    },

    getAllNodes() {
      ensureOpen()
      return Array.from(nodes.values())
    },

    search(query) {
      ensureOpen()
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
      ensureOpen()
      const now = Date.now()
      const id = nodeData.id ?? ulid()

      const node: KNode = {
        id,
        type: nodeData.type ?? "task",
        parent_id: parentId,
        parent_idx: nodeData.parent_idx ?? now,
        link_to: nodeData.link_to ?? null,
        link_alias: nodeData.link_alias,
        fs_path: nodeData.fs_path,
        fs_ino: nodeData.fs_ino,
        name: nodeData.name,
        title: nodeData.title,
        md_pos: nodeData.md_pos,
        md_line: nodeData.md_line,
        md_slug: nodeData.md_slug,
        task_status: nodeData.task_status ?? (nodeData.type === "task" ? "todo" : undefined),
        task_mark: nodeData.task_mark ?? (nodeData.type === "task" ? " " : undefined),
        assigned_to: nodeData.assigned_to,
        due_date: nodeData.due_date,
        scheduled_date: nodeData.scheduled_date,
        priority: nodeData.priority,
        content: nodeData.content,
        content_hash: nodeData.content_hash,
        data: nodeData.data ?? {},
        created_at: now,
        updated_at: now,
        version: nodeData.version ?? id,
      }

      nodes.set(id, node)
      return id
    },

    updateNode(id, changes) {
      ensureOpen()
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
      ensureOpen()
      nodes.delete(id)
    },

    moveNode(id, newParentId, position) {
      ensureOpen()
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

  function ensureOpen() {
    if (closed) throw new Error("DataStore is closed")
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
 * const id = data.addNode(null, { type: "task", content: "Test" })
 * // Full SQL queries work (search, etc.)
 *
 * @returns DBDataStore (DataStore + HasDatabase)
 */
export function createMemDataStore(): DataStore & HasDatabase {
  const db = new Database(":memory:")

  // Initialize schema
  db.exec(SCHEMA)

  let closed = false

  return {
    get database() {
      ensureOpen()
      return db
    },

    getNode(id) {
      ensureOpen()
      return dbGetNode(db, id)
    },

    getChildren(parentId) {
      ensureOpen()
      return dbGetChildren(db, parentId)
    },

    getAllNodes() {
      ensureOpen()
      return dbGetAllNodes(db)
    },

    search(query) {
      ensureOpen()
      return dbSearch(db, query)
    },

    addNode(parentId, node) {
      ensureOpen()
      return dbAddNode(db, parentId, node, "memory")
    },

    updateNode(id, changes) {
      ensureOpen()
      dbUpdateNode(db, id, changes, "memory")
    },

    deleteNode(id) {
      ensureOpen()
      dbDeleteNode(db, id, "memory")
    },

    moveNode(id, newParentId, position) {
      ensureOpen()
      dbMoveNode(db, id, newParentId, position, "memory")
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

  function ensureOpen() {
    if (closed) throw new Error("DataStore is closed")
  }
}

// =============================================================================
// Factory: createDBDataStore
// =============================================================================

/**
 * Create a DataStore from an existing database instance.
 *
 * This is the low-level factory for infrastructure code that manages
 * its own database lifecycle. Most code should use createMemDataStore()
 * or createDiskDataStore() instead.
 *
 * @param db - SQLite database instance (caller manages lifecycle)
 * @returns DataStore + HasDatabase (no event sourcing - caller manages)
 */
export function createDBDataStore(db: Database): DataStore & HasDatabase {
  let closed = false

  return {
    get database() {
      ensureOpen()
      return db
    },

    getNode(id) {
      ensureOpen()
      return dbGetNode(db, id)
    },

    getChildren(parentId) {
      ensureOpen()
      return dbGetChildren(db, parentId)
    },

    getAllNodes() {
      ensureOpen()
      return dbGetAllNodes(db)
    },

    search(query) {
      ensureOpen()
      return dbSearch(db, query)
    },

    addNode(parentId, node) {
      ensureOpen()
      return dbAddNode(db, parentId, node, "memory")
    },

    updateNode(id, changes) {
      ensureOpen()
      dbUpdateNode(db, id, changes, "memory")
    },

    deleteNode(id) {
      ensureOpen()
      dbDeleteNode(db, id, "memory")
    },

    moveNode(id, newParentId, position) {
      ensureOpen()
      dbMoveNode(db, id, newParentId, position, "memory")
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

  function ensureOpen() {
    if (closed) throw new Error("DataStore is closed")
  }
}
