/**
 * Canonical event log — append-only store of AgentEvents per session.
 *
 * Writes to `<dir>/<sessionId>.jsonl` so the same file format is compatible
 * with recall's FTS5 indexer (see bearly/recall). M10 wires this through to
 * HistoryView + replay.
 *
 * Keeping this behind a small interface lets tests swap in an in-memory
 * implementation without touching the harness.
 */

import { appendFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import type { AgentEvent, SessionId } from "./events.ts"

export interface EventLog {
  append(event: AgentEvent): void
  close(): void
  sessionId(): SessionId | null
}

export function createFileEventLog(dir: string, sessionId: SessionId | null = null): EventLog {
  let currentSession: SessionId | null = sessionId
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* dir already exists */
  }
  function pathFor(sid: SessionId): string {
    return join(dir, `${sid}.jsonl`)
  }
  return {
    append(event: AgentEvent): void {
      if (!currentSession && event.kind === "session-init") {
        currentSession = event.sessionId
      }
      const sid = currentSession ?? ("unknown" as SessionId)
      const line = JSON.stringify(event) + "\n"
      try {
        appendFileSync(pathFor(sid), line)
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
    events(): AgentEvent[] {
      return events.slice()
    },
  }
}
