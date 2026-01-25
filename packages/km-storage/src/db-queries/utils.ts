/**
 * Database Query Utilities
 *
 * Core utilities for converting database rows to KNode objects
 * and low-level database operations.
 */

import type { Database } from "bun:sqlite";
import type { KNode, TaskStatus, NodeType, NodeRules } from "@km/core";

// =============================================================================
// Utility Queries
// =============================================================================

/**
 * Get the last event ID processed
 */
export function getLastEventId(db: Database): string | null {
  const row = db
    .query("SELECT value FROM meta WHERE key = ?")
    .get("last_event") as { value: string } | null;

  return row?.value ?? null;
}

/**
 * Get all nodes (for debugging/export)
 */
export function getAllNodes(db: Database): KNode[] {
  const rows = db.query("SELECT * FROM nodes").all() as Record<
    string,
    unknown
  >[];
  return rows.map(rowToNode);
}

/**
 * Get total count of nodes in the database
 */
export function getNodeCount(db: Database): number {
  const result = db.query("SELECT COUNT(*) as count FROM nodes").get() as {
    count: number;
  };
  return result.count;
}

// =============================================================================
// Row Conversion
// =============================================================================

/**
 * Convert database row to KNode object
 * Title and rules are read from stored values (data.title, data.rules)
 */
export function rowToNode(row: Record<string, unknown>): KNode {
  const type = row.type as NodeType;
  const content = row.content as string | undefined;

  // Parse data JSON
  const data =
    typeof row.data === "string"
      ? (JSON.parse(row.data) as Record<string, unknown>)
      : ((row.data as Record<string, unknown>) ?? {});

  // Extract rules from data.rules (stored by parser during sync)
  const rules = data.rules as NodeRules | undefined;

  return {
    id: row.id as string,
    type,
    parent_id: row.parent_id as string | null,
    parent_idx: row.parent_idx as number,
    link_to: row.link_to as string | null,
    link_alias: row.link_alias as string | undefined,
    fs_path: row.fs_path as string | undefined,
    fs_ino: row.fs_ino as number | undefined,
    fs_mtime: row.fs_mtime as number | undefined,
    name: row.name as string | undefined,
    md_pos: row.md_pos as number | undefined,
    md_slug: row.md_slug as string | undefined,
    md_line: row.md_line as number | undefined,
    task_status: row.task_status as TaskStatus | undefined,
    task_mark: row.task_mark as KNode["task_mark"],
    assigned_to: row.assigned_to as string | undefined,
    due_date: row.due_date as string | undefined,
    scheduled_date: row.scheduled_date as string | undefined,
    priority: row.priority as number | undefined,
    content,
    content_hash: row.content_hash as string | undefined,
    title: row.title as string | undefined,
    rules,
    data,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
    version: row.version as string,
  };
}
