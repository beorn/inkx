/**
 * Database Events - Event application and change tracking
 *
 * This module handles applying events to the database state.
 * Events are the source of truth for all state changes.
 */

import { createLogger } from "@beorn/logger"
import type { Database, SQLQueryBindings } from "bun:sqlite"

const log = createLogger("km:storage:db:events")
import { readFileSync } from "fs"
import { getMarkerForStatus, composeDatetime, decomposeDatetime } from "@km/core"
import type { Event, TaskStatus } from "@km/core"
import { NODE_COLUMNS } from "./schema.ts"

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

  // Derive due_at/start_at and legacy fields for dual-write
  const dueAt = (data.due_at as string) ?? null
  const startAt = (data.start_at as string) ?? null
  const dueParts = decomposeDatetime(dueAt)
  const startParts = decomposeDatetime(startAt)

  // Use INSERT OR IGNORE as safety net for duplicate path-based IDs
  // This can happen if both discovery and watch handler create the same node
  db.run(
    `
    INSERT OR IGNORE INTO nodes (
      id, type, fstype, parent_id, link_to, link_alias, embed, parent_idx,
      fs_path, fs_ino, fs_mtime, name, title, md_pos, md_line,
      list_marker, task_marker,
      task_status, assigned_to, due_at, start_at, due_date, scheduled_date, priority,
      content, content_hash, data,
      created_at, updated_at, version
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?
    )
  `,
    [
      data.id as string,
      data.type as string,
      (data.fstype as string) ?? null,
      (data.parent_id as string) ?? null,
      (data.link_to as string) ?? null,
      (data.link_alias as string) ?? null,
      data.embed ? 1 : 0,
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
      dueAt,
      startAt,
      dueParts?.date ?? (data.due_date as string) ?? null,
      startParts?.date ?? (data.scheduled_date as string) ?? null,
      (data.priority as number) ?? null,
      (data.content as string) ?? null,
      (data.content_hash as string) ?? null,
      JSON.stringify(data.data ?? {}),
      event.ts,
      event.ts,
      event.id,
    ],
  )
}

// oxlint-disable-next-line complexity/complexity -- Write-through logic for task_status + dates
function applyNodeUpdated(db: Database, event: Event): void {
  if (!event.target) return

  const data = event.data as Record<string, unknown>

  // Dual-write: keep due_at ↔ due_date and start_at ↔ scheduled_date in sync
  if ("due_at" in data && !("due_date" in data)) {
    const parts = decomposeDatetime(data.due_at as string | null)
    data.due_date = parts?.date ?? null
  }
  if ("due_date" in data && !("due_at" in data)) {
    data.due_at = composeDatetime(data.due_date as string | null, data.due_time as string | null) ?? null
  }
  if ("start_at" in data && !("scheduled_date" in data)) {
    const parts = decomposeDatetime(data.start_at as string | null)
    data.scheduled_date = parts?.date ?? null
  }
  if ("scheduled_date" in data && !("start_at" in data)) {
    data.start_at = composeDatetime(data.scheduled_date as string | null, data.scheduled_time as string | null) ?? null
  }

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
      // Non-column KNode field (due_time, scheduled_time, etc.) → data blob
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

  // Bidirectional sync: write task status changes back to markdown file
  if (data.task_status !== undefined) {
    // Get the task's md_line and fs_path (may be on task or parent file)
    const task = db.query("SELECT parent_id, md_line, fs_path FROM nodes WHERE id = ?").get(event.target) as {
      parent_id: string | null
      md_line: number | null
      fs_path: string | null
    } | null

    if (task && task.md_line !== null) {
      let fsPath = task.fs_path

      // If task doesn't have fs_path directly, walk up to find parent file
      if (!fsPath && task.parent_id) {
        const file = db
          .query(
            `
            WITH RECURSIVE ancestors AS (
              SELECT id, parent_id, fs_path, type, fstype FROM nodes WHERE id = ?
              UNION ALL
              SELECT n.id, n.parent_id, n.fs_path, n.type, n.fstype
              FROM nodes n
              JOIN ancestors a ON n.id = a.parent_id
            )
            SELECT fs_path FROM ancestors WHERE type = 'oi' AND fstype IN ('file', 'mdfile') AND fs_path IS NOT NULL LIMIT 1
          `,
          )
          .get(task.parent_id) as { fs_path: string } | null
        fsPath = file?.fs_path ?? null
      }

      if (fsPath) {
        writeTaskStatusToFile(fsPath, task.md_line, data.task_status as TaskStatus)
      }
    }
  }

  // Bidirectional sync: write date field changes back to markdown file
  if (data.due_date !== undefined || data.scheduled_date !== undefined || data.due_at !== undefined || data.start_at !== undefined) {
    const task = db.query("SELECT * FROM nodes WHERE id = ?").get(event.target) as Record<string, unknown> | null
    if (task && task.md_line !== null) {
      let fsPath = task.fs_path as string | null
      if (!fsPath && task.parent_id) {
        const file = db
          .query(
            `WITH RECURSIVE ancestors AS (
              SELECT id, parent_id, fs_path, type, fstype FROM nodes WHERE id = ?
              UNION ALL
              SELECT n.id, n.parent_id, n.fs_path, n.type, n.fstype
              FROM nodes n JOIN ancestors a ON n.id = a.parent_id
            )
            SELECT fs_path FROM ancestors WHERE type = 'oi' AND fstype IN ('file', 'mdfile') AND fs_path IS NOT NULL LIMIT 1`,
          )
          .get(task.parent_id as string) as { fs_path: string } | null
        fsPath = file?.fs_path ?? null
      }
      if (fsPath) {
        writeDateToFile(
          fsPath,
          task.md_line as number,
          task.due_date as string | null,
          task.scheduled_date as string | null,
        )
      }
    }
  }
}

/**
 * Write task status change back to markdown file (bidirectional sync)
 */
function writeTaskStatusToFile(fsPath: string, mdLine: number, newStatus: TaskStatus): void {
  try {
    const content = readFileSync(fsPath, "utf-8")
    const lines = content.split("\n")

    if (mdLine >= lines.length) return

    const line = lines[mdLine]
    if (!line) return

    const marker = getMarkerForStatus(newStatus)
    const mark = marker[1] // Extract inner char from "[x]" → "x"

    lines[mdLine] = line.replace(/^(\s*-\s+\[).(])/, `$1${mark}$2`)

    void Bun.write(fsPath, lines.join("\n"))
  } catch {
    // Ignore write errors
  }
}

/**
 * Write date field changes back to markdown file (bidirectional sync).
 * Updates existing emoji (📅/⏳) or inline (due:/start:) markers, or appends inline format.
 */
function writeDateToFile(
  fsPath: string,
  mdLine: number,
  dueDate: string | null,
  scheduledDate: string | null,
): void {
  try {
    const content = readFileSync(fsPath, "utf-8")
    const lines = content.split("\n")
    if (mdLine >= lines.length) return
    let line = lines[mdLine]
    if (!line) return

    line = updateDateField(line, dueDate, "due")
    line = updateDateField(line, scheduledDate, "scheduled")

    lines[mdLine] = line
    void Bun.write(fsPath, lines.join("\n"))
  } catch {
    // Ignore write errors
  }
}

function updateDateField(line: string, date: string | null, field: "due" | "scheduled"): string {
  const emojiRegex = field === "due"
    ? /\s*📅\s*\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/g
    : /\s*⏳\s*\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/g
  const inlineRegex = field === "due"
    ? /\s*\bdue:\d{4}-\d{2}-\d{2}\b/g
    : /\s*\bstart:\d{4}-\d{2}-\d{2}\b/g

  const hasEmoji = emojiRegex.test(line)
  const hasInline = inlineRegex.test(line)

  if (date) {
    if (hasEmoji) {
      const emoji = field === "due" ? "📅" : "⏳"
      const replaceRegex = field === "due"
        ? /📅\s*\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/
        : /⏳\s*\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/
      line = line.replace(replaceRegex, `${emoji} ${date}`)
    } else if (hasInline) {
      const replaceRegex = field === "due"
        ? /\bdue:\d{4}-\d{2}-\d{2}\b/
        : /\bstart:\d{4}-\d{2}-\d{2}\b/
      const inlineKey = field === "due" ? "due" : "start"
      line = line.replace(replaceRegex, `${inlineKey}:${date}`)
    } else {
      const inlineKey = field === "due" ? "due" : "start"
      line = line.trimEnd() + ` ${inlineKey}:${date}`
    }
  } else {
    if (hasEmoji) {
      const clearRegex = field === "due"
        ? /\s*📅\s*\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/g
        : /\s*⏳\s*\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/g
      line = line.replace(clearRegex, "")
    }
    if (hasInline) {
      const clearRegex = field === "due"
        ? /\s*\bdue:\d{4}-\d{2}-\d{2}\b/g
        : /\s*\bstart:\d{4}-\d{2}-\d{2}\b/g
      line = line.replace(clearRegex, "")
    }
  }

  return line
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
  db.run("DELETE FROM nodes WHERE id = ?", [event.target])
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
