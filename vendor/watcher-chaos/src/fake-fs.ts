/**
 * MockFileSystem - In-memory filesystem for fast chaos testing
 *
 * Provides a complete virtual filesystem with:
 * - Standard fs operations (read, write, stat, etc.)
 * - Error injection (ENOENT, EACCES, EIO, etc.)
 * - Directory scanning for reconciliation tests
 * - Deterministic behavior for reproducible tests
 */

import { dirname, basename } from "path"

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FileEntry {
  type: "file"
  content: string
  ino: number
  mtime: number
  size: number
}

interface DirEntry {
  type: "dir"
  ino: number
  mtime: number
}

type FsNode = FileEntry | DirEntry

/** Standard fs stat result */
export interface StatResult {
  ino: number
  mtimeMs: number
  size: number
  isDirectory: () => boolean
  isFile: () => boolean
}

/** Entry returned by directory scanning */
export interface FsEntry {
  path: string
  ino: number
  mtime: number
  isDirectory: boolean
}

/** FileSystem operations interface (compatible with Node fs) */
export interface FileSystemOps {
  writeFileSync(path: string, content: string, encoding?: BufferEncoding): void
  readFileSync(path: string, encoding?: BufferEncoding): string
  unlinkSync(path: string): void
  rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void
  mkdirSync(path: string, options?: { recursive?: boolean }): void
  existsSync(path: string): boolean
  renameSync(oldPath: string, newPath: string): void
  statSync(path: string): StatResult
}

/** Pattern matcher interface for pre-compiled ignore patterns */
export interface PatternMatcher {
  matches(path: string, repoPath?: string): boolean
  readonly size: number
}

/** Directory scanner function type */
export type DirectoryScanner = (dirPath: string, ignorePatterns?: string[] | PatternMatcher) => FsEntry[]

/** Error injection configuration */
export interface ErrorInjection {
  /** Paths that will throw EACCES (permission denied) */
  permissionDenied?: string[]
  /** Paths that will throw EIO (I/O error) */
  ioError?: string[]
  /** Paths that will throw EROFS (read-only filesystem) */
  readOnly?: string[]
  /** Global error rate (0-1) - random operations fail with EIO */
  errorRate?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// MockFileSystem
// ─────────────────────────────────────────────────────────────────────────────

/**
 * In-memory filesystem implementation for testing
 *
 * @example
 * ```typescript
 * const fs = new MockFileSystem();
 *
 * // Setup initial state
 * fs.mkdirSync("/repo", { recursive: true });
 * fs.writeFileSync("/repo/test.md", "# Hello");
 *
 * // Inject errors
 * fs.setErrorInjection({
 *   permissionDenied: ["/repo/secret.md"],
 *   ioError: ["/repo/corrupt.md"],
 * });
 *
 * // Use as drop-in fs replacement
 * const content = fs.readFileSync("/repo/test.md", "utf8");
 * ```
 */
export class FakeFileSystem implements FileSystemOps {
  private files = new Map<string, FsNode>()
  private nextIno = 1
  private errorInjection: ErrorInjection = {}
  private errorRng: (() => number) | null = null

  constructor() {
    // Initialize with root directory
    this.files.set("/", {
      type: "dir",
      ino: this.nextIno++,
      mtime: Date.now(),
    })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Error Injection
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Configure error injection for testing error handling
   */
  setErrorInjection(config: ErrorInjection): void {
    this.errorInjection = config
  }

  /**
   * Set random number generator for error rate injection
   */
  setErrorRng(rng: () => number): void {
    this.errorRng = rng
  }

  /**
   * Clear all error injection settings
   */
  clearErrorInjection(): void {
    this.errorInjection = {}
    this.errorRng = null
  }

  private checkErrors(path: string, operation: string): void {
    const normalized = this.normalizePath(path)

    // Check permission denied
    if (this.errorInjection.permissionDenied?.includes(normalized)) {
      const error = new Error(`EACCES: permission denied, ${operation} '${path}'`)
      ;(error as NodeJS.ErrnoException).code = "EACCES"
      throw error
    }

    // Check I/O error
    if (this.errorInjection.ioError?.includes(normalized)) {
      const error = new Error(`EIO: i/o error, ${operation} '${path}'`)
      ;(error as NodeJS.ErrnoException).code = "EIO"
      throw error
    }

    // Check read-only
    if (
      this.errorInjection.readOnly?.includes(normalized) &&
      ["write", "unlink", "mkdir", "rename"].includes(operation)
    ) {
      const error = new Error(`EROFS: read-only file system, ${operation} '${path}'`)
      ;(error as NodeJS.ErrnoException).code = "EROFS"
      throw error
    }

    // Random error injection
    if (this.errorInjection.errorRate && this.errorRng) {
      if (this.errorRng() < this.errorInjection.errorRate) {
        const error = new Error(`EIO: i/o error, ${operation} '${path}'`)
        ;(error as NodeJS.ErrnoException).code = "EIO"
        throw error
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FileSystemOps Implementation
  // ─────────────────────────────────────────────────────────────────────────

  writeFileSync(path: string, content: string, _encoding?: BufferEncoding): void {
    this.checkErrors(path, "write")
    const normalized = this.normalizePath(path)
    const existing = this.files.get(normalized)

    if (existing?.type === "dir") {
      const error = new Error(`EISDIR: illegal operation on a directory, write '${path}'`)
      ;(error as NodeJS.ErrnoException).code = "EISDIR"
      throw error
    }

    // Ensure parent directory exists
    const parentDir = dirname(normalized)
    if (parentDir !== normalized && !this.files.has(parentDir)) {
      const error = new Error(`ENOENT: no such file or directory, open '${path}'`)
      ;(error as NodeJS.ErrnoException).code = "ENOENT"
      throw error
    }

    const now = Date.now()
    this.files.set(normalized, {
      type: "file",
      content,
      ino: existing?.ino ?? this.nextIno++,
      mtime: now,
      size: content.length,
    })
  }

  readFileSync(path: string, _encoding?: BufferEncoding): string {
    this.checkErrors(path, "read")
    const normalized = this.normalizePath(path)
    const entry = this.files.get(normalized)

    if (!entry) {
      const error = new Error(`ENOENT: no such file or directory, open '${path}'`)
      ;(error as NodeJS.ErrnoException).code = "ENOENT"
      throw error
    }

    if (entry.type === "dir") {
      const error = new Error(`EISDIR: illegal operation on a directory, read '${path}'`)
      ;(error as NodeJS.ErrnoException).code = "EISDIR"
      throw error
    }

    return entry.content
  }

  unlinkSync(path: string): void {
    this.checkErrors(path, "unlink")
    const normalized = this.normalizePath(path)
    const entry = this.files.get(normalized)

    if (!entry) {
      const error = new Error(`ENOENT: no such file or directory, unlink '${path}'`)
      ;(error as NodeJS.ErrnoException).code = "ENOENT"
      throw error
    }

    if (entry.type === "dir") {
      const error = new Error(`EISDIR: illegal operation on a directory, unlink '${path}'`)
      ;(error as NodeJS.ErrnoException).code = "EISDIR"
      throw error
    }

    this.files.delete(normalized)
  }

  rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void {
    const normalized = this.normalizePath(path)
    const entry = this.files.get(normalized)

    if (!entry) {
      if (options?.force) return
      const error = new Error(`ENOENT: no such file or directory, rm '${path}'`)
      ;(error as NodeJS.ErrnoException).code = "ENOENT"
      throw error
    }

    this.checkErrors(path, "unlink")

    if (entry.type === "dir" && options?.recursive) {
      // Remove all children first
      const prefix = normalized + "/"
      for (const childPath of this.files.keys()) {
        if (childPath.startsWith(prefix)) {
          this.files.delete(childPath)
        }
      }
    }

    this.files.delete(normalized)
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    this.checkErrors(path, "mkdir")
    const normalized = this.normalizePath(path)

    if (this.files.has(normalized)) {
      const existing = this.files.get(normalized)!
      if (existing.type === "file") {
        const error = new Error(`EEXIST: file already exists, mkdir '${path}'`)
        ;(error as NodeJS.ErrnoException).code = "EEXIST"
        throw error
      }
      // Directory already exists, that's fine
      return
    }

    const parentDir = dirname(normalized)
    if (parentDir !== normalized && !this.files.has(parentDir)) {
      if (options?.recursive) {
        this.mkdirSync(parentDir, options)
      } else {
        const error = new Error(`ENOENT: no such file or directory, mkdir '${path}'`)
        ;(error as NodeJS.ErrnoException).code = "ENOENT"
        throw error
      }
    }

    this.files.set(normalized, {
      type: "dir",
      ino: this.nextIno++,
      mtime: Date.now(),
    })
  }

  existsSync(path: string): boolean {
    // existsSync doesn't throw errors, even for permission issues
    return this.files.has(this.normalizePath(path))
  }

  renameSync(oldPath: string, newPath: string): void {
    this.checkErrors(oldPath, "rename")
    this.checkErrors(newPath, "rename")
    const normalizedOld = this.normalizePath(oldPath)
    const normalizedNew = this.normalizePath(newPath)

    const entry = this.files.get(normalizedOld)
    if (!entry) {
      const error = new Error(`ENOENT: no such file or directory, rename '${oldPath}'`)
      ;(error as NodeJS.ErrnoException).code = "ENOENT"
      throw error
    }

    // Ensure parent of new path exists
    const newParent = dirname(normalizedNew)
    if (newParent !== normalizedNew && !this.files.has(newParent)) {
      const error = new Error(`ENOENT: no such file or directory, rename '${newPath}'`)
      ;(error as NodeJS.ErrnoException).code = "ENOENT"
      throw error
    }

    this.files.delete(normalizedOld)
    this.files.set(normalizedNew, { ...entry, mtime: Date.now() })

    // When renaming a directory, cascade to all children (like a real filesystem)
    if (entry.type === "dir") {
      const oldPrefix = normalizedOld + "/"
      const newPrefix = normalizedNew + "/"
      for (const [childPath, childEntry] of this.files) {
        if (childPath.startsWith(oldPrefix)) {
          this.files.delete(childPath)
          this.files.set(newPrefix + childPath.slice(oldPrefix.length), childEntry)
        }
      }
    }
  }

  statSync(path: string): StatResult {
    this.checkErrors(path, "stat")
    const normalized = this.normalizePath(path)
    const entry = this.files.get(normalized)

    if (!entry) {
      const error = new Error(`ENOENT: no such file or directory, stat '${path}'`)
      ;(error as NodeJS.ErrnoException).code = "ENOENT"
      throw error
    }

    const isDir = entry.type === "dir"
    return {
      ino: entry.ino,
      mtimeMs: entry.mtime,
      size: isDir ? 0 : (entry as FileEntry).size,
      isDirectory: () => isDir,
      isFile: () => !isDir,
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DirectoryScanner Implementation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a DirectoryScanner function bound to this MockFileSystem
   */
  createScanner(): DirectoryScanner {
    return (dirPath: string, ignorePatterns?: string[] | PatternMatcher): FsEntry[] => {
      return this.scanDirectory(dirPath, ignorePatterns)
    }
  }

  /**
   * Scan a directory and return entries
   */
  scanDirectory(dirPath: string, ignorePatterns?: string[] | PatternMatcher): FsEntry[] {
    this.checkErrors(dirPath, "scandir")
    const normalized = this.normalizePath(dirPath)
    const entries: FsEntry[] = []

    for (const [path, node] of this.files) {
      // Check if this is a direct child of dirPath
      const parent = dirname(path)
      if (parent !== normalized) continue

      // Skip the directory itself
      if (path === normalized) continue

      // Check ignore patterns
      const name = basename(path)
      if (this.shouldIgnore(name, path, ignorePatterns)) continue

      entries.push({
        path,
        ino: node.ino,
        mtime: node.mtime,
        isDirectory: node.type === "dir",
      })
    }

    return entries
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Test Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Reset filesystem to initial state
   */
  reset(): void {
    this.files.clear()
    this.nextIno = 1
    this.files.set("/", {
      type: "dir",
      ino: this.nextIno++,
      mtime: Date.now(),
    })
    this.clearErrorInjection()
  }

  /**
   * Set mtime for a file (useful for conflict testing)
   */
  setMtime(path: string, mtime: number): void {
    const normalized = this.normalizePath(path)
    const entry = this.files.get(normalized)
    if (entry) {
      entry.mtime = mtime
    }
  }

  /**
   * Get all file paths (for debugging)
   */
  getAllPaths(): string[] {
    return Array.from(this.files.keys()).sort()
  }

  /**
   * Get file content (bypasses error throwing)
   */
  getContent(path: string): string | undefined {
    const entry = this.files.get(this.normalizePath(path))
    return entry?.type === "file" ? entry.content : undefined
  }

  /**
   * Dump filesystem state (for debugging)
   */
  dump(): Record<string, { type: string; size?: number; mtime: number }> {
    const result: Record<string, { type: string; size?: number; mtime: number }> = {}
    for (const [path, node] of this.files) {
      result[path] = {
        type: node.type,
        size: node.type === "file" ? node.size : undefined,
        mtime: node.mtime,
      }
    }
    return result
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private normalizePath(path: string): string {
    // Remove trailing slashes (except for root)
    let normalized = path.replace(/\/+$/, "") || "/"
    // Normalize multiple slashes
    normalized = normalized.replace(/\/+/g, "/")
    return normalized
  }

  private shouldIgnore(name: string, fullPath: string, patterns?: string[] | PatternMatcher): boolean {
    if (!patterns) return false

    // Handle PatternMatcher interface
    if (typeof patterns === "object" && "matches" in patterns) {
      return patterns.matches(fullPath)
    }

    // Simple pattern matching (supports * wildcard and negation)
    for (const pattern of patterns) {
      if (pattern.startsWith("!")) continue // Skip negation patterns for now

      if (pattern.startsWith("**/")) {
        // Match anywhere in path
        const suffix = pattern.slice(3)
        if (name === suffix || name.endsWith("/" + suffix)) return true
      } else if (pattern.includes("*")) {
        // Simple wildcard - escape special regex chars except *, then convert * to .*
        const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        const regex = new RegExp("^" + escaped.replace(/\*/g, ".*") + "$")
        if (regex.test(name)) return true
      } else {
        // Exact match
        if (name === pattern) return true
      }
    }

    return false
  }
}

/**
 * Create a new MockFileSystem instance
 */
export function createFakeFileSystem(): FakeFileSystem {
  return new FakeFileSystem()
}

/** @deprecated Use FakeFileSystem instead */
export const MockFileSystem = FakeFileSystem
/** @deprecated Use createFakeFileSystem instead */
export const createMockFileSystem = createFakeFileSystem
