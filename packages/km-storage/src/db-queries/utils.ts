/**
 * Database Query Utilities
 *
 * Core utilities for converting database rows to KNode objects
 * and low-level database operations.
 */

import type { Database } from "bun:sqlite"
import type { KNode, TaskStatus, FsType, NodeType, NodeRules, Reminder } from "@km/core"
import { composeItem } from "../item-helpers.ts"

// =============================================================================
// Utility Queries
// =============================================================================

/**
 * Get the last event ID processed
 */
export function getLastEventId(db: Database): string | null {
  const row = db.query("SELECT value FROM meta WHERE key = ?").get("last_event") as { value: string } | null

  return row?.value ?? null
}

/**
 * Get all nodes (for debugging/export)
 */
export function getAllNodes(db: Database): KNode[] {
  const rows = db.query("SELECT * FROM nodes").all() as Record<string, unknown>[]
  return rows.map(rowToNode)
}

/**
 * Get total count of nodes in the database
 */
export function getNodeCount(db: Database): number {
  const result = db.query("SELECT COUNT(*) as count FROM nodes").get() as {
    count: number
  }
  return result.count
}

// =============================================================================
// Row Conversion
// =============================================================================

/**
 * Convert database row to KNode object
 * Title and rules are read from stored values (data.title, data.rules)
 */
export function rowToNode(row: Record<string, unknown>): KNode {
  const type = row.type as NodeType
  const content = row.content as string | undefined

  // Parse data JSON
  const data =
    typeof row.data === "string"
      ? (JSON.parse(row.data) as Record<string, unknown>)
      : ((row.data as Record<string, unknown>) ?? {})

  // Extract rules from data.rules (stored by parser during sync)
  const rules = data.rules as NodeRules | undefined

  // Assemble nested item object from flat DB columns
  const item = composeItem(
    row.item,
    (row.list_marker ?? undefined) as string | undefined,
    (row.task_marker ?? undefined) as string | undefined,
    (row.task_status ?? undefined) as string | undefined,
  )

  return {
    id: row.id as string,
    type,
    fstype: (row.fstype ?? undefined) as FsType | undefined,
    parent_id: row.parent_id as string | null,
    parent_idx: row.parent_idx as number,
    item,
    embed_source: (row.embed_source ?? undefined) as string | null | undefined,
    fs_path: (row.fs_path ?? undefined) as string | undefined,
    fs_ino: (row.fs_ino ?? undefined) as number | undefined,
    fs_mtime: (row.fs_mtime ?? undefined) as number | undefined,
    name: (row.name ?? undefined) as string | undefined,
    block_id: (row.block_id ?? undefined) as string | undefined,
    md_pos: (row.md_pos ?? undefined) as number | undefined,
    md_line: (row.md_line ?? undefined) as number | undefined,
    assigned_to: (row.assigned_to ?? undefined) as string | undefined,
    due_at: (row.due_at ?? undefined) as string | undefined,
    start_at: (row.start_at ?? undefined) as string | undefined,
    priority: (row.priority ?? undefined) as string | undefined,
    content,
    content_hash: row.content_hash as string | undefined,
    title: row.title as string | undefined,
    rules,
    rrule: data.rrule as string | undefined,
    recur_prev: data.recur_prev as string | undefined,
    completed_at: data.completed_at as number | undefined,
    reminders: data.reminders as Reminder[] | undefined,
    data,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
    version: row.version as string,
  }
}
