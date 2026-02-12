/**
 * FileTree Interface - Simple File I/O Abstraction
 *
 * FileTree provides simple file I/O operations for a directory tree.
 * It is NOT a DataStore - files and indexed data are fundamentally different:
 *
 * - DataStore: O(1)/O(log n) queries, structured nodes, IDs as primary keys
 * - FileTree: O(n) for everything, raw file content, paths as identifiers
 *
 * FileTree exists so that:
 * 1. Sync can translate between file format and data format
 * 2. Tests can use in-memory filesystems (memfs)
 * 3. The sync layer doesn't call node:fs directly
 *
 * The git analogy: FileTree is like git's working tree - a human-editable
 * representation that syncs with the indexed storage (DataStore).
 *
 * See: docs/00-principles.md
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { watch, type FSWatcher } from "chokidar"

// =============================================================================
// Core Interface
// =============================================================================

/**
 * FileTree - simple file I/O abstraction.
 *
 * All paths are relative to the root directory. The root is set at creation
 * time and cannot be changed.
 *
 * @example
 * ```typescript
 * const files = createDiskFileTree("/path/to/repo")
 *
 * // Read a file
 * const content = files.read("projects.md")
 *
 * // Write a file (creates parent directories as needed)
 * files.write("notes/meeting.md", "# Meeting Notes\n...")
 *
 * // List files in a directory
 * const mdFiles = files.list("notes")  // ["meeting.md", "ideas.md"]
 *
 * // Watch for changes
 * const watcher = files.watch()
 * watcher.on("change", (eventType, filename) => { ... })
 * ```
 */
export interface FileTree extends Disposable {
  /**
   * The root directory path.
   * All operations are relative to this path.
   */
  readonly root: string

  /**
   * Read file contents as UTF-8 string.
   *
   * @param relativePath - Path relative to root (e.g., "projects.md", "notes/ideas.md")
   * @returns File contents as string
   * @throws If file does not exist or cannot be read
   */
  read(relativePath: string): string

  /**
   * Write content to a file.
   *
   * Creates parent directories as needed. Overwrites existing content.
   *
   * @param relativePath - Path relative to root
   * @param content - UTF-8 string content to write
   * @throws If write fails (permissions, disk full, etc.)
   */
  write(relativePath: string, content: string): void

  /**
   * Check if a file or directory exists.
   *
   * @param relativePath - Path relative to root
   * @returns true if path exists, false otherwise
   */
  exists(relativePath: string): boolean

  /**
   * List files and directories in a directory.
   *
   * Returns names only (not full paths). Does not recurse into subdirectories.
   *
   * @param relativePath - Directory path relative to root. Defaults to root if omitted.
   * @returns Array of file/directory names in the directory
   * @throws If directory does not exist
   */
  list(relativePath?: string): string[]

  /**
   * Watch for file system changes.
   *
   * Returns a raw FSWatcher - the sync layer handles debouncing, filtering,
   * and semantic interpretation of changes.
   *
   * @returns Node.js FSWatcher for the root directory (recursive)
   */
  watch(): FSWatcher

  /**
   * Close and release resources.
   *
   * After calling close(), all other methods will throw.
   * Calling close() multiple times is safe (idempotent).
   */
  close(): void
}

// =============================================================================
// Factory: createDiskFileTree
// =============================================================================

/**
 * Create a FileTree backed by the real filesystem.
 *
 * @param root - Absolute path to the root directory
 * @returns FileTree that reads/writes to disk
 *
 * @example
 * ```typescript
 * const files = createDiskFileTree("/Users/me/repo")
 * const content = files.read("inbox.md")
 * ```
 */
export function createDiskFileTree(root: string): FileTree {
  let closed = false
  let watcher: FSWatcher | null = null

  return {
    root,

    read(relativePath) {
      ensureOpen()
      const fullPath = join(root, relativePath)
      return readFileSync(fullPath, "utf-8")
    },

    write(relativePath, content) {
      ensureOpen()
      const fullPath = join(root, relativePath)
      const dir = dirname(fullPath)

      // Create parent directories if they don't exist
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      writeFileSync(fullPath, content, "utf-8")
    },

    exists(relativePath) {
      ensureOpen()
      const fullPath = join(root, relativePath)
      return existsSync(fullPath)
    },

    list(relativePath = "") {
      ensureOpen()
      const fullPath = join(root, relativePath)
      return readdirSync(fullPath)
    },

    watch() {
      ensureOpen()
      watcher = watch(root, {
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 100 },
      })
      return watcher
    },

    close() {
      if (closed) return
      closed = true
      void watcher?.close()
      watcher = null
    },

    [Symbol.dispose]() {
      this.close()
    },
  }

  function ensureOpen() {
    if (closed) throw new Error("FileTree is closed")
  }
}

// =============================================================================
// Factory: createMemFileTree
// =============================================================================

/**
 * Create an in-memory FileTree.
 *
 * Useful for testing without disk I/O. The root path is virtual and
 * only used for identity - no actual filesystem access occurs.
 *
 * @param initialRoot - Virtual root path (default: "/mem")
 * @returns FileTree that stores files in memory
 *
 * @example
 * ```typescript
 * const files = createMemFileTree()
 * files.write("test.md", "# Test\n- [ ] Task 1")
 * const content = files.read("test.md")
 * ```
 */
export function createMemFileTree(initialRoot = "/mem"): FileTree {
  const files = new Map<string, string>()
  let closed = false

  return {
    root: initialRoot,

    read(relativePath) {
      ensureOpen()
      const normalized = normalizePath(relativePath)
      const content = files.get(normalized)
      if (content === undefined) {
        throw new Error(`ENOENT: no such file: ${relativePath}`)
      }
      return content
    },

    write(relativePath, content) {
      ensureOpen()
      const normalized = normalizePath(relativePath)
      files.set(normalized, content)
    },

    exists(relativePath) {
      ensureOpen()
      const normalized = normalizePath(relativePath)
      // Check exact file match
      if (files.has(normalized)) return true
      // Check if it's a directory (has files under it)
      const prefix = normalized === "" ? "" : normalized + "/"
      for (const path of files.keys()) {
        if (path.startsWith(prefix)) return true
      }
      return false
    },

    list(relativePath = "") {
      ensureOpen()
      const normalized = normalizePath(relativePath)
      const prefix = normalized === "" ? "" : normalized + "/"
      const entries = new Set<string>()

      for (const path of files.keys()) {
        if (normalized === "" || path.startsWith(prefix)) {
          // Get the portion after the prefix
          const remainder = normalized === "" ? path : path.slice(prefix.length)
          // Get the first segment (immediate child)
          const firstSlash = remainder.indexOf("/")
          const entry = firstSlash === -1 ? remainder : remainder.slice(0, firstSlash)
          if (entry) {
            entries.add(entry)
          }
        }
      }

      return Array.from(entries).sort()
    },

    watch() {
      ensureOpen()
      // In-memory FileTree doesn't support real file watching.
      throw new Error("watch() not supported for in-memory FileTree")
    },

    close() {
      if (closed) return
      closed = true
      files.clear()
    },

    [Symbol.dispose]() {
      this.close()
    },
  }

  function ensureOpen() {
    if (closed) throw new Error("FileTree is closed")
  }

  function normalizePath(p: string): string {
    // Remove leading/trailing slashes and normalize
    return p.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/")
  }
}
