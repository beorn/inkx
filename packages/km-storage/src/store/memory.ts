/**
 * MemoryStore - In-memory mode with filesystem scanning
 *
 * Uses :memory: SQLite, rebuilt each run, ephemeral IDs.
 * Provides read-write access but without persistence.
 */

import { Database, type SQLQueryBindings } from "bun:sqlite"
import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync, appendFileSync } from "fs"
import { join, dirname, basename, relative } from "path"
import { toRelativeFsPath } from "../fs/path-utils.ts"
import type { KNode } from "@km/core"
import { decomposeItem } from "../item-helpers.ts"
import { parseMarkdownWithLinks } from "@km/markdown"
import { SCHEMA, NODE_COLUMNS } from "../db/schema.ts"
import { addLink } from "../db/db.ts"
import { getIgnorePatterns, shouldIgnore } from "../fs/ignore.ts"
import { ensureRepoRootNode } from "../repo/loader.ts"
import { findChildByContent, findFileByName } from "../db/queries/wikilink-resolver.ts"
import { getNode } from "../db/queries/index.ts"
import { createLogger } from "loggily"
import { BaseStore } from "./base.ts"

const log = createLogger("km:storage:store")

/**
 * MemoryStore - in-memory mode with filesystem scanning
 * Uses :memory: SQLite, rebuilds on each run
 */
export class MemoryStore extends BaseStore {
  readonly mode = "memory"
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

  constructor(rootPath: string, options?: { lazy?: boolean; inject?: { database?: Database } }) {
    super()
    this.rootPath = rootPath
    if (options?.inject?.database) {
      // Use injected database (e.g., from loadRepo)
      this.db = options.inject.database
      this.initialized = true // Already populated by caller
    } else {
      this.db = new Database(":memory:")
      this.db.run(SCHEMA)
      // Scan filesystem unless lazy mode
      if (!options?.lazy) {
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
    const ignorePatterns = getIgnorePatterns(this.rootPath)

    // First pass: count files for progress reporting
    yield { phase: "scanning", current: 0, total: 0 }
    const total = this.countMarkdownFiles(this.rootPath, ignorePatterns)

    // Clear any previous errors
    this.parseErrors = []

    // Second pass: scan and parse in a transaction for performance
    // This matches disk mode's BEGIN/COMMIT pattern
    this.fileCount = 0
    ensureRepoRootNode(this.db, this.rootPath)
    this.db.run("BEGIN IMMEDIATE")
    try {
      yield* this.scanDirectoryAsync(this.rootPath, ".", 0, total, ignorePatterns)
      this.db.run("COMMIT")
    } catch (error) {
      this.db.run("ROLLBACK")
      throw error
    }

    // Final yield to show 100%
    yield { phase: "scanning", current: this.fileCount, total }

    // Log parse errors summary if any occurred
    if (this.parseErrors.length > 0) {
      log.warn?.(`${this.parseErrors.length} file(s) could not be parsed`, {
        errors: this.parseErrors.slice(0, 5).map(({ path, error }) => ({ path, error })),
        truncated: this.parseErrors.length > 5 ? this.parseErrors.length - 5 : 0,
      })
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
  private countMarkdownFiles(dirPath: string, ignorePatterns: string[]): number {
    if (!existsSync(dirPath)) return 0

    let count = 0
    const entries = readdirSync(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      if (shouldIgnore(fullPath, ignorePatterns, this.rootPath)) continue

      if (entry.isDirectory()) {
        count += this.countMarkdownFiles(fullPath, ignorePatterns)
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
    const ignorePatterns = getIgnorePatterns(this.rootPath)
    ensureRepoRootNode(this.db, this.rootPath)
    this.db.run("BEGIN IMMEDIATE")
    try {
      for (const _ of this.scanDirectoryAsync(this.rootPath, ".", 0, 0, ignorePatterns)) {
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
    ignorePatterns: string[],
  ): Generator<{ phase: string; current: number; total: number }> {
    if (!existsSync(dirPath)) return

    // Skip ignored directories (but not the root directory)
    if (parentId !== "." && shouldIgnore(dirPath, ignorePatterns, this.rootPath)) {
      return
    }

    const entries = readdirSync(dirPath, { withFileTypes: true })
    let order = 0

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)

      // Skip ignored entries BEFORE creating nodes
      if (shouldIgnore(fullPath, ignorePatterns, this.rootPath)) continue

      if (entry.isDirectory()) {
        // Create folder node
        const folderId = this.generateId(fullPath)
        this.insertNode({
          id: folderId,
          type: "h",
          item: {},
          fstype: "folder",
          parent_id: parentId,
          fs_path: toRelativeFsPath(this.rootPath, fullPath),
          name: entry.name, // Folder name for link resolution (e.g., "inbox" for [[inbox]])
          content: entry.name,
          parent_idx: order++,
        })

        // Recurse
        yield* this.scanDirectoryAsync(fullPath, folderId, 0, total, ignorePatterns)
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
            type: "h",
            item: {},
            fstype: "file",
            parent_id: parentId,
            fs_path: toRelativeFsPath(this.rootPath, fullPath),
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
  private parseMarkdownFile(filePath: string, folderParentId: string | null, sortOrder: number): void {
    try {
      const content = readFileSync(filePath, "utf-8")
      const { nodes, wikilinks } = parseMarkdownWithLinks(content, filePath)

      // The first node is always the file node
      const fileNode = nodes[0]
      if (!(fileNode?.type === "h" && fileNode?.item) || (fileNode.fstype !== "file" && fileNode.fstype !== "mdfile")) {
        return
      }

      // Set the file node's parent to the folder, store relative path
      fileNode.parent_id = folderParentId
      fileNode.parent_idx = sortOrder
      fileNode.fs_path = toRelativeFsPath(this.rootPath, filePath)

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
      let targetNode: { id: string } | null = null

      // Prefer block_id resolution (stable across content edits)
      if (link.blockId) {
        const row = this.db.prepare("SELECT id FROM nodes WHERE block_id = ? LIMIT 1").get(link.blockId) as {
          id: string
        } | null
        if (row) targetNode = row
      }

      if (!targetNode) {
        // Try to find target file by name
        targetNode = findFileByName(this.db, link.target)
        // If there's a section reference, try to find the specific child node
        if (targetNode && link.section) {
          const childNode = findChildByContent(this.db, targetNode.id, link.section)
          if (childNode) {
            targetNode = childNode
          }
        }
        // Fallback: target might be a node ID (e.g., ![[ULID]] from serialized embeds)
        if (!targetNode) {
          targetNode = getNode(this.db, link.target)
        }
      }
      addLink(this.db, {
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
   * Insert a node into the in-memory database.
   * Non-column KNode fields (rrule, etc.) are merged into data blob.
   */
  private insertNode(node: Partial<KNode>): void {
    const now = Date.now()

    // Merge non-column fields into data blob (matches db-ops.ts addNodeImpl)
    const mergedData: Record<string, unknown> = { ...node.data }
    for (const [key, value] of Object.entries(node)) {
      if (key !== "data" && !NODE_COLUMNS.has(key) && value !== undefined && value !== null) {
        mergedData[key] = value
      }
    }

    const ic = decomposeItem(node.item)
    this.db.run(
      `INSERT INTO nodes (
        id, type, fstype, parent_id, parent_idx, item, embed_source,
        fs_path, md_pos, md_line, name, block_id,
        content, content_hash, title, list_marker, task_marker,
        task_status, assigned_to, due_at, start_at, priority,
        data, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        node.id ?? null,
        node.type ?? null,
        node.fstype ?? null,
        node.parent_id ?? null,
        node.parent_idx ?? 0,
        ic.item,
        node.embed_source ?? null,
        node.fs_path ?? null,
        node.md_pos ?? null,
        node.md_line ?? null,
        node.name ?? null,
        node.block_id ?? null,
        node.content ?? null,
        node.content_hash ?? null,
        node.title ?? null,
        ic.list_marker,
        ic.task_marker,
        ic.task_status,
        node.assigned_to ?? null,
        node.due_at ?? null,
        node.start_at ?? null,
        node.priority ?? null,
        JSON.stringify(mergedData),
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

    // Decompose nested item object into flat DB columns
    const augmented: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(changes)) {
      if (key === "item") {
        Object.assign(augmented, decomposeItem(value as KNode["item"]))
      } else {
        augmented[key] = value
      }
    }

    // Route fields to SQL columns vs data blob
    const sets: string[] = []
    const values: (string | number | null)[] = []
    const dataOverrides: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(augmented)) {
      if (key === "id") continue
      if (key === "data") {
        const jsonStr = typeof value === "string" ? value : JSON.stringify(value)
        sets.push("data = ?")
        values.push(jsonStr)
      } else if (NODE_COLUMNS.has(key)) {
        sets.push(`${key} = ?`)
        values.push(value as string | number | null)
      } else {
        // Non-column KNode field → data blob
        dataOverrides[key] = value
      }
    }

    if (Object.keys(dataOverrides).length > 0) {
      sets.push("data = json_patch(data, ?)")
      values.push(JSON.stringify(dataOverrides))
    }

    if (sets.length === 0) return

    sets.push("updated_at = ?")
    values.push(Date.now())
    values.push(id)

    this.db.run(`UPDATE nodes SET ${sets.join(", ")} WHERE id = ?`, values as SQLQueryBindings[])

    // Write through to markdown file for task status changes
    const newTaskStatus = changes.item?.task?.status
    if (newTaskStatus !== undefined && node.md_line !== undefined) {
      const relPath = node.fs_path || this.getFilePathForNode(node)
      if (relPath) {
        const absPath = join(this.rootPath, relPath)
        this.writeTaskStatusToFile(absPath, node.md_line, newTaskStatus)
      }
    }

    // Write through date fields to markdown file
    if ((changes.due_at !== undefined || changes.start_at !== undefined) && node.md_line !== undefined) {
      const relPath = node.fs_path || this.getFilePathForNode(node)
      if (relPath) {
        const absPath = join(this.rootPath, relPath)
        // Re-read the updated node to get merged state
        const updated = this.getNode(id)
        if (updated?.md_line !== undefined) {
          this.writeDateToFile(absPath, updated.md_line, updated)
        }
      }
    }
  }

  moveNode(id: string, newParentId: string | null, parentIdx?: number): void {
    const node = this.getNode(id)
    if (!node) return

    const idx = parentIdx ?? Date.now()
    this.db.run(`UPDATE nodes SET parent_id = ?, parent_idx = ?, updated_at = ? WHERE id = ?`, [
      newParentId,
      idx,
      Date.now(),
      id,
    ])

    // Note: In memory mode, we don't emit events since there's no persistence
    // The in-memory DB is the source of truth
  }

  appendTaskToFile(filePath: string, content: string, options?: { ensure?: boolean }): void {
    const fullPath = filePath.startsWith("/") ? filePath : join(this.rootPath, filePath)

    // Ensure directory exists if requested
    if (options?.ensure) {
      const dir = dirname(fullPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      if (!existsSync(fullPath)) {
        writeFileSync(fullPath, `---\ntitle: ${basename(fullPath).replace(/\.md$/, "")}\n---\n\n`)
      }
    }

    appendFileSync(fullPath, content)

    // Re-parse the file to update in-memory state
    const existingFileNode = this.getNodeByPath(toRelativeFsPath(this.rootPath, fullPath))
    if (existingFileNode) {
      // Remove the file node and all its children, then re-parse
      this.db.run(`DELETE FROM nodes WHERE fs_path = ?`, [fullPath])
      // Re-parse with the same parent and sort order
      this.parseMarkdownFile(fullPath, existingFileNode.parent_id, existingFileNode.parent_idx)
    }
  }

  cloneTask(sourceId: string, changes: Partial<KNode>): string | null {
    const source = this.getNode(sourceId)
    if (!source?.item?.task) return null

    // Generate new ID (ephemeral for memory mode)
    const newId = `clone-${Date.now()}`
    const now = Date.now()

    // Clone the task with changes
    const id = newId
    const type = source.type
    const parent_id = changes.parent_id ?? source.parent_id
    const parent_idx = changes.parent_idx ?? source.parent_idx + 0.001
    const newItem = changes.item ?? source.item
    const ic = decomposeItem(newItem)
    // Recurring tasks always have a task — default to todo/[ ] as safety net
    const task_status = ic.task_status ?? "todo"
    const task_marker = ic.task_marker ?? "[ ]"
    const assigned_to = changes.assigned_to ?? source.assigned_to ?? null
    const due_at = changes.due_at ?? source.due_at ?? null
    const start_at = changes.start_at ?? source.start_at ?? null
    const priority = changes.priority ?? source.priority ?? null
    const content = changes.content ?? source.content ?? ""
    const data = JSON.stringify({
      ...source.data,
      ...changes.data,
      recur_prev: sourceId,
    })

    // Insert into database
    this.db.run(
      `INSERT INTO nodes (id, type, parent_id, parent_idx, item, list_marker,
        task_status, task_marker, assigned_to, due_at, start_at,
        priority, content, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        type,
        parent_id,
        parent_idx,
        1,
        ic.list_marker,
        task_status,
        task_marker,
        assigned_to,
        due_at,
        start_at,
        priority,
        content,
        data,
        now,
        now,
      ],
    )

    // If the source task is in a file, append the new task to that file
    const relPath = this.getFilePathForNode(source)
    const filePath = relPath ? join(this.rootPath, relPath) : null
    if (filePath && content) {
      let taskLine = `\n- [ ] ${content}`
      taskLine = taskLine.replace(/\s*due:\d{4}-\d{2}-\d{2}/g, "")
      if (due_at) {
        taskLine += ` due:${due_at}`
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
