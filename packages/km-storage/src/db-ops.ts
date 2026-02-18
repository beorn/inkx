/**
 * Database Operations - Write operations
 *
 * This module contains all write operations that modify the database.
 *
 * API: createDbOps(db, emitter?) returns operations bound to dependencies.
 * If emitter is provided, mutations emit events; otherwise direct SQL.
 */

import type { Database } from "bun:sqlite"
import { createLogger } from "@beorn/logger"
import { ulid } from "ulid"

const log = createLogger("km:storage:db:ops")
import type { KNode } from "@km/core"
import { composeDatetime, decomposeDatetime } from "@km/core"
import { NODE_COLUMNS } from "./schema.ts"
import type { Emitter } from "./emitter.ts"

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
 * ops.addNode(null, { type: "li", task_marker: "[ ]", content: "Test" })
 *
 * // Disk mode - emit events
 * const ops = createDbOps(db, emitter)
 * ops.addNode(null, { type: "li", task_marker: "[ ]", content: "Test" })  // emits node_created
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
// Implementation Functions (internal)
// =============================================================================

function moveNodeImpl(
  db: Database,
  nodeId: string,
  newParentId: string,
  newParentIdx: number,
  emitter?: Emitter,
): void {
  log.debug?.(`moveNode: ${nodeId} → parent=${newParentId} idx=${newParentIdx} emitter=${!!emitter}`)
  if (emitter) {
    emitter.emit(
      {
        type: "node_moved",
        actor: "user",
        target: nodeId,
        data: {
          parent_id: newParentId,
          parent_idx: newParentIdx,
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

  // Dual-write: keep due_at ↔ due_date and start_at ↔ scheduled_date in sync
  const augmented = { ...updates }
  if ("due_at" in augmented && !("due_date" in augmented)) {
    const parts = decomposeDatetime(augmented.due_at as string | null)
    augmented.due_date = parts?.date ?? null
  }
  if ("due_date" in augmented && !("due_at" in augmented)) {
    augmented.due_at = composeDatetime(augmented.due_date as string | null, augmented.due_time as string | null) ?? null
  }
  if ("start_at" in augmented && !("scheduled_date" in augmented)) {
    const parts = decomposeDatetime(augmented.start_at as string | null)
    augmented.scheduled_date = parts?.date ?? null
  }
  if ("scheduled_date" in augmented && !("start_at" in augmented)) {
    augmented.start_at =
      composeDatetime(augmented.scheduled_date as string | null, augmented.scheduled_time as string | null) ?? null
  }

  if (emitter) {
    emitter.emit(
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
        // Non-column KNode field (due_time, scheduled_time, etc.) → data blob
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
    emitter.emit(
      {
        type: "node_deleted",
        actor: "user",
        target: nodeId,
        data: {},
      },
      { db },
    )
  } else {
    db.run("DELETE FROM nodes WHERE id = ?", [nodeId])
  }
}

function addNodeImpl(db: Database, parentId: string | null, node: Partial<KNode>, emitter?: Emitter): string {
  const nodeId = node.id ?? ulid()
  log.debug?.(`addNode: ${nodeId} type=${node.type ?? "li"} parent=${parentId} emitter=${!!emitter}`)
  const now = Date.now()

  // Merge data-blob fields (due_time, scheduled_time, etc.) into the data object
  const mergedData: Record<string, unknown> = { ...(node.data ?? {}) }
  for (const [key, value] of Object.entries(node)) {
    if (key !== "data" && !NODE_COLUMNS.has(key) && value !== undefined && value !== null) {
      mergedData[key] = value
    }
  }

  // Default type: "li" with task_marker "[ ]" (replaces old "task" default)
  const defaultType = node.type ?? "li"
  const isTask = node.task_marker !== undefined || (defaultType === "li" && node.type === undefined)

  // Compute due_at/start_at from either new or legacy fields
  const dueAt = node.due_at ?? composeDatetime(node.due_date, node.due_time) ?? null
  const startAt = node.start_at ?? composeDatetime(node.scheduled_date, node.scheduled_time) ?? null
  const dueParts = decomposeDatetime(dueAt)
  const startParts = decomposeDatetime(startAt)

  const nodeData = {
    id: nodeId,
    type: defaultType,
    fstype: node.fstype ?? null,
    parent_id: parentId ?? ".",
    parent_idx: node.parent_idx ?? now,
    link_to: node.link_to ?? null,
    link_alias: node.link_alias ?? null,
    embed: node.embed ? 1 : 0,
    fs_path: node.fs_path ?? null,
    fs_ino: node.fs_ino ?? null,
    name: node.name ?? null,
    title: node.title ?? null,
    md_pos: node.md_pos ?? null,
    md_line: node.md_line ?? null,
    list_marker: node.list_marker ?? null,
    task_marker: node.task_marker ?? (isTask ? "[ ]" : null),
    task_status: node.task_status ?? (isTask ? "todo" : null),
    assigned_to: node.assigned_to ?? null,
    due_at: dueAt,
    start_at: startAt,
    due_date: dueParts?.date ?? null,
    scheduled_date: startParts?.date ?? null,
    priority: node.priority ?? null,
    content: node.content ?? null,
    content_hash: node.content_hash ?? null,
    data: mergedData,
    created_at: now,
    updated_at: now,
  }

  if (emitter) {
    emitter.emit(
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
        id, type, fstype, parent_id, parent_idx, link_to, link_alias, embed,
        fs_path, fs_ino, name, title, md_pos, md_line,
        list_marker, task_marker,
        task_status, assigned_to, due_at, start_at, due_date, scheduled_date, priority,
        content, content_hash, data, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )`,
      [
        nodeData.id,
        nodeData.type,
        nodeData.fstype,
        nodeData.parent_id,
        nodeData.parent_idx,
        nodeData.link_to,
        nodeData.link_alias,
        nodeData.embed,
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
        nodeData.due_date,
        nodeData.scheduled_date,
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
