/**
 * withFsWriter — lightweight decorator for CLI / non-TUI contexts
 *
 * Synchronously writes DB changes back to .md files via emitter.onApply().
 * Unlike withSync(), has no watcher, no WriteQueue, no debouncing.
 * Designed for one-shot CLI commands that do a mutation and exit.
 *
 * The TUI replaces this with withSync() which adds bidirectional sync.
 */

import { createLogger } from "loggily"
import { existsSync, mkdirSync, renameSync, rmSync, statSync, unlinkSync } from "fs"
import type { Database } from "bun:sqlite"
import type { Change } from "@km/core"
import type { Emitter } from "../emitter.ts"
import { toRelativeFsPath } from "../fs/path-utils.ts"
import { getNodeByPath } from "../db/queries/core-lookup.ts"
import type { SyncableRepo } from "./sync.ts"
import { ChangeHandlers, type FsWriteTarget } from "./change-handlers.ts"
import { safeWriteFile } from "./safe-write.ts"

const log = createLogger("km:storage:watch:fs-writer")

/** Result of withFsWriter — the repo plus a direct FS projection function */
export interface FsWriterResult<R> {
  repo: R
  /** Project a single change to the filesystem (no DB, no journal, no broadcast) */
  applyChangeToFs(change: Change): void
}

/**
 * Build a sync FsWriteTarget backed by safeWriteFile.
 *
 * Closes over the DB + emitter + repo root so the target can look up the
 * expected content hash from the file node before each write and surface
 * conflicts via the emitter's `conflict_created` change type.
 */
function createSyncFsTarget(db: Database, repoPath: string, emitter: Emitter): FsWriteTarget {
  return {
    writeFile: (absPath: string, content: string, changeId?: string) => {
      const expectedHash = lookupExpectedFsHash(db, repoPath, absPath)
      const result = safeWriteFile(absPath, content, { expectedHash })

      if (result.outcome === "conflict") {
        // Don't throw — callers (ChangeHandlers, bulk write flushes) batch
        // multiple writes per change and a throw here would strand the
        // remainder. Surface the divergence and move on; the user sees a
        // conflict event and the data on disk stays intact.
        log.warn?.(
          `safe-write conflict: ${absPath} (expected=${expectedHash ?? "<none>"}, actual=${result.actualHashBefore ?? "<missing>"})`,
        )
        emitter.apply(
          {
            type: "conflict_created",
            actor: "system",
            data: {
              fs_path: toRelativeFsPath(repoPath, absPath),
              reason: "external_edit_detected",
              expected_hash: expectedHash,
              actual_hash: result.actualHashBefore,
              change_id: changeId,
            },
          },
          // Don't re-project this meta-change to the FS; it's purely a
          // notification. skipPersist=false so it still lands in changes.jsonl
          // for audit.
          { source: "fs-import" },
        )
        return
      }

      // "wrote" or "noop" — disk is consistent with `content`. Refresh the
      // fs_content_hash baseline on the file node so the next write can use
      // the post-write hash as its expected value. Without this, a sequence
      // of legitimate in-app writes would conflict on the second iteration:
      // the DB's fs_content_hash (captured at scan time) would no longer
      // match the now-on-disk bytes we just produced.
      //
      // Step 5 of the CAS contract (hub/km/storage-architecture.md §7.1).
      const finalHash = result.newHash ?? result.actualHashBefore
      if (finalHash) updateFsContentHash(db, repoPath, absPath, finalHash)
    },
    deleteFile: (absPath: string, _changeId?: string) => {
      if (existsSync(absPath)) {
        if (statSync(absPath).isDirectory()) {
          rmSync(absPath, { recursive: true, force: true })
        } else {
          unlinkSync(absPath)
        }
      }
    },
    renameFile: (oldPath: string, newPath: string) => {
      renameSync(oldPath, newPath)
    },
    mkdir: (absPath: string) => {
      mkdirSync(absPath, { recursive: true })
    },
  }
}

/**
 * Resolve the last-known file-content hash for the node owning `absPath`.
 *
 * Returns null when (a) the path doesn't resolve to a DB node yet (fresh
 * file) or (b) the node hasn't had `fs_content_hash` populated. Null means
 * "don't guard" to the CAS contract — safe-write treats it as a first-write
 * and proceeds. Once the watcher/reconciler populates `fs_content_hash`,
 * subsequent writes are protected.
 */
function lookupExpectedFsHash(db: Database, repoPath: string, absPath: string): string | null {
  const relPath = toRelativeFsPath(repoPath, absPath)
  const node = getNodeByPath(db, relPath)
  return node?.fs_content_hash ?? null
}

/**
 * Record the post-write file-bytes hash on the owning file node, so the next
 * safe-write pass can use it as `expectedHash`. No-op when the node doesn't
 * exist yet (fresh file not yet imported — the reconciler will populate
 * fs_content_hash the first time it sees the file, and subsequent writes
 * will be guarded).
 */
function updateFsContentHash(db: Database, repoPath: string, absPath: string, hash: string): void {
  const relPath = toRelativeFsPath(repoPath, absPath)
  try {
    db.run("UPDATE nodes SET fs_content_hash = ? WHERE fs_path = ?", [hash, relPath])
  } catch (err) {
    log.warn?.(`failed to update fs_content_hash for ${relPath}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/**
 * Decorator that adds synchronous filesystem write-back to a repo.
 *
 * Subscribes to emitter.onApply() to project changes to .md files after DB commit.
 * For CLI usage where mutations need immediate FS write-back.
 *
 * Returns the repo (unchanged) plus an `applyChangeToFs` function for
 * direct FS projection (used by repo.syncToFs after withDeferredFs).
 *
 * @example
 * const { applyChangeToFs } = withFsWriter(repo)
 * repo.apply(change) // DB + journal + broadcast + write to .md
 */
export function withFsWriter<R extends SyncableRepo>(repo: R): FsWriterResult<R> {
  const { database, path, emitter } = repo
  const syncFsTarget = createSyncFsTarget(database, path, emitter)
  const handlers = new ChangeHandlers(database, path, emitter, syncFsTarget)

  // Subscribe to apply() to add FS projection.
  // onApply fires after DB + persist + broadcast; commit() does NOT fire it,
  // so FS-origin changes (which use commit()) structurally cannot echo back.
  emitter.onApply((change, options) => {
    if (options.source !== "fs-import") {
      handlers.applyChangeToFs(change)
    }
  })

  return {
    repo,
    applyChangeToFs: (change: Change) => handlers.applyChangeToFs(change),
  }
}
