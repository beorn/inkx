/**
 * Database Events - Event application and change tracking
 *
 * This module handles applying events to the database state.
 * Events are the source of truth for all state changes.
 */

import { createLogger } from "loggily"
import type { Database, SQLQueryBindings } from "bun:sqlite"

const log = createLogger("km:storage:db:events")
import type { Event } from "@km/core"
import { NODE_COLUMNS } from "./schema.ts"
import { deleteSubtree } from "./db-ops.ts"

// =============================================================================
// Event Application
// =============================================================================

/**
 * Apply an event to the database (db-accepting version)
 */
export function applyEventWithDb(db: Database, event: Event): void {
  log.debug?.(`${event.type} ${event.target?.slice(-8) ?? ""}`)

  switch (event.type) {
    case "node_created":
      applyNodeCreated(db, event)
      break
    case "node_updated":
      applyNodeUpdated(db, event)
      break
    case "node_moved":
      applyNodeMoved(db, event)
      break
    case "node_deleted":
      applyNodeDeleted(db, event)
      break
    case "task_claimed":
      applyTaskClaimed(db, event)
      break
    case "task_released":
      applyTaskReleased(db, event)
      break
    case "task_completed":
      applyTaskCompleted(db, event)
      break
    // Session events don't modify state.db
    case "session_started":
    case "session_message":
    case "session_tool_call":
    case "session_ended":
    case "message":
    case "conflict_created":
      // No-op for state.db
      break
  }

  // Update last event cursor
  db.run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", ["last_event", event.id])
}

// =============================================================================
// Event Handlers
// =============================================================================

function applyNodeCreated(db: Database, event: Event): void {
  const data = event.data as Record<string, unknown>

  // Use INSERT OR IGNORE as safety net for duplicate path-based IDs
  // This can happen if both discovery and watch handler create the same node
  db.run(
    `
    INSERT OR IGNORE INTO nodes (
      id, type, fstype, parent_id, item, embed_source, parent_idx,
      fs_path, fs_ino, fs_mtime, name, title, md_pos, md_line,
      list_marker, task_marker,
      task_status, assigned_to, due_at, start_at, priority,
      content, content_hash, data,
      created_at, updated_at, version
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
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
      (data.embed_source as string) ?? null,
      (data.parent_idx as number) ?? 0,
      (data.fs_path as string) ?? null,
      (data.fs_ino as number) ?? null,
      (data.fs_mtime as number) ?? null,
      (data.name as string) ?? null,
      (data.title as string) ?? null,
      (data.md_pos as number) ?? null,
      (data.md_line as number) ?? null,
      (data.list_marker as string) ?? null,
      (data.task_marker as string) ?? null,
      (data.task_status as string) ?? null,
      (data.assigned_to as string) ?? null,
      (data.due_at as string) ?? null,
      (data.start_at as string) ?? null,
      (data.priority as string) ?? null,
      (data.content as string) ?? null,
      (data.content_hash as string) ?? null,
      JSON.stringify(data.data ?? {}),
      event.ts,
      event.ts,
      event.id,
    ],
  )
}

function applyNodeUpdated(db: Database, event: Event): void {
  if (!event.target) return

  const data = event.data as Record<string, unknown>

  const sets: string[] = []
  const values: unknown[] = []

  const dataOverrides: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    if (key === "data") {
      // Full replacement — json_patch merges and preserves stale properties
      sets.push("data = ?")
      values.push(JSON.stringify(value))
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
  values.push(event.ts, event.id, event.target)

  const sql = `UPDATE nodes SET ${sets.join(", ")} WHERE id = ?`
  db.run(sql, values as SQLQueryBindings[])

  // NOTE: Filesystem write-back (task_status, dates) is handled by
  // SyncManager.applyEventToFs / FsWriter.applyEventToFs, which regenerate
  // the entire file from DB state via the WriteQueue pipeline.
  // Direct FS writes here would race with that pipeline.
}

function applyNodeMoved(db: Database, event: Event): void {
  if (!event.target) return

  const data = event.data as { parent_id: string | null; parent_idx?: number }

  db.run(
    `
    UPDATE nodes
    SET parent_id = ?, parent_idx = ?, updated_at = ?, version = ?
    WHERE id = ?
  `,
    [data.parent_id, data.parent_idx ?? 0, event.ts, event.id, event.target],
  )
}

function applyNodeDeleted(db: Database, event: Event): void {
  if (!event.target) return
  deleteSubtree(db, event.target)
}

function applyTaskClaimed(db: Database, event: Event): void {
  if (!event.target) return

  db.run(
    `
    UPDATE nodes
    SET assigned_to = ?, task_status = 'wip', updated_at = ?, version = ?
    WHERE id = ?
  `,
    [event.actor, event.ts, event.id, event.target],
  )
}

function applyTaskReleased(db: Database, event: Event): void {
  if (!event.target) return

  db.run(
    `
    UPDATE nodes
    SET assigned_to = NULL, task_status = 'todo', updated_at = ?, version = ?
    WHERE id = ?
  `,
    [event.ts, event.id, event.target],
  )
}

function applyTaskCompleted(db: Database, event: Event): void {
  if (!event.target) return

  db.run(
    `
    UPDATE nodes
    SET task_status = 'done', task_marker = '[x]', updated_at = ?, version = ?
    WHERE id = ?
  `,
    [event.ts, event.id, event.target],
  )
}

// Export for use with emit
