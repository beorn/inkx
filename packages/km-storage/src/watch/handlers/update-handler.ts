/**
 * Update handler - handles file modification
 *
 * Unified handler that works with both:
 * - Filesystem parsing (reads and parses file)
 * - Pre-parsed content (from parallel parsing pipeline)
 */

import { createLogger } from "loggily"
import type { Database } from "bun:sqlite"
import { type KNode, isIndexFile, findIndexFile, extractSlotTargets, namesAreSimilar } from "@km/core"
import { toRelativeFsPath } from "../../fs/path-utils.ts"
import { emitNodeCreated, emitNodeUpdated, emitNodeDeleted, type Emitter } from "../../emitter.ts"
import { getFileWithChildren, getNodeContentHash } from "../../db/queries/core-lookup.ts"
import { addLink, removeLinksFromSource } from "../../db/links.ts"
import {
  processMarkdownFile,
  toResolvedLinks,
  type ProcessedMarkdown,
  type WikilinkRef,
} from "../../markdown/processing.ts"
import type { FileSystemOps } from "../writequeue.ts"
import type { ReconcileOp } from "../reconcile.ts"
import type { ParseResult } from "../../markdown/parse-pool.ts"
import type { ReconcileContext } from "./create-handler.ts"
import { diffNodes } from "./node-differ.ts"
import { getNode, getChildren } from "../../index.ts"

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

  // Skip if content hasn't actually changed — but still update fs_mtime/fs_ino
  // so the next heartbeat doesn't re-reconcile this file (F5: infinite re-reconciliation fix)
  const existingHash = getNodeContentHash(db, op.nodeId)
  if (existingHash === hash) {
    const mtimeUpdates: Record<string, unknown> = { fs_mtime: mtime }
    if (ino !== undefined) {
      mtimeUpdates.fs_ino = ino
    }
    emitNodeUpdated(emitter, "fs-watch", op.nodeId, mtimeUpdates)
    return
  }

  // Get existing nodes for this file (DB stores relative paths)
  const existingNodes = getFileWithChildren(db, toRelativeFsPath(repoRoot, op.path))

  log.debug?.(`handleUpdate: existing nodes count=${existingNodes.length}, new nodes count=${newNodes.length}`)

  // Diff and emit changes
  const { changes, idMap } = diffNodes(existingNodes, newNodes)

  // Formatting-only edit: raw bytes changed but parsed nodes are identical.
  // Update baseline hash so we don't re-process, but skip DB updates and file rewrite.
  if (changes.length === 0) {
    log.debug?.(`handleUpdate: formatting-only change for ${op.path}, updating baseline hash only`)
    const baselineUpdates: Record<string, unknown> = {
      fs_mtime: mtime,
      content_hash: hash,
    }
    if (ino !== undefined) {
      baselineUpdates.fs_ino = ino
    }
    emitNodeUpdated(emitter, "fs-watch", op.nodeId, baselineUpdates)
    return
  }

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

    // Emit embed_source update so the in-memory store stays in sync.
    // addLink sets embed_source on the DB node directly (no events),
    // but the TUI reads from the in-memory store which needs the event.
    if (link.embedded && link.target_id) {
      emitNodeUpdated(emitter, "fs-watch", sourceId, {
        embed_source: link.target_id,
        name: link.alias ?? undefined,
      })
    }
  }

  // Post-processing: if this file is an index file, sync changes back to its parent folder
  syncIndexFileToFolder(options)

  // Track this index file for post-batch re-sync (siblings created later in the batch
  // won't exist yet when syncIndexFileToFolder runs above)
  if (op.nodeId) {
    ctx.modifiedIndexFiles ??= new Set()
    ctx.modifiedIndexFiles.add(op.nodeId)
  }
}

/**
 * After a standard update, check if the updated file is an index file for its parent folder.
 * If so, propagate structural changes (title, child ordering) from the index file to the folder.
 *
 * This enables bidirectional sync: editing an index file externally updates the folder's
 * children ordering and title in the DB.
 *
 * Circular sync is already prevented: events emitted here use actor "fs-watch",
 * and the event-handler skips fs-watch-origin events — so these changes won't
 * trigger the write path to regenerate the index file.
 */
export function syncIndexFileToFolder(options: UpdateHandlerOptions): void {
  const { db, op, emitter } = options
  if (!op.nodeId) return

  const node = getNode(db, op.nodeId)
  if (!node) {
    log.debug?.(`syncIndexFileToFolder: node not found for id=${op.nodeId} (deleted during batch)`)
    return
  }
  if (node.fstype !== "mdfile") return

  // Check if this file is the PRIMARY index file for its parent folder.
  // When multiple index files exist (same-name.md + index.md), only the highest-priority
  // one should promote its title. findIndexFile returns the winner.
  if (!node.parent_id) return
  const parent = getNode(db, node.parent_id)
  if (parent?.fstype !== "folder") return
  if (!isIndexFile(parent.name ?? "", node)) return
  const folderSiblings = getChildren(db, parent.id)
  const primaryIndex = findIndexFile(parent, folderSiblings)
  if (!primaryIndex || primaryIndex.id !== node.id) return

  // Get the index file's children (sections parsed from the file)
  const indexChildren = getChildren(db, node.id)

  // Extract all slot targets from the index file content
  const slotTargets = extractSlotTargets(indexChildren)

  // Sync child ordering: for each slot target, update parent_idx
  const folderChildren = getChildren(db, parent.id)
  const referencedIds = new Set<string>()
  let idx = 0

  for (const target of slotTargets) {
    const child = folderChildren.find((c) => c.id !== node.id && namesAreSimilar(c.name ?? "", target))
    if (child) {
      referencedIds.add(child.id)
      if (child.parent_idx !== idx) {
        emitNodeUpdated(emitter, "fs-watch", child.id, { parent_idx: idx })
      }
      idx++
    } else {
      log.debug?.(
        `syncIndexFileToFolder: slot target "${target}" has no matching child in folder ${parent.id} (may resolve in post-batch sync)`,
      )
    }
  }

  // Append unreferenced children after referenced ones
  for (const child of folderChildren) {
    if (child.id === node.id || referencedIds.has(child.id)) continue
    if (child.parent_idx !== idx) {
      emitNodeUpdated(emitter, "fs-watch", child.id, { parent_idx: idx })
    }
    idx++
  }

  // Sync title from index file's H1 (stored as the file node's content/title) to folder node
  const indexTitle = node.title ?? node.content
  if (indexTitle && parent.content !== indexTitle) {
    emitNodeUpdated(emitter, "fs-watch", parent.id, { content: indexTitle })
  }
}
