/**
 * Database Changes — Change application and state tracking
 *
 * This module handles applying changes to the database state.
 * Changes are the source of truth for all state mutations.
 */

import { createLogger } from "loggily"
import type { Database, SQLQueryBindings } from "bun:sqlite"

const log = createLogger("km:storage:db:changes")
import type { Change } from "@km/core"
import { NODE_COLUMNS } from "./schema.ts"
import { deleteSubtree } from "./ops.ts"
import { decomposeChangeItem } from "../item-helpers.ts"

// =============================================================================
// Change Application
// =============================================================================

/**
 * Apply a change to the database (db-accepting version)
 */
export function applyChangeWithDb(db: Database, change: Change): void {
  log.debug?.(`${change.type} ${change.target?.slice(-8) ?? ""}`)

  switch (change.type) {
    case "node_created":
      applyNodeCreated(db, change)
      break
    case "node_updated":
      applyNodeUpdated(db, change)
      break
    case "node_moved":
      applyNodeMoved(db, change)
      break
    case "node_deleted":
      applyNodeDeleted(db, change)
      break
    case "task_claimed":
      applyTaskClaimed(db, change)
      break
    case "task_released":
      applyTaskReleased(db, change)
      break
    case "task_completed":
      applyTaskCompleted(db, change)
      break
    // Session changes don't modify state.db
    case "session_started":
    case "session_message":
    case "session_tool_call":
    case "session_ended":
    case "message":
    case "conflict_created":
      // No-op for state.db
      break
  }

  // Update last change cursor
  db.run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ["last_event", change.id])
}

// =============================================================================
// Change Handlers
// =============================================================================

function applyNodeCreated(db: Database, change: Change): void {
  const data = change.data as Record<string, unknown>

  // Extract flat DB columns from nested item object (new format) or flat fields (legacy)
  const { listMarker, taskMarker, taskStatus } = decomposeChangeItem(data)

  // INSERT OR IGNORE as safety net for duplicate path-based IDs
  // This can happen if both discovery and watch handler create the same node.
  // Must include block_id — fs-watch creates from a parsed KNode where
  // kmBlockIdTransform already extracted ^id into node.block_id. Omitting
  // it here drops block_id on all nodes created via the watch path.
  // See km-markdown.block-id-prod-sync.
  const result = db.run(
    `
    INSERT OR IGNORE INTO nodes (
      id, type, fstype, parent_id, item, embed_of, parent_idx,
      fs_path, fs_dev, fs_ino, fs_mtime, fs_size, fs_content_hash,
      name, block_id, title, md_pos, md_line,
      list_marker, task_marker,
      task_status, assigned_to, due_at, start_at, priority,
      content, content_hash, data,
      created_at, updated_at, version
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?
    )
  `,
    [
      data.id as string,
      data.type as string,
      (data.fstype as string) ?? null,
      (data.parent_id as string) ?? null,
      data.item ? 1 : 0,
      (data.embed_of as string) ?? null,
      (data.parent_idx as number) ?? 0,
      (data.fs_path as string) ?? null,
      (data.fs_dev as number) ?? null,
      (data.fs_ino as number) ?? null,
      (data.fs_mtime as number) ?? null,
      (data.fs_size as number) ?? null,
      (data.fs_content_hash as string) ?? null,
      (data.name as string) ?? null,
      (data.block_id as string) ?? null,
      (data.title as string) ?? null,
      (data.md_pos as number) ?? null,
      (data.md_line as number) ?? null,
      listMarker,
      taskMarker,
      taskStatus,
      (data.assigned_to as string) ?? null,
      (data.due_at as string) ?? null,
      (data.start_at as string) ?? null,
      (data.priority as string) ?? null,
      (data.content as string) ?? null,
      (data.content_hash as string) ?? null,
      JSON.stringify(data.data ?? {}),
      change.ts,
      change.ts,
      change.id,
    ],
  )

  if (result.changes === 0) {
    log.warn?.(`node_created collision: id=${(data.id as string)?.slice(-8)} already exists, change ignored`)
  }
}

function applyNodeUpdated(db: Database, change: Change): void {
  if (!change.target) return

  const data = change.data as Record<string, unknown>

  const sets: string[] = []
  const values: unknown[] = []

  const dataOverrides: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    if (key === "data") {
      // Full replacement — json_patch merges and preserves stale properties
      sets.push("data = ?")
      values.push(JSON.stringify(value))
    } else if (key === "item") {
      // Nested item object → extract flat DB columns
      const itemObj = value as Record<string, unknown> | undefined
      const task = itemObj?.task as { marker?: string; status?: string } | undefined
      if (task?.status !== undefined) {
        sets.push("task_status = ?")
        values.push(task.status)
      }
      if (task?.marker !== undefined) {
        sets.push("task_marker = ?")
        values.push(task.marker)
      }
      if (itemObj?.list !== undefined) {
        sets.push("list_marker = ?")
        values.push(itemObj.list)
      }
      sets.push("item = ?")
      values.push(value ? 1 : 0)
    } else if (NODE_COLUMNS.has(key)) {
      sets.push(`${key} = ?`)
      values.push(value)
    } else {
      // Non-column KNode field → data blob
      dataOverrides[key] = value
    }
  }

  if (Object.keys(dataOverrides).length > 0) {
    sets.push("data = json_patch(data, ?)")
    values.push(JSON.stringify(dataOverrides))
  }

  sets.push("updated_at = ?", "version = ?")
  values.push(change.ts, change.id, change.target)

  const sql = `UPDATE nodes SET ${sets.join(", ")} WHERE id = ?`
  db.run(sql, values as SQLQueryBindings[])

  // NOTE: Filesystem write-back (task_status, dates) is handled by
  // FS decorators (withFsWriter/withSync) that wrap emitter.apply(),
  // which regenerate the entire file from DB state.
  // Direct FS writes here would race with that pipeline.
}

function applyNodeMoved(db: Database, change: Change): void {
  if (!change.target) return

  const data = change.data as { parent_id: string | null; parent_idx?: number }

  db.run(
    `
    UPDATE nodes
    SET parent_id = ?, parent_idx = ?, updated_at = ?, version = ?
    WHERE id = ?
  `,
    [data.parent_id, data.parent_idx ?? 0, change.ts, change.id, change.target],
  )
}

function applyNodeDeleted(db: Database, change: Change): void {
  if (!change.target) return
  deleteSubtree(db, change.target)
}

function applyTaskClaimed(db: Database, change: Change): void {
  if (!change.target) return

  db.run(
    `
    UPDATE nodes
    SET assigned_to = ?, task_status = 'wip', updated_at = ?, version = ?
    WHERE id = ?
  `,
    [change.actor, change.ts, change.id, change.target],
  )
}

function applyTaskReleased(db: Database, change: Change): void {
  if (!change.target) return

  db.run(
    `
    UPDATE nodes
    SET assigned_to = NULL, task_status = 'todo', updated_at = ?, version = ?
    WHERE id = ?
  `,
    [change.ts, change.id, change.target],
  )
}

function applyTaskCompleted(db: Database, change: Change): void {
  if (!change.target) return

  db.run(
    `
    UPDATE nodes
    SET task_status = 'done', task_marker = '[x]', updated_at = ?, version = ?
    WHERE id = ?
  `,
    [change.ts, change.id, change.target],
  )
}

// Export for use with emit
