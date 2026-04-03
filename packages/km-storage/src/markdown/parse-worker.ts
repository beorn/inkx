/**
 * Parse Worker Thread
 *
 * Parses markdown files in a worker thread for parallel processing.
 * km-fast-md.6: Worker pool for parallel parsing
 */

import { readFileSync, statSync } from "fs"
import { createHash } from "crypto"
import { parseMarkdownWithLinks } from "@km/markdown"

// Create logger for this module's debug output
import { createLogger } from "loggily"
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
