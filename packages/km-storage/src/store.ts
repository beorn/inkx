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

import { Database, type SQLQueryBindings } from "bun:sqlite"
import {
  existsSync,
  readdirSync,
  statSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
} from "fs"
import { join, dirname, basename, relative } from "path"
import { ulid } from "ulid"
import { getMarkForStatus } from "@km/core"
import type { KNode, TaskStatus } from "@km/core"
import { setKmDir, emitNodeMoved } from "./emit.ts"
import { parseMarkdownWithLinks } from "@km/markdown"
import { SCHEMA, MIGRATIONS } from "./schema.ts"
import { addLink, setDb } from "./db.ts"
import {
  findChildByContent,
  findFileByName,
} from "./db-queries/wikilink-resolver.ts"
import { rowToNode } from "./db-queries/index.ts"

/**
 * Apply schema migrations to an existing database.
 * Each migration is idempotent - safe to run multiple times.
 */
function applyMigrations(db: Database): void {
  // Check if links table has relationship column
  const columns = db.query("PRAGMA table_info(links)").all() as {
    name: string
  }[]
  const hasRelationship = columns.some((c) => c.name === "relationship")

  if (!hasRelationship) {
    // Apply migrations - ALTER TABLE will add the column
    db.exec(MIGRATIONS)
  }
}

/**
 * NodeStore interface - unified access to node storage
 */
export interface NodeStore extends Disposable {
  readonly mode: "memory" | "disk"
  readonly rootPath: string

  // Internal database access (for setDb() calls that configure global state)
  getDatabase(): Database

  // Read operations
  getNode(id: string): KNode | null
  getNodeByPath(fsPath: string): KNode | null
  getChildren(parentId: string | null): KNode[]
  getAncestors(nodeId: string): KNode[]
  getSubtree(rootId: string): KNode[]
  getAllNodes(): KNode[]
  getAllTasks(): KNode[]
  getTasksByStatus(status: TaskStatus | TaskStatus[]): KNode[]
  search(query: string, limit?: number): KNode[]

  // Write operations
  updateNode(id: string, changes: Partial<KNode>): void
  moveNode(id: string, newParentId: string | null, parentIdx?: number): void
  appendTaskToFile(
    filePath: string,
    content: string,
    options?: { ensure?: boolean },
  ): void
  cloneTask(sourceId: string, changes: Partial<KNode>): string | null

  // Filesystem helpers (avoids CLI importing fs directly)
  pathExists(relativePath: string): boolean
  getFileInfo(
    relativePath: string,
  ): { isDirectory: boolean; size: number } | null

  // Lifecycle
  refresh(): void
  close(): void
}

/**
 * Base store implementation with shared query methods
 */
abstract class BaseStore implements NodeStore {
  abstract readonly mode: "memory" | "disk"
  abstract readonly rootPath: string
  protected abstract db: Database

  getDatabase(): Database {
    return this.db
  }

  getNode(id: string): KNode | null {
    const row = this.db
      .query("SELECT * FROM nodes WHERE id = ?")
      .get(id) as Record<string, unknown> | null
    return row ? rowToNode(row) : null
  }

  getNodeByPath(fsPath: string): KNode | null {
    const row = this.db
      .query("SELECT * FROM nodes WHERE fs_path = ?")
      .get(fsPath) as Record<string, unknown> | null
    return row ? rowToNode(row) : null
  }

  getChildren(parentId: string | null): KNode[] {
    let rows: Record<string, unknown>[]
    if (parentId === null) {
      rows = this.db
        .query(
          "SELECT * FROM nodes WHERE parent_id IS NULL ORDER BY parent_idx, created_at",
        )
        .all() as Record<string, unknown>[]
    } else {
      rows = this.db
        .query(
          "SELECT * FROM nodes WHERE parent_id = ? ORDER BY parent_idx, created_at",
        )
        .all(parentId) as Record<string, unknown>[]
    }
    return rows.map(rowToNode)
  }

  getAncestors(nodeId: string): KNode[] {
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
      .all(nodeId) as Record<string, unknown>[]
    return rows.map(rowToNode).reverse()
  }

  getSubtree(rootId: string): KNode[] {
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
      .all(rootId) as Record<string, unknown>[]
    return rows.map(rowToNode)
  }

  getAllNodes(): KNode[] {
    const rows = this.db.query("SELECT * FROM nodes").all() as Record<
      string,
      unknown
    >[]
    return rows.map(rowToNode)
  }

  getAllTasks(): KNode[] {
    const rows = this.db
      .query(
        `SELECT * FROM nodes WHERE type = 'task'
         ORDER BY task_status, priority ASC, due_date ASC, created_at ASC`,
      )
      .all() as Record<string, unknown>[]
    return rows.map(rowToNode)
  }

  getTasksByStatus(status: TaskStatus | TaskStatus[]): KNode[] {
    const statuses = Array.isArray(status) ? status : [status]
    const placeholders = statuses.map(() => "?").join(", ")
    const rows = this.db
      .query(
        `SELECT * FROM nodes WHERE type = 'task' AND task_status IN (${placeholders})
         ORDER BY priority ASC, due_date ASC, created_at ASC`,
      )
      .all(...statuses) as Record<string, unknown>[]
    return rows.map(rowToNode)
  }

  search(query: string, limit = 50): KNode[] {
    try {
      const rows = this.db
        .query(
          `SELECT n.* FROM nodes n
           JOIN nodes_fts f ON n.id = f.id
           WHERE nodes_fts MATCH ?
           ORDER BY rank LIMIT ?`,
        )
        .all(query, limit) as Record<string, unknown>[]
      return rows.map(rowToNode)
    } catch {
      // FTS might fail, fallback to simple search
      const rows = this.db
        .query(`SELECT * FROM nodes WHERE content LIKE ? LIMIT ?`)
        .all(`%${query}%`, limit) as Record<string, unknown>[]
      return rows.map(rowToNode)
    }
  }

  abstract updateNode(id: string, changes: Partial<KNode>): void
  abstract moveNode(
    id: string,
    newParentId: string | null,
    parentIdx?: number,
  ): void
  abstract appendTaskToFile(
    filePath: string,
    content: string,
    options?: { ensure?: boolean },
  ): void
  abstract cloneTask(sourceId: string, changes: Partial<KNode>): string | null
  abstract refresh(): void
  abstract close(): void

  [Symbol.dispose](): void {
    this.close()
  }

  /**
   * Check if a path exists relative to rootPath
   */
  pathExists(relativePath: string): boolean {
    const fullPath = join(this.rootPath, relativePath)
    return existsSync(fullPath)
  }

  /**
   * Get file info for a path relative to rootPath
   */
  getFileInfo(
    relativePath: string,
  ): { isDirectory: boolean; size: number } | null {
    const fullPath = join(this.rootPath, relativePath)
    try {
      const stats = statSync(fullPath)
      return {
        isDirectory: stats.isDirectory(),
        size: stats.size,
      }
    } catch {
      return null
    }
  }

  /**
   * Get file path for a node by traversing up to its file ancestor
   */
  protected getFilePathForNode(node: KNode): string | null {
    let current: KNode | null = node
    while (current) {
      if (current.fs_path && current.type === "file") {
        return current.fs_path
      }
      if (!current.parent_id) break
      current = this.getNode(current.parent_id)
    }
    return null
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
      const content = readFileSync(filePath, "utf-8")
      const lines = content.split("\n")

      if (mdLine >= lines.length) return

      const line = lines[mdLine]
      if (!line) return

      const newMark = getMarkForStatus(newStatus)

      lines[mdLine] = line.replace(/^(\s*-\s+\[).(])/, `$1${newMark}$2`)

      // Use synchronous write to ensure completion before CLI exits
      writeFileSync(filePath, lines.join("\n"))
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
  readonly mode = "disk" as const
  readonly rootPath: string
  protected db: Database

  constructor(kmPath: string, options?: { inject?: { database?: Database } }) {
    super()
    this.rootPath = dirname(kmPath)
    if (options?.inject?.database) {
      this.db = options.inject.database
    } else {
      this.db = new Database(join(kmPath, "state.db"))
      this.db.exec(SCHEMA)
      applyMigrations(this.db)
    }
  }

  updateNode(id: string, changes: Partial<KNode>): void {
    const node = this.getNode(id)
    if (!node) return

    // Update SQLite database
    const sets: string[] = []
    const values: unknown[] = []

    for (const [key, value] of Object.entries(changes)) {
      if (key === "id") continue
      if (key === "data") {
        sets.push("data = json_patch(data, ?)")
        values.push(JSON.stringify(value))
      } else {
        sets.push(`${key} = ?`)
        values.push(value)
      }
    }

    if (sets.length === 0) return

    sets.push("updated_at = ?")
    values.push(Date.now(), id)

    this.db.run(
      `UPDATE nodes SET ${sets.join(", ")} WHERE id = ?`,
      values as SQLQueryBindings[],
    )

    // Write through to markdown file for task status changes (bidirectional sync)
    if (changes.task_status !== undefined && node.md_line !== undefined) {
      // Tasks may not have fs_path directly - look up from parent file node
      const filePath = node.fs_path || this.getFilePathForNode(node)
      if (filePath) {
        this.writeTaskStatusToFile(filePath, node.md_line, changes.task_status)
      }
    }
  }

  moveNode(id: string, newParentId: string | null, parentIdx?: number): void {
    const node = this.getNode(id)
    if (!node) return

    const idx = parentIdx ?? Date.now()
    this.db.run(
      `UPDATE nodes SET parent_id = ?, parent_idx = ?, updated_at = ? WHERE id = ?`,
      [newParentId, idx, Date.now(), id],
    )

    // Emit event for persistence
    emitNodeMoved("store", id, { parent_id: newParentId, parent_idx: idx })
  }

  appendTaskToFile(
    filePath: string,
    content: string,
    options?: { ensure?: boolean },
  ): void {
    const fullPath = filePath.startsWith("/")
      ? filePath
      : join(this.rootPath, filePath)

    // Ensure directory exists if requested
    if (options?.ensure) {
      const dir = dirname(fullPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      if (!existsSync(fullPath)) {
        writeFileSync(
          fullPath,
          `---\ntitle: ${basename(fullPath).replace(/\.md$/, "")}\n---\n\n`,
        )
      }
    }

    appendFileSync(fullPath, content)
  }

  cloneTask(sourceId: string, changes: Partial<KNode>): string | null {
    const source = this.getNode(sourceId)
    if (!source || source.type !== "task") return null

    // Generate new ID
    const newId = ulid()
    const now = Date.now()

    // Clone the task with changes - use definite values
    const id = newId
    const type = "task"
    const parent_id = changes.parent_id ?? source.parent_id
    const parent_idx = changes.parent_idx ?? source.parent_idx + 0.001
    const link_to = null
    const task_status = changes.task_status ?? "todo"
    const task_mark = changes.task_mark ?? " "
    const assigned_to = changes.assigned_to ?? source.assigned_to ?? null
    const due_date = changes.due_date ?? source.due_date ?? null
    const scheduled_date =
      changes.scheduled_date ?? source.scheduled_date ?? null
    const priority = changes.priority ?? source.priority ?? null
    const content = changes.content ?? source.content ?? ""
    const data = JSON.stringify({
      ...source.data,
      ...changes.data,
      recur_prev: sourceId, // Link back to source
    })

    // Insert into database
    this.db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, link_to,
        task_status, task_mark, assigned_to, due_date, scheduled_date,
        priority, content, data, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        type,
        parent_id,
        parent_idx,
        link_to,
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
    )

    // If the source task is in a file, append the new task to that file
    const filePath = this.getFilePathForNode(source)
    if (filePath && content) {
      // Build task line with metadata
      let taskLine = `\n- [ ] ${content}`
      // Remove old due date from content if present
      taskLine = taskLine.replace(/\s*due:\d{4}-\d{2}-\d{2}/g, "")
      if (due_date) {
        taskLine += ` due:${due_date}`
      }
      appendFileSync(filePath, taskLine)
    }

    return newId
  }

  refresh(): void {
    // In disk mode, refresh means rebuild from events
    // This is handled by loadVault()
  }

  close(): void {
    this.db.close()
  }
}

/**
 * MemoryStore - in-memory mode with filesystem scanning
 * Uses :memory: SQLite, rebuilds on each run
 */
export class MemoryStore extends BaseStore {
  readonly mode = "memory" as const
  readonly rootPath: string
  protected db: Database
  private pendingWikilinks: Array<{
    nodeId: string
    link: {
      target: string
      section?: string
      blockId?: string
      alias?: string
      embedded?: boolean
    }
    relationship?: string
  }> = []
  private initialized = false
  private fileCount = 0
  private parseErrors: Array<{ path: string; error: string }> = []

  constructor(
    rootPath: string,
    options?: { lazy?: boolean; inject?: { database?: Database } },
  ) {
    super()
    this.rootPath = rootPath
    if (options?.inject?.database) {
      // Use injected database (e.g., from loadVault)
      this.db = options.inject.database
      this.initialized = true // Already populated by caller
    } else {
      this.db = new Database(":memory:")
      this.db.exec(SCHEMA)
      // Only set the db singleton if not lazy - in lazy mode, the db is managed elsewhere
      // (e.g., by vault-loader.ts which may have already set up a database)
      if (!options?.lazy) {
        setDb(this.db)
        this.scanFilesystem()
      }
    }
  }

  /**
   * Initialize the store by scanning filesystem.
   * Yields progress for spinner animation.
   */
  *initialize(): Generator<{ phase: string; current: number; total: number }> {
    if (this.initialized) return
    yield* this.scanFilesGenerator()
    yield* this.resolveLinksGenerator()
    this.initialized = true
  }

  /**
   * Scan filesystem phase - yields scanning progress.
   * Can be called separately for finer progress control.
   *
   * Uses transaction wrapping and deferred FTS updates for performance
   * (matching disk mode's bulk loading pattern).
   */
  *scanFilesGenerator(): Generator<{
    phase: string
    current: number
    total: number
  }> {
    // First pass: count files for progress reporting
    yield { phase: "scanning", current: 0, total: 0 }
    const total = this.countMarkdownFiles(this.rootPath)

    // Clear any previous errors
    this.parseErrors = []

    // Second pass: scan and parse in a transaction for performance
    // This matches disk mode's BEGIN/COMMIT pattern
    this.fileCount = 0
    this.db.run("BEGIN IMMEDIATE")
    try {
      yield* this.scanDirectoryAsync(this.rootPath, null, 0, total)
      this.db.run("COMMIT")
    } catch (error) {
      this.db.run("ROLLBACK")
      throw error
    }

    // Final yield to show 100%
    yield { phase: "scanning", current: this.fileCount, total }

    // Log parse errors summary if any occurred
    if (this.parseErrors.length > 0) {
      console.warn(
        `Warning: ${this.parseErrors.length} file(s) could not be parsed:`,
      )
      for (const { path, error } of this.parseErrors.slice(0, 5)) {
        console.warn(`  - ${path}: ${error}`)
      }
      if (this.parseErrors.length > 5) {
        console.warn(`  ... and ${this.parseErrors.length - 5} more`)
      }
    }
  }

  /**
   * Resolve wikilinks phase - yields reconciling progress.
   * Can be called separately for finer progress control.
   */
  *resolveLinksGenerator(): Generator<{
    phase: string
    current: number
    total: number
  }> {
    const total = this.pendingWikilinks.length
    yield { phase: "reconciling", current: 0, total }
    yield* this.resolveWikilinksGenerator()
  }

  /**
   * Count markdown files for progress reporting
   */
  private countMarkdownFiles(dirPath: string): number {
    if (!existsSync(dirPath)) return 0

    let count = 0
    const entries = readdirSync(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue

      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        count += this.countMarkdownFiles(fullPath)
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        count++
      }
    }
    return count
  }

  /**
   * Scan filesystem and populate in-memory database (sync version for refresh)
   */
  private scanFilesystem(): void {
    this.parseErrors = []
    this.db.run("BEGIN IMMEDIATE")
    try {
      for (const _ of this.scanDirectoryAsync(this.rootPath, null, 0, 0)) {
        // Consume generator without progress reporting
      }
      this.db.run("COMMIT")
    } catch (error) {
      this.db.run("ROLLBACK")
      throw error
    }
    this.resolveWikilinks()
    this.initialized = true
  }

  /**
   * Recursively scan a directory (generator for progress reporting)
   */
  private *scanDirectoryAsync(
    dirPath: string,
    parentId: string | null,
    sortOrder: number,
    total: number,
  ): Generator<{ phase: string; current: number; total: number }> {
    if (!existsSync(dirPath)) return

    // Skip hidden directories and common excludes (but not the root directory)
    if (parentId !== null) {
      const name = basename(dirPath)
      if (name.startsWith(".") || name === "node_modules") return
    }

    const entries = readdirSync(dirPath, { withFileTypes: true })
    let order = 0

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)

      // Skip hidden files
      if (entry.name.startsWith(".")) continue

      if (entry.isDirectory()) {
        // Create folder node
        const folderId = this.generateId(fullPath)
        this.insertNode({
          id: folderId,
          type: "folder",
          parent_id: parentId,
          fs_path: fullPath,
          content: entry.name,
          parent_idx: order++,
        })

        // Recurse
        yield* this.scanDirectoryAsync(fullPath, folderId, 0, total)
      } else if (entry.isFile()) {
        const isMarkdown = entry.name.endsWith(".md")

        if (isMarkdown) {
          // Use the full km-markdown parser for .md files
          this.parseMarkdownFile(fullPath, parentId, order++)
          this.fileCount++
          // Yield progress every 50 files to avoid overhead
          if (this.fileCount % 50 === 0) {
            yield { phase: "scanning", current: this.fileCount, total }
          }
        } else {
          // Create simple file node for non-markdown files
          const fileId = this.generateId(fullPath)
          this.insertNode({
            id: fileId,
            type: "file",
            parent_id: parentId,
            fs_path: fullPath,
            content: entry.name,
            parent_idx: order++,
          })
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
      const content = readFileSync(filePath, "utf-8")
      const { nodes, wikilinks } = parseMarkdownWithLinks(content, filePath)

      // The first node is always the file node
      const fileNode = nodes[0]
      if (!fileNode || fileNode.type !== "file") {
        return
      }

      // Set the file node's parent to the folder
      fileNode.parent_id = folderParentId
      fileNode.parent_idx = sortOrder

      // Insert all nodes
      for (const node of nodes) {
        this.insertNode(node)
      }

      // Collect wikilinks for resolution after all files are parsed
      for (const wikilink of wikilinks) {
        this.pendingWikilinks.push(wikilink)
      }
    } catch (err) {
      // Accumulate errors instead of silently skipping (matches disk mode pattern)
      const message = err instanceof Error ? err.message : String(err)
      this.parseErrors.push({ path: filePath, error: message })
    }
  }

  /**
   * Resolve all collected wikilinks after files are parsed (generator version)
   */
  private *resolveWikilinksGenerator(): Generator<{
    phase: string
    current: number
    total: number
  }> {
    const total = this.pendingWikilinks.length
    let current = 0

    for (const { nodeId, link, relationship } of this.pendingWikilinks) {
      // Try to find target file by name
      const fileNode = findFileByName(this.db, link.target)
      // If there's a section reference, try to find the specific child node
      let targetNode = fileNode
      if (fileNode && link.section) {
        const childNode = findChildByContent(this.db, fileNode.id, link.section)
        if (childNode) {
          targetNode = childNode
        }
      }
      addLink({
        source_id: nodeId,
        target_name: link.target,
        target_id: targetNode?.id ?? null,
        section: link.section ?? null,
        block_id: link.blockId ?? null,
        alias: link.alias ?? null,
        embedded: link.embedded ?? false,
        relationship: relationship ?? null,
      })

      current++
      // Yield progress every 10 links for smoother animation
      if (current % 10 === 0 || current === total) {
        yield { phase: "reconciling", current, total }
      }
    }
    // Clear pending wikilinks after resolution
    this.pendingWikilinks = []
  }

  /**
   * Resolve all collected wikilinks after files are parsed (sync version for refresh)
   */
  private resolveWikilinks(): void {
    for (const _ of this.resolveWikilinksGenerator()) {
      // Consume generator without progress reporting
    }
  }

  /**
   * Generate ephemeral ID based on path and line
   */
  private generateId(filePath: string, lineNum?: number): string {
    const relPath = relative(this.rootPath, filePath)
    if (lineNum !== undefined) {
      return `${relPath}:${lineNum}`
    }
    return relPath
  }

  /**
   * Insert a node into the in-memory database
   */
  private insertNode(node: Partial<KNode>): void {
    const now = Date.now()
    this.db.run(
      `INSERT INTO nodes (
        id, type, parent_id, parent_idx, fs_path, md_line,
        content, title, task_status, task_mark, data, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        node.id ?? null,
        node.type ?? null,
        node.parent_id ?? null,
        node.parent_idx ?? 0,
        node.fs_path ?? null,
        node.md_line ?? null,
        node.content ?? null,
        node.title ?? null,
        node.task_status ?? null,
        node.task_mark ?? null,
        JSON.stringify(node.data ?? {}),
        now,
        now,
      ] as SQLQueryBindings[],
    )
  }

  /**
   * Update a node and write through to the markdown file
   */
  updateNode(id: string, changes: Partial<KNode>): void {
    const node = this.getNode(id)
    if (!node) return

    // Update in-memory SQLite
    const sets: string[] = []
    const values: unknown[] = []

    for (const [key, value] of Object.entries(changes)) {
      if (key === "id") continue
      sets.push(`${key} = ?`)
      values.push(value)
    }

    if (sets.length === 0) return

    sets.push("updated_at = ?")
    values.push(Date.now(), id)

    this.db.run(
      `UPDATE nodes SET ${sets.join(", ")} WHERE id = ?`,
      values as SQLQueryBindings[],
    )

    // Write through to markdown file for task status changes
    if (changes.task_status !== undefined && node.md_line !== undefined) {
      // Tasks may not have fs_path directly - look up from parent file node
      const filePath = node.fs_path || this.getFilePathForNode(node)
      if (filePath) {
        this.writeTaskStatusToFile(filePath, node.md_line, changes.task_status)
      }
    }
  }

  moveNode(id: string, newParentId: string | null, parentIdx?: number): void {
    const node = this.getNode(id)
    if (!node) return

    const idx = parentIdx ?? Date.now()
    this.db.run(
      `UPDATE nodes SET parent_id = ?, parent_idx = ?, updated_at = ? WHERE id = ?`,
      [newParentId, idx, Date.now(), id],
    )

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
      : join(this.rootPath, filePath)

    // Ensure directory exists if requested
    if (options?.ensure) {
      const dir = dirname(fullPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      if (!existsSync(fullPath)) {
        writeFileSync(
          fullPath,
          `---\ntitle: ${basename(fullPath).replace(/\.md$/, "")}\n---\n\n`,
        )
      }
    }

    appendFileSync(fullPath, content)

    // Re-parse the file to update in-memory state
    const existingFileNode = this.getNodeByPath(fullPath)
    if (existingFileNode) {
      // Remove the file node and all its children, then re-parse
      this.db.run(`DELETE FROM nodes WHERE fs_path = ?`, [fullPath])
      // Re-parse with the same parent and sort order
      this.parseMarkdownFile(
        fullPath,
        existingFileNode.parent_id,
        existingFileNode.parent_idx,
      )
    }
  }

  cloneTask(sourceId: string, changes: Partial<KNode>): string | null {
    const source = this.getNode(sourceId)
    if (!source || source.type !== "task") return null

    // Generate new ID (ephemeral for memory mode)
    const newId = `clone-${Date.now()}`
    const now = Date.now()

    // Clone the task with changes
    const id = newId
    const type = "task"
    const parent_id = changes.parent_id ?? source.parent_id
    const parent_idx = changes.parent_idx ?? source.parent_idx + 0.001
    const task_status = changes.task_status ?? "todo"
    const task_mark = changes.task_mark ?? " "
    const assigned_to = changes.assigned_to ?? source.assigned_to ?? null
    const due_date = changes.due_date ?? source.due_date ?? null
    const scheduled_date =
      changes.scheduled_date ?? source.scheduled_date ?? null
    const priority = changes.priority ?? source.priority ?? null
    const content = changes.content ?? source.content ?? ""
    const data = JSON.stringify({
      ...source.data,
      ...changes.data,
      recur_prev: sourceId,
    })

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
    )

    // If the source task is in a file, append the new task to that file
    const filePath = this.getFilePathForNode(source)
    if (filePath && content) {
      let taskLine = `\n- [ ] ${content}`
      taskLine = taskLine.replace(/\s*due:\d{4}-\d{2}-\d{2}/g, "")
      if (due_date) {
        taskLine += ` due:${due_date}`
      }
      appendFileSync(filePath, taskLine)
    }

    return newId
  }

  refresh(): void {
    // Clear and rescan
    this.db.run("DELETE FROM nodes")
    this.scanFilesystem()
  }

  close(): void {
    this.db.close()
  }
}

// Singleton store instance
let storeInstance: NodeStore | null = null

/**
 * Detect mode and initialize appropriate store
 * @param startPath - Directory to use as root
 * @param searchAncestors - If true (default), search for .km/ in ancestors.
 *                          If false, only check startPath directly for .km/
 */
export function initStore(
  startPath?: string,
  searchAncestors = true,
  options?: { lazy?: boolean },
): NodeStore {
  const path = startPath ?? process.cwd()

  // When a path is explicitly provided, check only that directory for .km/
  // When no path is provided (using cwd), search ancestors for .km/
  const kmPath = searchAncestors
    ? findKmDirectory(path)
    : findKmDirectoryExact(path)

  if (kmPath) {
    // Update global kmDir so getKmDir() returns the correct path
    setKmDir(kmPath)
    storeInstance = new DiskStore(kmPath)
  } else {
    storeInstance = new MemoryStore(path, { lazy: options?.lazy })
  }

  return storeInstance
}

/**
 * Check if .km directory exists in the exact path (no ancestor search)
 */
function findKmDirectoryExact(path: string): string | null {
  const kmPath = join(path, ".km")
  if (existsSync(kmPath) && statSync(kmPath).isDirectory()) {
    return kmPath
  }
  return null
}

/**
 * Get the current store instance.
 * If no store exists, creates one in lazy mode (deferred scanning).
 * @deprecated Use createVault() factory to create a Vault domain object instead.
 * This singleton will be removed in a future version.
 */
export function getStore(): NodeStore {
  if (!storeInstance) {
    // Use lazy mode by default to avoid immediate filesystem scan
    // Caller should call store.initialize() if they need full data
    return initStore(undefined, true, { lazy: true })
  }
  return storeInstance
}

/**
 * Close and reset the store
 */
export function closeStore(): void {
  if (storeInstance) {
    storeInstance.close()
    storeInstance = null
  }
}

/**
 * Find .km directory in path or ancestors
 */
function findKmDirectory(startPath: string): string | null {
  let current = startPath
  const root = "/"

  while (current !== root) {
    const kmPath = join(current, ".km")
    if (existsSync(kmPath) && statSync(kmPath).isDirectory()) {
      return kmPath
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return null
}
