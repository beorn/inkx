/**
 * NodeStore Interface
 *
 * Defines the unified interface for node storage. Both disk and memory
 * implementations share this contract.
 */

import type { Database } from "bun:sqlite"
import type { KNode, TaskStatus } from "@km/core"

/**
 * NodeStore interface - unified access to node storage
 */
export interface NodeStore extends Disposable {
  readonly mode: "memory" | "disk"
  readonly rootPath: string

  // Internal database access (for raw queries or DI)
  getDatabase(): Database

  // Read operations
  getNode(id: string): KNode | null
  getNodeByPath(fsPath: string): KNode | null
  getChildren(parentId: string | null): KNode[]
  getChildIds(parentId: string | null): readonly string[]
  getAncestors(nodeId: string): KNode[]
  getSubtree(rootId: string): KNode[]
  getAllNodes(): KNode[]
  getAllTasks(): KNode[]
  getTasksByStatus(status: TaskStatus | TaskStatus[]): KNode[]
  search(query: string, limit?: number): KNode[]

  // Write operations
  updateNode(id: string, changes: Partial<KNode>): void
  moveNode(id: string, newParentId: string | null, parentIdx?: number): void
  appendTaskToFile(filePath: string, content: string, options?: { ensure?: boolean }): void
  cloneTask(sourceId: string, changes: Partial<KNode>): string | null

  // Filesystem helpers (avoids CLI importing fs directly)
  pathExists(relativePath: string): boolean
  getFileInfo(relativePath: string): { isDirectory: boolean; size: number } | null

  // Lifecycle
  refresh(): void
  close(): void
}
