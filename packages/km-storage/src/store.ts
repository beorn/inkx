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
import {
  existsSync,
  readdirSync,
  statSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
} from "fs";
import { join, dirname, basename, relative } from "path";
import { ulid } from "ulid";
import type { Node, NodeType, TaskStatus } from "@km/core";
import { setKmDir, emitNodeMoved } from "./emit.ts";
import { parseMarkdownToNodes } from "@km/markdown";

/**
 * NodeStore interface - unified access to node storage
 */
export interface NodeStore {
  readonly mode: "memory" | "disk";
  readonly rootPath: string;

  // Internal database access (for backwards compatibility with db.ts)
  getDatabase(): Database;

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
  moveNode(id: string, newParentId: string | null, parentIdx?: number): void;
  appendTaskToFile(
    filePath: string,
    content: string,
    options?: { ensure?: boolean },
  ): void;
  cloneTask(sourceId: string, changes: Partial<Node>): string | null;

  // Filesystem helpers (avoids CLI importing fs directly)
  pathExists(relativePath: string): boolean;
  getFileInfo(
    relativePath: string,
  ): { isDirectory: boolean; size: number } | null;

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
  parent_idx REAL DEFAULT 0,

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
    parent_idx: row.parent_idx as number,
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

  getDatabase(): Database {
    return this.db;
  }

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
          "SELECT * FROM nodes WHERE parent_id IS NULL ORDER BY parent_idx, created_at",
        )
        .all() as Record<string, unknown>[];
    } else {
      rows = this.db
        .query(
          "SELECT * FROM nodes WHERE parent_id = ? ORDER BY parent_idx, created_at",
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
      `,
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
        SELECT * FROM subtree ORDER BY parent_idx, created_at
      `,
      )
      .all(rootId) as Record<string, unknown>[];
    return rows.map(rowToNode);
  }

  getAllNodes(): Node[] {
    const rows = this.db.query("SELECT * FROM nodes").all() as Record<
      string,
      unknown
    >[];
    return rows.map(rowToNode);
  }

  getAllTasks(): Node[] {
    const rows = this.db
      .query(
        `SELECT * FROM nodes WHERE type = 'task'
         ORDER BY task_status, priority ASC, due_date ASC, created_at ASC`,
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
         ORDER BY priority ASC, due_date ASC, created_at ASC`,
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
           ORDER BY rank LIMIT ?`,
        )
        .all(query, limit) as Record<string, unknown>[];
      return rows.map(rowToNode);
    } catch {
      // FTS might fail, fallback to simple search
      const rows = this.db
        .query(`SELECT * FROM nodes WHERE content LIKE ? LIMIT ?`)
        .all(`%${query}%`, limit) as Record<string, unknown>[];
      return rows.map(rowToNode);
    }
  }

  abstract updateNode(id: string, changes: Partial<Node>): void;
  abstract moveNode(
    id: string,
    newParentId: string | null,
    parentIdx?: number,
  ): void;
  abstract appendTaskToFile(
    filePath: string,
    content: string,
    options?: { ensure?: boolean },
  ): void;
  abstract cloneTask(sourceId: string, changes: Partial<Node>): string | null;
  abstract refresh(): void;
  abstract close(): void;

  /**
   * Check if a path exists relative to rootPath
   */
  pathExists(relativePath: string): boolean {
    const fullPath = join(this.rootPath, relativePath);
    return existsSync(fullPath);
  }

  /**
   * Get file info for a path relative to rootPath
   */
  getFileInfo(
    relativePath: string,
  ): { isDirectory: boolean; size: number } | null {
    const fullPath = join(this.rootPath, relativePath);
    try {
      const stats = statSync(fullPath);
      return {
        isDirectory: stats.isDirectory(),
        size: stats.size,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get file path for a node by traversing up to its file ancestor
   */
  protected getFilePathForNode(node: Node): string | null {
    let current: Node | null = node;
    while (current) {
      if (current.fs_path && current.type === "file") {
        return current.fs_path;
      }
      if (!current.parent_id) break;
      current = this.getNode(current.parent_id);
    }
    return null;
  }

  /**
   * Write task status change back to markdown file (synchronously for CLI)
   */
  protected writeTaskStatusToFile(
    filePath: string,
    mdLine: number,
    newStatus: TaskStatus,
  ): void {
    try {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      if (mdLine >= lines.length) return;

      const line = lines[mdLine];
      if (!line) return;

      // Map status to task mark
      const newMark =
        newStatus === "done"
          ? "x"
          : newStatus === "blocked"
            ? "!"
            : newStatus === "dropped"
              ? "-"
              : newStatus === "wip"
                ? "/"
                : " "; // todo

      lines[mdLine] = line.replace(/^(\s*-\s+\[).(])/, `$1${newMark}$2`);

      // Use synchronous write to ensure completion before CLI exits
      writeFileSync(filePath, lines.join("\n"));
    } catch {
      // Ignore write errors
    }
  }
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
    const node = this.getNode(id);
    if (!node) return;

    // Update SQLite database
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

    // Write through to markdown file for task status changes (bidirectional sync)
    if (changes.task_status !== undefined && node.md_line !== undefined) {
      // Tasks may not have fs_path directly - look up from parent file node
      const filePath = node.fs_path || this.getFilePathForNode(node);
      if (filePath) {
        this.writeTaskStatusToFile(filePath, node.md_line, changes.task_status);
      }
    }
  }

  moveNode(id: string, newParentId: string | null, parentIdx?: number): void {
    const node = this.getNode(id);
    if (!node) return;

    const idx = parentIdx ?? Date.now();
    this.db.run(
      `UPDATE nodes SET parent_id = ?, parent_idx = ?, updated_at = ? WHERE id = ?`,
      [newParentId, idx, Date.now(), id],
    );

    // Emit event for persistence
    emitNodeMoved("store", id, { parent_id: newParentId, parent_idx: idx });
  }

  appendTaskToFile(
    filePath: string,
    content: string,
    options?: { ensure?: boolean },
  ): void {
    const fullPath = filePath.startsWith("/")
      ? filePath
      : join(this.rootPath, filePath);

    // Ensure directory exists if requested
    if (options?.ensure) {
      const dir = dirname(fullPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      if (!existsSync(fullPath)) {
        writeFileSync(
          fullPath,
          `---\ntitle: ${basename(fullPath).replace(/\.md$/, "")}\n---\n\n`,
        );
      }
    }

    appendFileSync(fullPath, content);
  }

  cloneTask(sourceId: string, changes: Partial<Node>): string | null {
    const source = this.getNode(sourceId);
    if (!source || source.type !== "task") return null;

    // Generate new ID
    const newId = ulid();
    const now = Date.now();

    // Clone the task with changes - use definite values
    const id = newId;
    const type = "task";
    const parent_id = changes.parent_id ?? source.parent_id;
    const parent_idx = changes.parent_idx ?? source.parent_idx + 0.001;
    const symlink_to = null;
    const task_status = changes.task_status ?? "todo";
    const task_mark = changes.task_mark ?? " ";
    const assigned_to = changes.assigned_to ?? source.assigned_to ?? null;
    const due_date = changes.due_date ?? source.due_date ?? null;
    const scheduled_date =
      changes.scheduled_date ?? source.scheduled_date ?? null;
    const priority = changes.priority ?? source.priority ?? null;
    const content = changes.content ?? source.content ?? "";
    const data = JSON.stringify({
      ...source.data,
      ...changes.data,
      recur_prev: sourceId, // Link back to source
    });

    // Insert into database
    this.db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, symlink_to,
        task_status, task_mark, assigned_to, due_date, scheduled_date,
        priority, content, data, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        type,
        parent_id,
        parent_idx,
        symlink_to,
        task_status,
        task_mark,
        assigned_to,
        due_date,
        scheduled_date,
        priority,
        content,
        data,
        now,
        now,
        newId,
      ],
    );

    // If the source task is in a file, append the new task to that file
    const filePath = this.getFilePathForNode(source);
    if (filePath && content) {
      // Build task line with metadata
      let taskLine = `\n- [ ] ${content}`;
      // Remove old due date from content if present
      taskLine = taskLine.replace(/\s*due:\d{4}-\d{2}-\d{2}/g, "");
      if (due_date) {
        taskLine += ` due:${due_date}`;
      }
      appendFileSync(filePath, taskLine);
    }

    return newId;
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
  private scanDirectory(
    dirPath: string,
    parentId: string | null,
    sortOrder: number,
  ): void {
    if (!existsSync(dirPath)) return;

    // Skip hidden directories and common excludes (but not the root directory)
    if (parentId !== null) {
      const name = basename(dirPath);
      if (name.startsWith(".") || name === "node_modules") return;
    }

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
          parent_idx: order++,
        });

        // Recurse
        this.scanDirectory(fullPath, folderId, 0);
      } else if (entry.isFile()) {
        const isMarkdown = entry.name.endsWith(".md");

        if (isMarkdown) {
          // Use the full km-markdown parser for .md files
          this.parseMarkdownFile(fullPath, parentId, order++);
        } else {
          // Create simple file node for non-markdown files
          const fileId = this.generateId(fullPath);
          this.insertNode({
            id: fileId,
            type: "file",
            parent_id: parentId,
            fs_path: fullPath,
            content: entry.name,
            parent_idx: order++,
          });
        }
      }
    }
  }

  /**
   * Parse a markdown file using the km-markdown parser and insert all nodes.
   *
   * Uses parseMarkdownToNodes which handles:
   * - Full markdown syntax (headings, tasks, lists)
   * - Frontmatter parsing
   * - H1 merging into file node
   * - Wiki links and inline fields
   * - Task metadata extraction
   */
  private parseMarkdownFile(
    filePath: string,
    folderParentId: string | null,
    sortOrder: number,
  ): void {
    try {
      const content = readFileSync(filePath, "utf-8");
      const nodes = parseMarkdownToNodes(content, filePath);

      // The first node is always the file node
      const fileNode = nodes[0];
      if (!fileNode || fileNode.type !== "file") {
        return;
      }

      // Set the file node's parent to the folder
      fileNode.parent_id = folderParentId;
      fileNode.parent_idx = sortOrder;

      // Insert all nodes
      for (const node of nodes) {
        this.insertNode(node);
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
        id, type, parent_id, parent_idx, fs_path, md_line,
        content, task_status, task_mark, data, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        node.id,
        node.type,
        node.parent_id ?? null,
        node.parent_idx ?? 0,
        node.fs_path ?? null,
        node.md_line ?? null,
        node.content ?? null,
        node.task_status ?? null,
        node.task_mark ?? null,
        JSON.stringify(node.data ?? {}),
        now,
        now,
      ],
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
    if (changes.task_status !== undefined && node.md_line !== undefined) {
      // Tasks may not have fs_path directly - look up from parent file node
      const filePath = node.fs_path || this.getFilePathForNode(node);
      if (filePath) {
        this.writeTaskStatusToFile(filePath, node.md_line, changes.task_status);
      }
    }
  }

  moveNode(id: string, newParentId: string | null, parentIdx?: number): void {
    const node = this.getNode(id);
    if (!node) return;

    const idx = parentIdx ?? Date.now();
    this.db.run(
      `UPDATE nodes SET parent_id = ?, parent_idx = ?, updated_at = ? WHERE id = ?`,
      [newParentId, idx, Date.now(), id],
    );

    // Note: In memory mode, we don't emit events since there's no persistence
    // The in-memory DB is the source of truth
  }

  appendTaskToFile(
    filePath: string,
    content: string,
    options?: { ensure?: boolean },
  ): void {
    const fullPath = filePath.startsWith("/")
      ? filePath
      : join(this.rootPath, filePath);

    // Ensure directory exists if requested
    if (options?.ensure) {
      const dir = dirname(fullPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      if (!existsSync(fullPath)) {
        writeFileSync(
          fullPath,
          `---\ntitle: ${basename(fullPath).replace(/\.md$/, "")}\n---\n\n`,
        );
      }
    }

    appendFileSync(fullPath, content);

    // Re-parse the file to update in-memory state
    const existingFileNode = this.getNodeByPath(fullPath);
    if (existingFileNode) {
      // Remove the file node and all its children, then re-parse
      this.db.run(`DELETE FROM nodes WHERE fs_path = ?`, [fullPath]);
      // Re-parse with the same parent and sort order
      this.parseMarkdownFile(
        fullPath,
        existingFileNode.parent_id,
        existingFileNode.parent_idx,
      );
    }
  }

  cloneTask(sourceId: string, changes: Partial<Node>): string | null {
    const source = this.getNode(sourceId);
    if (!source || source.type !== "task") return null;

    // Generate new ID (ephemeral for memory mode)
    const newId = `clone-${Date.now()}`;
    const now = Date.now();

    // Clone the task with changes
    const id = newId;
    const type = "task";
    const parent_id = changes.parent_id ?? source.parent_id;
    const parent_idx = changes.parent_idx ?? source.parent_idx + 0.001;
    const task_status = changes.task_status ?? "todo";
    const task_mark = changes.task_mark ?? " ";
    const assigned_to = changes.assigned_to ?? source.assigned_to ?? null;
    const due_date = changes.due_date ?? source.due_date ?? null;
    const scheduled_date =
      changes.scheduled_date ?? source.scheduled_date ?? null;
    const priority = changes.priority ?? source.priority ?? null;
    const content = changes.content ?? source.content ?? "";
    const data = JSON.stringify({
      ...source.data,
      ...changes.data,
      recur_prev: sourceId,
    });

    // Insert into database
    this.db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx,
        task_status, task_mark, assigned_to, due_date, scheduled_date,
        priority, content, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        type,
        parent_id,
        parent_idx,
        task_status,
        task_mark,
        assigned_to,
        due_date,
        scheduled_date,
        priority,
        content,
        data,
        now,
        now,
      ],
    );

    // If the source task is in a file, append the new task to that file
    const filePath = this.getFilePathForNode(source);
    if (filePath && content) {
      let taskLine = `\n- [ ] ${content}`;
      taskLine = taskLine.replace(/\s*due:\d{4}-\d{2}-\d{2}/g, "");
      if (due_date) {
        taskLine += ` due:${due_date}`;
      }
      appendFileSync(filePath, taskLine);
    }

    return newId;
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
 * @param startPath - Directory to use as root
 * @param searchAncestors - If true (default), search for .km/ in ancestors.
 *                          If false, only check startPath directly for .km/
 */
export function initStore(
  startPath?: string,
  searchAncestors = true,
): NodeStore {
  const path = startPath ?? process.cwd();

  // When a path is explicitly provided, check only that directory for .km/
  // When no path is provided (using cwd), search ancestors for .km/
  const kmPath = searchAncestors
    ? findKmDirectory(path)
    : findKmDirectoryExact(path);

  if (kmPath) {
    // Update global kmDir so getKmDir() returns the correct path
    setKmDir(kmPath);
    storeInstance = new DiskStore(kmPath);
  } else {
    storeInstance = new MemoryStore(path);
  }

  return storeInstance;
}

/**
 * Check if .km directory exists in the exact path (no ancestor search)
 */
function findKmDirectoryExact(path: string): string | null {
  const kmPath = join(path, ".km");
  if (existsSync(kmPath) && statSync(kmPath).isDirectory()) {
    return kmPath;
  }
  return null;
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
