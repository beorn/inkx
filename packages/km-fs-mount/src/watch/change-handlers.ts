/**
 * Change Handlers — Shared logic for applying DB changes to filesystem
 *
 * Shared change→filesystem projection logic used by withFsWriter and withSync.
 * Uses FsWriteTarget interface to abstract sync vs async write mechanisms.
 */

import { createLogger } from "loggily"
import { existsSync, readFileSync, readdirSync } from "fs"
import { basename, dirname, join, relative } from "path"
import type { Database } from "bun:sqlite"
import { ulid } from "ulid"
import { type Change, KNode, findIndexFile, namesAreSimilar, type ItemData } from "@km/core"
import {
  type Emitter,
  getAllNodes,
  getChildren,
  getNode,
  getSubtree,
  nodesToMarkdown,
  getNodeContentHash,
  getFolderIndexConfig,
  buildIndexContent,
  indexFileName,
  writeSiblingOrder,
} from "@km/storage"
import { toAbsoluteFsPath } from "../fs/path-utils.ts"
import { getIgnorePatterns } from "../fs/ignore.ts"
import { hashContent } from "../fs/cas.ts"
import { parseMarkdownWithLinks } from "@km/markdown"
// reconcileIfChanged removed — DB is authority for user-origin changes
import { findFileNode, titleToFilename } from "./watch-utils.ts"
import { computeRenameCascade } from "./rename-cascade.ts"

const log = createLogger("km:storage:watch:change-handlers")

/**
 * FsWriteTarget — abstraction layer for filesystem write operations.
 * Allows both sync (withFsWriter) and async (withSync) implementations.
 */
export interface FsWriteTarget {
  /** Write content to a file, creating parent directories as needed */
  writeFile(absPath: string, content: string, changeId?: string): void | Promise<void>

  /** Delete a file or directory. Noop if path doesn't exist. */
  deleteFile(absPath: string, changeId?: string): void | Promise<void>

  /** Rename a file. Must not overwrite an existing target. */
  renameFile(oldPath: string, newPath: string): void | Promise<void>

  /** Create a directory. Must create parent directories as needed. */
  mkdir(absPath: string): void | Promise<void>

  /** Mark a path as in-flight (for watcher debouncing). Optional. */
  markInFlight?(absPath: string): void

  /** Clear in-flight status (for watcher debouncing). Optional. */
  clearInFlight?(absPath: string, delayMs?: number): void

  /** Record a write token for a path (for watcher suppression). Optional. */
  recordWriteToken?(absPath: string, content: string): void

  /**
   * Record the on-disk content as the current baseline (for conflict
   * detection). Called by `save()` after it merges external drift into
   * the in-memory subtree, so the subsequent write is not flagged as a
   * spurious conflict. Optional.
   */
  recordExternalObservation?(absPath: string, content: string, nodeId?: string): void

  /** Rewrite a pending write's path when the target file is renamed. Optional. */
  renamePending?(oldPath: string, newPath: string): boolean

  /** Cancel a pending write for a deleted file. Optional. */
  dropPending?(path: string): boolean

  /** Rewrite all pending writes under a renamed directory. Optional. */
  renamePendingSubtree?(oldPrefix: string, newPrefix: string): number
}

/**
 * ChangeHandlers — shared node mutation handlers.
 * Parameterized by FsWriteTarget to work with both sync and async write mechanisms.
 */
export class ChangeHandlers {
  private ignorePatterns: string[]
  private currentChangeId: string = ""

  constructor(
    private db: Database,
    private repoPath: string,
    private emitter: Emitter,
    private fsTarget: FsWriteTarget,
  ) {
    this.ignorePatterns = getIgnorePatterns(repoPath)
  }

  /**
   * Apply a database change to filesystem
   */
  applyChangeToFs(change: Change): void {
    if (change.actor === "fs-watch") {
      log.debug?.(`skipping fs apply for actor=${change.actor} change=${change.type}`)
      return
    }

    log.debug?.(`applying ${change.type} to fs: ${change.target ?? "no-target"}`)

    // Store changeId for this change's handler lifecycle
    this.currentChangeId = change.id

    switch (change.type) {
      case "node_updated":
        this.handleNodeUpdated(change)
        break
      case "node_created":
        this.handleNodeCreated(change)
        break
      case "node_deleted":
        this.handleNodeDeleted(change)
        break
      case "node_moved":
        this.handleNodeMoved(change)
        break
      case "task_claimed":
      case "task_released":
      case "task_completed":
        this.handleTaskChange(change)
        break
    }

    this.currentChangeId = ""
  }

  /**
   * Create an assignBlockId callback that collects newly assigned anchors.
   * After serialization, call rewriteSourceFiles to write `^anchor` suffixes
   * into the files that contain the referenced nodes.
   *
   * Post-v6: anchor literals are folded into `.name` per storage-architecture
   * §2.3 — the callback writes to `name`, overriding any prior content-derived
   * slug (anchor wins).
   *
   * @param changeId — optional override for the change ID used in writes.
   *   When omitted, uses `this.currentChangeId` (set during applyChangeToFs).
   *   Pass explicitly when calling from outside the change handler lifecycle
   *   (e.g. syncFromFs, syncToFs).
   */
  createBlockIdAssigner(changeId?: string): {
    assign: (nodeId: string, blockId: string) => void
    rewriteSourceFiles: (excludeFileId?: string) => void
  } {
    const assigned = new Map<string, string>() // nodeId → anchor literal
    return {
      assign: (nodeId: string, blockId: string) => {
        // Route the anchor back-write through emitter.commit so DB + journal
        // are paired per row (op-vocabulary audit G4/G7). commit() (not apply())
        // because this runs during FS-origin serialization; apply() would echo
        // back into the FS projection subscribers.
        this.emitter.commit({
          type: "node_updated",
          target: nodeId,
          actor: "fs-watch",
          data: { name: blockId },
        })
        assigned.set(nodeId, blockId)
      },
      rewriteSourceFiles: (excludeFileId?: string) => {
        if (assigned.size === 0) return
        // Group by containing file
        const fileIds = new Set<string>()
        for (const [nodeId, blockId] of assigned) {
          const node = getNode(this.db, nodeId)
          if (!node) {
            log.error?.(`rewriteSourceFiles: node ${nodeId} vanished after anchor assignment`)
            continue
          }
          // Update in-memory node for serialization (anchor is now the name)
          node.name = blockId
          const file = findFileNode(this.db, node)
          if (file && file.id !== excludeFileId) fileIds.add(file.id)
        }
        // Rewrite each affected source file (without assignBlockId to prevent cascading)
        const writeChangeId = changeId ?? this.currentChangeId
        for (const fileId of fileIds) {
          const file = getNode(this.db, fileId)
          if (!file?.fs_path) {
            log.error?.(`rewriteSourceFiles: file node ${fileId} missing or has no fs_path`)
            continue
          }
          const absPath = toAbsoluteFsPath(this.repoPath, file.fs_path)
          const subtreeNodes = getSubtree(this.db, fileId)
          const content = nodesToMarkdown(subtreeNodes, getAllNodes(this.db))
          this.fsTarget.writeFile(absPath, content, writeChangeId)
        }
      },
    }
  }

  /**
   * save(node) — the core domain verb for DB→FS sync.
   *
   * Finds the containing file, serializes its subtree to markdown,
   * writes to disk, and cascades block ID rewrites to other files.
   * This is the single primitive that all change handlers use.
   *
   * Before writing, this method performs a drift-aware merge: if the
   * on-disk content has diverged from the baseline km last observed
   * (e.g. because an external editor added frontmatter or appended a
   * task and the watcher hasn't fired yet), the disk version is
   * re-parsed and its additive content (frontmatter + appended nodes)
   * is folded into the in-memory subtree before serialization. This
   * prevents silent data loss when the filesystem watcher misses an
   * external edit.
   *
   * See km-storage.frontmatter-wipe and km-storage.watcher-misses-changes.
   */
  save(node: KNode): void {
    const fileNode = findFileNode(this.db, node)
    if (!fileNode?.fs_path) return

    const blockIds = this.createBlockIdAssigner()
    const absPath = toAbsoluteFsPath(this.repoPath, fileNode.fs_path)
    let subtreeNodes = getSubtree(this.db, fileNode.id)
    subtreeNodes = this.mergeExternalDrift(fileNode, absPath, subtreeNodes)
    const content = nodesToMarkdown(subtreeNodes, getAllNodes(this.db), blockIds.assign)
    this.fsTarget.writeFile(absPath, content, this.currentChangeId)
    // Record the write as the new parsed-content baseline on the file node.
    //
    // Why: mergeExternalDrift (called on the NEXT save) reads
    // nodes.content_hash to decide whether the disk has drifted since
    // km last wrote. Without this update, `content_hash` stays frozen at
    // whatever the initial parse recorded, so every follow-up save sees
    // "drift" vs the real-current disk and folds the just-written content
    // back in — producing duplicated list items on each subsequent edit.
    //
    // NOTE (`km-storage.writeback-cas-adopt-in-withsync`, 2026-04): We
    // update ONLY `content_hash` here, NOT `fs_content_hash`. The write
    // path (safeWriteFile via fs-writer / withSync's writeImpl) owns
    // fs_content_hash and updates it atomically with the actual disk
    // state. Touching it here too would race with the async WriteQueue
    // flush: if save() queued a write and then pre-emptively set
    // fs_content_hash to hash(intended content), the subsequent flush
    // would read a baseline that never matched disk and the CAS guard
    // would spuriously trip. On conflict (disk diverged from our
    // baseline) the write path correctly leaves fs_content_hash alone.
    this.updateContentBaseline(fileNode.id, hashContent(content))
    blockIds.rewriteSourceFiles(fileNode.id)
  }

  /**
   * If the on-disk content has drifted from the baseline km last saw,
   * fold the additive parts of the disk version (frontmatter, appended
   * child nodes) into the in-memory subtree before we serialize it.
   *
   * "Additive" is deliberate: existing child nodes keep their DB state
   * (the in-app mutation that triggered this save() has already been
   * committed there and must not be reverted). We only rescue content
   * that the DB would otherwise overwrite — namely:
   *
   *   - frontmatter added externally (file node's `data` field)
   *   - brand-new child nodes that exist on disk but not in the DB
   *
   * The watcher's normal reconciliation path is still the preferred
   * route for keeping the DB in sync with disk. This is the safety net
   * for the narrow window where an external edit slipped past the
   * watcher and an in-app write is about to clobber it.
   */
  private mergeExternalDrift(fileNode: KNode, absPath: string, subtreeNodes: KNode[]): KNode[] {
    const diskContent = readDiskContentIfChanged(this.db, fileNode, absPath)
    if (diskContent === null) return subtreeNodes

    // Update the tracker + DB baselines to the current disk content so the
    // subsequent write is not flagged as a spurious conflict by the
    // WriteQueue's baseline-hash check OR by safe-write's CAS guard. We've
    // already read and folded the disk state into the in-memory subtree,
    // so it is the new baseline for both the parsed-content hash
    // (`content_hash`) and the raw-file hash (`fs_content_hash`, §7.1).
    this.fsTarget.recordExternalObservation?.(absPath, diskContent, fileNode.id)
    this.updateBaselineHash(fileNode.id, hashContent(diskContent))

    const diskNodes = parseDiskContent(diskContent, fileNode, absPath)
    if (!diskNodes) return subtreeNodes

    const diskFile = diskNodes.find((n) => KNode.isOutline(n) && (n.fstype === "file" || n.fstype === "mdfile"))
    if (!diskFile) return subtreeNodes

    const withMergedFrontmatter = mergeFileFrontmatter(subtreeNodes, fileNode.id, diskFile)
    return appendUnmatchedDiskChildren(withMergedFrontmatter, fileNode, diskFile, diskNodes)
  }

  /**
   * Align BOTH baselines (content_hash + fs_content_hash) with a known
   * on-disk state. Callers must have just read `diskContent` from disk and
   * verified (or observed) that it IS the current on-disk bytes — otherwise
   * fs_content_hash will desynchronize from the CAS guard.
   *
   * Used by mergeExternalDrift after reading disk: both baselines advance
   * together because we just observed disk.
   */
  private updateBaselineHash(nodeId: string, diskHash: string): void {
    try {
      // Route through emitter.commit so DB + journal are paired per row
      // (op-vocabulary audit G9). commit() (not apply()) because this is
      // FS-origin — the disk moved, we're realigning in-memory state.
      // apply() would fire onApply subscribers and re-project back to FS.
      this.emitter.commit({
        type: "node_updated",
        target: nodeId,
        actor: "fs-watch",
        data: { content_hash: diskHash, fs_content_hash: diskHash },
      })
    } catch (err) {
      log.warn?.(
        `mergeExternalDrift: failed to update baselines for ${nodeId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /**
   * Update ONLY `content_hash` (the parsed-content drift baseline used by
   * the next save()'s mergeExternalDrift). Leaves `fs_content_hash` alone
   * so the write path (safeWriteFile) retains sole ownership of the CAS
   * guard baseline — critical because the WriteQueue is async and the
   * write may not have reached disk yet when this runs.
   */
  private updateContentBaseline(nodeId: string, contentHash: string): void {
    try {
      this.emitter.commit({
        type: "node_updated",
        target: nodeId,
        actor: "fs-watch",
        data: { content_hash: contentHash },
      })
    } catch (err) {
      log.warn?.(
        `save: failed to update content_hash for ${nodeId}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /**
   * Handle node updated — save the containing file.
   */
  private handleNodeUpdated(change: Change): void {
    if (!change.target) return

    const node = getNode(this.db, change.target)
    if (!node) return
    const updates = change.data as Partial<KNode>

    // Folder rename: content change on a folder → rename directory on disk
    if (KNode.isOutline(node) && node.fstype === "folder" && node.fs_path && updates.content) {
      this.handleFolderRename(node, updates.content, change.id)
      return
    }

    // Folder metadata update: update or create index file
    if (KNode.isOutline(node) && node.fstype === "folder" && node.fs_path) {
      this.handleFolderIndexUpdate(node)
      return
    }

    // File rename: content change on the file node itself → rename .md file
    const fileNode = findFileNode(this.db, node)
    if (node.id === fileNode?.id && updates.content && fileNode.fs_path?.endsWith(".md")) {
      this.handleFileRename(fileNode, updates.content, change.id)
    }

    this.save(node)
  }

  /**
   * Handle node created — create directory, empty file, or regenerate parent file.
   */
  private handleNodeCreated(change: Change): void {
    const data = change.data as Partial<KNode>

    if (data.type === "h" && data.item && data.fstype === "folder" && data.fs_path) {
      const absPath = toAbsoluteFsPath(this.repoPath, data.fs_path)
      this.fsTarget.mkdir(absPath)
    } else if (data.type === "h" && data.item && (data.fstype === "file" || data.fstype === "mdfile") && data.fs_path) {
      const absPath = toAbsoluteFsPath(this.repoPath, data.fs_path)
      this.fsTarget.writeFile(absPath, "", this.currentChangeId)
    } else if (data.parent_id && data.parent_id !== ".") {
      // Non-file node (task, section, etc.) created under a file → save
      const parent = getNode(this.db, data.parent_id)
      if (parent) this.save(parent)
    }
  }

  /**
   * Handle node deleted — remove file/directory, or regenerate parent file.
   * Node is already deleted from DB by the time fsSync runs,
   * so we read metadata from change.data (snapshotted before deletion).
   */
  private handleNodeDeleted(change: Change): void {
    if (!change.target) return

    // Node is already deleted from DB — use data passed in change payload
    const data = change.data as
      | {
          fs_path?: string
          type?: string
          parent_id?: string | null
          item?: ItemData
        }
      | undefined
    const fsPath = data?.fs_path
    const nodeType = data?.type

    if (fsPath && nodeType === "h" && data?.item) {
      // File/folder node: delete the file from disk
      const absPath = toAbsoluteFsPath(this.repoPath, fsPath)
      if (existsSync(absPath)) {
        this.fsTarget.deleteFile(absPath, this.currentChangeId)
      }

      // If deleted node's parent is a folder, regenerate index file
      const parentId = data.parent_id
      if (parentId && parentId !== ".") {
        const parent = getNode(this.db, parentId)
        if (parent?.fstype === "folder" && parent.fs_path) {
          this.handleFolderIndexUpdate(parent)
        }
      }
    } else if (data?.parent_id) {
      // Non-file node (section, task, paragraph): save the parent file
      const parent = getNode(this.db, data.parent_id)
      if (parent) this.save(parent)
    }
  }

  /**
   * Handle node moved — regenerate BOTH the source and destination files.
   *
   * The node's parent_id in the DB already points to the new parent (DB updated
   * before fsSync runs). The change data carries old_parent_id so we can find
   * and regenerate the source file, preventing stale content on disk.
   */
  private handleNodeMoved(change: Change): void {
    if (!change.target) return

    const node = getNode(this.db, change.target)
    if (!node) return

    // Handle file/folder item moves on disk FIRST — when a file or folder node
    // is moved between parents, the actual filesystem entry must be relocated
    // before any save() calls, so save() writes to the correct (new) path.
    let didDiskMove = false
    if (node.item && (node.fstype === "file" || node.fstype === "mdfile" || node.fstype === "folder") && node.fs_path) {
      const oldAbsPath = toAbsoluteFsPath(this.repoPath, node.fs_path)
      const newParent = node.parent_id ? getNode(this.db, node.parent_id) : null
      if (newParent?.fs_path) {
        const newAbsPath = join(toAbsoluteFsPath(this.repoPath, newParent.fs_path), basename(oldAbsPath))
        if (oldAbsPath !== newAbsPath && existsSync(oldAbsPath)) {
          if (existsSync(newAbsPath)) {
            log.warn?.(`move-disk aborted: target already exists: ${newAbsPath}`)
          } else {
            log.info?.(`move-disk: ${node.fs_path} → ${relative(this.repoPath, newAbsPath)}`)
            this.fsTarget.markInFlight?.(oldAbsPath)
            this.fsTarget.markInFlight?.(newAbsPath)

            // Drop any pending writes to the old path before renaming
            this.fsTarget.dropPending?.(oldAbsPath)

            this.fsTarget.renameFile(oldAbsPath, newAbsPath)

            // Route fs_path updates through emitter.commit so each UPDATE is
            // paired with a changes.jsonl entry. commit() (not apply()) avoids
            // re-firing onApply subscribers — we're already inside one.
            const newRelPath = relative(this.repoPath, newAbsPath)
            const oldRelPath = node.fs_path
            this.commitRename(node.id, { fs_path: newRelPath, old_fs_path: oldRelPath })

            // Cascade fs_path updates for folder descendants, one op per
            // descendant so DB + journal stay paired per row.
            if (node.fstype === "folder") {
              this.commitRenameCascade(oldRelPath, newRelPath)
            }

            this.fsTarget.clearInFlight?.(oldAbsPath, 1000)
            this.fsTarget.clearInFlight?.(newAbsPath, 1000)
            didDiskMove = true
          }
        }
      }
    }

    // Save the DESTINATION file (where the node now lives).
    // For disk-moved file/folder items, re-read the node to pick up the updated fs_path.
    if (didDiskMove) {
      const refreshed = getNode(this.db, change.target)
      if (refreshed) this.save(refreshed)
    } else {
      this.save(node)
    }

    // Save the SOURCE file (where the node used to live) to remove stale content
    const data = change.data as { old_parent_id?: string | null }
    const oldParentId = data?.old_parent_id
    if (oldParentId) {
      const oldParent = getNode(this.db, oldParentId)
      if (oldParent) {
        const sourceFileNode = findFileNode(this.db, oldParent)
        const destNode = didDiskMove ? getNode(this.db, change.target) : node
        const destFileNode = destNode ? findFileNode(this.db, destNode) : null
        // Only save if source differs from destination (cross-file move)
        if (sourceFileNode?.fs_path && sourceFileNode.id !== destFileNode?.id) {
          this.save(oldParent)
        }
      }
    }

    // If moved node's parent is a folder with materialization, regenerate its index file
    const parent = node.parent_id ? getNode(this.db, node.parent_id) : null
    if (parent?.fstype === "folder" && parent.fs_path) {
      this.handleFolderIndexUpdate(parent)
    }

    // Persist sibling order when folder children are reordered.
    // This ensures column order survives state.db rebuilds.
    this.persistFolderChildOrder(node, change)
  }

  /**
   * Persist folder child order to `.km/sibling-order.json` when the moved
   * node's parent is a folder. Reads the current children from the DB
   * (already updated by the time this runs) and writes their names in
   * parent_idx order. This allows discovery to restore the order on rebuild.
   */
  private persistFolderChildOrder(node: KNode, _change: Change): void {
    if (!node.parent_id) return

    const parent = getNode(this.db, node.parent_id)
    if (!parent) return

    // Only persist order for folder parents — markdown file sections already
    // have their order serialized in the file content.
    if (parent.fstype !== "folder") return

    const parentFsPath = parent.fs_path ?? "."
    const children = getChildren(this.db, parent.id)

    // Only persist order for filesystem-backed children (folders, files).
    // Inline children (sections, paragraphs) are serialized in markdown.
    const fsChildren = children.filter(
      (c) => c.fstype === "folder" || c.fstype === "mdfile" || c.fstype === "file" || c.fstype === "txtfile",
    )

    if (fsChildren.length === 0) return

    // Extract child names (filesystem basenames)
    const childNames = fsChildren
      .map((c) => {
        if (c.fs_path) return basename(c.fs_path)
        return c.name ?? c.content ?? ""
      })
      .filter((n) => n.length > 0)

    writeSiblingOrder(this.repoPath, parentFsPath, childNames)
  }

  /**
   * Handle task lifecycle changes (claimed, released, completed).
   * These update task_status/task_marker in DB but need the containing
   * file regenerated so the change appears in markdown.
   */
  private handleTaskChange(change: Change): void {
    if (!change.target) return
    const node = getNode(this.db, change.target)
    if (node) this.save(node)
  }

  /**
   * Update or create an index file for a folder node.
   * Respects the folderIndex config — does nothing if materialization is "none".
   */
  private handleFolderIndexUpdate(node: KNode): void {
    const config = getFolderIndexConfig(this.repoPath)
    if (config.materialization === "none") return
    const indexConfig = { materialization: config.materialization, naming: config.naming }

    const folderPath = node.fs_path
    if (!folderPath) return

    const content = buildIndexContent(this.db, node, indexConfig)
    if (!content) {
      log.warn?.(`handleFolderIndexUpdate: folder ${node.id} has no title or name, skipping index file`)
      return
    }

    const children = getChildren(this.db, node.id)
    const existingIndex = findIndexFile(node, children)

    if (existingIndex?.fs_path) {
      // Update existing index file
      const absPath = toAbsoluteFsPath(this.repoPath, existingIndex.fs_path)
      this.fsTarget.writeFile(absPath, content, this.currentChangeId)
    } else if (config.materialization === "full") {
      // Only "full" mode auto-creates index files. "metadata" mode only updates existing ones —
      // the user creates the index file manually, materialization keeps it in sync.
      const filename = indexFileName(node.name ?? "", config.naming)
      const newFsPath = join(folderPath, filename)
      const absPath = toAbsoluteFsPath(this.repoPath, newFsPath)
      this.fsTarget.writeFile(absPath, content, this.currentChangeId)
    }
  }

  /**
   * Rename a folder directory on disk when its content (name) changes.
   */
  private handleFolderRename(node: KNode, newName: string, _changeId: string): void {
    const oldFsPath = node.fs_path ?? ""
    const oldAbsPath = toAbsoluteFsPath(this.repoPath, oldFsPath)
    const parentDir = dirname(oldFsPath)
    const newFsPath = parentDir === "." ? newName : join(parentDir, newName)
    const newAbsPath = toAbsoluteFsPath(this.repoPath, newFsPath)

    if (oldAbsPath === newAbsPath) return
    if (existsSync(newAbsPath)) {
      log.warn?.(`folder rename aborted: target already exists: ${newFsPath}`)
      return
    }

    // Before renaming the folder, check for a same-name index file that needs renaming too
    const oldFolderName = node.name ?? ""
    const children = getChildren(this.db, node.id)
    const indexFile = findIndexFile(node, children)
    const indexNeedsRename = indexFile?.fs_path && indexFile.name && namesAreSimilar(oldFolderName, indexFile.name)

    log.info?.(`folder rename: ${oldFsPath} → ${newFsPath}`)

    // Rewrite all pending writes under the old directory to the new path
    // BEFORE the rename so queued writes flush to the new location
    this.fsTarget.renamePendingSubtree?.(oldAbsPath, newAbsPath)

    if (existsSync(oldAbsPath)) {
      this.fsTarget.markInFlight?.(oldAbsPath)
      this.fsTarget.markInFlight?.(newAbsPath)
      this.fsTarget.renameFile(oldAbsPath, newAbsPath)
      this.fsTarget.clearInFlight?.(oldAbsPath, 1000)
      this.fsTarget.clearInFlight?.(newAbsPath, 1000)
    }

    // Rename the same-name index file inside the (now renamed) folder
    let indexRenameSucceeded = false
    if (indexNeedsRename && indexFile?.fs_path) {
      const oldIndexName = indexFile.fs_path.split("/").pop() ?? ""
      const newIndexName = newName + ".md"
      if (oldIndexName !== newIndexName) {
        const oldIndexAbsPath = toAbsoluteFsPath(this.repoPath, join(newFsPath, oldIndexName))
        const newIndexAbsPath = toAbsoluteFsPath(this.repoPath, join(newFsPath, newIndexName))
        try {
          if (existsSync(oldIndexAbsPath) && !existsSync(newIndexAbsPath)) {
            log.info?.(`index file rename: ${oldIndexName} → ${newIndexName}`)
            this.fsTarget.markInFlight?.(oldIndexAbsPath)
            this.fsTarget.markInFlight?.(newIndexAbsPath)
            this.fsTarget.renameFile(oldIndexAbsPath, newIndexAbsPath)
            this.fsTarget.clearInFlight?.(oldIndexAbsPath, 1000)
            this.fsTarget.clearInFlight?.(newIndexAbsPath, 1000)
            indexRenameSucceeded = true
          }
        } catch (err) {
          log.error?.(`index file rename failed: ${oldIndexName} → ${newIndexName}: ${String(err)}`)
          // Don't update DB for index file — reconciler will pick up the mismatch
        }
      } else {
        // Names are the same, no rename needed — treat as success for DB update
        indexRenameSucceeded = true
      }
    }

    // Record write tokens for all .md files in the renamed directory
    // so the watcher recognizes them as our own writes (not external changes)
    if (existsSync(newAbsPath)) {
      this.recordTokensRecursive(newAbsPath)
    }

    // Update DB paths through the emitter so each UPDATE is paired with a
    // changes.jsonl entry (DB + journal atomic per row). commit() is used
    // (not apply()) because this runs inside an onApply callback — apply()
    // would recursively fire projection and risk an echo loop.
    this.commitRename(node.id, { fs_path: newFsPath, name: newName, old_fs_path: oldFsPath })

    // Cascade descendant fs_path rewrites as individual node_updated ops
    // (one per row). Per-row atomicity is the invariant; cascade completeness
    // is best-effort — a crash mid-loop leaves some descendants pending for
    // a later reconciliation pass.
    this.commitRenameCascade(oldFsPath, newFsPath)

    // Only update the index file's name and fs_path in DB if the FS rename succeeded
    if (indexNeedsRename && indexFile && indexRenameSucceeded) {
      const newIndexFsPath = join(newFsPath, newName + ".md")
      this.commitRename(indexFile.id, { fs_path: newIndexFsPath, name: newName })
    }

    // Refresh index file content with new title (node already updated in DB)
    const updatedFolder = getNode(this.db, node.id)
    if (updatedFolder) {
      this.handleFolderIndexUpdate(updatedFolder)
    }
  }

  /**
   * Rename a .md file when its H1 title changes.
   */
  private handleFileRename(fileNode: KNode, newTitle: string, _changeId: string): void {
    const oldFsPath = fileNode.fs_path
    if (!oldFsPath) return

    const newFileName = titleToFilename(newTitle)
    const parentDir = dirname(oldFsPath)
    const newFsPath = parentDir === "." ? newFileName : join(parentDir, newFileName)

    if (oldFsPath === newFsPath) return

    const oldAbsPath = toAbsoluteFsPath(this.repoPath, oldFsPath)
    const newAbsPath = toAbsoluteFsPath(this.repoPath, newFsPath)

    if (existsSync(newAbsPath)) {
      log.warn?.(`file rename aborted: target already exists: ${newFsPath}`)
      return
    }

    log.info?.(`file rename: ${oldFsPath} → ${newFsPath}`)

    // Rewrite any pending write from old path to new path BEFORE the rename
    // so the queued write flushes to the new location instead of recreating the old file
    this.fsTarget.renamePending?.(oldAbsPath, newAbsPath)

    if (existsSync(oldAbsPath)) {
      this.fsTarget.markInFlight?.(oldAbsPath)
      this.fsTarget.markInFlight?.(newAbsPath)
      this.fsTarget.renameFile(oldAbsPath, newAbsPath)
      this.fsTarget.clearInFlight?.(oldAbsPath, 1000)
      this.fsTarget.clearInFlight?.(newAbsPath, 1000)

      // Record write token at new path so watcher recognizes it as our write
      try {
        const content = readFileSync(newAbsPath, "utf-8")
        this.fsTarget.recordWriteToken?.(newAbsPath, content)
      } catch {
        // Read failure after rename — markInFlight provides fallback suppression
      }
    }

    // Update DB fs_path + name + title through the emitter so the UPDATE is
    // paired with a changes.jsonl entry (DB + journal atomic per row).
    // title is used by nodesToMarkdown for the H1 heading.
    const newName = newFileName.replace(/\.md$/i, "")
    this.commitRename(fileNode.id, { fs_path: newFsPath, name: newName, title: newTitle, old_fs_path: oldFsPath })

    // Mutate node so caller writes content at new path
    fileNode.fs_path = newFsPath
    fileNode.name = newName

    // If parent folder has materialization enabled, refresh its index file
    // so slots reflect the new filename
    if (fileNode.parent_id && fileNode.parent_id !== ".") {
      const parent = getNode(this.db, fileNode.parent_id)
      if (parent?.fstype === "folder" && parent.fs_path) {
        this.handleFolderIndexUpdate(parent)
      }
    }
  }

  /**
   * Commit a rename DB update paired with a journal entry.
   *
   * Routes through `emitter.commit()` — which applies to the DB via
   * `applyChangeWithDb` and appends to `changes.jsonl` in one call — so the
   * two writes are paired per row (emitter contract). Uses `commit()` rather
   * than `apply()` because this runs inside an `onApply` callback; firing
   * more `onApply` subscribers from here risks an echo loop back to the FS.
   *
   * `fs_path`, `name`, `title` are real `nodes` columns. `old_fs_path` is
   * audit metadata and lands in the node's `data` blob via json_patch.
   */
  private commitRename(nodeId: string, changes: Record<string, unknown>): void {
    this.emitter.commit({
      type: "node_updated",
      target: nodeId,
      actor: "user",
      data: changes,
    })
  }

  /**
   * Cascade a folder rename to every descendant whose fs_path is nested
   * under the old folder path, issuing one `node_updated` op per row.
   *
   * Per-row DB + journal atomicity is the invariant. Cascade completeness
   * is best-effort: if the process dies mid-loop, some descendants are
   * updated (DB + journal in sync) and the rest lag their parent — the
   * reconciliation path catches those up on next boot.
   */
  private commitRenameCascade(oldFsPath: string, newFsPath: string): void {
    const descendants = computeRenameCascade(this.db, oldFsPath, newFsPath)
    for (const d of descendants) {
      this.emitter.commit({
        type: "node_updated",
        target: d.id,
        actor: "user",
        data: { fs_path: d.newFsPath, old_fs_path: d.oldFsPath },
      })
    }
  }

  /**
   * Recursively record write tokens for all .md files in a directory.
   * Used after folder renames so the watcher recognizes the files at their
   * new paths as our own writes rather than external changes.
   */
  private recordTokensRecursive(dir: string): void {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          this.recordTokensRecursive(fullPath)
        } else if (entry.name.endsWith(".md")) {
          try {
            const content = readFileSync(fullPath, "utf-8")
            this.fsTarget.recordWriteToken?.(fullPath, content)
          } catch {
            // Individual file read failure — skip, markInFlight provides fallback
          }
        }
      }
    } catch {
      // Directory read failure — skip, markInFlight provides fallback
    }
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Drift-aware save helpers (used by ChangeHandlers.save → mergeExternalDrift)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Read the on-disk content and return it only when it differs from the
 * baseline km last observed for this file node. Returns null when the file
 * is missing, unreadable, or still matches the baseline (no drift).
 */
function readDiskContentIfChanged(db: Database, fileNode: KNode, absPath: string): string | null {
  if (!existsSync(absPath)) return null
  let diskContent: string
  try {
    diskContent = readFileSync(absPath, "utf-8")
  } catch {
    return null
  }
  const baselineHash = getNodeContentHash(db, fileNode.id)
  if (baselineHash && baselineHash === hashContent(diskContent)) return null
  return diskContent
}

/**
 * Parse the on-disk markdown into km-ast nodes. Returns null on parse
 * failure (drift merge falls back to the DB snapshot — noisy but safe).
 */
function parseDiskContent(content: string, fileNode: KNode, absPath: string): KNode[] | null {
  try {
    return parseMarkdownWithLinks(content, fileNode.fs_path ?? absPath).nodes
  } catch (err) {
    log.warn?.(
      `mergeExternalDrift: failed to parse disk content for ${absPath}: ${err instanceof Error ? err.message : String(err)}`,
    )
    return null
  }
}

/**
 * Merge the disk file node's `data` field (frontmatter + parser internals)
 * into the DB file node's. DB state wins on conflict — anything the DB
 * actively tracks stays authoritative — but fields only present on disk
 * (user-added frontmatter keys) are imported.
 */
function mergeFileFrontmatter(subtreeNodes: KNode[], fileNodeId: string, diskFile: KNode): KNode[] {
  const dbFileIdx = subtreeNodes.findIndex((n) => n.id === fileNodeId)
  if (dbFileIdx < 0) return subtreeNodes
  const dbFile = subtreeNodes[dbFileIdx]
  if (!dbFile) return subtreeNodes
  const mergedData: Record<string, unknown> = { ...diskFile.data, ...dbFile.data }
  const next = subtreeNodes.slice()
  next[dbFileIdx] = { ...dbFile, data: mergedData }
  return next
}

/**
 * Identify child nodes on disk that are not represented in the DB subtree
 * (matched by `.name` or by type+content), and append them to the subtree
 * re-parented to the file node. Existing children keep their DB state — the
 * in-app mutation that triggered the save has already been committed and
 * must not be reverted here.
 */
function appendUnmatchedDiskChildren(
  subtreeNodes: KNode[],
  fileNode: KNode,
  diskFile: KNode,
  diskNodes: KNode[],
): KNode[] {
  const dbChildren = subtreeNodes.filter((n) => n.id !== fileNode.id)
  const diskChildren = diskNodes.filter((n) => n !== diskFile)
  if (diskChildren.length === 0) return subtreeNodes

  // Post-v6: anchor literals live in `.name` (storage-architecture §2.3).
  // Matching by name covers both anchored blocks and slug-derived headings.
  const dbNames = new Set<string>()
  const dbContentKeys = new Set<string>()
  for (const n of dbChildren) {
    if (n.name) dbNames.add(n.name)
    if (n.content) dbContentKeys.add(`${n.type}:${n.content}`)
  }

  const maxIdx = dbChildren.reduce((acc, n) => Math.max(acc, n.parent_idx ?? 0), -1)
  let nextIdx = maxIdx + 1
  const appended: KNode[] = []

  for (const disk of diskChildren) {
    if (isDiskChildMatched(disk, dbNames, dbContentKeys)) continue
    appended.push({
      ...disk,
      id: ulid(),
      parent_id: fileNode.id,
      parent_idx: nextIdx++,
    })
  }

  if (appended.length === 0) return subtreeNodes
  log.info?.(`mergeExternalDrift: rescuing ${appended.length} externally-added node(s) from ${fileNode.fs_path ?? ""}`)
  return [...subtreeNodes, ...appended]
}

function isDiskChildMatched(disk: KNode, dbNames: Set<string>, dbContentKeys: Set<string>): boolean {
  if (disk.name && dbNames.has(disk.name)) return true
  if (disk.content && dbContentKeys.has(`${disk.type}:${disk.content}`)) return true
  return false
}
