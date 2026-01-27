/**
 * Parse Worker Thread
 *
 * Parses markdown files in a worker thread for parallel processing.
 * km-fast-md.6: Worker pool for parallel parsing
 */

// CRITICAL: Intercept debug output BEFORE importing any modules
// This ensures ALL debug() calls (including from @km/markdown) are forwarded to main thread
import createDebug from "debug"

// Override createDebug.log to forward all worker debug output to main thread
// This captures debug() calls from ALL imported modules (@km/markdown, etc.)
createDebug.log = (...args: unknown[]) => {
  // First arg is the formatted string from debug (includes namespace prefix and colors)
  const message = typeof args[0] === "string" ? args[0] : String(args[0])

  try {
    postMessage({
      type: "debug",
      namespace: "km:worker", // Generic namespace, actual namespace is in message
      message,
    })
  } catch {
    // Worker might not be fully initialized yet - silently fail
  }
}

// Now import modules - their debug() calls will use our intercepted logger
import { readFileSync, statSync } from "fs"
import { createHash } from "crypto"
import { parseMarkdownWithLinks } from "@km/markdown"

// Create debug instance using the intercepted createDebug
const debug = createDebug("km:storage:parse-worker")

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
export type WorkerResponse =
  | ParseResponse
  | { type: "ready" }
  | { type: "shutdown" }
  | { type: "debug"; namespace: string; message: string }

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
      debug("parsing %s", message.fsPath)
      const stat = statSync(message.fsPath)
      const content = readFileSync(message.fsPath, "utf-8")
      const hash = createHash("sha256").update(content, "utf-8").digest("hex")
      const { nodes, wikilinks } = parseMarkdownWithLinks(
        content,
        message.fsPath,
        stat.ino,
        stat.mtimeMs,
      )

      debug(
        "parsed %s: %d nodes, %d links",
        message.fsPath,
        nodes.length,
        wikilinks.length,
      )
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
      debug(
        "parse error %s: %s",
        message.fsPath,
        err instanceof Error ? err.message : String(err),
      )
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
