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
 * ops.addNode(null, { type: "task", content: "Test" })
 *
 * // Disk mode - emit events
 * const ops = createDbOps(db, emitter)
 * ops.addNode(null, { type: "task", content: "Test" })  // emits node_created
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
  if (emitter) {
    emitter.emit(
      {
        type: "node_updated",
        actor: "user",
        target: nodeId,
        data: updates,
      },
      { db },
    )
  } else {
    const sets: string[] = []
    const values: (string | number | null)[] = []

    for (const [key, value] of Object.entries(updates)) {
      sets.push(`${key} = ?`)
      values.push(value as string | number | null)
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
  log.debug?.(`addNode: ${nodeId} type=${node.type ?? "task"} parent=${parentId} emitter=${!!emitter}`)
  const now = Date.now()

  const nodeData = {
    id: nodeId,
    type: node.type ?? "task",
    parent_id: parentId ?? ".",
    parent_idx: node.parent_idx ?? now,
    link_to: node.link_to ?? null,
    link_alias: node.link_alias ?? null,
    fs_path: node.fs_path ?? null,
    fs_ino: node.fs_ino ?? null,
    name: node.name ?? null,
    title: node.title ?? null,
    md_pos: node.md_pos ?? null,
    md_line: node.md_line ?? null,
    md_slug: node.md_slug ?? null,
    task_status: node.task_status ?? (node.type === "task" ? "todo" : null),
    task_mark: node.task_mark ?? (node.type === "task" ? " " : null),
    assigned_to: node.assigned_to ?? null,
    due_date: node.due_date ?? null,
    scheduled_date: node.scheduled_date ?? null,
    priority: node.priority ?? null,
    content: node.content ?? null,
    content_hash: node.content_hash ?? null,
    data: node.data ?? {},
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
        id, type, parent_id, parent_idx, link_to, link_alias,
        fs_path, fs_ino, name, title, md_pos, md_line, md_slug,
        task_status, task_mark, assigned_to, due_date, scheduled_date, priority,
        content, content_hash, data, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )`,
      [
        nodeData.id,
        nodeData.type,
        nodeData.parent_id,
        nodeData.parent_idx,
        nodeData.link_to,
        nodeData.link_alias,
        nodeData.fs_path,
        nodeData.fs_ino,
        nodeData.name,
        nodeData.title,
        nodeData.md_pos,
        nodeData.md_line,
        nodeData.md_slug,
        nodeData.task_status,
        nodeData.task_mark,
        nodeData.assigned_to,
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
