/**
 * Database Events - Event application and change tracking
 *
 * This module handles applying events to the database state.
 * Events are the source of truth for all state changes.
 */

import type { Database } from "bun:sqlite";
import { readFileSync } from "fs";
import type { Event, TaskStatus } from "@km/core";
import { getDb } from "./db-instance.ts";

// =============================================================================
// Event Application
// =============================================================================

/**
 * Apply an event to the database
 */
export function applyEvent(event: Event): void {
  const db = getDb();

  switch (event.type) {
    case "node_created":
      applyNodeCreated(db, event);
      break;
    case "node_updated":
      applyNodeUpdated(db, event);
      break;
    case "node_moved":
      applyNodeMoved(db, event);
      break;
    case "node_deleted":
      applyNodeDeleted(db, event);
      break;
    case "task_claimed":
      applyTaskClaimed(db, event);
      break;
    case "task_released":
      applyTaskReleased(db, event);
      break;
    case "task_completed":
      applyTaskCompleted(db, event);
      break;
    // Session events don't modify state.db
    case "session_started":
    case "session_message":
    case "session_tool_call":
    case "session_ended":
    case "message":
    case "conflict_created":
      // No-op for state.db
      break;
  }

  // Update last event cursor
  db.run("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [
    "last_event",
    event.id,
  ]);
}

// =============================================================================
// Event Handlers
// =============================================================================

function applyNodeCreated(db: Database, event: Event): void {
  const data = event.data as Record<string, unknown>;

  db.run(
    `
    INSERT INTO nodes (
      id, type, parent_id, link_to, link_alias, parent_idx,
      fs_path, fs_ino, name, title, md_pos, md_line, md_slug,
      task_status, task_mark, assigned_to, due_date, scheduled_date, priority,
      content, content_hash, data,
      created_at, updated_at, version
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?
    )
  `,
    [
      data.id as string,
      data.type as string,
      (data.parent_id as string) ?? null,
      (data.link_to as string) ?? null,
      (data.link_alias as string) ?? null,
      (data.parent_idx as number) ?? 0,
      (data.fs_path as string) ?? null,
      (data.fs_ino as number) ?? null,
      (data.name as string) ?? null,
      (data.title as string) ?? null,
      (data.md_pos as number) ?? null,
      (data.md_line as number) ?? null,
      (data.md_slug as string) ?? null,
      (data.task_status as string) ?? null,
      (data.task_mark as string) ?? null,
      (data.assigned_to as string) ?? null,
      (data.due_date as string) ?? null,
      (data.scheduled_date as string) ?? null,
      (data.priority as number) ?? null,
      (data.content as string) ?? null,
      (data.content_hash as string) ?? null,
      JSON.stringify(data.data ?? {}),
      event.ts,
      event.ts,
      event.id,
    ],
  );
}

function applyNodeUpdated(db: Database, event: Event): void {
  if (!event.target) return;

  const data = event.data as Record<string, unknown>;
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === "data") {
      // Merge JSON data
      sets.push("data = json_patch(data, ?)");
      values.push(JSON.stringify(value));
    } else {
      sets.push(`${key} = ?`);
      values.push(value);
    }
  }

  sets.push("updated_at = ?", "version = ?");
  values.push(event.ts, event.id, event.target);

  const sql = `UPDATE nodes SET ${sets.join(", ")} WHERE id = ?`;
  db.run(sql, values);

  // Bidirectional sync: write task status changes back to markdown file
  if (data.task_status !== undefined) {
    // Get the task's md_line and fs_path (may be on task or parent file)
    const task = db
      .query("SELECT parent_id, md_line, fs_path FROM nodes WHERE id = ?")
      .get(event.target) as {
      parent_id: string | null;
      md_line: number | null;
      fs_path: string | null;
    } | null;

    if (task && task.md_line !== null) {
      let fsPath = task.fs_path;

      // If task doesn't have fs_path directly, walk up to find parent file
      if (!fsPath && task.parent_id) {
        const file = db
          .query(
            `
            WITH RECURSIVE ancestors AS (
              SELECT id, parent_id, fs_path, type FROM nodes WHERE id = ?
              UNION ALL
              SELECT n.id, n.parent_id, n.fs_path, n.type
              FROM nodes n
              JOIN ancestors a ON n.id = a.parent_id
            )
            SELECT fs_path FROM ancestors WHERE type = 'file' AND fs_path IS NOT NULL LIMIT 1
          `,
          )
          .get(task.parent_id) as { fs_path: string } | null;
        fsPath = file?.fs_path ?? null;
      }

      if (fsPath) {
        writeTaskStatusToFile(
          fsPath,
          task.md_line,
          data.task_status as TaskStatus,
        );
      }
    }
  }
}

/**
 * Write task status change back to markdown file (bidirectional sync)
 */
function writeTaskStatusToFile(
  fsPath: string,
  mdLine: number,
  newStatus: TaskStatus,
): void {
  try {
    const content = readFileSync(fsPath, "utf-8");
    const lines = content.split("\n");

    if (mdLine >= lines.length) return;

    const line = lines[mdLine];
    if (!line) return;

    // Map status to task mark
    const statusStr = newStatus as string;
    const newMark =
      statusStr === "done"
        ? "x"
        : statusStr === "wip"
          ? "/"
          : statusStr === "blocked"
            ? "!"
            : statusStr === "dropped"
              ? "-"
              : " "; // todo

    lines[mdLine] = line.replace(/^(\s*-\s+\[).(])/, `$1${newMark}$2`);

    void Bun.write(fsPath, lines.join("\n"));
  } catch {
    // Ignore write errors
  }
}

function applyNodeMoved(db: Database, event: Event): void {
  if (!event.target) return;

  const data = event.data as { parent_id: string | null; parent_idx?: number };

  db.run(
    `
    UPDATE nodes
    SET parent_id = ?, parent_idx = ?, updated_at = ?, version = ?
    WHERE id = ?
  `,
    [data.parent_id, data.parent_idx ?? 0, event.ts, event.id, event.target],
  );
}

function applyNodeDeleted(db: Database, event: Event): void {
  if (!event.target) return;
  db.run("DELETE FROM nodes WHERE id = ?", [event.target]);
}

function applyTaskClaimed(db: Database, event: Event): void {
  if (!event.target) return;

  db.run(
    `
    UPDATE nodes
    SET assigned_to = ?, task_status = 'wip', updated_at = ?, version = ?
    WHERE id = ?
  `,
    [event.actor, event.ts, event.id, event.target],
  );
}

function applyTaskReleased(db: Database, event: Event): void {
  if (!event.target) return;

  db.run(
    `
    UPDATE nodes
    SET assigned_to = NULL, task_status = 'todo', updated_at = ?, version = ?
    WHERE id = ?
  `,
    [event.ts, event.id, event.target],
  );
}

function applyTaskCompleted(db: Database, event: Event): void {
  if (!event.target) return;

  db.run(
    `
    UPDATE nodes
    SET task_status = 'done', task_mark = 'x', updated_at = ?, version = ?
    WHERE id = ?
  `,
    [event.ts, event.id, event.target],
  );
}

// Export for use with emit
export const dbApplyEvent = { applyEvent };
