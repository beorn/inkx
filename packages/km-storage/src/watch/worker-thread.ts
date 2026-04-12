/**
 * Watcher Worker
 *
 * Runs chokidar file watching in a separate thread to avoid blocking the main event loop.
 * Chokidar's FSEvents setup can block for 20+ seconds on large directories (21k+ files).
 */

import { watch, type FSWatcher } from "chokidar"
import { dirname } from "path"
import { createWorkerLogger } from "loggily/worker"

// Create worker logger that forwards to main thread
const log = createWorkerLogger(postMessage, "km:storage:watch:worker")

// Helper for debug logging with format string support
function debug(message: string, ...args: unknown[]): void {
  // Format the message with args (simple %s/%d/%O replacement)
  let formatted = message
  let argIndex = 0
  formatted = message.replace(/%[sdOo]/g, () => {
    const arg = args[argIndex++]
    if (arg === undefined) return ""
    if (arg === null) return "null"
    if (typeof arg === "object") return JSON.stringify(arg)
    return String(arg)
  })
  log.debug?.(formatted)
}

// Message types from main thread → worker
export type WorkerCommand =
  | {
      type: "start"
      repoPath: string
      ignorePatterns: string[]
      debounceMs: number
    }
  | { type: "stop" }
  | { type: "markInFlight"; path: string }
  | { type: "clearInFlight"; path: string; delayMs: number }
  | { type: "forceSync" }
  | { type: "getStatus" }

/** Watcher state for status reporting */
export type WatcherState = "starting" | "ready" | "syncing" | "idle" | "stopped" | "error"

/** Status information from the watcher */
export interface WatcherStatus {
  state: WatcherState
  pendingPaths: number
  watchedPaths?: number
  lastSync?: number // timestamp
  error?: string
}

// Message types from worker → main thread
import type { Event as LoggerEvent } from "loggily"

export type WorkerMessage =
  | { type: "ready"; watchedPaths?: number }
  | { type: "sync"; paths: string[]; directories: string[] }
  | { type: "error"; message: string; stack?: string }
  | { type: "stopped" }
  | { type: "status"; status: WatcherStatus }
  | LoggerEvent

// Worker state
let watcher: FSWatcher | null = null
const pendingPaths: Set<string> = new Set()
let debounceTimer: ReturnType<typeof setTimeout> | undefined
const inFlightWrites: Set<string> = new Set()
let currentDebounceMs = 5000
let currentState: WatcherState = "stopped"
let watchedPathCount = 0
let lastSyncTime: number | undefined
let lastError: string | undefined
// Timer ID type - setInterval returns Timer in Node/Bun
let statusInterval: ReturnType<typeof setInterval> | undefined

/**
 * Check if path should be ignored based on patterns
 *
 * Supported patterns:
 * - **\/foo/**: Match "foo" directory anywhere in path (e.g., .git, node_modules)
 * - **\/foo: Match "foo" anywhere in path
 * - foo/**: Match anything under "foo" directory at root
 * - *.ext: Match files with extension
 * - exact: Exact match or as directory prefix
 */
// oxlint-disable-next-line complexity/complexity -- Glob matching with 5 distinct pattern types
function shouldIgnore(path: string, patterns: string[], repoPath: string): boolean {
  const relativePath = path.replace(repoPath, "").replace(/^\//, "")

  // Debug: check .git and vendor paths specifically
  if (relativePath.includes(".git") || relativePath.includes("vendor")) {
    debug("worker: shouldIgnore check", { path, relativePath })
  }

  for (const pattern of patterns) {
    // Handle **/.git/** pattern - match directory anywhere in path
    if (pattern.startsWith("**/") && pattern.endsWith("/**")) {
      // Extract the middle part: **/.git/** -> .git
      const middle = pattern.slice(3, -3)
      // Match if path contains /middle/ OR starts with middle/ OR equals middle
      if (
        relativePath.includes("/" + middle + "/") ||
        relativePath.startsWith(middle + "/") ||
        relativePath === middle
      ) {
        if (relativePath.includes(".git") || relativePath.includes("vendor")) {
          debug("worker: shouldIgnore MATCHED", { pattern, middle })
        }
        return true
      }
    } else if (pattern.startsWith("**/")) {
      // Match suffix anywhere in path: **/foo matches any path ending with /foo or equal to foo
      const suffix = pattern.slice(3)
      if (
        relativePath === suffix ||
        relativePath.endsWith("/" + suffix) ||
        relativePath.includes("/" + suffix + "/") ||
        relativePath.startsWith(suffix + "/")
      ) {
        return true
      }
    } else if (pattern.endsWith("/**")) {
      // Match directory prefix: foo/** matches foo and anything under foo
      const prefix = pattern.slice(0, -3)
      if (relativePath === prefix || relativePath.startsWith(prefix + "/")) {
        return true
      }
    } else if (pattern.includes("*")) {
      // Simple wildcard - convert to regex
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$")
      if (regex.test(relativePath)) {
        return true
      }
    } else {
      // Exact match or directory prefix
      if (relativePath === pattern || relativePath.startsWith(pattern + "/")) {
        return true
      }
    }
  }

  return false
}

/**
 * Emit current status
 */
function emitStatus(): void {
  postMessage({
    type: "status",
    status: {
      state: currentState,
      pendingPaths: pendingPaths.size,
      watchedPaths: watchedPathCount,
      lastSync: lastSyncTime,
      error: lastError,
    },
  } satisfies WorkerMessage)
}

/**
 * Update state and emit status
 */
function setState(newState: WatcherState): void {
  if (currentState !== newState) {
    debug("worker: state %s → %s", currentState, newState)
    currentState = newState
    emitStatus()
  }
}

/**
 * Start watching a directory
 */
function startWatcher(repoPath: string, ignorePatterns: string[], debounceMs: number): void {
  debug("worker: starting watcher for %s", repoPath)
  currentDebounceMs = debounceMs
  setState("starting")
  lastError = undefined

  // Create ignored function that combines patterns with file type check
  const ignoredFn = (path: string, stats?: { isSocket?: () => boolean }) => {
    // Always ignore socket files
    if (stats?.isSocket?.()) {
      return true
    }
    if (path.endsWith(".sock")) {
      return true
    }
    const result = shouldIgnore(path, ignorePatterns, repoPath)
    // Debug: log when ignored function is called for .git/vendor paths
    if (path.includes(".git") || path.includes("vendor")) {
      debug("worker: ignoredFn called: path=%s result=%s", path, result)
    }
    return result
  }

  watcher = watch(repoPath, {
    persistent: true,
    ignoreInitial: true,
    ignored: ignoredFn,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  })

  watcher.on("all", (event, path) => {
    // Skip in-flight writes (our own writes)
    if (inFlightWrites.has(path)) {
      debug("worker: skipping in-flight: %s %s", event, path)
      return
    }

    // Double-check ignored paths (FSEvents on macOS may bypass chokidar's ignored filter)
    if (shouldIgnore(path, ignorePatterns, repoPath)) {
      debug("worker: filtering ignored path: %s %s", event, path)
      return
    }

    debug("worker: fs event: %s %s", event, path)
    pendingPaths.add(path)
    scheduleSync()
  })

  watcher.on("error", (err: unknown) => {
    const error = err instanceof Error ? err : new Error(String(err))
    debug("worker: watcher error: %O", error)
    lastError = error.message
    setState("error")
    postMessage({
      type: "error",
      message: error.message,
      stack: error.stack,
    } satisfies WorkerMessage)
  })

  watcher.on("ready", () => {
    debug("worker: watcher ready")
    // Get watched path count from chokidar
    const watched = watcher?.getWatched()
    if (watched) {
      watchedPathCount = Object.keys(watched).length
    }
    setState("idle")
    postMessage({
      type: "ready",
      watchedPaths: watchedPathCount,
    } satisfies WorkerMessage)

    // Start periodic status updates (every 5 seconds)
    if (statusInterval) {
      clearInterval(statusInterval)
    }
    statusInterval = setInterval(() => {
      emitStatus()
    }, 5000)
  })
}

/**
 * Stop watching
 */
async function stopWatcher(): Promise<void> {
  debug("worker: stopping watcher")

  // Stop status interval
  if (statusInterval) {
    clearInterval(statusInterval)
    statusInterval = undefined
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = undefined
  }

  if (watcher) {
    await watcher.close()
    watcher = null
  }

  pendingPaths.clear()
  inFlightWrites.clear()
  watchedPathCount = 0

  setState("stopped")
  postMessage({ type: "stopped" } satisfies WorkerMessage)

  // Exit the worker thread cleanly after sending stopped message
  // This prevents the main process from hanging while waiting for the worker
  // Note: We use setTimeout to ensure the message is posted before exiting
  setTimeout(() => {
    process.exit(0)
  }, 50)
}

/**
 * Schedule a sync after debounce period
 */
function scheduleSync(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }

  setState("syncing")
  debug("worker: scheduling sync in %dms (%d pending)", currentDebounceMs, pendingPaths.size)
  debounceTimer = setTimeout(() => {
    emitSync()
  }, currentDebounceMs)
}

/**
 * Emit sync event with pending paths
 */
function emitSync(): void {
  const paths = [...pendingPaths]
  pendingPaths.clear()
  debounceTimer = undefined

  if (paths.length === 0) {
    debug("worker: sync: no pending paths")
    setState("idle")
    return
  }

  // Group by directory
  const dirs = new Set<string>()
  for (const path of paths) {
    dirs.add(dirname(path))
  }

  debug("worker: sync: emitting %d paths, %d directories", paths.length, dirs.size)
  lastSyncTime = Date.now()

  postMessage({
    type: "sync",
    paths,
    directories: [...dirs],
  } satisfies WorkerMessage)

  setState("idle")
}

/**
 * Handle messages from main thread
 */
function handleMessage(command: WorkerCommand): void {
  switch (command.type) {
    case "start":
      startWatcher(command.repoPath, command.ignorePatterns, command.debounceMs)
      break

    case "stop":
      void stopWatcher()
      break

    case "markInFlight":
      debug("worker: marking in-flight: %s", command.path)
      inFlightWrites.add(command.path)
      break

    case "clearInFlight":
      setTimeout(() => {
        inFlightWrites.delete(command.path)
      }, command.delayMs)
      break

    case "forceSync":
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = undefined
      }
      emitSync()
      break

    case "getStatus":
      emitStatus()
      break
  }
}

// Listen for messages from main thread
// Use Bun's self.onmessage for worker threads
declare const self: {
  onmessage: ((event: MessageEvent<WorkerCommand>) => void) | null
  postMessage: (message: WorkerMessage) => void
}

// Bun workers use self.onmessage
self.onmessage = (event: MessageEvent<WorkerCommand>) => {
  handleMessage(event.data)
}

// Also export for type checking
export { handleMessage }
