/**
 * SQLite Database - state.db management
 * Uses bun:sqlite for native Bun support
 */

import { Database } from "bun:sqlite";
import { join, resolve } from "path";
import { existsSync, mkdirSync, readFileSync } from "fs";
import type { Node, Event, TaskStatus, NodeType, NodeRules } from "@km/core";
import { getKmDir, emit } from "@km/core";
import { parseHeadingRules } from "@km/markdown";
import { isExplicitPath } from "./path-utils.ts";

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
  parent_idx REAL DEFAULT 0,

  -- Filesystem
  fs_path TEXT,
  fs_ino INTEGER,

  -- Markdown
  md_pos INTEGER,
  md_line INTEGER,
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
  embedded INTEGER DEFAULT 0,  -- 1 if this is an embedding (![[...]]), 0 otherwise
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
      id, type, parent_id, symlink_to, parent_idx,
      fs_path, fs_ino, md_pos, md_line, md_slug,
      task_status, task_mark, assigned_to, due_date, scheduled_date, priority,
      content, content_hash, data,
      created_at, updated_at, version
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
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
      (data.parent_idx as number) ?? 0,
      (data.fs_path as string) ?? null,
      (data.fs_ino as number) ?? null,
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
 * Get a node by ID prefix or suffix with optional type filter.
 *
 * Supports both prefix matching (start of ID) and suffix matching (end of ID).
 * The CLI displays short IDs using the last 8 chars (suffix), so we try both.
 *
 * @param idPrefix - The ID or partial ID to search for
 * @param typeFilter - Optional type to filter by (e.g., 'task')
 */
function getNodeByIdPrefixWithType(
  idPrefix: string,
  typeFilter?: string,
): Node | null {
  const db = getDb();
  const typeClause = typeFilter ? " AND type = ?" : "";
  const params = typeFilter ? [idPrefix, typeFilter] : [idPrefix];

  // Try exact match first
  let row = db
    .query(`SELECT * FROM nodes WHERE id = ?${typeClause}`)
    .get(...params) as Record<string, unknown> | null;

  if (row) return rowToNode(row);

  // Try prefix match (ID starts with input)
  const prefixParams = typeFilter
    ? [`${idPrefix}%`, typeFilter]
    : [`${idPrefix}%`];
  row = db
    .query(`SELECT * FROM nodes WHERE id LIKE ?${typeClause}`)
    .get(...prefixParams) as Record<string, unknown> | null;

  if (row) return rowToNode(row);

  // Try suffix match (ID ends with input) - for short IDs displayed as last 8 chars
  const suffixParams = typeFilter
    ? [`%${idPrefix}`, typeFilter]
    : [`%${idPrefix}`];
  row = db
    .query(`SELECT * FROM nodes WHERE id LIKE ?${typeClause}`)
    .get(...suffixParams) as Record<string, unknown> | null;

  if (!row) return null;
  return rowToNode(row);
}

/**
 * Get a node by ID prefix or suffix (for CLI convenience)
 */
export function getNodeByIdPrefix(idPrefix: string): Node | null {
  return getNodeByIdPrefixWithType(idPrefix);
}

/**
 * Get a task by ID prefix or suffix (for CLI convenience)
 */
export function getTaskByIdPrefix(idPrefix: string): Node | null {
  return getNodeByIdPrefixWithType(idPrefix, "task");
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
 * Get all folder/file nodes under a directory path (for reconciliation)
 */
export function getNodesUnderPath(dirPath: string): Node[] {
  const db = getDb();
  const rows = db
    .query(
      `
      SELECT * FROM nodes
      WHERE fs_path LIKE ? || '%'
      AND (type = 'folder' OR type = 'file')
    `,
    )
    .all(dirPath) as Record<string, unknown>[];

  return rows.map(rowToNode);
}

/**
 * Get a file node and its children (sections, tasks, etc.)
 */
export function getFileWithChildren(fsPath: string): Node[] {
  const db = getDb();
  const rows = db
    .query(
      `
      SELECT * FROM nodes
      WHERE fs_path = ? OR parent_id IN (
        SELECT id FROM nodes WHERE fs_path = ?
      )
    `,
    )
    .all(fsPath, fsPath) as Record<string, unknown>[];

  return rows.map(rowToNode);
}

/**
 * Get content hash for a node (for change detection)
 */
export function getNodeContentHash(nodeId: string): string | null {
  const db = getDb();
  const row = db
    .query("SELECT content_hash FROM nodes WHERE id = ?")
    .get(nodeId) as { content_hash: string | null } | undefined;

  return row?.content_hash ?? null;
}

/**
 * Find a file node by name (for wikilink resolution)
 */
export function findFileByName(name: string): Node | null {
  const db = getDb();
  const normalizedName = name.toLowerCase().replace(/\.md$/, "");

  const row = db
    .query(
      `
    SELECT * FROM nodes
    WHERE type = 'file'
    AND (
      LOWER(REPLACE(fs_path, '.md', '')) LIKE '%' || ? || '%'
      OR LOWER(json_extract(data, '$.name')) = ?
    )
    LIMIT 1
  `,
    )
    .get(normalizedName, normalizedName) as Record<string, unknown> | null;

  if (!row) return null;
  return rowToNode(row);
}

/**
 * Smart node resolver - finds a node by various identifiers.
 *
 * Resolution order:
 * 1. Exact ID match
 * 2. ID prefix match (e.g., "abc" matches "abc123...")
 * 3. ID suffix match (e.g., "xyz" matches "...xyz")
 * 4. Exact filesystem path match
 * 5. Filename match (fs_path ends with query)
 * 6. Filename without extension (e.g., "@inbox" matches "@inbox.md")
 * 7. Content/title match (for nodes without fs_path)
 *
 * @param query - ID, path, or filename to search for
 * @param type - Optional type filter (e.g., "task", "file")
 * @returns The matching node, or null if not found
 */
export function resolveNode(query: string, type?: string): Node | null {
  const db = getDb();
  const typeFilter = type ? " AND type = ?" : "";
  const typeParams = type ? [type] : [];

  // 0. Handle explicit filesystem paths (/, ./, ../)
  // Note: ~ is expanded by the shell before reaching this code
  if (isExplicitPath(query)) {
    const absolutePath = resolve(process.cwd(), query);
    const row = db
      .query(`SELECT * FROM nodes WHERE fs_path = ?${typeFilter}`)
      .get(absolutePath, ...typeParams) as Record<string, unknown> | null;
    if (row) return rowToNode(row);
    // Don't fall through for explicit paths - they should match exactly or not at all
    // This prevents /some/path from accidentally matching an ID suffix
    return null;
  }

  // 1. Exact ID match
  let row = db
    .query(`SELECT * FROM nodes WHERE id = ?${typeFilter}`)
    .get(query, ...typeParams) as Record<string, unknown> | null;
  if (row) return rowToNode(row);

  // 2. ID prefix match
  row = db
    .query(`SELECT * FROM nodes WHERE id LIKE ?${typeFilter}`)
    .get(`${query}%`, ...typeParams) as Record<string, unknown> | null;
  if (row) return rowToNode(row);

  // 3. ID suffix match (for short IDs like the last 8 chars)
  row = db
    .query(`SELECT * FROM nodes WHERE id LIKE ?${typeFilter}`)
    .get(`%${query}`, ...typeParams) as Record<string, unknown> | null;
  if (row) return rowToNode(row);

  // 4. Exact filesystem path match
  row = db
    .query(`SELECT * FROM nodes WHERE fs_path = ?${typeFilter}`)
    .get(query, ...typeParams) as Record<string, unknown> | null;
  if (row) return rowToNode(row);

  // 5. Filename match (fs_path ends with the query)
  // This handles cases like "@inbox.md" when full path is "/path/to/@inbox.md"
  row = db
    .query(`SELECT * FROM nodes WHERE fs_path LIKE ?${typeFilter}`)
    .get(`%/${query}`, ...typeParams) as Record<string, unknown> | null;
  if (row) return rowToNode(row);

  // Also try without leading slash (handles bare filenames)
  row = db
    .query(`SELECT * FROM nodes WHERE fs_path LIKE ?${typeFilter}`)
    .get(`%${query}`, ...typeParams) as Record<string, unknown> | null;
  if (row) return rowToNode(row);

  // 6. Filename without extension (e.g., "@inbox" matches "@inbox.md")
  if (!query.includes(".")) {
    row = db
      .query(`SELECT * FROM nodes WHERE fs_path LIKE ?${typeFilter}`)
      .get(`%/${query}.md`, ...typeParams) as Record<string, unknown> | null;
    if (row) return rowToNode(row);

    row = db
      .query(`SELECT * FROM nodes WHERE fs_path LIKE ?${typeFilter}`)
      .get(`%${query}.md`, ...typeParams) as Record<string, unknown> | null;
    if (row) return rowToNode(row);
  }

  // 7. Content/title match (exact match on content field)
  row = db
    .query(`SELECT * FROM nodes WHERE content = ?${typeFilter}`)
    .get(query, ...typeParams) as Record<string, unknown> | null;
  if (row) return rowToNode(row);

  return null;
}

/**
 * Smart task resolver - like resolveNode but only returns tasks.
 *
 * @param query - ID, path, or filename to search for
 * @returns The matching task node, or null if not found
 */
export function resolveTask(query: string): Node | null {
  return resolveNode(query, "task");
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
      ORDER BY parent_idx, created_at
    `,
      )
      .all() as Record<string, unknown>[];
  } else {
    rows = db
      .query(
        `
      SELECT * FROM nodes
      WHERE parent_id = ?
      ORDER BY parent_idx, created_at
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
    ORDER BY parent_idx, created_at
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
 * Get all symlinks pointing to a given node
 * Used to find which boards/sections contain a task
 */
export function getSymlinksTo(nodeId: string): Node[] {
  const db = getDb();
  const rows = db
    .query(
      `
    SELECT * FROM nodes
    WHERE symlink_to = ?
    ORDER BY parent_idx ASC
  `,
    )
    .all(nodeId) as Record<string, unknown>[];

  return rows.map(rowToNode);
}

/**
 * Convert a search query to FTS5 syntax
 * - Quoted phrases become FTS5 phrase queries
 * - Unquoted terms use prefix matching with *
 */
export function toFts5Query(query: string): string {
  const parts: string[] = [];

  // Extract quoted phrases and replace with placeholders
  const phrases: string[] = [];
  const remaining = query.replace(/"([^"]+)"/g, (_, phrase) => {
    phrases.push(phrase);
    return `__PHRASE_${phrases.length - 1}__`;
  });

  // Split remaining into tokens
  const tokens = remaining.split(/\s+/).filter((t) => t.length > 0);

  for (const token of tokens) {
    // Check if this is a phrase placeholder
    const phraseMatch = token.match(/^__PHRASE_(\d+)__$/);
    if (phraseMatch && phraseMatch[1] !== undefined) {
      const idx = parseInt(phraseMatch[1], 10);
      const phrase = phrases[idx];
      if (phrase !== undefined) {
        // FTS5 phrase syntax: "word1 word2 word3"
        parts.push(`"${phrase}"`);
      }
    } else if (token.startsWith("-")) {
      // Negation: NOT term
      parts.push(`NOT ${token.slice(1)}*`);
    } else {
      // Regular term with prefix matching
      parts.push(`${token}*`);
    }
  }

  return parts.join(" ");
}

/**
 * Full-text search
 */
export function search(query: string, limit = 50): Node[] {
  const db = getDb();
  const ftsQuery = toFts5Query(query);

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
    .all(ftsQuery, limit) as Record<string, unknown>[];

  return rows.map(rowToNode);
}

/**
 * Search result with snippet highlighting
 */
export interface SearchResult {
  node: Node;
  snippet: string;
}

/**
 * Full-text search with snippet highlighting
 *
 * Returns nodes with a snippet showing matching context.
 * Uses FTS5 snippet() function for efficient highlighting.
 *
 * @param query - Search query (supports "quoted phrases" and individual terms)
 * @param limit - Maximum results to return
 * @param snippetOptions - Options for snippet generation
 * @returns Array of search results with highlighted snippets
 */
export function searchWithSnippet(
  query: string,
  limit = 50,
  snippetOptions: {
    startMark?: string;
    endMark?: string;
    ellipsis?: string;
    maxTokens?: number;
  } = {},
): SearchResult[] {
  const db = getDb();
  const ftsQuery = toFts5Query(query);

  const {
    startMark = "<<",
    endMark = ">>",
    ellipsis = "...",
    maxTokens = 32,
  } = snippetOptions;

  // Use snippet() function for highlighting
  // snippet(fts_table, column_idx, start_mark, end_mark, ellipsis, max_tokens)
  // column_idx 1 = content column
  const rows = db
    .query(
      `
    SELECT n.*, snippet(nodes_fts, 1, ?, ?, ?, ?) as snippet
    FROM nodes n
    JOIN nodes_fts f ON n.id = f.id
    WHERE nodes_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `,
    )
    .all(startMark, endMark, ellipsis, maxTokens, ftsQuery, limit) as Array<
    Record<string, unknown> & { snippet: string }
  >;

  return rows.map((row) => ({
    node: rowToNode(row),
    snippet: row.snippet ?? "",
  }));
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
 * For section nodes, computes title and rules from content on-the-fly
 */
function rowToNode(row: Record<string, unknown>): Node {
  const type = row.type as NodeType;
  const content = row.content as string | undefined;

  // For sections, compute title and rules from content (first line only)
  let title: string | undefined;
  let rules: NodeRules | undefined;
  if (type === "section" && content) {
    const firstLine = content.split("\n")[0] ?? content;
    const parsed = parseHeadingRules(firstLine);
    title = parsed.title;
    if (Object.keys(parsed.rules).length > 0) {
      rules = parsed.rules;
    }
  }

  return {
    id: row.id as string,
    type,
    parent_id: row.parent_id as string | null,
    parent_idx: row.parent_idx as number,
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
    content,
    content_hash: row.content_hash as string | undefined,
    title,
    rules,
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
  embedded: boolean;
  created_at: number;
}

/**
 * Add a link from source to target
 */
export function addLink(link: Omit<Link, "created_at">): void {
  const db = getDb();
  db.run(
    `
    INSERT OR REPLACE INTO links (source_id, target_name, target_id, section, block_id, alias, embedded, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
    [
      link.source_id,
      link.target_name,
      link.target_id,
      link.section,
      link.block_id,
      link.alias,
      link.embedded ? 1 : 0,
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
    embedded: Boolean(row.embedded),
    created_at: row.created_at as number,
  };
}

// Export the applyEvent function for use with emit
export const dbApplyEvent = { applyEvent };

/**
 * Move a node to a new parent with a new sort order.
 * Handles both memory mode (direct SQL) and disk mode (via emit).
 *
 * This is the proper store-layer API for moving nodes.
 * UI components should use this instead of raw SQL.
 */
export function moveNode(
  nodeId: string,
  newParentId: string,
  newParentIdx: number,
): void {
  if (isMemoryMode()) {
    const db = getDb();
    db.run(
      "UPDATE nodes SET parent_id = ?, parent_idx = ?, updated_at = ? WHERE id = ?",
      [newParentId, newParentIdx, Date.now(), nodeId],
    );
  } else {
    emit({
      type: "node_moved",
      actor: "user",
      target: nodeId,
      data: {
        parent_id: newParentId,
        parent_idx: newParentIdx,
      },
    });
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
  nodeId: string,
  updates: Record<string, unknown>,
): void {
  if (isMemoryMode()) {
    const db = getDb();
    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    for (const [key, value] of Object.entries(updates)) {
      sets.push(`${key} = ?`);
      values.push(value as string | number | null);
    }

    sets.push("updated_at = ?");
    values.push(Date.now());
    values.push(nodeId);

    const sql = `UPDATE nodes SET ${sets.join(", ")} WHERE id = ?`;
    db.run(sql, values);
  } else {
    emit({
      type: "node_updated",
      actor: "user",
      target: nodeId,
      data: updates,
    });
  }
}

/**
 * Delete a node from the database.
 * Handles both memory mode (direct SQL) and disk mode (via emit).
 *
 * This is the proper store-layer API for deleting nodes.
 * UI components should use this instead of raw SQL.
 */
export function deleteNode(nodeId: string): void {
  if (isMemoryMode()) {
    const db = getDb();
    db.run("DELETE FROM nodes WHERE id = ?", [nodeId]);
  } else {
    emit({
      type: "node_deleted",
      actor: "user",
      target: nodeId,
      data: {},
    });
  }
}
