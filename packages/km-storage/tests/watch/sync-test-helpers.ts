/**
 * Shared test helpers for sync-related tests
 */

import type { EventEmitter } from "events"
import type { Database } from "bun:sqlite"

import type { Emitter } from "../../src/emitter.ts"
import { SyncManager, type SyncConfig } from "../../src/watch/sync.ts"

/** Default sync config for tests - fast debounces, no worker */
const TEST_DEFAULTS: Partial<SyncConfig> = {
  debounceFs: 100,
  debounceApply: 50,
  conflictStrategy: "last_write_wins",
  useWorker: false,
}

/** Create SyncManager with test defaults */
export function createTestSyncManager(db: Database, repoPath: string, overrides?: Partial<SyncConfig>): SyncManager {
  return new SyncManager({
    db,
    repoPath,
    ...TEST_DEFAULTS,
    ...overrides,
  } as SyncConfig)
}

/** Set up sync manager with automatic cleanup via AsyncDisposableStack */
export function setupSyncManager(stack: AsyncDisposableStack, syncManager: SyncManager, emitter: Emitter): void {
  emitter.setFsSync(syncManager)
  stack.defer(() => emitter.setFsSync(null))
  stack.defer(async () => await syncManager.stop())
}

/** Wait for syncManager to be ready */
export function waitForReady(syncManager: SyncManager): Promise<void> {
  return new Promise((resolve) => {
    syncManager.once("ready", resolve)
  })
}

/** Wait for a full state-change cycle (reconciling → idle) */
export function waitForStateChange(events: EventEmitter): Promise<void> {
  return new Promise((resolve) => {
    let sawReconciling = false
    const handler = (state: string) => {
      if (state === "reconciling") {
        sawReconciling = true
      }
      if (state === "idle" && sawReconciling) {
        events.off("state-change", handler)
        resolve()
      }
    }
    events.on("state-change", handler)
  })
}

/** Race promise against timeout */
export function withTimeout<T>(promise: Promise<T>, ms: number, message = "Timeout"): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))])
}
