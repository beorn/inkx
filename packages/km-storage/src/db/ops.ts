/**
 * Database Operations - Write operations
 *
 * This module contains all write operations that modify the database.
 *
 * API: createDbOps(db, emitter?) returns operations bound to dependencies.
 * If emitter is provided, mutations emit events; otherwise direct SQL.
 */

import type { Database } from "bun:sqlite"
import { createLogger } from "loggily"
import { ulid } from "ulid"

const log = createLogger("km:storage:db:ops")
import type { KNode } from "@km/core"
import { decomposeItem } from "../item-helpers.ts"
import { NODE_COLUMNS } from "./schema.ts"
import type { Emitter } from "../emitter.ts"

// =============================================================================
// Factory: createDbOps
// =============================================================================

/**
 * Database operations interface returned by createDbOps.
 */
export interface DbOps {
  addNode(parentId: string | null, node: Partial<KNode>): string
  updateNode(nodeId: string, updates: Record<string, unknown>): void
  deleteNode(nodeId: string): void
  moveNode(nodeId: string, newParentId: string, newParentIdx: number): void
}

/**
 * Create database operations bound to a database and optional emitter.
 *
 * If emitter is provided, mutations emit events (disk mode).
 * If emitter is not provided, mutations use direct SQL (memory mode).
 *
 * @param db - Database instance for direct SQL operations
 * @param emitter - Optional emitter for disk mode (emit events instead of direct SQL)
 * @returns DbOps with addNode, updateNode, deleteNode, moveNode
 *
 * @example
 * // Memory mode - direct SQL
 * const ops = createDbOps(db)
 * ops.addNode(null, { type: "p", item: { list: "-", task: { marker: "[ ]", status: "todo" } }, content: "Test" })
 *
 * // Disk mode - emit events
 * const ops = createDbOps(db, emitter)
 * ops.addNode(null, { type: "p", item: { list: "-", task: { marker: "[ ]", status: "todo" } }, content: "Test" })  // emits node_created
 */
export function createDbOps(db: Database, emitter?: Emitter): DbOps {
  return {
    addNode: (parentId, node) => addNodeImpl(db, parentId, node, emitter),
    updateNode: (nodeId, updates) => updateNodeImpl(db, nodeId, updates, emitter),
    deleteNode: (nodeId) => deleteNodeImpl(db, nodeId, emitter),
    moveNode: (nodeId, newParentId, newParentIdx) => moveNodeImpl(db, nodeId, newParentId, newParentIdx, emitter),
  }
}

// =============================================================================
// Embed Child Builder
// =============================================================================

/**
 * Options for building an embed child node.
 */
export interface EmbedChildOpts {
  /** Source node being embedded — its id becomes embed_of */
  source: KNode
  /** Sort order within parent */
  parentIdx: number
  /** Block type: "h" for outline items (boards), "p" for list items (CLI). Default: "h" */
  type?: "h" | "p"
  /** Stable embed path for deduplication (stored in data.targetPath) */
  targetPath?: string
}

/**
 * Build a Partial<KNode> for an embed child. Pure function — caller chooses
 * write mechanism: createDbOps(db).addNode() (direct SQL) or repo.addNode() (with events).
 *
 * Content is left empty — the display layer resolves it from embed_of
 * at render time via getDisplayContent(). Setting content would freeze it
 * at creation time and be treated as an alias override.
 * Task traits (marker, status) are carried from the source with marker derivation.
 */
export function buildEmbedChild(opts: EmbedChildOpts): Partial<KNode> {
  const { source, parentIdx, type = "h", targetPath } = opts

  const node: Partial<KNode> = {
    type,
    item: type === "p" ? { list: "-", ...(source.item?.task ? { task: source.item.task } : {}) } : {},
    embed_of: source.id,
    parent_idx: parentIdx,
  }

  if (targetPath) {
    node.data = { targetPath }
  }

  return node
}

// =============================================================================
// Shared Helpers
// =============================================================================

/**
 * Recursively delete a node and all its descendants, cleaning up links.
 * Used by both direct SQL (deleteNodeImpl) and event replay (applyNodeDeleted).
 */
export function deleteSubtree(db: Database, rootId: string): void {
  const descendants = db
    .query(
      `WITH RECURSIVE tree AS (
        SELECT id FROM nodes WHERE id = ?
        UNION ALL
        SELECT n.id FROM nodes n JOIN tree t ON n.parent_id = t.id
      )
      SELECT id FROM tree`,
    )
    .all(rootId) as { id: string }[]

  if (descendants.length === 0) return

  const ids = descendants.map((d) => d.id)
  const placeholders = ids.map(() => "?").join(",")

  // Clean up link rows whose host is being deleted. The v4 links schema
  // has no target column — backlinks pointing at a deleted node are
  // broken-by-href and reported as such by the runtime resolver, not by a
  // cascade delete. See docs/design/model/klink.md.
  db.run(`DELETE FROM links WHERE host_id IN (${placeholders})`, ids)

  // Cascade the same cleanup to collapsed-file edges so a deleted
  // collapsed file stops contributing backlinks.
  db.run(`DELETE FROM collapsed_file_links WHERE host_id IN (${placeholders})`, ids)

  // Delete all nodes in the subtree
  db.run(`DELETE FROM nodes WHERE id IN (${placeholders})`, ids)
}

// =============================================================================
// Implementation Functions (internal)
// =============================================================================

/** Thrown when moveNode is called with a parent type that's incompatible with the child. */
export class InvalidMoveError extends Error {
  constructor(
    public readonly nodeId: string,
    public readonly newParentId: string,
    public readonly reason: string,
  ) {
    super(`Invalid move: ${nodeId} → ${newParentId}: ${reason}`)
    this.name = "InvalidMoveError"
  }
}

/**
 * Validate that a move is structurally legal — filesystem-backed nodes
 * (files, markdown files, folders) can only be parented to folders or the
 * root node. This prevents the corruption class captured by
 * km-storage.move-type-validation, where a node_moved event reparents a
 * file/folder into an mdsection and every downstream cursor-invariant
 * check trips on the broken hierarchy.
 *
 * Content nodes (mdsections, paragraphs, list items, etc.) are not
 * constrained here — their parent can legitimately be a heading, a file,
 * another list item, etc., and the tree/markdown layer enforces those
 * rules.
 *
 * Non-existent child or parent is treated as a silent no-op (returns
 * undefined) because the downstream UPDATE is idempotent and callers
 * historically rely on that graceful degradation. Only structurally
 * invalid type combinations throw.
 *
 * Returns an InvalidMoveError if the move is illegal, undefined otherwise.
 */
function validateMove(db: Database, nodeId: string, newParentId: string): InvalidMoveError | undefined {
  const child = db.query("SELECT id, fstype FROM nodes WHERE id = ?").get(nodeId) as {
    id: string
    fstype: string | null
  } | null
  if (!child) return undefined

  // Only filesystem-backed children are constrained.
  const FS_TYPES = new Set(["file", "mdfile", "folder"])
  if (child.fstype === null || !FS_TYPES.has(child.fstype)) return undefined

  const parent = db.query("SELECT id, fstype FROM nodes WHERE id = ?").get(newParentId) as {
    id: string
    fstype: string | null
  } | null
  if (!parent) return undefined

  // The filesystem root is represented as id="." with fstype="folder", so
  // this rule covers it naturally.
  if (parent.fstype !== "folder") {
    return new InvalidMoveError(
      nodeId,
      newParentId,
      `child is fs-backed (${child.fstype}) but parent has fstype=${parent.fstype ?? "null"} — filesystem nodes can only be parented to folders`,
    )
  }
  return undefined
}

function moveNodeImpl(
  db: Database,
  nodeId: string,
  newParentId: string,
  newParentIdx: number,
  emitter?: Emitter,
): void {
  log.debug?.(`moveNode: ${nodeId} → parent=${newParentId} idx=${newParentIdx} emitter=${!!emitter}`)

  const err = validateMove(db, nodeId, newParentId)
  if (err) throw err

  if (emitter) {
    // Snapshot old parent before emission so downstream FS projection decorators
    // can regenerate the source file after a cross-file move
    const row = db.query("SELECT parent_id FROM nodes WHERE id = ?").get(nodeId) as { parent_id: string | null } | null
    const oldParentId = row?.parent_id ?? null

    emitter.apply(
      {
        type: "node_moved",
        actor: "user",
        target: nodeId,
        data: {
          parent_id: newParentId,
          parent_idx: newParentIdx,
          old_parent_id: oldParentId,
        },
      },
      { db },
    )
  } else {
    db.run("UPDATE nodes SET parent_id = ?, parent_idx = ?, updated_at = ? WHERE id = ?", [
      newParentId,
      newParentIdx,
      Date.now(),
      nodeId,
    ])
  }
}

function updateNodeImpl(db: Database, nodeId: string, updates: Record<string, unknown>, emitter?: Emitter): void {
  if (!updates) {
    throw new Error(`updateNode called with undefined updates for node ${nodeId}`)
  }

  // Decompose nested item object into flat DB columns
  const augmented: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (key === "item") {
      Object.assign(augmented, decomposeItem(value as KNode["item"]))
    } else {
      augmented[key] = value
    }
  }

  if (emitter) {
    emitter.apply(
      {
        type: "node_updated",
        actor: "user",
        target: nodeId,
        data: augmented,
      },
      { db },
    )
  } else {
    const sets: string[] = []
    const values: (string | number | null)[] = []
    const dataOverrides: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(augmented)) {
      if (key === "data") {
        // Full replacement — callers (e.g. rename) pass complete data object
        const jsonStr = typeof value === "string" ? value : JSON.stringify(value)
        sets.push("data = ?")
        values.push(jsonStr)
      } else if (NODE_COLUMNS.has(key)) {
        sets.push(`${key} = ?`)
        values.push(value as string | number | null)
      } else {
        // Non-column KNode field → data blob
        dataOverrides[key] = value
      }
    }

    if (Object.keys(dataOverrides).length > 0) {
      sets.push("data = json_patch(data, ?)")
      values.push(JSON.stringify(dataOverrides))
    }

    sets.push("updated_at = ?")
    values.push(Date.now())
    values.push(nodeId)

    const sql = `UPDATE nodes SET ${sets.join(", ")} WHERE id = ?`
    db.run(sql, values)
  }
}

function deleteNodeImpl(db: Database, nodeId: string, emitter?: Emitter): void {
  log.debug?.(`deleteNode: ${nodeId} emitter=${!!emitter}`)
  if (emitter) {
    // Snapshot metadata before deletion so downstream FS projection decorators can act
    const node = db.query("SELECT fs_path, type, parent_id, item FROM nodes WHERE id = ?").get(nodeId) as {
      fs_path: string | null
      type: string
      parent_id: string | null
      item: number
    } | null

    emitter.apply(
      {
        type: "node_deleted",
        actor: "user",
        target: nodeId,
        data: node
          ? {
              fs_path: node.fs_path,
              type: node.type,
              parent_id: node.parent_id,
              item: node.item === 1 ? {} : undefined,
            }
          : {},
      },
      { db },
    )
  } else {
    deleteSubtree(db, nodeId)
  }
}

function addNodeImpl(db: Database, parentId: string | null, node: Partial<KNode>, emitter?: Emitter): string {
  const nodeId = node.id ?? ulid()
  log.debug?.(
    `addNode: ${nodeId} type=${node.type ?? "p"} item=${String(node.item)} parent=${parentId} emitter=${!!emitter}`,
  )
  const now = Date.now()

  // Merge non-column fields into data blob
  const mergedData: Record<string, unknown> = { ...node.data }
  for (const [key, value] of Object.entries(node)) {
    if (key !== "data" && !NODE_COLUMNS.has(key) && value !== undefined && value !== null) {
      mergedData[key] = value
    }
  }

  // Default type: "p" with item + task (v2 trait model)
  const defaultType = node.type ?? "p"
  const defaultItem =
    node.item ??
    (node.type === undefined ? { list: "-", task: { marker: "[ ]" as const, status: "todo" as const } } : undefined)
  const itemObj = defaultItem

  const ic = decomposeItem(itemObj)
  const nodeData = {
    id: nodeId,
    type: defaultType,
    fstype: node.fstype ?? null,
    parent_id: parentId ?? ".",
    parent_idx: node.parent_idx ?? now,
    item: ic.item,
    embed_of: node.embed_of ?? null,
    fs_path: node.fs_path ?? null,
    fs_ino: node.fs_ino ?? null,
    name: node.name ?? null,
    title: node.title ?? null,
    md_pos: node.md_pos ?? null,
    md_line: node.md_line ?? null,
    list_marker: ic.list_marker,
    task_marker: ic.task_marker,
    task_status: ic.task_status,
    assigned_to: node.assigned_to ?? null,
    due_at: node.due_at ?? null,
    start_at: node.start_at ?? null,
    priority: node.priority ?? null,
    content: node.content ?? null,
    content_hash: node.content_hash ?? null,
    data: mergedData,
    created_at: now,
    updated_at: now,
  }

  if (emitter) {
    emitter.apply(
      {
        type: "node_created",
        actor: "user",
        data: nodeData,
      },
      { db },
    )
  } else {
    db.run(
      `INSERT INTO nodes (
        id, type, fstype, parent_id, parent_idx, item, embed_of,
        fs_path, fs_ino, name, title, md_pos, md_line,
        list_marker, task_marker,
        task_status, assigned_to, due_at, start_at, priority,
        content, content_hash, data, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )`,
      [
        nodeData.id,
        nodeData.type,
        nodeData.fstype,
        nodeData.parent_id,
        nodeData.parent_idx,
        nodeData.item,
        nodeData.embed_of,
        nodeData.fs_path,
        nodeData.fs_ino,
        nodeData.name,
        nodeData.title,
        nodeData.md_pos,
        nodeData.md_line,
        nodeData.list_marker,
        nodeData.task_marker,
        nodeData.task_status,
        nodeData.assigned_to,
        nodeData.due_at,
        nodeData.start_at,
        nodeData.priority,
        nodeData.content,
        nodeData.content_hash,
        JSON.stringify(nodeData.data),
        nodeData.created_at,
        nodeData.updated_at,
      ],
    )
  }

  return nodeId
}
