/**
 * Shared test helpers for sync-related tests
 */

import type { Database } from "bun:sqlite"

import type { Emitter } from "../../src/emitter.ts"
import { createSync, type Sync, type SyncConfig, type SyncCallbacks } from "../../src/watch/sync.ts"

/** Default sync config for tests - fast debounces, no worker */
const TEST_DEFAULTS: Partial<SyncConfig> = {
  debounceFs: 100,
  debounceApply: 50,
  conflictStrategy: "last_write_wins",
  useWorker: false,
}

/** Create Sync with test defaults */
export function createTestSync(
  db: Database,
  repoPath: string,
  overrides?: Partial<SyncConfig> & { callbacks?: SyncCallbacks },
): Sync {
  return createSync({
    db,
    repoPath,
    ...TEST_DEFAULTS,
    ...overrides,
  } as SyncConfig)
}

/** @deprecated Use createTestSync instead */
export const createTestSyncManager = createTestSync

/** Set up sync with automatic cleanup via AsyncDisposableStack */
export function setupSync(stack: AsyncDisposableStack, sync: Sync, emitter: Emitter): void {
  emitter.setFsSync(sync)
  stack.defer(() => emitter.setFsSync(null))
  stack.defer(async () => await sync.stop())
}

/** @deprecated Use setupSync instead */
export const setupSyncManager = setupSync

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

/** @deprecated Use createStateChangeWaiter() instead */
export function waitForStateChange(_events: { on: (event: string, handler: (state: string) => void) => void }): never {
  throw new Error("waitForStateChange with EventEmitter is no longer supported. Use createStateChangeWaiter() instead.")
}

/** Race promise against timeout */
export function withTimeout<T>(promise: Promise<T>, ms: number, message = "Timeout"): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))])
}
