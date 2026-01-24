/**
 * Parse Worker Pool
 *
 * Manages a pool of worker threads for parallel markdown parsing.
 * km-fast-md.6: Worker pool for parallel parsing
 * km-disposable.3: Wrapped with Service factory pattern
 */

import createDebug from "debug";
import { cpus } from "os";
import type { ServiceStatus } from "./watcher.ts";
import type {
  ParseRequest,
  WorkerMessage,
  WorkerResponse,
} from "./parse-worker.ts";

const debug = createDebug("km:storage:parse-pool");

export interface ParseResult {
  nodeId: string;
  fsPath: string;
  nodes: unknown[];
  wikilinks: unknown[];
  error?: string;
}

export interface ParsePoolOptions {
  /** Number of worker threads (default: CPU count - 1, min 1) */
  poolSize?: number;
}

/**
 * Pool of worker threads for parallel markdown parsing.
 */
export class ParsePool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private pendingRequests: Map<
    number,
    {
      resolve: (result: ParseResult) => void;
      reject: (error: Error) => void;
    }
  > = new Map();
  private requestQueue: ParseRequest[] = [];
  private nextRequestId = 0;
  private poolSize: number;
  private shutdownPromise: Promise<void> | null = null;

  constructor(options?: ParsePoolOptions) {
    this.poolSize = options?.poolSize ?? Math.max(1, cpus().length - 1);
    debug("creating pool with %d workers", this.poolSize);
  }

  /**
   * Start the worker pool.
   */
  async start(): Promise<void> {
    debug("starting pool");

    const readyPromises: Promise<void>[] = [];

    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(new URL("./parse-worker.ts", import.meta.url));

      const readyPromise = new Promise<void>((resolve) => {
        const onMessage = (event: MessageEvent<WorkerResponse>) => {
          if (event.data.type === "ready") {
            worker.removeEventListener("message", onMessage);
            resolve();
          }
        };
        worker.addEventListener("message", onMessage);
      });
      readyPromises.push(readyPromise);

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        this.handleWorkerMessage(worker, event.data);
      };

      worker.onerror = (error: ErrorEvent) => {
        debug("worker error: %s", error.message);
      };

      this.workers.push(worker);
    }

    await Promise.all(readyPromises);
    this.availableWorkers = [...this.workers];
    debug("pool started, %d workers ready", this.workers.length);
  }

  /**
   * Parse a file using a worker from the pool.
   */
  parse(nodeId: string, fsPath: string): Promise<ParseResult> {
    return new Promise((resolve, reject) => {
      const id = this.nextRequestId++;

      this.pendingRequests.set(id, { resolve, reject });

      const request: ParseRequest = {
        type: "parse",
        id,
        nodeId,
        fsPath,
      };

      // If a worker is available, dispatch immediately
      const worker = this.availableWorkers.pop();
      if (worker) {
        worker.postMessage(request);
      } else {
        // Queue the request
        this.requestQueue.push(request);
      }
    });
  }

  /**
   * Parse multiple files in parallel.
   */
  async parseMany(
    files: Array<{ nodeId: string; fsPath: string }>,
    onProgress?: (current: number, total: number) => void,
    shouldAbort?: () => boolean,
  ): Promise<ParseResult[]> {
    const total = files.length;
    const results: ParseResult[] = [];
    let completed = 0;

    const promises = files.map(async ({ nodeId, fsPath }) => {
      if (shouldAbort?.()) {
        return null;
      }

      const result = await this.parse(nodeId, fsPath);
      completed++;
      onProgress?.(completed, total);
      return result;
    });

    for (const promise of promises) {
      const result = await promise;
      if (result) {
        results.push(result);
      }
      if (shouldAbort?.()) {
        break;
      }
    }

    return results;
  }

  /**
   * Shutdown the worker pool.
   */
  async shutdown(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    debug("shutting down pool");

    this.shutdownPromise = Promise.all(
      this.workers.map(
        (worker) =>
          new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              worker.terminate();
              resolve();
            }, 1000);

            worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
              if (event.data.type === "shutdown") {
                clearTimeout(timeout);
                worker.terminate();
                resolve();
              }
            };

            worker.postMessage({ type: "shutdown" } satisfies WorkerMessage);
          }),
      ),
    ).then(() => {
      this.workers = [];
      this.availableWorkers = [];
      debug("pool shut down");
    });

    return this.shutdownPromise;
  }

  private handleWorkerMessage(worker: Worker, message: WorkerResponse): void {
    if (message.type === "parsed") {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve({
            nodeId: message.nodeId,
            fsPath: message.fsPath,
            nodes: message.nodes,
            wikilinks: message.wikilinks,
          });
        }
      }

      // Process next queued request
      const nextRequest = this.requestQueue.shift();
      if (nextRequest) {
        worker.postMessage(nextRequest);
      } else {
        this.availableWorkers.push(worker);
      }
    }
  }
}

/**
 * ParsePoolService interface - worker pool with Service lifecycle.
 * Implements AsyncDisposable for automatic cleanup.
 */
export interface ParsePoolService extends AsyncDisposable {
  readonly status: ServiceStatus;
  start(): Promise<void>;
  stop(): Promise<void>;
  parse(nodeId: string, fsPath: string): Promise<ParseResult>;
  parseMany(
    files: Array<{ nodeId: string; fsPath: string }>,
    onProgress?: (current: number, total: number) => void,
    shouldAbort?: () => boolean,
  ): Promise<ParseResult[]>;
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
  debug("createParsePool", { options });

  const pool = new ParsePool(options);
  let status: ServiceStatus = "stopped";

  return {
    get status() {
      return status;
    },

    async start() {
      if (status !== "stopped") {
        debug("start called but status is %s", status);
        return;
      }

      status = "starting";
      debug("starting parse pool");

      try {
        await pool.start();
        status = "running";
        debug("parse pool started");
      } catch (error) {
        status = "stopped";
        throw error;
      }
    },

    async stop() {
      if (status !== "running") {
        debug("stop called but status is %s", status);
        return;
      }

      status = "stopping";
      debug("stopping parse pool");

      try {
        await pool.shutdown();
        status = "stopped";
        debug("parse pool stopped");
      } catch (error) {
        // Force status to stopped even on error
        status = "stopped";
        throw error;
      }
    },

    parse(nodeId: string, fsPath: string) {
      return pool.parse(nodeId, fsPath);
    },

    parseMany(
      files: Array<{ nodeId: string; fsPath: string }>,
      onProgress?: (current: number, total: number) => void,
      shouldAbort?: () => boolean,
    ) {
      return pool.parseMany(files, onProgress, shouldAbort);
    },

    async [Symbol.asyncDispose]() {
      await this.stop();
    },
  };
}

// Singleton instance for convenient access
let defaultPool: ParsePoolService | null = null;

/**
 * Get or create the default parse pool.
 * @deprecated Use createParsePool() for new code
 */
export async function getParsePool(): Promise<ParsePoolService> {
  if (!defaultPool) {
    defaultPool = createParsePool();
    await defaultPool.start();
  }
  return defaultPool;
}

/**
 * Shutdown the default parse pool.
 * @deprecated Use createParsePool() with AsyncDisposable for new code
 */
export async function shutdownParsePool(): Promise<void> {
  if (defaultPool) {
    await defaultPool.stop();
    defaultPool = null;
  }
}
