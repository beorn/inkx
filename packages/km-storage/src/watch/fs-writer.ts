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
import { existsSync, mkdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "fs"
import { dirname } from "path"
import type { Database } from "bun:sqlite"
import type { Event } from "@km/core"
import type { Emitter, FsSync } from "../emitter.ts"
import { toAbsoluteFsPath } from "../path-utils.ts"
import { EventHandlers, type FsWriteTarget } from "./event-handlers.ts"

const log = createLogger("km:storage:watch:fs-writer")

export class FsWriter implements FsSync {
  private handlers: EventHandlers

  constructor(
    private db: Database,
    private repoPath: string,
    private emitter: Emitter,
  ) {
    // Create sync FsWriteTarget using writeFileSync, mkdirSync, renameSync, unlinkSync
    const fsTarget: FsWriteTarget = {
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

    this.handlers = new EventHandlers(db, repoPath, emitter, fsTarget)
  }

  applyEventToFs(event: Event): void {
    this.handlers.applyEventToFs(event)
  }
}
