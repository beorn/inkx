/**
 * Heartbeat — Periodic reconciliation to catch silently dropped events.
 *
 * Runs on a timer, skips when busy or not idle long enough,
 * and re-projects dirty paths (failed writes recovered by heartbeat).
 *
 * Extracted from SyncManager to separate scheduling concerns from
 * watcher lifecycle and event wiring.
 */

import { createLogger } from "loggily"
import type { Database } from "bun:sqlite"

const log = createLogger("km:storage:watch:heartbeat")

import { toAbsoluteFsPath } from "../path-utils.ts"
import { getAllNodes, getSubtree, nodesToMarkdown } from "../index.ts"
import type { ReconciliationEngine } from "./reconciliation-engine.ts"
import type { SyncState as SyncStateStore } from "./sync-state.ts"
import type { WriteQueue } from "./writequeue.ts"
import type { ParsePoolService } from "../parse-pool.ts"

export interface HeartbeatConfig {
  /** Enable periodic reconciliation to catch silently dropped events (default: true) */
  enabled: boolean
  /** Interval between heartbeat checks in ms (default: 60000 = 1 min) */
  intervalMs: number
  /** Only run heartbeat if idle for this long in ms (default: 30000 = 30s) */
  idleThresholdMs: number
}

export const DEFAULT_HEARTBEAT: HeartbeatConfig = {
  enabled: true,
  intervalMs: 60000, // 1 minute
  idleThresholdMs: 30000, // 30 seconds
}

export type SyncState = "idle" | "fs_debouncing" | "db_debouncing" | "reconciling" | "applying" | "emitting" | "writing"

export interface HeartbeatDeps {
  engine: ReconciliationEngine
  syncState: SyncStateStore
  writeQueue: WriteQueue
  db: Database
  repoPath: string
  ignorePatterns: () => string[]
  getParsePool: () => Promise<ParsePoolService>
  getState: () => SyncState
  setState: (state: SyncState) => void
  isStopped: () => boolean
  onError: (error: unknown) => void
  onDrift: (info: { opsCount: number; totalDrift: number }) => void
  onComplete: (info: { duration: number; opsCount: number }) => void
}

export function createHeartbeat(config: HeartbeatConfig, deps: HeartbeatDeps) {
  let timer: ReturnType<typeof setInterval> | undefined
  let lastActivityTime: number = Date.now()
  let drift: number = 0

  function reprojectDirtyPaths(): void {
    const dirtyPaths = deps.syncState.getDirtyPaths()
    if (dirtyPaths.length === 0) return

    log.debug?.(`re-projecting ${dirtyPaths.length} dirty paths`)
    for (const fsPath of dirtyPaths) {
      try {
        const fileNode = getAllNodes(deps.db).find((n) => n.fs_path === fsPath)
        if (!fileNode) {
          // Node no longer exists -- clear the dirty flag
          deps.syncState.clearDirty(fsPath)
          continue
        }
        const absPath = toAbsoluteFsPath(deps.repoPath, fsPath)
        const subtree = getSubtree(deps.db, fileNode.id)
        const content = nodesToMarkdown(subtree, getAllNodes(deps.db))
        deps.writeQueue.queue({
          path: absPath,
          content,
          sourceEventId: "heartbeat-reproject",
        })
        deps.syncState.clearDirty(fsPath)
      } catch (error) {
        log.debug?.(`failed to re-project ${fsPath}: ${String(error)}`)
      }
    }
  }

  async function run(): Promise<void> {
    if (deps.isStopped()) return

    const now = Date.now()
    const idleTime = now - lastActivityTime

    if (idleTime < config.idleThresholdMs) {
      log.debug?.(`skipping, idle=${idleTime}ms < threshold=${config.idleThresholdMs}ms`)
      return
    }

    if (deps.getState() !== "idle") {
      log.debug?.(`skipping, state=${deps.getState()}`)
      return
    }

    if (deps.writeQueue.getPendingCount() > 0) {
      log.debug?.(`skipping, pending writes=${deps.writeQueue.getPendingCount()}`)
      return
    }

    log.debug?.("running reconciliation")
    const start = Date.now()

    try {
      deps.setState("reconciling")

      const ops = await deps.engine.reconcileAsync(deps.repoPath, deps.ignorePatterns())

      if (ops.length > 0) {
        log.debug?.(`found ${ops.length} changes (drift detected)`)
        drift += ops.length

        deps.setState("emitting")
        await deps.engine.applyOpsAsync(ops, await deps.getParsePool())

        deps.onDrift({
          opsCount: ops.length,
          totalDrift: drift,
        })
      }

      // Re-project dirty paths (failed writes recovered by heartbeat)
      reprojectDirtyPaths()

      log.debug?.(`completed in ${Date.now() - start}ms, ops=${ops.length}`)
      deps.onComplete({
        duration: Date.now() - start,
        opsCount: ops.length,
      })
    } catch (error) {
      log.debug?.(`error ${String(error)}`)
      deps.onError(error)
    } finally {
      deps.setState("idle")
    }
  }

  return {
    start(): void {
      if (!config.enabled) {
        log.debug?.("heartbeat disabled")
        return
      }
      if (timer) return

      log.debug?.(`starting: interval=${config.intervalMs}ms, idleThreshold=${config.idleThresholdMs}ms`)

      timer = setInterval(() => {
        void run()
      }, config.intervalMs)
    },

    stop(): void {
      if (timer) {
        clearInterval(timer)
        timer = undefined
        log.debug?.("stopped")
      }
    },

    /**
     * Force a heartbeat reconciliation now (synchronous, for testing/debugging).
     */
    force(): { opsCount: number; duration: number } {
      const start = Date.now()
      deps.setState("reconciling")

      try {
        const ops = deps.engine.reconcile(deps.repoPath, deps.ignorePatterns())

        if (ops.length > 0) {
          deps.setState("emitting")
          deps.engine.applyOps(ops)
          drift += ops.length
        }

        // Re-project dirty paths
        reprojectDirtyPaths()

        return { opsCount: ops.length, duration: Date.now() - start }
      } finally {
        deps.setState("idle")
      }
    },

    diagnostics(): {
      enabled: boolean
      totalDrift: number
      lastActivityTime: number
      idleSinceMs: number
    } {
      return {
        enabled: config.enabled,
        totalDrift: drift,
        lastActivityTime,
        idleSinceMs: Date.now() - lastActivityTime,
      }
    },

    touchActivity(): void {
      lastActivityTime = Date.now()
    },
  }
}

export type Heartbeat = ReturnType<typeof createHeartbeat>
