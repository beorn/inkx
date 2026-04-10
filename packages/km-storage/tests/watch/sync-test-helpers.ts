/**
 * Shared test helpers for sync-related tests
 */

import type { Database } from "bun:sqlite"
import { join } from "path"

import { createEmitter, type Emitter } from "../../src/emitter.ts"
import { withSync, type Sync, type SyncConfig, type SyncableRepo, type SyncCallbacks } from "../../src/watch/sync.ts"

/** Default sync config for tests - fast debounces, no worker */
const TEST_DEFAULTS: Partial<SyncConfig> = {
  debounceFs: 100,
  debounceApply: 50,
  conflictStrategy: "last_write_wins",
  useWorker: false,
}

/** Build a minimal SyncableRepo from db + repoPath (for tests without a full Repo) */
function buildSyncableRepo(db: Database, repoPath: string, existingEmitter?: Emitter): SyncableRepo {
  const emitter = existingEmitter ?? createEmitter({ kmDir: join(repoPath, ".km"), db })
  return {
    database: db,
    path: repoPath,
    emitter,
    apply(event, options?) {
      return emitter.apply(event, options)
    },
    commit(event, options?) {
      return emitter.commit(event, options)
    },
  }
}

// Map from Sync instance to its "ready" promise. createTestSync captures the
// onReady callback here so waitForReady(sync) can await the real watcher ready
// event (instead of resolving instantly on the next tick).
const readyPromises = new WeakMap<Sync, Promise<void>>()

/** Create Sync with test defaults */
export function createTestSync(
  db: Database,
  repoPath: string,
  overrides?: Partial<SyncConfig> & { callbacks?: SyncCallbacks; emitter?: Emitter },
): Sync {
  const { emitter, callbacks: userCallbacks, ...syncOverrides } = overrides ?? {}
  const repo = buildSyncableRepo(db, repoPath, emitter)

  // Wire onReady into a promise that waitForReady() can await. Chain the
  // user-provided onReady so the test can still observe it if needed.
  let resolveReady!: () => void
  const readyPromise = new Promise<void>((r) => {
    resolveReady = r
  })
  const callbacks: SyncCallbacks = {
    ...userCallbacks,
    onReady: () => {
      userCallbacks?.onReady?.()
      resolveReady()
    },
  }

  const decorated = withSync({ ...TEST_DEFAULTS, ...syncOverrides, callbacks })(repo)
  readyPromises.set(decorated, readyPromise)
  return decorated
}

/** Set up sync with automatic cleanup via AsyncDisposableStack */
export function setupSync(stack: AsyncDisposableStack, sync: Sync): void {
  stack.defer(async () => await sync.stop())
}

/**
 * Wait for the watcher's real "ready" event.
 *
 * Resolves when chokidar finishes its initial scan. This is essential for
 * delete/rename tests — without it, the watcher may miss events fired right
 * after start() returns.
 */
export function waitForReady(sync: Sync): Promise<void> {
  const promise = readyPromises.get(sync)
  if (!promise) {
    // Backwards-compat fallback for any callers that didn't go through
    // createTestSync — resolve on the next tick.
    return new Promise((resolve) => setTimeout(resolve, 0))
  }
  return promise
}

/**
 * Wait for a full state-change cycle (reconciling → idle).
 *
 * Callers must pass the callbacks-based approach: create Sync with an
 * onStateChange callback that calls the returned resolver.
 */
export interface StateChangeWaiter {
  /** Promise that resolves on reconciling → idle cycle */
  promise: Promise<void>
  /** The onStateChange handler to wire into SyncCallbacks */
  handler: (state: string) => void
}

export function createStateChangeWaiter(): StateChangeWaiter {
  let sawReconciling = false
  let resolve: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  const handler = (state: string) => {
    if (state === "reconciling") {
      sawReconciling = true
    }
    if (state === "idle" && sawReconciling) {
      sawReconciling = false
      resolve()
    }
  }
  return { promise, handler }
}

/** Race promise against timeout */
export function withTimeout<T>(promise: Promise<T>, ms: number, message = "Timeout"): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))])
}
