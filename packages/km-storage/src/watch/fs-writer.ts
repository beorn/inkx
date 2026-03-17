/**
 * FsWriter — lightweight FsSync for CLI / non-TUI contexts
 *
 * Synchronously writes DB changes back to .md files.
 * Unlike SyncManager, has no watcher, no WriteQueue, no debouncing.
 * Designed for one-shot CLI commands that do a mutation and exit.
 *
 * The TUI replaces this with SyncManager via emitter.setFsSync().
 */

import { createLogger } from "loggily"
import { existsSync, mkdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs"
import { dirname, join } from "path"
import type { Database } from "bun:sqlite"
import type { Event, KNode } from "@km/core"
import type { Emitter, FsSync } from "../emitter.ts"
import { toAbsoluteFsPath } from "../path-utils.ts"
import { getIgnorePatterns } from "../ignore.ts"
import { getAllNodes, getChildren, getNode, getSubtree, nodesToMarkdown } from "../index.ts"
import { shouldApplyToFs } from "./writequeue.ts"
import { reconcileDirectory, applyReconcileOps } from "./reconcile.ts"
import { findFileNode, titleToFilename } from "./watch-utils.ts"
import { findIndexFile, isIndexFile, namesAreSimilar } from "@km/tree"
import { getFolderIndexConfig } from "../config.ts"
import { buildIndexContent, indexFileName } from "../index-file-writer.ts"

const log = createLogger("km:storage:watch:fs-writer")

export class FsWriter implements FsSync {
  private ignorePatterns: string[]

  constructor(
    private db: Database,
    private repoPath: string,
    private emitter: Emitter,
  ) {
    this.ignorePatterns = getIgnorePatterns(repoPath)
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
          this.writeSync(absPath, content)
        }
      },
    }
  }

  applyEventToFs(event: Event): void {
    if (!shouldApplyToFs(event.actor)) return

    log.debug?.(`applying ${event.type} to fs: ${event.target ?? "no-target"}`)

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
    if (node.type === "h" && node.item && node.fstype === "folder" && node.fs_path && changes.content) {
      this.handleFolderRename(node, changes.content, event.id)
      return
    }

    // Folder metadata update: update or create index file
    if (node.type === "h" && node.item && node.fstype === "folder" && node.fs_path) {
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
    this.reconcileIfChanged(fileNode)

    const blockIds = this.createBlockIdAssigner()
    const subtreeNodes = getSubtree(this.db, fileNode.id)
    const content = nodesToMarkdown(subtreeNodes, getAllNodes(this.db), blockIds.assign)
    this.writeSync(absPath, content)
    blockIds.rewriteSourceFiles(fileNode.id)
  }

  /**
   * Handle node created — create directory, empty file, or regenerate parent file.
   */
  private handleNodeCreated(event: Event): void {
    const data = event.data as Partial<KNode>

    if (data.type === "h" && data.item && data.fstype === "folder" && data.fs_path) {
      const absPath = toAbsoluteFsPath(this.repoPath, data.fs_path)
      mkdirSync(absPath, { recursive: true })
    } else if (data.type === "h" && data.item && (data.fstype === "file" || data.fstype === "mdfile") && data.fs_path) {
      const absPath = toAbsoluteFsPath(this.repoPath, data.fs_path)
      this.writeSync(absPath, "")
    } else if (data.parent_id) {
      // Non-file node (task, section, etc.) created under a file → regenerate
      const parent = getNode(this.db, data.parent_id)
      if (!parent) return
      const fileNode = findFileNode(this.db, parent)
      if (!fileNode?.fs_path) return
      this.reconcileIfChanged(fileNode)
      const blockIds = this.createBlockIdAssigner()
      const absPath = toAbsoluteFsPath(this.repoPath, fileNode.fs_path)
      const subtreeNodes = getSubtree(this.db, fileNode.id)
      const content = nodesToMarkdown(subtreeNodes, getAllNodes(this.db), blockIds.assign)
      this.writeSync(absPath, content)
      blockIds.rewriteSourceFiles(fileNode.id)
    }
  }

  /**
   * Handle node deleted — remove file or directory.
   */
  private handleNodeDeleted(event: Event): void {
    if (!event.target) return

    const node = getNode(this.db, event.target)
    if (
      node?.fs_path &&
      node.type === "h" &&
      node.item &&
      (node.fstype === "folder" || node.fstype === "file" || node.fstype === "mdfile")
    ) {
      const absPath = toAbsoluteFsPath(this.repoPath, node.fs_path)
      if (existsSync(absPath)) {
        unlinkSync(absPath)
      }

      // If deleted node was an index file, regenerate parent folder's index
      if (node.fstype === "mdfile" && node.parent_id && node.parent_id !== ".") {
        const parent = getNode(this.db, node.parent_id)
        if (parent?.fstype === "folder" && parent.fs_path && isIndexFile(parent.name ?? "", node)) {
          this.handleFolderIndexUpdate(parent)
        }
      }
    }
  }

  /**
   * Handle node moved — regenerate the target file.
   */
  private handleNodeMoved(event: Event): void {
    if (!event.target) return

    const node = getNode(this.db, event.target)
    if (!node) return

    const fileNode = findFileNode(this.db, node)
    if (!fileNode?.fs_path) return

    this.reconcileIfChanged(fileNode)

    const blockIds = this.createBlockIdAssigner()
    const absPath = toAbsoluteFsPath(this.repoPath, fileNode.fs_path)
    const subtreeNodes = getSubtree(this.db, fileNode.id)
    const content = nodesToMarkdown(subtreeNodes, getAllNodes(this.db), blockIds.assign)
    this.writeSync(absPath, content)
    blockIds.rewriteSourceFiles(fileNode.id)

    // If moved node's parent is a folder with materialization, regenerate its index file
    const parent = node.parent_id ? getNode(this.db, node.parent_id) : null
    if (parent?.fstype === "folder" && parent.fs_path) {
      this.handleFolderIndexUpdate(parent)
    }
  }

  /**
   * Update or create an index file for a folder node.
   * Respects the folderIndex config — does nothing if materialization is "none".
   */
  private handleFolderIndexUpdate(node: KNode): void {
    const config = getFolderIndexConfig(this.repoPath)
    if (config.materialization === "none") return

    const folderPath = node.fs_path
    if (!folderPath) return

    const content = buildIndexContent(this.db, node, config)
    if (!content) {
      log.warn?.(`handleFolderIndexUpdate: folder ${node.id} has no title or name, skipping index file`)
      return
    }

    const children = getChildren(this.db, node.id)
    const existingIndex = findIndexFile(node, children)

    if (existingIndex?.fs_path) {
      // Update existing index file
      const absPath = toAbsoluteFsPath(this.repoPath, existingIndex.fs_path)
      this.writeSync(absPath, content)
    } else {
      // Create new index file
      const filename = indexFileName(node.name ?? "", config.naming)
      const newFsPath = join(folderPath, filename)
      const absPath = toAbsoluteFsPath(this.repoPath, newFsPath)
      this.writeSync(absPath, content)
      // The watcher will pick up the new file and create a DB node for it
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
      renameSync(oldAbsPath, newAbsPath)
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
            renameSync(oldIndexAbsPath, newIndexAbsPath)
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

    // Only update the index file's name and fs_path in DB if the FS rename succeeded
    if (indexNeedsRename && indexFile && indexRenameSucceeded) {
      const newIndexFsPath = join(newFsPath, newName + ".md")
      this.db.run("UPDATE nodes SET fs_path = ?, name = ?, updated_at = ? WHERE id = ?", [
        newIndexFsPath,
        newName,
        Date.now(),
        indexFile.id,
      ])
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
      const newDir = dirname(newAbsPath)
      if (!existsSync(newDir)) {
        mkdirSync(newDir, { recursive: true })
      }
      renameSync(oldAbsPath, newAbsPath)
    }

    // Update DB
    const newName = newFileName.replace(/\.md$/i, "")
    this.db.run("UPDATE nodes SET fs_path = ?, name = ?, updated_at = ? WHERE id = ?", [
      newFsPath,
      newName,
      Date.now(),
      fileNode.id,
    ])

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
   * Reconcile if file was modified externally (mtime differs from DB).
   * Prevents data loss when DB changes race with FS changes.
   */
  private reconcileIfChanged(fileNode: KNode): void {
    if (!fileNode.fs_path) return
    const absPath = toAbsoluteFsPath(this.repoPath, fileNode.fs_path)
    if (!existsSync(absPath)) return

    try {
      const stat = statSync(absPath)
      const dbMtime = fileNode.fs_mtime

      if (dbMtime !== undefined && stat.mtimeMs !== dbMtime) {
        log.debug?.(`reconcile-before-write: file changed externally, reconciling path=${absPath}`)

        const dir = dirname(absPath)
        const ops = reconcileDirectory(this.db, dir, this.repoPath, this.ignorePatterns)

        if (ops.length > 0) {
          log.debug?.(`reconcile-before-write: applying ${ops.length} ops`)
          applyReconcileOps(this.db, ops, this.repoPath, this.emitter)
        }
      }
    } catch (err) {
      log.error?.(`reconcile-before-write: error checking file ${absPath}: ${String(err)}`)
    }
  }

  /**
   * Write content to a file, ensuring the parent directory exists.
   */
  private writeSync(absPath: string, content: string): void {
    const dir = dirname(absPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(absPath, content, "utf-8")
  }
}
