/**
 * Event Handlers — Shared logic for applying DB events to filesystem
 *
 * Extracted from SyncManager and FsWriter to eliminate duplicate handler code.
 * Uses FsWriteTarget interface to abstract sync vs async write mechanisms.
 */

import { createLogger } from "loggily"
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "fs"
import { dirname, join } from "path"
import type { Database } from "bun:sqlite"
import { ulid } from "ulid"
import { type Event, KNode, findIndexFile, namesAreSimilar, type ItemData } from "@km/core"
import type { Emitter } from "../emitter.ts"
import { toAbsoluteFsPath } from "../path-utils.ts"
import { getIgnorePatterns } from "../ignore.ts"
import { getAllNodes, getChildren, getNode, getSubtree, nodesToMarkdown } from "../index.ts"
import { shouldApplyToFs } from "./writequeue.ts"
// reconcileIfChanged removed — DB is authority for user-origin events
import { findFileNode, titleToFilename } from "./watch-utils.ts"
import { getFolderIndexConfig } from "../config.ts"
import { buildIndexContent, indexFileName } from "../index-file-writer.ts"

const log = createLogger("km:storage:watch:event-handlers")

/**
 * FsWriteTarget — abstraction layer for filesystem write operations.
 * Allows both sync (FsWriter) and async (SyncManager) implementations.
 */
export interface FsWriteTarget {
  /** Write content to a file, creating parent directories as needed */
  writeFile(absPath: string, content: string, eventId?: string): void | Promise<void>

  /** Delete a file or directory. Noop if path doesn't exist. */
  deleteFile(absPath: string, eventId?: string): void | Promise<void>

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
}

/**
 * EventHandlers — shared node mutation handlers.
 * Parameterized by FsWriteTarget to work with both sync and async write mechanisms.
 */
export class EventHandlers {
  private ignorePatterns: string[]
  private currentEventId: string = ""

  constructor(
    private db: Database,
    private repoPath: string,
    private emitter: Emitter,
    private fsTarget: FsWriteTarget,
  ) {
    this.ignorePatterns = getIgnorePatterns(repoPath)
  }

  /**
   * Apply a database event to filesystem
   */
  applyEventToFs(event: Event): void {
    if (!shouldApplyToFs(event.actor)) {
      log.debug?.(`skipping fs apply for actor=${event.actor} event=${event.type}`)
      return
    }

    log.debug?.(`applying ${event.type} to fs: ${event.target ?? "no-target"}`)

    // Store eventId for this event's handler lifecycle
    this.currentEventId = event.id

    switch (event.type) {
      case "node_updated":
        this.handleNodeUpdated(event)
        break
      case "node_created":
        this.handleNodeCreated(event)
        break
      case "node_deleted":
        this.handleNodeDeleted(event)
        break
      case "node_moved":
        this.handleNodeMoved(event)
        break
      case "task_claimed":
      case "task_released":
      case "task_completed":
        this.handleTaskEvent(event)
        break
    }

    this.currentEventId = ""
  }

  /**
   * Create an assignBlockId callback that collects newly assigned IDs.
   * After serialization, call rewriteSourceFiles to write ^block-id
   * suffixes into the files that contain the referenced nodes.
   */
  private createBlockIdAssigner(): {
    assign: (nodeId: string, blockId: string) => void
    rewriteSourceFiles: (excludeFileId?: string) => void
  } {
    const assigned = new Map<string, string>() // nodeId → blockId
    return {
      assign: (nodeId: string, blockId: string) => {
        this.db.run("UPDATE nodes SET block_id = ? WHERE id = ?", [blockId, nodeId])
        assigned.set(nodeId, blockId)
      },
      rewriteSourceFiles: (excludeFileId?: string) => {
        if (assigned.size === 0) return
        // Group by containing file
        const fileIds = new Set<string>()
        for (const [nodeId, blockId] of assigned) {
          const node = getNode(this.db, nodeId)
          if (!node) {
            log.error?.(`rewriteSourceFiles: node ${nodeId} vanished after block_id assignment`)
            continue
          }
          // Update in-memory node for serialization
          node.block_id = blockId
          const file = findFileNode(this.db, node)
          if (file && file.id !== excludeFileId) fileIds.add(file.id)
        }
        // Rewrite each affected source file (without assignBlockId to prevent cascading)
        for (const fileId of fileIds) {
          const file = getNode(this.db, fileId)
          if (!file?.fs_path) {
            log.error?.(`rewriteSourceFiles: file node ${fileId} missing or has no fs_path`)
            continue
          }
          const absPath = toAbsoluteFsPath(this.repoPath, file.fs_path)
          const subtreeNodes = getSubtree(this.db, fileId)
          const content = nodesToMarkdown(subtreeNodes, getAllNodes(this.db))
          this.fsTarget.writeFile(absPath, content, this.currentEventId)
        }
      },
    }
  }

  /**
   * Handle node updated — regenerate the containing file.
   * Reconciles external changes first to avoid data loss.
   */
  private handleNodeUpdated(event: Event): void {
    if (!event.target) return

    const node = getNode(this.db, event.target)
    if (!node) return
    const changes = event.data as Partial<KNode>

    // Folder rename: content change on a folder → rename directory on disk
    if (KNode.isOutline(node) && node.fstype === "folder" && node.fs_path && changes.content) {
      this.handleFolderRename(node, changes.content, event.id)
      return
    }

    // Folder metadata update: update or create index file
    if (KNode.isOutline(node) && node.fstype === "folder" && node.fs_path) {
      this.handleFolderIndexUpdate(node)
      return
    }

    const fileNode = findFileNode(this.db, node)
    if (!fileNode?.fs_path) return

    // File rename: content change on the file node itself → rename .md file
    if (node.id === fileNode.id && changes.content && fileNode.fs_path.endsWith(".md")) {
      this.handleFileRename(fileNode, changes.content, event.id)
    }

    const absPath = toAbsoluteFsPath(this.repoPath, fileNode.fs_path)
    // NOTE: reconcileIfChanged removed here. For user-origin events, the DB
    // is the authority. Reconciling from a stale file (written by a previous
    // event in the same batch) causes data loss — e.g., name set by inline
    // edit gets overwritten by the empty heading from the prior write.
    // External edits are handled by the watcher's periodic reconciliation.

    const blockIds = this.createBlockIdAssigner()
    const subtreeNodes = getSubtree(this.db, fileNode.id)
    const content = nodesToMarkdown(subtreeNodes, getAllNodes(this.db), blockIds.assign)
    this.fsTarget.writeFile(absPath, content, this.currentEventId)
    blockIds.rewriteSourceFiles(fileNode.id)
  }

  /**
   * Handle node created — create directory, empty file, or regenerate parent file.
   */
  private handleNodeCreated(event: Event): void {
    const data = event.data as Partial<KNode>

    if (data.type === "h" && data.item && data.fstype === "folder" && data.fs_path) {
      const absPath = toAbsoluteFsPath(this.repoPath, data.fs_path)
      this.fsTarget.mkdir(absPath)
    } else if (data.type === "h" && data.item && (data.fstype === "file" || data.fstype === "mdfile") && data.fs_path) {
      const absPath = toAbsoluteFsPath(this.repoPath, data.fs_path)
      this.fsTarget.writeFile(absPath, "", this.currentEventId)
    } else if (data.parent_id && data.parent_id !== ".") {
      // Non-file node (task, section, etc.) created under a file → regenerate
      const parent = getNode(this.db, data.parent_id)
      if (!parent) return
      const fileNode = findFileNode(this.db, parent)
      if (!fileNode?.fs_path) return
      const blockIds = this.createBlockIdAssigner()
      const absPath = toAbsoluteFsPath(this.repoPath, fileNode.fs_path)
      const subtreeNodes = getSubtree(this.db, fileNode.id)
      const content = nodesToMarkdown(subtreeNodes, getAllNodes(this.db), blockIds.assign)
      this.fsTarget.writeFile(absPath, content, this.currentEventId)
      blockIds.rewriteSourceFiles(fileNode.id)
    }
  }

  /**
   * Handle node deleted — remove file/directory, or regenerate parent file.
   * Node is already deleted from DB by the time fsSync runs,
   * so we read metadata from event.data (snapshotted before deletion).
   */
  private handleNodeDeleted(event: Event): void {
    if (!event.target) return

    // Node is already deleted from DB — use data passed in event payload
    const data = event.data as
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
        this.fsTarget.deleteFile(absPath, this.currentEventId)
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
      // Non-file node (section, task, paragraph): regenerate the parent file
      // to reflect the deletion. Reconcile first to avoid overwriting external edits.
      const parent = getNode(this.db, data.parent_id)
      if (!parent) return
      const fileNode = findFileNode(this.db, parent)
      if (!fileNode?.fs_path) return
      const blockIds = this.createBlockIdAssigner()
      const absPath = toAbsoluteFsPath(this.repoPath, fileNode.fs_path)
      const subtreeNodes = getSubtree(this.db, fileNode.id)
      const content = nodesToMarkdown(subtreeNodes, getAllNodes(this.db), blockIds.assign)
      this.fsTarget.writeFile(absPath, content, this.currentEventId)
      blockIds.rewriteSourceFiles(fileNode.id)
    }
  }

  /**
   * Handle node moved — regenerate BOTH the source and destination files.
   *
   * The node's parent_id in the DB already points to the new parent (DB updated
   * before fsSync runs). The event data carries old_parent_id so we can find
   * and regenerate the source file, preventing stale content on disk.
   */
  private handleNodeMoved(event: Event): void {
    if (!event.target) return

    const node = getNode(this.db, event.target)
    if (!node) return

    // Regenerate the DESTINATION file (where the node now lives)
    const destFileNode = findFileNode(this.db, node)
    if (destFileNode?.fs_path) {
      const blockIds = this.createBlockIdAssigner()
      const absPath = toAbsoluteFsPath(this.repoPath, destFileNode.fs_path)
      const subtreeNodes = getSubtree(this.db, destFileNode.id)
      const content = nodesToMarkdown(subtreeNodes, getAllNodes(this.db), blockIds.assign)
      this.fsTarget.writeFile(absPath, content, this.currentEventId)
      blockIds.rewriteSourceFiles(destFileNode.id)
    }

    // Regenerate the SOURCE file (where the node used to live) to remove stale content
    const data = event.data as { old_parent_id?: string | null }
    const oldParentId = data?.old_parent_id
    if (oldParentId) {
      const oldParent = getNode(this.db, oldParentId)
      if (oldParent) {
        const sourceFileNode = findFileNode(this.db, oldParent)
        // Only regenerate if source differs from destination (cross-file move)
        if (sourceFileNode?.fs_path && sourceFileNode.id !== destFileNode?.id) {
          const blockIds = this.createBlockIdAssigner()
          const absPath = toAbsoluteFsPath(this.repoPath, sourceFileNode.fs_path)
          const subtreeNodes = getSubtree(this.db, sourceFileNode.id)
          const content = nodesToMarkdown(subtreeNodes, getAllNodes(this.db), blockIds.assign)
          this.fsTarget.writeFile(absPath, content, this.currentEventId)
          blockIds.rewriteSourceFiles(sourceFileNode.id)
        }
      }
    }

    // If moved node's parent is a folder with materialization, regenerate its index file
    const parent = node.parent_id ? getNode(this.db, node.parent_id) : null
    if (parent?.fstype === "folder" && parent.fs_path) {
      this.handleFolderIndexUpdate(parent)
    }
  }

  /**
   * Handle task lifecycle events (claimed, released, completed).
   * These update task_status/task_marker in DB but need the containing
   * file regenerated so the change appears in markdown.
   */
  private handleTaskEvent(event: Event): void {
    if (!event.target) return

    const node = getNode(this.db, event.target)
    if (!node) return

    const fileNode = findFileNode(this.db, node)
    if (!fileNode?.fs_path) return

    const blockIds = this.createBlockIdAssigner()
    const absPath = toAbsoluteFsPath(this.repoPath, fileNode.fs_path)
    const subtreeNodes = getSubtree(this.db, fileNode.id)
    const content = nodesToMarkdown(subtreeNodes, getAllNodes(this.db), blockIds.assign)
    this.fsTarget.writeFile(absPath, content, this.currentEventId)
    blockIds.rewriteSourceFiles(fileNode.id)
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
      this.fsTarget.writeFile(absPath, content, this.currentEventId)
    } else if (config.materialization === "full") {
      // Only "full" mode auto-creates index files. "metadata" mode only updates existing ones —
      // the user creates the index file manually, materialization keeps it in sync.
      const filename = indexFileName(node.name ?? "", config.naming)
      const newFsPath = join(folderPath, filename)
      const absPath = toAbsoluteFsPath(this.repoPath, newFsPath)
      this.fsTarget.writeFile(absPath, content, this.currentEventId)
    }
  }

  /**
   * Rename a folder directory on disk when its content (name) changes.
   */
  private handleFolderRename(node: KNode, newName: string, _eventId: string): void {
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

    // Update DB paths
    const oldPrefix = oldFsPath + "/"
    const newPrefix = newFsPath + "/"
    this.db.run("UPDATE nodes SET fs_path = ?, name = ?, updated_at = ? WHERE id = ?", [
      newFsPath,
      newName,
      Date.now(),
      node.id,
    ])
    this.db.run(`UPDATE nodes SET fs_path = ? || SUBSTR(fs_path, ?), updated_at = ? WHERE fs_path LIKE ?`, [
      newPrefix,
      oldPrefix.length + 1,
      Date.now(),
      oldPrefix + "%",
    ])

    // Journal the folder rename for event-sourcing completeness
    this.journalRename(node.id, { fs_path: newFsPath, name: newName, old_fs_path: oldFsPath })

    // Only update the index file's name and fs_path in DB if the FS rename succeeded
    if (indexNeedsRename && indexFile && indexRenameSucceeded) {
      const newIndexFsPath = join(newFsPath, newName + ".md")
      this.db.run("UPDATE nodes SET fs_path = ?, name = ?, updated_at = ? WHERE id = ?", [
        newIndexFsPath,
        newName,
        Date.now(),
        indexFile.id,
      ])
      // Journal the index file rename
      this.journalRename(indexFile.id, { fs_path: newIndexFsPath, name: newName })
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
  private handleFileRename(fileNode: KNode, newTitle: string, _eventId: string): void {
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

    // Update DB: fs_path, name, and title (title is used by nodesToMarkdown for H1 heading)
    const newName = newFileName.replace(/\.md$/i, "")
    this.db.run("UPDATE nodes SET fs_path = ?, name = ?, title = ?, updated_at = ? WHERE id = ?", [
      newFsPath,
      newName,
      newTitle,
      Date.now(),
      fileNode.id,
    ])

    // Journal the file rename for event-sourcing completeness
    this.journalRename(fileNode.id, { fs_path: newFsPath, name: newName, title: newTitle, old_fs_path: oldFsPath })

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
   * Journal a rename operation to events.jsonl.
   * The DB is already updated by direct mutation (for atomicity with the FS rename),
   * so this only persists to the journal for event-sourcing completeness.
   */
  private journalRename(nodeId: string, changes: Record<string, unknown>): void {
    const event: Event = {
      id: ulid(),
      ts: Date.now(),
      type: "node_updated",
      target: nodeId,
      actor: "user",
      data: changes,
    }
    try {
      const dir = dirname(this.emitter.eventsPath)
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      appendFileSync(this.emitter.eventsPath, JSON.stringify(event) + "\n")
    } catch (err) {
      log.error?.(`journalRename failed for ${nodeId}: ${String(err)}`)
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
