/**
 * Shared database INSERT helpers for node rows.
 *
 * Used by:
 * - deferred-parsing.ts (INSERT OR IGNORE for stub replacement)
 * - repo-loader.ts (INSERT OR IGNORE for event application)
 * - pipeline.ts (plain INSERT for full create pipeline)
 */

import type { Database } from "bun:sqlite"
import type { KNode } from "@km/core"
import { decomposeItem } from "../item-helpers.ts"

// ============================================================================
// INSERT OR IGNORE (idempotent — disk mode / deferred parsing)
// ============================================================================

/** SQL for the INSERT OR IGNORE used by applyChanges, parseDeferredSequential, and parseStubFile.
 * Uses INSERT OR IGNORE to match applyChangeWithDb behavior — in disk mode,
 * changes.jsonl may contain changes for nodes that already exist in state.db. */
export const INSERT_NODE_SQL = `
  INSERT OR IGNORE INTO nodes (
    id, type, fstype, parent_id, item, embed_source, parent_idx,
    fs_path, fs_ino, fs_mtime, name, block_id, title, md_pos, md_line,
    list_marker, task_marker, task_status, assigned_to, due_at, start_at, priority,
    content, content_hash, data,
    created_at, updated_at, version
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

/**
 * Run the 30-column INSERT OR IGNORE for a KNode.
 * Shared by parseDeferredSequential and parseStubFile where the source is a KNode.
 */
export function insertNodeRow(stmt: ReturnType<Database["prepare"]>, node: KNode, now: number): void {
  const data = node.data ?? {}
  const ic = decomposeItem(node.item)
  stmt.run(
    node.id,
    node.type,
    node.fstype ?? null,
    node.parent_id ?? null,
    ic.item,
    node.embed_source ?? null,
    node.parent_idx ?? 0,
    node.fs_path ?? null,
    node.fs_ino ?? null,
    node.fs_mtime ?? null,
    node.name ?? null,
    node.block_id ?? null,
    node.title ?? null,
    node.md_pos ?? null,
    node.md_line ?? null,
    ic.list_marker,
    ic.task_marker,
    ic.task_status,
    node.assigned_to ?? null,
    node.due_at ?? null,
    node.start_at ?? null,
    node.priority ?? null,
    node.content ?? null,
    node.content_hash ?? null,
    JSON.stringify(data),
    node.created_at ?? now,
    node.updated_at ?? now,
    node.version || "",
  )
}

// ============================================================================
// Plain INSERT (pipeline — full create, no idempotency needed)
// ============================================================================

/** SQL for the plain INSERT used by the pipeline's applyNodes stage.
 * No OR IGNORE — used when we know the node does not yet exist (fresh create). */
export const INSERT_NODE_PLAIN_SQL = `
  INSERT INTO nodes (
    id, type, fstype, parent_id, item, embed_source, parent_idx,
    fs_path, fs_ino, fs_mtime, name, block_id, title, md_pos, md_line,
    list_marker, task_marker, task_status, assigned_to, due_at, start_at, priority,
    content, content_hash, data,
    created_at, updated_at, version
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`
