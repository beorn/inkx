/**
 * Emitter Domain Object
 *
 * Owns event emission lifecycle: kmDir, eventHub, fsSync.
 * Replaces global singletons in emit.ts with explicit ownership.
 *
 * Usage:
 *   const emitter = createEmitter({ kmDir: "/path/to/.km" })
 *   emitter.emit({ type: "node_created", actor: "user", data: {...} })
 *   emitter.setEventHub({ broadcast: (e) => socket.send(e) })
 *   emitter.setFsSync(syncManager)
 *   emitter.close()
 */

import { createLogger } from "loggily"
import { appendFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import type { Event } from "@km/core"
import type { Database } from "bun:sqlite"
import { applyEventWithDb } from "./db-events.ts"

const log = createLogger("km:storage:emitter")

// --- Types ---

/** Event hub for real-time broadcasting (e.g., to TUI or WebSocket clients) */
export interface EventHub {
  broadcast(event: Event): void
}

/** Filesystem sync callback (e.g., SyncManager for bidirectional sync) */
export interface FsSync {
  applyEventToFs(event: Event): void
}

/** Options for emit() calls */
export interface EmitOptions {
  /** Skip writing to events.jsonl */
  skipPersist?: boolean
  /** Skip broadcasting via eventHub */
  skipBroadcast?: boolean
  /** Database to apply event to (if not provided, event is not applied to db) */
  db?: Database
}

/** Options for createEmitter() */
export interface EmitterOptions {
  /** Path to .km directory (required) */
  kmDir: string
  /** Database to apply events to (optional - events only written to file if not provided) */
  db?: Database
  /** Optional event hub for real-time broadcasting */
  eventHub?: EventHub
  /** Optional filesystem sync callback */
  fsSync?: FsSync
  /** Skip persisting events to filesystem by default (useful for mock fs tests) */
  skipPersist?: boolean
}

/** Emitter domain object - owns event emission lifecycle */
export interface Emitter {
  /** Path to .km directory */
  readonly kmDir: string

  /** Path to events.jsonl file */
  readonly eventsPath: string

  /**
   * Emit an event.
   * 1. Applies to database (if db provided) — primary operation, DB consistency is non-negotiable
   * 2. Appends to events.jsonl (unless skipPersist) — if crash between 1 and 2, event is lost from journal but DB is correct
   * 3. Broadcasts via eventHub (unless skipBroadcast)
   * 4. Syncs to filesystem (if fsSync set)
   */
  emit(event: Omit<Event, "id" | "ts">, options?: EmitOptions): Event

  /** Set event hub for real-time broadcasting */
  setEventHub(hub: EventHub | null): void

  /** Set filesystem sync callback */
  setFsSync(sync: FsSync | null): void

  /** Get current event hub (for testing/inspection) */
  getEventHub(): EventHub | null

  /** Get current fs sync (for testing/inspection) */
  getFsSync(): FsSync | null

  /** Close emitter (clears callbacks) */
  close(): void
}

// --- Factory ---

/**
 * Create an Emitter domain object.
 *
 * @example
 * const emitter = createEmitter({ kmDir: "/path/to/.km" })
 * emitter.emit({ type: "node_created", actor: "user", data: { id: "abc" } })
 */
export function createEmitter(options: EmitterOptions): Emitter {
  const { kmDir } = options
  const defaultDb = options.db ?? null
  const defaultSkipPersist = options.skipPersist ?? false
  let eventHub: EventHub | null = options.eventHub ?? null
  let fsSync: FsSync | null = options.fsSync ?? null

  const eventsPath = join(kmDir, "events.jsonl")

  function ensureKmDir(): void {
    if (!existsSync(kmDir)) {
      mkdirSync(kmDir, { recursive: true })
    }
  }

  return {
    get kmDir() {
      return kmDir
    },
    get eventsPath() {
      return eventsPath
    },

    emit(partialEvent, emitOptions = {}) {
      const event: Event = {
        id: ulid(),
        ts: Date.now(),
        ...partialEvent,
      }

      // Debug logging removed - db:events logs the apply

      // 1. Apply to database — primary operation, must succeed or throw
      const db = emitOptions.db ?? defaultDb
      if (db) {
        applyEventWithDb(db, event)
      }

      // 2. Persist to events.jsonl (unless skipPersist is set per-call or as default)
      // Isolated: failure here must not prevent broadcast (step 3) or fs sync (step 4)
      const shouldPersist = !(emitOptions.skipPersist ?? defaultSkipPersist)
      if (shouldPersist) {
        try {
          ensureKmDir()
          appendFileSync(eventsPath, JSON.stringify(event) + "\n")
        } catch (err) {
          log.error?.(`events.jsonl append failed for ${event.type}: ${err}`)
        }
      }

      // 3. Broadcast via event hub — isolated so failure doesn't block fs sync
      if (eventHub && !emitOptions.skipBroadcast) {
        try {
          eventHub.broadcast(event)
        } catch (err) {
          log.error?.(`broadcast failed for ${event.type}: ${err}`)
        }
      }

      // 4. Sync to filesystem — isolated from broadcast
      if (fsSync) {
        try {
          fsSync.applyEventToFs(event)
        } catch (err) {
          // Re-throw programming errors; swallow only filesystem I/O errors
          if (err instanceof Error && (err as NodeJS.ErrnoException).code) {
            // Has an errno code (ENOENT, EACCES, etc.) — filesystem error, log and continue
            log.error?.(`fs sync failed for ${event.type}: ${err}`)
          } else {
            throw err
          }
        }
      }

      return event
    },

    setEventHub(hub) {
      eventHub = hub
    },

    setFsSync(sync) {
      fsSync = sync
    },

    getEventHub() {
      return eventHub
    },

    getFsSync() {
      return fsSync
    },

    close() {
      eventHub = null
      fsSync = null
    },
  }
}

// --- Helper Functions ---
// These are convenience wrappers that take an emitter parameter

/** Emit node_created event */
export function emitNodeCreated(
  emitter: Emitter,
  actor: string,
  data: Record<string, unknown>,
  options?: EmitOptions,
): Event {
  return emitter.emit({ type: "node_created", actor, data }, options)
}

/** Emit node_updated event */
export function emitNodeUpdated(
  emitter: Emitter,
  actor: string,
  target: string,
  data: Record<string, unknown>,
  options?: EmitOptions,
): Event {
  return emitter.emit({ type: "node_updated", actor, target, data }, options)
}

/** Emit node_moved event */
export function emitNodeMoved(
  emitter: Emitter,
  actor: string,
  target: string,
  data: { parent_id: string | null; parent_idx?: number },
  options?: EmitOptions,
): Event {
  return emitter.emit({ type: "node_moved", actor, target, data }, options)
}

/** Emit node_deleted event */
export function emitNodeDeleted(
  emitter: Emitter,
  actor: string,
  target: string,
  reason?: string,
  options?: EmitOptions,
): Event {
  return emitter.emit({ type: "node_deleted", actor, target, data: { reason } }, options)
}

/** Emit task_claimed event */
export function emitTaskClaimed(emitter: Emitter, target: string, actor: string, options?: EmitOptions): Event {
  return emitter.emit({ type: "task_claimed", actor, target, data: {} }, options)
}

/** Emit task_released event */
export function emitTaskReleased(
  emitter: Emitter,
  target: string,
  actor: string,
  reason?: string,
  options?: EmitOptions,
): Event {
  return emitter.emit({ type: "task_released", actor, target, data: { reason } }, options)
}

/** Emit task_completed event */
export function emitTaskCompleted(
  emitter: Emitter,
  target: string,
  actor: string,
  summary?: string,
  options?: EmitOptions,
): Event {
  return emitter.emit({ type: "task_completed", actor, target, data: { summary } }, options)
}

/** Emit session_started event */
export function emitSessionStarted(
  emitter: Emitter,
  actor: string,
  sessionId: string,
  model: string,
  target?: string,
  systemPromptHash?: string,
  options?: EmitOptions,
): Event {
  return emitter.emit(
    {
      type: "session_started",
      actor,
      target,
      data: {
        session_id: sessionId,
        model,
        system_prompt_hash: systemPromptHash,
      },
    },
    options,
  )
}

/** Emit session_message event */
export function emitSessionMessage(
  emitter: Emitter,
  actor: string,
  sessionId: string,
  role: "user" | "assistant" | "system",
  content: string,
  tokens?: number,
  options?: EmitOptions,
): Event {
  return emitter.emit(
    {
      type: "session_message",
      actor,
      data: { session_id: sessionId, role, content, tokens },
    },
    options,
  )
}

/** Emit session_tool_call event */
export function emitSessionToolCall(
  emitter: Emitter,
  actor: string,
  sessionId: string,
  tool: string,
  args: Record<string, unknown>,
  result?: unknown,
  tokens?: number,
  options?: EmitOptions,
): Event {
  return emitter.emit(
    {
      type: "session_tool_call",
      actor,
      data: { session_id: sessionId, tool, args, result, tokens },
    },
    options,
  )
}

/** Emit session_ended event */
export function emitSessionEnded(
  emitter: Emitter,
  actor: string,
  sessionId: string,
  status: "success" | "error" | "cancelled",
  sessionOptions?: {
    totalTokens?: number
    costUsd?: number
    filesModified?: string[]
    summary?: string
    error?: string
  },
  emitOpts?: EmitOptions,
): Event {
  return emitter.emit(
    {
      type: "session_ended",
      actor,
      data: {
        session_id: sessionId,
        status,
        total_tokens: sessionOptions?.totalTokens,
        cost_usd: sessionOptions?.costUsd,
        files_modified: sessionOptions?.filesModified,
        summary: sessionOptions?.summary,
        error: sessionOptions?.error,
      },
    },
    emitOpts,
  )
}
