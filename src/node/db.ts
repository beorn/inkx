/**
 * SQLite Database - state.db management
 * Uses bun:sqlite for native Bun support
 */

import { Database } from "bun:sqlite";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import type { Node, Event, TaskStatus, NodeType } from "./types.ts";
import { getKmDir } from "./emit.ts";

// Singleton database instance
let dbInstance: Database | null = null;

// Flag to track if db was injected externally (e.g., from MemoryStore)
let dbInjected = false;

/**
 * SQL schema for state.db
 */
const SCHEMA = `
-- Core node table
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  parent_id TEXT,
  symlink_to TEXT,
  sort_order REAL DEFAULT 0,

  -- Filesystem
  fs_path TEXT,
  fs_ino INTEGER,

  -- Markdown
  md_pos INTEGER,
  md_slug TEXT,

  -- Task
  task_status TEXT,
  task_mark TEXT,
  assigned_to TEXT,
  due_date TEXT,
  scheduled_date TEXT,
  priority INTEGER,

  -- Content
  content TEXT,
  content_hash TEXT,

  -- Metadata
  data JSON DEFAULT '{}',
  created_at INTEGER,
  updated_at INTEGER,
  version TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_fs_path ON nodes(fs_path);
CREATE INDEX IF NOT EXISTS idx_nodes_fs_ino ON nodes(fs_ino);
CREATE INDEX IF NOT EXISTS idx_nodes_task_status ON nodes(task_status);
CREATE INDEX IF NOT EXISTS idx_nodes_assigned ON nodes(assigned_to);
CREATE INDEX IF NOT EXISTS idx_nodes_due ON nodes(due_date);

-- Full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  id,
  content,
  content='nodes',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, id, content) VALUES (new.rowid, new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, id, content) VALUES('delete', old.rowid, old.id, old.content);
END;

CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, id, content) VALUES('delete', old.rowid, old.id, old.content);
  INSERT INTO nodes_fts(rowid, id, content) VALUES (new.rowid, new.id, new.content);
END;

-- Event replay cursor
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Wikilinks (for bidirectional linking)
CREATE TABLE IF NOT EXISTS links (
  source_id TEXT NOT NULL,     -- Node containing the link
  target_name TEXT NOT NULL,   -- Target filename/slug (from [[target]])
  target_id TEXT,              -- Resolved target node ID (can be null if unresolved)
  section TEXT,                -- Optional section anchor (#section)
  block_id TEXT,               -- Optional block ID (^block)
  alias TEXT,                  -- Display alias (|alias)
  created_at INTEGER,
  PRIMARY KEY (source_id, target_name, section, block_id)
);

CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
CREATE INDEX IF NOT EXISTS idx_links_target_name ON links(target_name);
CREATE INDEX IF NOT EXISTS idx_links_target_id ON links(target_id);
`;

/**
 * Get the database path
 */
export function getDbPath(): string {
  return join(getKmDir(), "state.db");
}

/**
 * Initialize or get the database instance
 */
export function getDb(): Database {
  if (dbInstance) {
    return dbInstance;
  }

  const kmPath = getKmDir();
  if (!existsSync(kmPath)) {
    mkdirSync(kmPath, { recursive: true });
  }

  const dbPath = getDbPath();
  dbInstance = new Database(dbPath);

  // Initialize schema
  dbInstance.exec(SCHEMA);

  return dbInstance;
}

/**
 * Close the database
 */
export function closeDb(): void {
  if (dbInstance) {
    // Only close if we own it (not injected from external store)
    if (!dbInjected) {
      dbInstance.close();
    }
    dbInstance = null;
    dbInjected = false;
  }
}

/**
 * Inject an external database instance (e.g., from MemoryStore)
 * This allows memory mode to work with existing db.ts functions
 */
export function setDb(db: Database): void {
  if (dbInstance && !dbInjected) {
    dbInstance.close();
  }
  dbInstance = db;
  dbInjected = true;
}

/**
 * Check if database is using memory mode
 */
export function isMemoryMode(): boolean {
  return dbInjected;
}

/**
 * Reset the database (drop all tables and recreate)
 */
export function resetDb(): void {
  const db = getDb();
  db.exec(`
    DROP TABLE IF EXISTS nodes_fts;
    DROP TABLE IF EXISTS nodes;
    DROP TABLE IF EXISTS meta;
  `);
  db.exec(SCHEMA);
}

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

function applyNodeCreated(db: Database, event: Event): void {
  const data = event.data as Record<string, unknown>;

  db.run(
    `
    INSERT INTO nodes (
      id, type, parent_id, symlink_to, sort_order,
      fs_path, fs_ino, md_pos, md_slug,
      task_status, task_mark, assigned_to, due_date, scheduled_date, priority,
      content, content_hash, data,
      created_at, updated_at, version
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?
    )
  `,
    [
      data.id as string,
      data.type as string,
      (data.parent_id as string) ?? null,
      (data.symlink_to as string) ?? null,
      (data.sort_order as number) ?? 0,
      (data.fs_path as string) ?? null,
      (data.fs_ino as number) ?? null,
      (data.md_pos as number) ?? null,
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
}

function applyNodeMoved(db: Database, event: Event): void {
  if (!event.target) return;

  const data = event.data as { parent_id: string | null; sort_order?: number };

  db.run(
    `
    UPDATE nodes
    SET parent_id = ?, sort_order = ?, updated_at = ?, version = ?
    WHERE id = ?
  `,
    [data.parent_id, data.sort_order ?? 0, event.ts, event.id, event.target],
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
    SET assigned_to = ?, task_status = 'in_progress', updated_at = ?, version = ?
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
    SET assigned_to = NULL, task_status = 'open', updated_at = ?, version = ?
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

/**
 * Get a node by ID
 */
export function getNode(id: string): Node | null {
  const db = getDb();
  const row = db.query("SELECT * FROM nodes WHERE id = ?").get(id) as Record<
    string,
    unknown
  > | null;

  if (!row) return null;
  return rowToNode(row);
}

/**
 * Get a node by ID prefix (for CLI convenience)
 */
export function getNodeByIdPrefix(idPrefix: string): Node | null {
  const db = getDb();

  // Try exact match first
  let row = db
    .query("SELECT * FROM nodes WHERE id = ?")
    .get(idPrefix) as Record<string, unknown> | null;

  if (row) return rowToNode(row);

  // Try prefix match
  row = db
    .query("SELECT * FROM nodes WHERE id LIKE ?")
    .get(`${idPrefix}%`) as Record<string, unknown> | null;

  if (!row) return null;
  return rowToNode(row);
}

/**
 * Get a node by filesystem path
 */
export function getNodeByPath(fsPath: string): Node | null {
  const db = getDb();
  const row = db
    .query("SELECT * FROM nodes WHERE fs_path = ?")
    .get(fsPath) as Record<string, unknown> | null;

  if (!row) return null;
  return rowToNode(row);
}

/**
 * Get children of a node
 */
export function getChildren(parentId: string | null): Node[] {
  const db = getDb();

  let rows: Record<string, unknown>[];
  if (parentId === null) {
    rows = db
      .query(
        `
      SELECT * FROM nodes
      WHERE parent_id IS NULL
      ORDER BY sort_order, created_at
    `,
      )
      .all() as Record<string, unknown>[];
  } else {
    rows = db
      .query(
        `
      SELECT * FROM nodes
      WHERE parent_id = ?
      ORDER BY sort_order, created_at
    `,
      )
      .all(parentId) as Record<string, unknown>[];
  }

  return rows.map(rowToNode);
}

/**
 * Get subtree (recursive)
 */
export function getSubtree(rootId: string): Node[] {
  const db = getDb();
  const rows = db
    .query(
      `
    WITH RECURSIVE subtree AS (
      SELECT * FROM nodes WHERE id = ?
      UNION ALL
      SELECT n.* FROM nodes n
      JOIN subtree s ON n.parent_id = s.id
    )
    SELECT * FROM subtree
    ORDER BY sort_order, created_at
  `,
    )
    .all(rootId) as Record<string, unknown>[];

  return rows.map(rowToNode);
}

/**
 * Get ancestors of a node (from root to parent)
 * Returns array from root down to immediate parent (excludes the node itself)
 */
export function getAncestors(nodeId: string): Node[] {
  const db = getDb();
  const rows = db
    .query(
      `
    WITH RECURSIVE ancestors AS (
      SELECT * FROM nodes WHERE id = (SELECT parent_id FROM nodes WHERE id = ?)
      UNION ALL
      SELECT n.* FROM nodes n
      JOIN ancestors a ON n.id = a.parent_id
    )
    SELECT * FROM ancestors
  `,
    )
    .all(nodeId) as Record<string, unknown>[];

  // Results come in child-to-root order, reverse to get root-to-parent
  return rows.map(rowToNode).reverse();
}

/**
 * Get tasks by status
 */
export function getTasksByStatus(status: TaskStatus | TaskStatus[]): Node[] {
  const db = getDb();
  const statuses = Array.isArray(status) ? status : [status];
  const placeholders = statuses.map(() => "?").join(", ");

  const rows = db
    .query(
      `
    SELECT * FROM nodes
    WHERE type = 'task' AND task_status IN (${placeholders})
    ORDER BY priority ASC, due_date ASC, created_at ASC
  `,
    )
    .all(...statuses) as Record<string, unknown>[];

  return rows.map(rowToNode);
}

/**
 * Get all tasks
 */
export function getAllTasks(): Node[] {
  const db = getDb();
  const rows = db
    .query(
      `
    SELECT * FROM nodes
    WHERE type = 'task'
    ORDER BY task_status, priority ASC, due_date ASC, created_at ASC
  `,
    )
    .all() as Record<string, unknown>[];

  return rows.map(rowToNode);
}

/**
 * Full-text search
 */
export function search(query: string, limit = 50): Node[] {
  const db = getDb();
  const rows = db
    .query(
      `
    SELECT n.* FROM nodes n
    JOIN nodes_fts f ON n.id = f.id
    WHERE nodes_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `,
    )
    .all(query, limit) as Record<string, unknown>[];

  return rows.map(rowToNode);
}

/**
 * Get the last event ID processed
 */
export function getLastEventId(): string | null {
  const db = getDb();
  const row = db
    .query("SELECT value FROM meta WHERE key = ?")
    .get("last_event") as { value: string } | null;

  return row?.value ?? null;
}

/**
 * Get all nodes (for debugging/export)
 */
export function getAllNodes(): Node[] {
  const db = getDb();
  const rows = db.query("SELECT * FROM nodes").all() as Record<
    string,
    unknown
  >[];
  return rows.map(rowToNode);
}

/**
 * Convert database row to Node object
 */
function rowToNode(row: Record<string, unknown>): Node {
  return {
    id: row.id as string,
    type: row.type as NodeType,
    parent_id: row.parent_id as string | null,
    sort_order: row.sort_order as number,
    symlink_to: row.symlink_to as string | null,
    fs_path: row.fs_path as string | undefined,
    fs_ino: row.fs_ino as number | undefined,
    md_pos: row.md_pos as number | undefined,
    md_slug: row.md_slug as string | undefined,
    task_status: row.task_status as TaskStatus | undefined,
    task_mark: row.task_mark as Node["task_mark"],
    assigned_to: row.assigned_to as string | undefined,
    due_date: row.due_date as string | undefined,
    scheduled_date: row.scheduled_date as string | undefined,
    priority: row.priority as number | undefined,
    content: row.content as string | undefined,
    content_hash: row.content_hash as string | undefined,
    data:
      typeof row.data === "string"
        ? (JSON.parse(row.data) as Record<string, unknown>)
        : ((row.data as Record<string, unknown>) ?? {}),
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
    version: row.version as string,
  };
}

// ========== Link Management ==========

/**
 * Link record for wikilinks
 */
export interface Link {
  source_id: string;
  target_name: string;
  target_id: string | null;
  section: string | null;
  block_id: string | null;
  alias: string | null;
  created_at: number;
}

/**
 * Add a link from source to target
 */
export function addLink(link: Omit<Link, "created_at">): void {
  const db = getDb();
  db.run(
    `
    INSERT OR REPLACE INTO links (source_id, target_name, target_id, section, block_id, alias, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    [
      link.source_id,
      link.target_name,
      link.target_id,
      link.section,
      link.block_id,
      link.alias,
      Date.now(),
    ],
  );
}

/**
 * Remove all links from a source node
 */
export function removeLinksFromSource(sourceId: string): void {
  const db = getDb();
  db.run("DELETE FROM links WHERE source_id = ?", [sourceId]);
}

/**
 * Get outgoing links from a node (forward links)
 */
export function getOutgoingLinks(sourceId: string): Link[] {
  const db = getDb();
  const rows = db
    .query("SELECT * FROM links WHERE source_id = ?")
    .all(sourceId) as Array<Record<string, unknown>>;

  return rows.map(rowToLink);
}

/**
 * Get incoming links to a node (backlinks)
 */
export function getBacklinks(targetId: string): Link[] {
  const db = getDb();
  const rows = db
    .query("SELECT * FROM links WHERE target_id = ?")
    .all(targetId) as Array<Record<string, unknown>>;

  return rows.map(rowToLink);
}

/**
 * Get backlinks by target name (for unresolved links)
 */
export function getBacklinksByName(targetName: string): Link[] {
  const db = getDb();
  // Match by name (case-insensitive, with or without .md extension)
  const normalizedName = targetName.toLowerCase().replace(/\.md$/, "");
  const rows = db
    .query(
      `
    SELECT * FROM links
    WHERE LOWER(REPLACE(target_name, '.md', '')) = ?
  `,
    )
    .all(normalizedName) as Array<Record<string, unknown>>;

  return rows.map(rowToLink);
}

/**
 * Resolve unresolved links to a target node
 * Call this when a new node is created that might match pending links
 */
export function resolveLinks(targetId: string, targetName: string): number {
  const db = getDb();
  const normalizedName = targetName.toLowerCase().replace(/\.md$/, "");
  const result = db.run(
    `
    UPDATE links
    SET target_id = ?
    WHERE target_id IS NULL
    AND LOWER(REPLACE(target_name, '.md', '')) = ?
  `,
    [targetId, normalizedName],
  );
  return result.changes;
}

/**
 * Convert database row to Link object
 */
function rowToLink(row: Record<string, unknown>): Link {
  return {
    source_id: row.source_id as string,
    target_name: row.target_name as string,
    target_id: row.target_id as string | null,
    section: row.section as string | null,
    block_id: row.block_id as string | null,
    alias: row.alias as string | null,
    created_at: row.created_at as number,
  };
}

// Export the applyEvent function for use with emit
export const dbApplyEvent = { applyEvent };
