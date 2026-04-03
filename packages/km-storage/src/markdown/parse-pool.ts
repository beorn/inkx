/**
 * Parse Worker Pool
 *
 * Manages a pool of worker threads for parallel markdown parsing.
 * km-fast-md.6: Worker pool for parallel parsing
 * km-disposable.3: Wrapped with Service factory pattern
 */

import { createLogger } from "loggily"
import { cpus } from "os"
import type { ServiceStatus } from "../watcher.ts"
import type { ParseRequest, WorkerMessage, WorkerResponse } from "./parse-worker.ts"

const log = createLogger("km:storage:parse-pool")

export interface ParseResult {
  nodeId: string
  fsPath: string
  nodes: unknown[]
  wikilinks: unknown[]
  /** SHA-256 hash of file content (for change detection) */
  hash: string
  /** Filesystem inode */
  ino: number
  /** Filesystem mtime in ms */
  mtime: number
  error?: string
}

export interface ParsePoolOptions {
  /** Number of worker threads (default: CPU count - 1, min 1) */
  poolSize?: number
}

/**
 * Internal ParsePool interface for the pool implementation.
 */
interface ParsePoolInternal {
  start(): Promise<void>
  parse(nodeId: string, fsPath: string): Promise<ParseResult>
  parseMany(
    files: Array<{ nodeId: string; fsPath: string }>,
    onProgress?: (current: number, total: number) => void,
    shouldAbort?: () => boolean,
  ): Promise<ParseResult[]>
  stream(files: Array<{ nodeId: string; fsPath: string }>, signal?: AbortSignal): AsyncGenerator<ParseResult>
  shutdown(): Promise<void>
}

/**
 * Create a pool of worker threads for parallel markdown parsing.
 */
function createParsePoolInternal(options?: ParsePoolOptions): ParsePoolInternal {
  const poolSize = options?.poolSize ?? Math.max(1, cpus().length - 1)
  log.debug?.(`creating pool with ${poolSize} workers`)

  // Internal state
  let workers: Worker[] = []
  let availableWorkers: Worker[] = []
  const pendingRequests = new Map<
    number,
    {
      resolve: (result: ParseResult) => void
      reject: (error: Error) => void
    }
  >()
  const requestQueue: ParseRequest[] = []
  let nextRequestId = 0
  let shutdownPromise: Promise<void> | null = null

  return {
    async start() {
      log.debug?.("starting pool")

      const readyPromises: Promise<void>[] = []

      for (let i = 0; i < poolSize; i++) {
        const worker = new Worker(new URL("./parse-worker.ts", import.meta.url))

        const readyPromise = new Promise<void>((resolve) => {
          const onMessage = (event: MessageEvent<WorkerResponse>) => {
            if (event.data.type === "ready") {
              worker.removeEventListener("message", onMessage)
              resolve()
            }
          }
          worker.addEventListener("message", onMessage)
        })
        readyPromises.push(readyPromise)

        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          handleWorkerMessage(worker, event.data)
        }

        worker.onerror = (error: ErrorEvent) => {
          log.debug?.(`worker error: ${error.message}`)
        }

        workers.push(worker)
      }

      await Promise.all(readyPromises)
      availableWorkers = [...workers]
      log.debug?.(`pool started, ${workers.length} workers ready`)
    },

    parse(nodeId, fsPath) {
      return new Promise((resolve, reject) => {
        const id = nextRequestId++

        pendingRequests.set(id, { resolve, reject })

        const request: ParseRequest = {
          type: "parse",
          id,
          nodeId,
          fsPath,
        }

        // If a worker is available, dispatch immediately
        const worker = availableWorkers.pop()
        if (worker) {
          worker.postMessage(request)
        } else {
          // Queue the request
          requestQueue.push(request)
        }
      })
    },

    async parseMany(files, onProgress, shouldAbort) {
      const total = files.length
      const results: ParseResult[] = []
      let completed = 0

      const promises = files.map(async ({ nodeId, fsPath }) => {
        if (shouldAbort?.()) {
          return null
        }

        const result = await this.parse(nodeId, fsPath)
        completed++
        onProgress?.(completed, total)
        return result
      })

      for (const promise of promises) {
        const result = await promise
        if (result) {
          results.push(result)
        }
        if (shouldAbort?.()) {
          break
        }
      }

      return results
    },

    async *stream(files, signal) {
      if (files.length === 0) return

      // Create all parse promises upfront
      const pending = new Map<string, Promise<ParseResult>>()

      for (const file of files) {
        const parsePromise = this.parse(file.nodeId, file.fsPath)
        pending.set(file.fsPath, parsePromise)
      }

      // Yield as each completes
      while (pending.size > 0) {
        if (signal?.aborted) return

        // Race all pending promises
        const result = await Promise.race(pending.values())

        pending.delete(result.fsPath)
        yield result
      }
    },

    async shutdown() {
      if (shutdownPromise) {
        return shutdownPromise
      }

      log.debug?.("shutting down pool")

      shutdownPromise = (async () => {
        await Promise.all(
          workers.map(
            (worker) =>
              new Promise<void>((resolve) => {
                const timeout = setTimeout(() => {
                  worker.terminate()
                  resolve()
                }, 1000)

                worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
                  if (event.data.type === "shutdown") {
                    clearTimeout(timeout)
                    worker.terminate()
                    resolve()
                  }
                }

                worker.postMessage({ type: "shutdown" } satisfies WorkerMessage)
              }),
          ),
        )
        workers = []
        availableWorkers = []
        log.debug?.("pool shut down")
      })()

      return shutdownPromise
    },
  }

  // Internal helper function
  function handleWorkerMessage(worker: Worker, message: WorkerResponse): void {
    if (message.type === "parsed") {
      const pending = pendingRequests.get(message.id)
      if (pending) {
        pendingRequests.delete(message.id)

        if (message.error) {
          pending.reject(new Error(message.error))
        } else {
          pending.resolve({
            nodeId: message.nodeId,
            fsPath: message.fsPath,
            nodes: message.nodes,
            wikilinks: message.wikilinks,
            hash: message.hash,
            ino: message.ino,
            mtime: message.mtime,
          })
        }
      }

      // Process next queued request
      const nextRequest = requestQueue.shift()
      if (nextRequest) {
        worker.postMessage(nextRequest)
      } else {
        availableWorkers.push(worker)
      }
    }
  }
}

/**
 * ParsePoolService interface - worker pool with Service lifecycle.
 * Implements AsyncDisposable for automatic cleanup.
 */
export interface ParsePoolService extends AsyncDisposable {
  readonly status: ServiceStatus
  start(): Promise<void>
  stop(): Promise<void>
  parse(nodeId: string, fsPath: string): Promise<ParseResult>
  parseMany(
    files: Array<{ nodeId: string; fsPath: string }>,
    onProgress?: (current: number, total: number) => void,
    shouldAbort?: () => boolean,
  ): Promise<ParseResult[]>
  /** Stream parse results as workers complete. Yields results as they arrive. */
  stream(files: Array<{ nodeId: string; fsPath: string }>, signal?: AbortSignal): AsyncGenerator<ParseResult>
}

/**
 * Create a ParsePoolService for parallel markdown parsing.
 *
 * The pool implements the Service interface with start/stop lifecycle.
 * Use `await using pool = createParsePool()` for automatic cleanup.
 *
 * @example
 * await using pool = createParsePool({ poolSize: 4 });
 * await pool.start();
 * const result = await pool.parse("node-id", "/path/to/file.md");
 * // pool.stop() called automatically
 *
 * @param options - Pool configuration
 * @returns ParsePoolService
 */
export function createParsePool(options?: ParsePoolOptions): ParsePoolService {
  log.debug?.(`createParsePool options=${JSON.stringify(options)}`)

  const pool = createParsePoolInternal(options)
  let status: ServiceStatus = "stopped"

  return {
    get status() {
      return status
    },

    async start() {
      if (status !== "stopped") {
        log.debug?.(`start called but status is ${status}`)
        return
      }

      status = "starting"
      log.debug?.("starting parse pool")

      try {
        await pool.start()
        status = "running"
        log.debug?.("parse pool started")
      } catch (error) {
        status = "stopped"
        throw error
      }
    },

    async stop() {
      if (status !== "running") {
        log.debug?.(`stop called but status is ${status}`)
        return
      }

      status = "stopping"
      log.debug?.("stopping parse pool")

      try {
        await pool.shutdown()
        status = "stopped"
        log.debug?.("parse pool stopped")
      } catch (error) {
        // Force status to stopped even on error
        status = "stopped"
        throw error
      }
    },

    parse(nodeId: string, fsPath: string) {
      return pool.parse(nodeId, fsPath)
    },

    parseMany(
      files: Array<{ nodeId: string; fsPath: string }>,
      onProgress?: (current: number, total: number) => void,
      shouldAbort?: () => boolean,
    ) {
      return pool.parseMany(files, onProgress, shouldAbort)
    },

    stream(files: Array<{ nodeId: string; fsPath: string }>, signal?: AbortSignal) {
      return pool.stream(files, signal)
    },

    async [Symbol.asyncDispose]() {
      await this.stop()
    },
  }
}

// NOTE: Singleton functions (getParsePool, shutdownParsePool) removed.
// Use createParsePool() factory with AsyncDisposable pattern instead.
