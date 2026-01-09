/**
 * Store Abstraction Layer
 *
 * Provides a unified interface for both disk and memory modes.
 *
 * - DiskStore: Uses .km/state.db, event-sourced, stable IDs
 * - MemoryStore: Uses :memory: SQLite, rebuilt each run, ephemeral IDs
 *
 * Both modes are read-write. The difference is persistence.
 */

import { Database } from "bun:sqlite";
import { existsSync, readdirSync, statSync, readFileSync } from "fs";
import { join, dirname, basename, relative } from "path";
import type { Node, NodeType, TaskStatus } from "./types.ts";

/**
 * NodeStore interface - unified access to node storage
 */
export interface NodeStore {
  readonly mode: "memory" | "disk";
  readonly rootPath: string;

  // Read operations
  getNode(id: string): Node | null;
  getNodeByPath(fsPath: string): Node | null;
  getChildren(parentId: string | null): Node[];
  getAncestors(nodeId: string): Node[];
  getSubtree(rootId: string): Node[];
  getAllNodes(): Node[];
  getAllTasks(): Node[];
  getTasksByStatus(status: TaskStatus | TaskStatus[]): Node[];
  search(query: string, limit?: number): Node[];

  // Write operations
  updateNode(id: string, changes: Partial<Node>): void;

  // Lifecycle
  refresh(): void;
  close(): void;
}

/**
 * SQL schema (shared between modes)
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
  md_line INTEGER,

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
CREATE INDEX IF NOT EXISTS idx_nodes_task_status ON nodes(task_status);

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
`;

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
    md_line: row.md_line as number | undefined,
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

/**
 * Base store implementation with shared query methods
 */
abstract class BaseStore implements NodeStore {
  abstract readonly mode: "memory" | "disk";
  abstract readonly rootPath: string;
  protected abstract db: Database;

  getNode(id: string): Node | null {
    const row = this.db
      .query("SELECT * FROM nodes WHERE id = ?")
      .get(id) as Record<string, unknown> | null;
    return row ? rowToNode(row) : null;
  }

  getNodeByPath(fsPath: string): Node | null {
    const row = this.db
      .query("SELECT * FROM nodes WHERE fs_path = ?")
      .get(fsPath) as Record<string, unknown> | null;
    return row ? rowToNode(row) : null;
  }

  getChildren(parentId: string | null): Node[] {
    let rows: Record<string, unknown>[];
    if (parentId === null) {
      rows = this.db
        .query(
          "SELECT * FROM nodes WHERE parent_id IS NULL ORDER BY sort_order, created_at"
        )
        .all() as Record<string, unknown>[];
    } else {
      rows = this.db
        .query(
          "SELECT * FROM nodes WHERE parent_id = ? ORDER BY sort_order, created_at"
        )
        .all(parentId) as Record<string, unknown>[];
    }
    return rows.map(rowToNode);
  }

  getAncestors(nodeId: string): Node[] {
    const rows = this.db
      .query(
        `
        WITH RECURSIVE ancestors AS (
          SELECT * FROM nodes WHERE id = (SELECT parent_id FROM nodes WHERE id = ?)
          UNION ALL
          SELECT n.* FROM nodes n
          JOIN ancestors a ON n.id = a.parent_id
        )
        SELECT * FROM ancestors
      `
      )
      .all(nodeId) as Record<string, unknown>[];
    return rows.map(rowToNode).reverse();
  }

  getSubtree(rootId: string): Node[] {
    const rows = this.db
      .query(
        `
        WITH RECURSIVE subtree AS (
          SELECT * FROM nodes WHERE id = ?
          UNION ALL
          SELECT n.* FROM nodes n
          JOIN subtree s ON n.parent_id = s.id
        )
        SELECT * FROM subtree ORDER BY sort_order, created_at
      `
      )
      .all(rootId) as Record<string, unknown>[];
    return rows.map(rowToNode);
  }

  getAllNodes(): Node[] {
    const rows = this.db
      .query("SELECT * FROM nodes")
      .all() as Record<string, unknown>[];
    return rows.map(rowToNode);
  }

  getAllTasks(): Node[] {
    const rows = this.db
      .query(
        `SELECT * FROM nodes WHERE type = 'task'
         ORDER BY task_status, priority ASC, due_date ASC, created_at ASC`
      )
      .all() as Record<string, unknown>[];
    return rows.map(rowToNode);
  }

  getTasksByStatus(status: TaskStatus | TaskStatus[]): Node[] {
    const statuses = Array.isArray(status) ? status : [status];
    const placeholders = statuses.map(() => "?").join(", ");
    const rows = this.db
      .query(
        `SELECT * FROM nodes WHERE type = 'task' AND task_status IN (${placeholders})
         ORDER BY priority ASC, due_date ASC, created_at ASC`
      )
      .all(...statuses) as Record<string, unknown>[];
    return rows.map(rowToNode);
  }

  search(query: string, limit = 50): Node[] {
    try {
      const rows = this.db
        .query(
          `SELECT n.* FROM nodes n
           JOIN nodes_fts f ON n.id = f.id
           WHERE nodes_fts MATCH ?
           ORDER BY rank LIMIT ?`
        )
        .all(query, limit) as Record<string, unknown>[];
      return rows.map(rowToNode);
    } catch {
      // FTS might fail, fallback to simple search
      const rows = this.db
        .query(
          `SELECT * FROM nodes WHERE content LIKE ? LIMIT ?`
        )
        .all(`%${query}%`, limit) as Record<string, unknown>[];
      return rows.map(rowToNode);
    }
  }

  abstract updateNode(id: string, changes: Partial<Node>): void;
  abstract refresh(): void;
  abstract close(): void;
}

/**
 * DiskStore - persisted mode with event sourcing
 * Uses .km/state.db and events.jsonl
 */
export class DiskStore extends BaseStore {
  readonly mode = "disk" as const;
  readonly rootPath: string;
  protected db: Database;

  constructor(kmPath: string) {
    super();
    this.rootPath = dirname(kmPath);
    this.db = new Database(join(kmPath, "state.db"));
    this.db.exec(SCHEMA);
  }

  updateNode(id: string, changes: Partial<Node>): void {
    // In disk mode, updates go through events
    // This is handled by emitNodeUpdated -> applyEvent flow
    // Direct update for compatibility:
    const sets: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(changes)) {
      if (key === "id") continue;
      if (key === "data") {
        sets.push("data = json_patch(data, ?)");
        values.push(JSON.stringify(value));
      } else {
        sets.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (sets.length === 0) return;

    sets.push("updated_at = ?");
    values.push(Date.now(), id);

    this.db.run(`UPDATE nodes SET ${sets.join(", ")} WHERE id = ?`, values);
  }

  refresh(): void {
    // In disk mode, refresh means rebuild from events
    // This is handled by ensureState()
  }

  close(): void {
    this.db.close();
  }
}

/**
 * MemoryStore - in-memory mode with filesystem scanning
 * Uses :memory: SQLite, rebuilds on each run
 */
export class MemoryStore extends BaseStore {
  readonly mode = "memory" as const;
  readonly rootPath: string;
  protected db: Database;

  constructor(rootPath: string) {
    super();
    this.rootPath = rootPath;
    this.db = new Database(":memory:");
    this.db.exec(SCHEMA);
    this.scanFilesystem();
  }

  /**
   * Scan filesystem and populate in-memory database
   */
  private scanFilesystem(): void {
    this.scanDirectory(this.rootPath, null, 0);
  }

  /**
   * Recursively scan a directory
   */
  private scanDirectory(dirPath: string, parentId: string | null, sortOrder: number): void {
    if (!existsSync(dirPath)) return;

    // Skip hidden directories and common excludes
    const name = basename(dirPath);
    if (name.startsWith(".") || name === "node_modules") return;

    const entries = readdirSync(dirPath, { withFileTypes: true });
    let order = 0;

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      // Skip hidden files
      if (entry.name.startsWith(".")) continue;

      if (entry.isDirectory()) {
        // Create folder node
        const folderId = this.generateId(fullPath);
        this.insertNode({
          id: folderId,
          type: "folder",
          parent_id: parentId,
          fs_path: fullPath,
          content: entry.name,
          sort_order: order++,
        });

        // Recurse
        this.scanDirectory(fullPath, folderId, 0);
      } else if (entry.name.endsWith(".md")) {
        // Create file node and parse content
        const fileId = this.generateId(fullPath);
        this.insertNode({
          id: fileId,
          type: "file",
          parent_id: parentId,
          fs_path: fullPath,
          content: entry.name.replace(/\.md$/, ""),
          sort_order: order++,
        });

        // Parse markdown content
        this.parseMarkdownFile(fullPath, fileId);
      }
    }
  }

  /**
   * Parse a markdown file and create nodes for its content
   */
  private parseMarkdownFile(filePath: string, parentId: string): void {
    try {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      let currentSection: string | null = parentId;
      let sectionStack: { id: string; depth: number }[] = [];

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];

        // Check for heading
        const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (headingMatch) {
          const depth = headingMatch[1].length;
          const headingText = headingMatch[2].trim();

          // Pop sections until we find a parent at lower depth
          while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].depth >= depth) {
            sectionStack.pop();
          }

          const sectionParent = sectionStack.length > 0
            ? sectionStack[sectionStack.length - 1].id
            : parentId;

          const sectionId = this.generateId(filePath, lineNum);
          this.insertNode({
            id: sectionId,
            type: "section",
            parent_id: sectionParent,
            fs_path: filePath,
            md_line: lineNum,
            content: headingText,
            data: { depth },
            sort_order: lineNum,
          });

          sectionStack.push({ id: sectionId, depth });
          currentSection = sectionId;
          continue;
        }

        // Check for task
        const taskMatch = line.match(/^(\s*)-\s+\[(.)\]\s+(.+)$/);
        if (taskMatch) {
          const mark = taskMatch[2];
          const taskContent = taskMatch[3].trim();
          const taskId = this.generateId(filePath, lineNum);

          let status: TaskStatus = "open";
          if (mark === "x" || mark === "X") {
            status = "done";
          } else if (mark === "/" || mark === "-") {
            status = "in_progress";
          }

          this.insertNode({
            id: taskId,
            type: "task",
            parent_id: currentSection,
            fs_path: filePath,
            md_line: lineNum,
            content: taskContent,
            task_status: status,
            task_mark: mark as Node["task_mark"],
            sort_order: lineNum,
          });
        }
      }
    } catch {
      // Skip files that can't be read
    }
  }

  /**
   * Generate ephemeral ID based on path and line
   */
  private generateId(filePath: string, lineNum?: number): string {
    const relPath = relative(this.rootPath, filePath);
    if (lineNum !== undefined) {
      return `${relPath}:${lineNum}`;
    }
    return relPath;
  }

  /**
   * Insert a node into the in-memory database
   */
  private insertNode(node: Partial<Node>): void {
    const now = Date.now();
    this.db.run(
      `INSERT INTO nodes (
        id, type, parent_id, sort_order, fs_path, md_line,
        content, task_status, task_mark, data, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        node.id,
        node.type,
        node.parent_id ?? null,
        node.sort_order ?? 0,
        node.fs_path ?? null,
        node.md_line ?? null,
        node.content ?? null,
        node.task_status ?? null,
        node.task_mark ?? null,
        JSON.stringify(node.data ?? {}),
        now,
        now,
      ]
    );
  }

  /**
   * Update a node and write through to the markdown file
   */
  updateNode(id: string, changes: Partial<Node>): void {
    const node = this.getNode(id);
    if (!node) return;

    // Update in-memory SQLite
    const sets: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(changes)) {
      if (key === "id") continue;
      sets.push(`${key} = ?`);
      values.push(value);
    }

    if (sets.length === 0) return;

    sets.push("updated_at = ?");
    values.push(Date.now(), id);

    this.db.run(`UPDATE nodes SET ${sets.join(", ")} WHERE id = ?`, values);

    // Write through to markdown file for task status changes
    if (changes.task_status !== undefined && node.fs_path && node.md_line !== undefined) {
      this.writeTaskToFile(node, changes.task_status);
    }
  }

  /**
   * Write task status change back to markdown file
   */
  private writeTaskToFile(node: Node, newStatus: TaskStatus): void {
    if (!node.fs_path || node.md_line === undefined) return;

    try {
      const content = readFileSync(node.fs_path, "utf-8");
      const lines = content.split("\n");

      if (node.md_line >= lines.length) return;

      const line = lines[node.md_line];
      const newMark = newStatus === "done" ? "x" : newStatus === "in_progress" ? "/" : " ";

      lines[node.md_line] = line.replace(
        /^(\s*-\s+\[).(])/,
        `$1${newMark}$2`
      );

      Bun.write(node.fs_path, lines.join("\n"));
    } catch {
      // Ignore write errors
    }
  }

  refresh(): void {
    // Clear and rescan
    this.db.run("DELETE FROM nodes");
    this.scanFilesystem();
  }

  close(): void {
    this.db.close();
  }
}

// Singleton store instance
let storeInstance: NodeStore | null = null;

/**
 * Detect mode and initialize appropriate store
 */
export function initStore(startPath?: string): NodeStore {
  const path = startPath ?? process.cwd();
  const kmPath = findKmDirectory(path);

  if (kmPath) {
    storeInstance = new DiskStore(kmPath);
  } else {
    storeInstance = new MemoryStore(path);
  }

  return storeInstance;
}

/**
 * Get the current store instance
 */
export function getStore(): NodeStore {
  if (!storeInstance) {
    return initStore();
  }
  return storeInstance;
}

/**
 * Close and reset the store
 */
export function closeStore(): void {
  if (storeInstance) {
    storeInstance.close();
    storeInstance = null;
  }
}

/**
 * Find .km directory in path or ancestors
 */
function findKmDirectory(startPath: string): string | null {
  let current = startPath;
  const root = "/";

  while (current !== root) {
    const kmPath = join(current, ".km");
    if (existsSync(kmPath) && statSync(kmPath).isDirectory()) {
      return kmPath;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}
