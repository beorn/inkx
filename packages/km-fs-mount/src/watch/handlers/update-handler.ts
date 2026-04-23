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
import {
  emitNodeCreated,
  emitNodeUpdated,
  emitNodeDeleted,
  type Emitter,
  getFileWithChildren,
  getNodeContentHash,
  addLink,
  removeLinksFromSource,
  processMarkdownFile,
  toResolvedLinks,
  type ProcessedMarkdown,
  type WikilinkRef,
  type PoolParseResult as ParseResult,
  getNode,
  getChildren,
} from "@km/storage"
import type { FileSystemOps } from "../writequeue.ts"
import type { ReconcileOp } from "../reconcile.ts"
import { ensureLinkChanges, type ReconcileContext } from "./create-handler.ts"
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
// oxlint-disable-next-line complexity/complexity -- file-change reconciliation: .txt direct-write path + markdown re-parse path, each with stat/metadata/title/content/frontmatter/tags/anchors/child-edges update branches; flat sequential dispatch over the KNode fields a single file write might touch
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
    if (op.ino !== undefined) updates.fs_ino = op.ino
    if (op.dev !== undefined) updates.fs_dev = op.dev
    if (op.size !== undefined) updates.fs_size = op.size
    if (op.contentHash !== undefined) updates.fs_content_hash = op.contentHash
    emitNodeUpdated(emitter, "fs-watch", op.nodeId, updates)
    return
  }

  // For non-.md, non-.txt files, just update mtime/ino tracking
  if (!op.path.endsWith(".md")) {
    const updates: Record<string, unknown> = { fs_mtime: op.mtime }
    if (op.ino !== undefined) updates.fs_ino = op.ino
    if (op.dev !== undefined) updates.fs_dev = op.dev
    if (op.size !== undefined) updates.fs_size = op.size
    if (op.contentHash !== undefined) updates.fs_content_hash = op.contentHash
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
    if (ino !== undefined) mtimeUpdates.fs_ino = ino
    if (op.dev !== undefined) mtimeUpdates.fs_dev = op.dev
    if (op.size !== undefined) mtimeUpdates.fs_size = op.size
    // Keep the fs-bytes hash in lock-step with mtime so cascade Step 1
    // validation (content-hash signal) has an up-to-date value.
    mtimeUpdates.fs_content_hash = op.contentHash ?? hash
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
      fs_content_hash: op.contentHash ?? hash,
    }
    if (ino !== undefined) baselineUpdates.fs_ino = ino
    if (op.dev !== undefined) baselineUpdates.fs_dev = op.dev
    if (op.size !== undefined) baselineUpdates.fs_size = op.size
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
    fs_content_hash: op.contentHash ?? hash,
  }
  if (ino !== undefined) updates.fs_ino = ino
  if (op.dev !== undefined) updates.fs_dev = op.dev
  if (op.size !== undefined) updates.fs_size = op.size
  emitNodeUpdated(emitter, "fs-watch", op.nodeId, updates)

  // Update wikilinks: capture previous outgoing hrefs first so backlink
  // signals for targets that LOSE an inbound link still invalidate, then
  // remove old links from EXISTING nodes.
  const linkChanges = ensureLinkChanges(ctx)
  for (const node of existingNodes) {
    const prior = db.query("SELECT href FROM links WHERE host_id = ?").all(node.id) as Array<{ href: string }>
    for (const row of prior) linkChanges.targetHrefs.add(row.href)
    if (prior.length > 0) linkChanges.hostIds.add(node.id)
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
    const hostId = idMap.get(link.host_id) ?? link.host_id
    addLink(db, { host_id: hostId, href: link.href, rel: link.rel })
    linkChanges.hostIds.add(hostId)
    linkChanges.targetHrefs.add(link.href)

    // For embed rows, mirror embed_of + alias back onto the host node so
    // the in-memory store stays in sync. The v4 links schema has no
    // target_id column — embed_of is resolved transiently and materialized
    // on `nodes` here.
    //
    // Route through emitter.commit so DB + journal are paired per row
    // (op-vocabulary audit G4). commit() (not apply()) because this is
    // FS-origin — we just parsed the file and are back-writing derived
    // fields; apply() would fire onApply subscribers and echo to FS.
    if (link.rel === "embed" && link.embedTargetId) {
      emitter.commit({
        type: "node_updated",
        target: hostId,
        actor: "fs-watch",
        data: {
          embed_of: link.embedTargetId,
          name: link.alias ?? null,
        },
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
 * Circular sync is already prevented: changes emitted here use actor "fs-watch",
 * and the change-handler skips fs-watch-origin changes — so these won't
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
