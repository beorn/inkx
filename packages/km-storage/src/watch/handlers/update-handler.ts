/**
 * Update handler - handles file modification
 *
 * Unified handler that works with both:
 * - Filesystem parsing (reads and parses file)
 * - Pre-parsed content (from parallel parsing pipeline)
 */

import { createLogger } from "@beorn/logger"
import type { Database } from "bun:sqlite"
import type { KNode } from "@km/core"
import { toRelativeFsPath } from "../../path-utils.ts"
import { emitNodeCreated, emitNodeUpdated, emitNodeDeleted, type Emitter } from "../../emitter.ts"
import { getFileWithChildren, getNodeContentHash } from "../../db-queries/core-lookup.ts"
import { addLink, removeLinksFromSource } from "../../db-links.ts"
import {
  processMarkdownFile,
  toResolvedLinks,
  type ProcessedMarkdown,
  type WikilinkRef,
} from "../../markdown-processing.ts"
import type { FileSystemOps } from "../writequeue.ts"
import type { ReconcileOp } from "../reconcile.ts"
import type { ParseResult } from "../../parse-pool.ts"
import type { ReconcileContext } from "./create-handler.ts"
import { diffNodes } from "./node-differ.ts"

const log = createLogger("km:storage:watch:reconcile")

/**
 * Options for update handler
 */
export interface UpdateHandlerOptions {
  db: Database
  op: ReconcileOp
  repoRoot: string
  emitter: Emitter
  fs: FileSystemOps
  ctx: ReconcileContext
  /** Pre-parsed content (optional - if not provided, will parse from filesystem) */
  parsed?: ParseResult
}

/**
 * Handle file modification
 *
 * Unified handler that works with both filesystem parsing and pre-parsed content.
 */
export function handleUpdate(options: UpdateHandlerOptions): void {
  const { db, op, repoRoot, emitter, fs, ctx, parsed } = options

  if (!op.nodeId) {
    return
  }

  // For .txt files, update content directly (no markdown parsing)
  if (op.path.endsWith(".txt")) {
    const content = fs.readFileSync(op.path, "utf-8")
    const stat = fs.statSync(op.path)
    const updates: Record<string, unknown> = {
      content,
      fs_mtime: op.mtime ?? stat.mtimeMs,
    }
    if (op.ino !== undefined) {
      updates.fs_ino = op.ino
    }
    emitNodeUpdated(emitter, "fs-watch", op.nodeId, updates)
    return
  }

  // For non-.md, non-.txt files, just update mtime/ino tracking
  if (!op.path.endsWith(".md")) {
    const updates: Record<string, unknown> = { fs_mtime: op.mtime }
    if (op.ino !== undefined) {
      updates.fs_ino = op.ino
    }
    emitNodeUpdated(emitter, "fs-watch", op.nodeId, updates)
    return
  }

  // Get nodes, wikilinks, and hash - either from parsed result or parse from filesystem
  let newNodes: KNode[]
  let wikilinks: WikilinkRef[]
  let hash: string
  let ino: number | undefined
  let mtime: number

  if (parsed) {
    // Use pre-parsed result
    newNodes = parsed.nodes as KNode[]
    wikilinks = parsed.wikilinks as WikilinkRef[]
    hash = parsed.hash
    ino = parsed.ino
    mtime = parsed.mtime
  } else {
    // Parse from filesystem
    const content = fs.readFileSync(op.path, "utf-8")
    const stat = fs.statSync(op.path)
    const processed = processMarkdownFile(content, op.path, stat.ino, op.mtime ?? stat.mtimeMs)
    newNodes = processed.nodes
    wikilinks = processed.wikilinks
    hash = processed.hash
    ino = op.ino
    mtime = op.mtime ?? stat.mtimeMs
  }

  // Skip if content hasn't actually changed
  const existingHash = getNodeContentHash(db, op.nodeId)
  if (existingHash === hash) {
    return
  }

  // Get existing nodes for this file (DB stores relative paths)
  const existingNodes = getFileWithChildren(db, toRelativeFsPath(repoRoot, op.path))

  log.debug?.(`handleUpdate: existing nodes count=${existingNodes.length}, new nodes count=${newNodes.length}`)

  // Diff and emit changes
  const { changes, idMap } = diffNodes(existingNodes, newNodes)

  for (const change of changes) {
    switch (change.type) {
      case "created":
        if (change.node) {
          emitNodeCreated(emitter, "fs-watch", change.node as unknown as Record<string, unknown>)
        }
        break
      case "updated":
        if (change.nodeId && change.changes) {
          emitNodeUpdated(emitter, "fs-watch", change.nodeId, change.changes)
        }
        break
      case "deleted":
        if (change.nodeId) emitNodeDeleted(emitter, "fs-watch", change.nodeId)
        break
    }
  }

  // Always update the file node's fs_mtime, fs_ino, and content_hash
  const updates: Record<string, unknown> = {
    fs_mtime: mtime,
    content_hash: hash,
  }
  if (ino !== undefined) {
    updates.fs_ino = ino
  }
  emitNodeUpdated(emitter, "fs-watch", op.nodeId, updates)

  // Update wikilinks: remove old links from EXISTING nodes
  for (const node of existingNodes) {
    removeLinksFromSource(db, node.id)
  }

  // Add new links with source ID remapping (new parser IDs -> existing DB IDs)
  if (!ctx.resolver) {
    throw new Error("handleUpdate called without resolver context")
  }
  const processed: ProcessedMarkdown = {
    path: op.path,
    hash,
    nodes: newNodes,
    wikilinks,
    warnings: [],
  }
  const resolvedLinks = toResolvedLinks(processed, ctx.resolver)
  for (const link of resolvedLinks) {
    const sourceId = idMap.get(link.source_id) ?? link.source_id
    addLink(db, {
      ...link,
      source_id: sourceId,
    })

    // Emit link_to update so the in-memory store stays in sync.
    // addLink sets link_to on the DB node directly (no events),
    // but the TUI reads from the in-memory store which needs the event.
    if (link.embedded && link.target_id) {
      emitNodeUpdated(emitter, "fs-watch", sourceId, {
        type: "link",
        embed: true,
        link_to: link.target_id,
        link_alias: link.alias ?? undefined,
      })
    }
  }
}
