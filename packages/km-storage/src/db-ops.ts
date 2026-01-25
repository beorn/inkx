/**
 * Database Operations - Write operations
 *
 * This module contains all write operations that modify the database.
 * Operations handle both memory mode (direct SQL) and disk mode (via emit).
 */

import type { Database } from "bun:sqlite"
import createDebug from "debug"
import { ulid } from "ulid"

const debug = createDebug("km:storage:db:ops")
import type { KNode } from "@km/core"
import { isMemoryMode } from "./db-instance.ts"
import { emit } from "./emit.ts"

// =============================================================================
// Node Operations
// =============================================================================

/**
 * Move a node to a new parent with a new sort order.
 * Handles both memory mode (direct SQL) and disk mode (via emit).
 *
 * This is the proper store-layer API for moving nodes.
 * UI components should use this instead of raw SQL.
 */
export function moveNode(
  db: Database,
  nodeId: string,
  newParentId: string,
  newParentIdx: number,
): void {
  debug("moveNode: %s → parent=%s idx=%d", nodeId, newParentId, newParentIdx)
  if (isMemoryMode()) {
    db.run(
      "UPDATE nodes SET parent_id = ?, parent_idx = ?, updated_at = ? WHERE id = ?",
      [newParentId, newParentIdx, Date.now(), nodeId],
    )
  } else {
    emit({
      type: "node_moved",
      actor: "user",
      target: nodeId,
      data: {
        parent_id: newParentId,
        parent_idx: newParentIdx,
      },
    })
  }
}

/**
 * Update a node's properties.
 * Handles both memory mode (direct SQL) and disk mode (via emit).
 *
 * This is the proper store-layer API for updating nodes.
 * UI components should use this instead of raw SQL.
 */
export function updateNode(
  db: Database,
  nodeId: string,
  updates: Record<string, unknown>,
): void {
  debug("updateNode: %s keys=%o", nodeId, Object.keys(updates))
  if (isMemoryMode()) {
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
  } else {
    emit({
      type: "node_updated",
      actor: "user",
      target: nodeId,
      data: updates,
    })
  }
}

/**
 * Delete a node from the database.
 * Handles both memory mode (direct SQL) and disk mode (via emit).
 *
 * This is the proper store-layer API for deleting nodes.
 * UI components should use this instead of raw SQL.
 */
export function deleteNode(db: Database, nodeId: string): void {
  debug("deleteNode: %s", nodeId)
  if (isMemoryMode()) {
    db.run("DELETE FROM nodes WHERE id = ?", [nodeId])
  } else {
    emit({
      type: "node_deleted",
      actor: "user",
      target: nodeId,
      data: {},
    })
  }
}

/**
 * Add a new node to the database.
 * Handles both memory mode (direct SQL) and disk mode (via emit).
 *
 * This is the proper store-layer API for creating nodes.
 * UI components should use this instead of raw SQL or appendTaskToFile.
 *
 * @param db - Database instance
 * @param parentId - Parent node ID (or null for root level)
 * @param node - Partial node data (id will be generated if not provided)
 * @returns The created node's ID
 */
export function addNode(
  db: Database,
  parentId: string | null,
  node: Partial<KNode>,
): string {
  const nodeId = node.id ?? ulid()
  debug("addNode: %s type=%s parent=%s", nodeId, node.type ?? "task", parentId)
  const now = Date.now()

  const nodeData = {
    id: nodeId,
    type: node.type ?? "task",
    parent_id: parentId,
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

  if (isMemoryMode()) {
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
  } else {
    emit({
      type: "node_created",
      actor: "user",
      data: nodeData,
    })
  }

  return nodeId
}
