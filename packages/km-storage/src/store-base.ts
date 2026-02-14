/**
 * BaseStore - Abstract base class with shared query methods
 *
 * Provides read operations (getNode, getChildren, search, etc.) and
 * filesystem helpers shared between all NodeStore implementations.
 */

import { Database } from "bun:sqlite"
import { existsSync, readFileSync, statSync, writeFileSync } from "fs"
import { join, isAbsolute } from "path"
import { toRelativeFsPath } from "./path-utils.ts"
import { getMarkerForStatus } from "@km/core"
import type { KNode, TaskStatus } from "@km/core"
import type { NodeStore } from "./store-types.ts"
import { rowToNode } from "./db-queries/index.ts"

/**
 * Base store implementation with shared query methods
 */
export abstract class BaseStore implements NodeStore {
  abstract readonly mode: "memory" | "disk"
  abstract readonly rootPath: string
  protected abstract db: Database

  getDatabase(): Database {
    return this.db
  }

  getNode(id: string): KNode | null {
    const row = this.db.query("SELECT * FROM nodes WHERE id = ?").get(id) as Record<string, unknown> | null
    return row ? rowToNode(row) : null
  }

  getNodeByPath(fsPath: string): KNode | null {
    // Convert absolute paths to relative (DB stores relative paths)
    const queryPath = isAbsolute(fsPath) ? toRelativeFsPath(this.rootPath, fsPath) : fsPath
    const row = this.db.query("SELECT * FROM nodes WHERE fs_path = ?").get(queryPath) as Record<string, unknown> | null
    return row ? rowToNode(row) : null
  }

  getChildren(parentId: string | null): KNode[] {
    const pid = parentId ?? "."
    const rows = this.db
      .query("SELECT * FROM nodes WHERE parent_id = ? ORDER BY parent_idx, created_at")
      .all(pid) as Record<string, unknown>[]
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
    const rows = this.db.query("SELECT * FROM nodes").all() as Record<string, unknown>[]
    return rows.map(rowToNode)
  }

  getAllTasks(): KNode[] {
    const rows = this.db
      .query(
        `SELECT * FROM nodes WHERE task_status IS NOT NULL
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
        `SELECT * FROM nodes WHERE task_status IS NOT NULL AND task_status IN (${placeholders})
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
      const rows = this.db.query(`SELECT * FROM nodes WHERE content LIKE ? LIMIT ?`).all(`%${query}%`, limit) as Record<
        string,
        unknown
      >[]
      return rows.map(rowToNode)
    }
  }

  abstract updateNode(id: string, changes: Partial<KNode>): void
  abstract moveNode(id: string, newParentId: string | null, parentIdx?: number): void
  abstract appendTaskToFile(filePath: string, content: string, options?: { ensure?: boolean }): void
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
  getFileInfo(relativePath: string): { isDirectory: boolean; size: number } | null {
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
      if (current.fs_path && current.type === "oi" && (current.fstype === "file" || current.fstype === "mdfile")) {
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
  protected writeTaskStatusToFile(filePath: string, mdLine: number, newStatus: TaskStatus): void {
    try {
      const content = readFileSync(filePath, "utf-8")
      const lines = content.split("\n")

      if (mdLine >= lines.length) return

      const line = lines[mdLine]
      if (!line) return

      const marker = getMarkerForStatus(newStatus)
      const mark = marker[1] // Extract inner char from "[x]" → "x"

      lines[mdLine] = line.replace(/^(\s*-\s+\[).(])/, `$1${mark}$2`)

      // Use synchronous write to ensure completion before CLI exits
      writeFileSync(filePath, lines.join("\n"))
    } catch {
      // Ignore write errors
    }
  }
}
