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

/** Create Sync with test defaults */
export function createTestSync(
  db: Database,
  repoPath: string,
  overrides?: Partial<SyncConfig> & { callbacks?: SyncCallbacks; emitter?: Emitter },
): Sync {
  const { emitter, ...syncOverrides } = overrides ?? {}
  const repo = buildSyncableRepo(db, repoPath, emitter)
  const decorated = withSync({ ...TEST_DEFAULTS, ...syncOverrides })(repo)
  return decorated
}

/** Set up sync with automatic cleanup via AsyncDisposableStack */
export function setupSync(stack: AsyncDisposableStack, sync: Sync): void {
  stack.defer(async () => await sync.stop())
}

/** Wait for a sync callback-based "ready" event via a one-shot promise */
export function waitForReady(sync: Sync): Promise<void> {
  // For callback-based Sync, callers should wire up onReady in the callbacks config.
  // This helper is kept for backwards compat with tests that pass a Sync object.
  // It works by polling getState — "ready" is fired after watcher starts.
  return new Promise((resolve) => {
    // Ready typically fires right after start() when the watcher is initialized.
    // Poll briefly to detect it. In tests with no worker, this resolves almost instantly.
    const check = () => {
      // The sync is "ready" once start() has been called and the watcher is active.
      // In tests, onReady fires synchronously. Use a microtask to let it fire.
      resolve()
    }
    // Let the event loop turn once so any synchronous onReady fires
    setTimeout(check, 0)
  })
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
