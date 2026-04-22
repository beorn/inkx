/**
 * Parse Worker Thread
 *
 * Parses markdown files in a worker thread for parallel processing.
 * km-fast-md.6: Worker pool for parallel parsing
 */

// Forward console output from this worker to the main thread BEFORE
// importing anything else. Any module imported after this (e.g.
// @km/markdown) creates its own loggers via `createLogger`; loggily's
// console sink writes via `console.error(...)`, which in a Bun Worker
// otherwise goes directly to the host process's stdout and corrupts the
// TUI's alt-screen buffer. `forwardConsole` monkey-patches `console.*`
// so all output is posted to the main thread, where parse-pool.ts feeds
// it back through the main-thread loggily pipeline — picking up
// patchConsole suppression + the DEBUG_LOG file writer that km-cli
// installs in apps/km-cli/src/debug-log.ts.
import { forwardConsole } from "loggily/worker"
forwardConsole(postMessage, "km:storage:parse-worker")

import { readFileSync, statSync } from "fs"
import { createHash } from "crypto"
import { parseMarkdownWithLinks } from "@km/markdown"
import { createLogger } from "loggily"

// Using `createLogger` (not `createWorkerLogger`) deliberately: loggily's
// default pipeline writes through `console.error`, which `forwardConsole`
// above intercepts — so this module's logs travel the same route as every
// other logger transitively imported by the worker (e.g. @km/markdown's
// ast2nodes/nodes2md). Keeping a single transport means DEBUG filtering on
// the main side applies uniformly, and adding a new logger anywhere in the
// worker's import graph doesn't need a separate wiring pass.
const log = createLogger("km:storage:parse-worker")

export interface ParseRequest {
  type: "parse"
  id: number
  fsPath: string
  nodeId: string
}

export interface ParseResponse {
  type: "parsed"
  id: number
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

export type WorkerMessage = ParseRequest | { type: "shutdown" }
export type WorkerResponse = ParseResponse | { type: "ready" } | { type: "shutdown" }

// Worker entry point
declare const self: Worker

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data

  if (message.type === "shutdown") {
    self.postMessage({ type: "shutdown" } satisfies WorkerResponse)
    return
  }

  if (message.type === "parse") {
    try {
      log.debug?.(`parsing ${message.fsPath}`)
      const stat = statSync(message.fsPath)
      const content = readFileSync(message.fsPath, "utf-8")
      const hash = createHash("sha256").update(content, "utf-8").digest("hex")
      const { nodes, wikilinks } = parseMarkdownWithLinks(content, message.fsPath, stat.ino, stat.mtimeMs)

      log.debug?.(`parsed ${message.fsPath}: ${nodes.length} nodes, ${wikilinks.length} links`)
      self.postMessage({
        type: "parsed",
        id: message.id,
        nodeId: message.nodeId,
        fsPath: message.fsPath,
        nodes,
        wikilinks,
        hash,
        ino: stat.ino,
        mtime: stat.mtimeMs,
      } satisfies ParseResponse)
    } catch (err) {
      log.debug?.(`parse error ${message.fsPath}: ${err instanceof Error ? err.message : String(err)}`)
      self.postMessage({
        type: "parsed",
        id: message.id,
        nodeId: message.nodeId,
        fsPath: message.fsPath,
        nodes: [],
        wikilinks: [],
        hash: "",
        ino: 0,
        mtime: 0,
        error: err instanceof Error ? err.message : String(err),
      } satisfies ParseResponse)
    }
  }
}

// Signal ready
self.postMessage({ type: "ready" } satisfies WorkerResponse)
