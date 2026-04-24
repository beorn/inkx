/**
 * Canonical event log — append-only store of AgentEvents per session.
 *
 * Writes to `<dir>/<sessionId>.jsonl` so the same file format is compatible
 * with recall's FTS5 indexer (see bearly/recall). M10 wires this through to
 * HistoryView + replay.
 *
 * Keeping this behind a small interface lets tests swap in an in-memory
 * implementation without touching the harness.
 *
 * Rotation: the file backend caps each session log at `maxBytes` (default
 * 10 MiB) and keeps up to `keepGenerations` rotated siblings (default 3).
 * When the live file reaches the cap, we rename `.jsonl` → `.jsonl.1`,
 * shifting older generations (`.jsonl.1` → `.jsonl.2`, …) and dropping
 * anything past `keepGenerations`. The live `.jsonl` then restarts empty.
 * HistoryView's scan filter (`endsWith(".jsonl")`) naturally ignores the
 * `.jsonl.N` generations, so one row per session is preserved.
 */

import { appendFileSync, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import type { AgentEvent, SessionId } from "./events.ts"

export interface EventLog {
  append(event: AgentEvent): void
  close(): void
  sessionId(): SessionId | null
  /**
   * Observability hook — returns current live-file size, number of retained
   * generations, and total bytes (live + all generations). File backends
   * report real stats; memory/no-op backends return zeros.
   */
  size(): { current: number; generations: number; totalBytes: number }
}

export interface FileEventLogOptions {
  sessionId?: SessionId | null
  /** Rotate when the live file reaches this many bytes. Default: 10 MiB. */
  maxBytes?: number
  /** Keep at most N rotated generations (.jsonl.1 … .jsonl.N). Default: 3. */
  keepGenerations?: number
}

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024
const DEFAULT_KEEP_GENERATIONS = 3

function safeStatSize(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

let rotationErrorLogged = false
function logRotationErrorOnce(err: unknown): void {
  if (rotationErrorLogged) return
  rotationErrorLogged = true
  try {
    // eslint-disable-next-line no-console
    console.error("[event-log] rotation failed (subsequent errors suppressed):", err)
  } catch {
    /* best-effort */
  }
}

/**
 * Accepts either the legacy `createFileEventLog(dir, sessionId)` signature
 * or the options-object form `createFileEventLog(dir, { sessionId, maxBytes,
 * keepGenerations })`. Existing callers continue to work unchanged.
 */
export function createFileEventLog(
  dir: string,
  sessionIdOrOpts: SessionId | null | FileEventLogOptions = null,
): EventLog {
  const opts: FileEventLogOptions =
    sessionIdOrOpts && typeof sessionIdOrOpts === "object" ? sessionIdOrOpts : { sessionId: sessionIdOrOpts }
  let currentSession: SessionId | null = opts.sessionId ?? null
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  const keepGenerations = Math.max(0, opts.keepGenerations ?? DEFAULT_KEEP_GENERATIONS)

  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* dir already exists */
  }

  function livePath(sid: SessionId): string {
    return join(dir, `${sid}.jsonl`)
  }
  function genPath(sid: SessionId, gen: number): string {
    return join(dir, `${sid}.jsonl.${gen}`)
  }

  /**
   * Shift `.jsonl → .jsonl.1`, `.jsonl.1 → .jsonl.2`, …, dropping anything
   * past `keepGenerations`. When `keepGenerations === 0`, the live file is
   * simply truncated (unlinked) — no generations are retained.
   */
  function rotate(sid: SessionId): void {
    try {
      if (keepGenerations === 0) {
        try {
          unlinkSync(livePath(sid))
        } catch {
          /* nothing to remove */
        }
        return
      }
      // Drop the oldest generation if it would be bumped past the cap.
      const oldest = genPath(sid, keepGenerations)
      try {
        unlinkSync(oldest)
      } catch {
        /* no file at oldest slot */
      }
      // Shift N-1 → N, N-2 → N-1, …, 1 → 2.
      for (let g = keepGenerations - 1; g >= 1; g--) {
        try {
          renameSync(genPath(sid, g), genPath(sid, g + 1))
        } catch {
          /* generation missing — ok */
        }
      }
      // Finally live → .1.
      try {
        renameSync(livePath(sid), genPath(sid, 1))
      } catch {
        /* live file missing — ok */
      }
    } catch (err) {
      logRotationErrorOnce(err)
    }
  }

  function currentStats(): { current: number; generations: number; totalBytes: number } {
    const sid = currentSession
    if (!sid) return { current: 0, generations: 0, totalBytes: 0 }
    const current = safeStatSize(livePath(sid))
    let generations = 0
    let genBytes = 0
    for (let g = 1; g <= keepGenerations; g++) {
      const sz = safeStatSize(genPath(sid, g))
      if (sz > 0) {
        generations++
        genBytes += sz
      }
    }
    return { current, generations, totalBytes: current + genBytes }
  }

  return {
    append(event: AgentEvent): void {
      if (!currentSession && event.kind === "session-init") {
        currentSession = event.sessionId
      }
      const sid = currentSession ?? ("unknown" as SessionId)
      const line = JSON.stringify(event) + "\n"
      // Rotate before writing if the live file is already at/over the cap.
      // Using pre-write check keeps the semantic simple: the new line always
      // lands in a fresh or under-cap file. We never partially split a line.
      try {
        if (maxBytes > 0 && safeStatSize(livePath(sid)) >= maxBytes) {
          rotate(sid)
        }
      } catch (err) {
        logRotationErrorOnce(err)
      }
      try {
        appendFileSync(livePath(sid), line)
      } catch {
        /* best-effort — don't throw out of the write path */
      }
    },
    close(): void {
      /* no-op for append-only file logs */
    },
    sessionId(): SessionId | null {
      return currentSession
    },
    size(): { current: number; generations: number; totalBytes: number } {
      return currentStats()
    },
  }
}

export function createMemoryEventLog(): EventLog & { events(): AgentEvent[] } {
  const events: AgentEvent[] = []
  let currentSession: SessionId | null = null
  return {
    append(event: AgentEvent): void {
      if (!currentSession && event.kind === "session-init") currentSession = event.sessionId
      events.push(event)
    },
    close(): void {},
    sessionId(): SessionId | null {
      return currentSession
    },
    size(): { current: number; generations: number; totalBytes: number } {
      return { current: 0, generations: 0, totalBytes: 0 }
    },
    events(): AgentEvent[] {
      return events.slice()
    },
  }
}
