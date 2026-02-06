/**
 * Filesystem Watcher
 *
 * Watches for filesystem changes and triggers reconciliation
 */

import { createLogger } from "@beorn/logger"
import { watch, type FSWatcher } from "chokidar"

const log = createLogger("km:storage:watch:watcher")
import { dirname, join } from "path"
import {
  statSync,
  existsSync,
  readdirSync,
  readlinkSync,
  writeFileSync,
  unlinkSync,
} from "fs"
import { EventEmitter } from "events"
import {
  DEFAULT_IGNORE_PATTERNS,
  createIgnoreMatcher,
  shouldIgnore,
  isHiddenFile,
  type PatternMatcher,
} from "../ignore.ts"

export interface WatcherConfig {
  debounceMs: number
  ignored: string[]
}

const DEFAULT_CONFIG: WatcherConfig = {
  debounceMs: 5000,
  ignored: DEFAULT_IGNORE_PATTERNS,
}

export interface FileChange {
  type: "add" | "change" | "unlink" | "addDir" | "unlinkDir"
  path: string
  ino?: number
}

export class FileSystemWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null
  private pendingPaths: Set<string> = new Set()
  private debounceTimer: ReturnType<typeof setTimeout> | undefined
  private config: WatcherConfig
  private repoPath: string = ""
  private inFlightWrites: Set<string> = new Set()

  constructor(config: Partial<WatcherConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Start watching a directory
   */
  start(repoPath: string): void {
    this.repoPath = repoPath
    log.debug?.(`starting watcher for ${repoPath}`)

    // Load ignore patterns and pre-compile once
    const ignoreMatcher = createIgnoreMatcher(repoPath)
    log.debug?.(`ignore patterns: ${ignoreMatcher.size} compiled`)

    // Create ignored function that combines patterns with file type check
    // This prevents chokidar from trying to watch socket files (which causes EOPNOTSUPP)
    const ignoredFn = (path: string, stats?: { isSocket?: () => boolean }) => {
      // Always ignore socket files - they can't be watched
      if (stats?.isSocket?.()) {
        return true
      }
      // Also ignore by extension for paths we see before stat
      if (path.endsWith(".sock")) {
        return true
      }
      // Check against pre-compiled patterns (fast)
      return ignoreMatcher.matches(path, repoPath)
    }

    this.watcher = watch(repoPath, {
      persistent: true,
      ignoreInitial: true,
      ignored: ignoredFn,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    })

    this.watcher.on("all", (event, path) => {
      // Skip in-flight writes (our own writes)
      if (this.inFlightWrites.has(path)) {
        log.debug?.(`skipping in-flight: ${event} ${path}`)
        return
      }

      log.debug?.(`fs event: ${event} ${path}`)
      this.pendingPaths.add(path)
      this.scheduleSync()
    })

    this.watcher.on("error", (error) => {
      log.debug?.(`watcher error: ${String(error)}`)
      this.emit("error", error)
    })

    this.watcher.on("ready", () => {
      log.debug?.("watcher ready")
      this.emit("ready")
    })
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    log.debug?.("stopping watcher")
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = undefined
    }

    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
  }

  /**
   * Mark a path as in-flight (being written by us)
   */
  markInFlight(path: string): void {
    log.debug?.(`marking in-flight: ${path}`)
    this.inFlightWrites.add(path)
  }

  /**
   * Clear in-flight status after write settles
   */
  clearInFlight(path: string, delayMs: number = 1000): void {
    setTimeout(() => {
      this.inFlightWrites.delete(path)
    }, delayMs)
  }

  /**
   * Check if a path is in-flight
   */
  isInFlight(path: string): boolean {
    return this.inFlightWrites.has(path)
  }

  /**
   * Schedule a sync after debounce period
   */
  private scheduleSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    log.debug?.(
      `scheduling sync in ${this.config.debounceMs}ms (${this.pendingPaths.size} pending)`,
    )
    this.debounceTimer = setTimeout(() => {
      this.sync()
    }, this.config.debounceMs)
  }

  /**
   * Process pending changes
   */
  private sync(): void {
    const paths = [...this.pendingPaths]
    this.pendingPaths.clear()

    if (paths.length === 0) {
      log.debug?.("sync: no pending paths")
      return
    }

    // Group by directory for efficient scanning
    const dirs = new Set<string>()
    for (const path of paths) {
      dirs.add(dirname(path))
    }

    log.debug?.(
      `sync: emitting ${paths.length} paths, ${dirs.size} directories`,
    )

    // Emit sync event with affected directories
    this.emit("sync", {
      paths,
      directories: [...dirs],
    })
  }

  /**
   * Force immediate sync (bypass debounce)
   */
  forceSync(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = undefined
    }
    this.sync()
  }

  /**
   * Get file identity (for rename detection)
   */
  static getFileIdentity(
    path: string,
  ): { ino: number; path: string; mtime: number; size: number } | null {
    try {
      const stat = statSync(path)
      return {
        ino: stat.ino,
        path,
        mtime: stat.mtimeMs,
        size: stat.size,
      }
    } catch {
      return null
    }
  }
}

/**
 * Information about detected symlinks (for user notification)
 */
export interface SymlinkInfo {
  path: string
  target: string | null
}

/**
 * Scan a directory for files, applying ignore patterns.
 * Symlinks are skipped to avoid potential infinite loops from circular symlinks.
 *
 * @param ignorePatterns - Either string[] (legacy, slow) or PatternMatcher (fast)
 */
export function scanDirectory(
  dirPath: string,
  ignorePatterns?: string[] | PatternMatcher,
): Array<{
  path: string
  ino: number
  mtime: number
  isDirectory: boolean
  isSymlink?: boolean
}> {
  const results: Array<{
    path: string
    ino: number
    mtime: number
    isDirectory: boolean
    isSymlink?: boolean
  }> = []

  if (!existsSync(dirPath)) {
    return results
  }

  const entries = readdirSync(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)

    // Skip hidden files (files starting with .)
    if (isHiddenFile(fullPath)) {
      continue
    }

    // Skip files matching ignore patterns (works with both string[] and PatternMatcher)
    if (ignorePatterns && shouldIgnore(fullPath, ignorePatterns)) {
      continue
    }

    // Skip symlinks to avoid potential infinite loops and inconsistent behavior
    // Symlinks pointing to directories above the repo root could cause:
    // - Infinite recursion during scans
    // - Duplicate nodes if symlink target is also in repo
    // - Confusing behavior if symlink target is modified
    if (entry.isSymbolicLink()) {
      log.debug?.(`skipping symlink: ${fullPath}`)
      continue
    }

    try {
      const stat = statSync(fullPath)
      results.push({
        path: fullPath,
        ino: stat.ino,
        mtime: stat.mtimeMs,
        isDirectory: entry.isDirectory(),
      })
    } catch {
      // Skip inaccessible files
    }
  }

  return results
}

/** Entry from directory scan */
export interface ScanEntry {
  path: string
  ino: number
  mtime: number
  isDirectory: boolean
}

/**
 * Recursively scan directory tree (generator version)
 * Yields entries as they're found for progress reporting.
 *
 * @param ignorePatterns - Either string[] (legacy, slow) or PatternMatcher (fast)
 */
export function* scanDirectoryRecursiveGen(
  dirPath: string,
  filter?: (path: string) => boolean,
  ignorePatterns?: string[] | PatternMatcher,
): Generator<ScanEntry, void, unknown> {
  function* scan(dir: string): Generator<ScanEntry, void, unknown> {
    const entries = scanDirectory(dir, ignorePatterns)

    for (const entry of entries) {
      // Always recurse into directories
      if (entry.isDirectory) {
        yield* scan(entry.path)
      }

      // Apply filter to determine if entry should be yielded
      if (filter && !filter(entry.path)) {
        continue
      }

      yield entry
    }
  }

  yield* scan(dirPath)
}

/**
 * Recursively scan directory tree (array version)
 * Returns all entries at once - use scanDirectoryRecursiveGen for progress.
 *
 * @param ignorePatterns - Either string[] (legacy, slow) or PatternMatcher (fast)
 */
export function scanDirectoryRecursive(
  dirPath: string,
  filter?: (path: string) => boolean,
  ignorePatterns?: string[] | PatternMatcher,
): ScanEntry[] {
  return [...scanDirectoryRecursiveGen(dirPath, filter, ignorePatterns)]
}

/**
 * Scan a directory for symlinks (for user notification purposes).
 * Returns information about symlinks found, including their targets.
 */
export function scanSymlinks(
  dirPath: string,
  ignorePatterns?: string[],
  recursive: boolean = false,
): SymlinkInfo[] {
  const symlinks: SymlinkInfo[] = []

  function scan(dir: string) {
    if (!existsSync(dir)) {
      return
    }

    const entries = readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)

      // Skip hidden files
      if (isHiddenFile(fullPath)) {
        continue
      }

      // Skip files matching ignore patterns
      if (ignorePatterns && shouldIgnore(fullPath, ignorePatterns)) {
        continue
      }

      if (entry.isSymbolicLink()) {
        // Read symlink target
        let target: string | null = null
        try {
          target = readlinkSync(fullPath)
        } catch {
          // Target unreadable
        }
        symlinks.push({ path: fullPath, target })
      } else if (recursive && entry.isDirectory()) {
        scan(fullPath)
      }
    }
  }

  scan(dirPath)
  return symlinks
}

/**
 * Information about case collisions (files that would conflict on case-insensitive FS)
 */
export interface CaseCollision {
  /** Normalized lowercase path */
  normalizedPath: string
  /** All paths that collide (differ only by case) */
  paths: string[]
}

/**
 * Detect if the filesystem at a given path is case-sensitive.
 *
 * This creates a temporary test file to check the actual filesystem behavior,
 * which is more reliable than checking the OS since:
 * - macOS can have case-sensitive volumes (APFS case-sensitive)
 * - Linux can have case-insensitive mounts (e.g., NTFS, exFAT)
 * - Network filesystems may have different behavior
 *
 * @param dirPath Directory to test (must exist and be writable)
 * @returns true if case-sensitive, false if case-insensitive
 */
export function detectCaseSensitivity(dirPath: string): boolean {
  const testFile = join(dirPath, `.km-case-test-${Date.now()}`)
  const testFileUpper = testFile.toUpperCase()

  try {
    // Create a lowercase test file
    writeFileSync(testFile, "")

    // Check if the uppercase version exists (would be same file on case-insensitive FS)
    const isCaseInsensitive = existsSync(testFileUpper)

    // Clean up
    unlinkSync(testFile)

    return !isCaseInsensitive
  } catch {
    // If we can't test, assume case-sensitive (safer default)
    log.debug?.(
      `could not detect case sensitivity, assuming case-sensitive dirPath=${dirPath}`,
    )
    return true
  }
}

/**
 * Normalize a path for case-insensitive comparison.
 * Only lowercases if caseSensitive is false.
 */
export function normalizePath(path: string, caseSensitive: boolean): string {
  return caseSensitive ? path : path.toLowerCase()
}

/**
 * Detect case collisions in a directory - files that would conflict on case-insensitive filesystems.
 *
 * This is useful for:
 * - Warning users moving from Linux to macOS/Windows
 * - Identifying potential sync issues with case-insensitive remotes (Dropbox, iCloud)
 *
 * @param dirPath Directory to scan
 * @param recursive Whether to scan subdirectories
 * @returns Array of collision groups
 */
export function detectCaseCollisions(
  dirPath: string,
  recursive: boolean = false,
): CaseCollision[] {
  const pathsByNormalized = new Map<string, string[]>()

  function scan(dir: string) {
    if (!existsSync(dir)) {
      return
    }

    const entries = readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = join(dir, entry.name)

      // Skip hidden files
      if (isHiddenFile(fullPath)) {
        continue
      }

      // Skip symlinks
      if (entry.isSymbolicLink()) {
        continue
      }

      const normalized = fullPath.toLowerCase()
      const existing = pathsByNormalized.get(normalized) ?? []
      existing.push(fullPath)
      pathsByNormalized.set(normalized, existing)

      if (recursive && entry.isDirectory()) {
        scan(fullPath)
      }
    }
  }

  scan(dirPath)

  // Filter to only collisions (more than one path per normalized key)
  const collisions: CaseCollision[] = []
  for (const [normalizedPath, paths] of pathsByNormalized) {
    if (paths.length > 1) {
      collisions.push({ normalizedPath, paths })
    }
  }

  return collisions
}
