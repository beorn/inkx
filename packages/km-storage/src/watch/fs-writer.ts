/**
 * withFsWriter — lightweight decorator for CLI / non-TUI contexts
 *
 * Synchronously writes DB changes back to .md files by wrapping emitter.apply().
 * Unlike withSync(), has no watcher, no WriteQueue, no debouncing.
 * Designed for one-shot CLI commands that do a mutation and exit.
 *
 * The TUI replaces this with withSync() which adds bidirectional sync.
 */

import { existsSync, mkdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "fs"
import { dirname } from "path"
import type { Event } from "@km/core"
import type { SyncableRepo } from "./sync.ts"
import { EventHandlers, type FsWriteTarget } from "./event-handlers.ts"

/** Result of withFsWriter — the repo plus a direct FS projection function */
export interface FsWriterResult<R> {
  repo: R
  /** Project a single event to the filesystem (no DB, no journal, no broadcast) */
  applyEventToFs(event: Event): void
}

// Create sync FsWriteTarget using writeFileSync, mkdirSync, renameSync, unlinkSync
const syncFsTarget: FsWriteTarget = {
  writeFile: (absPath: string, content: string, _eventId?: string) => {
    const dir = dirname(absPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(absPath, content, "utf-8")
  },
  deleteFile: (absPath: string, _eventId?: string) => {
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

/**
 * Decorator that adds synchronous filesystem write-back to a repo.
 *
 * Wraps emitter.apply() to project events to .md files after DB commit.
 * For CLI usage where mutations need immediate FS write-back.
 *
 * Returns the repo (unchanged) plus an `applyEventToFs` function for
 * direct FS projection (used by repo.syncToFs after withDeferredFs).
 *
 * @example
 * const { applyEventToFs } = withFsWriter(repo)
 * repo.apply(event) // DB + journal + broadcast + write to .md
 */
export function withFsWriter<R extends SyncableRepo>(repo: R): FsWriterResult<R> {
  const { database, path, emitter } = repo
  const handlers = new EventHandlers(database, path, emitter, syncFsTarget)

  // Subscribe to apply() to add FS projection.
  // onApply fires after DB + persist + broadcast; commit() does NOT fire it,
  // so FS-origin events (which use commit()) structurally cannot echo back.
  emitter.onApply((event, options) => {
    if (options.source !== "fs-import") {
      handlers.applyEventToFs(event)
    }
  })

  return {
    repo,
    applyEventToFs: (event: Event) => handlers.applyEventToFs(event),
  }
}
