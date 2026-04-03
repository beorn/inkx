/**
 * Emitter Domain Object
 *
 * Owns event emission lifecycle: kmDir, eventHub.
 * Replaces global singletons in emit.ts with explicit ownership.
 *
 * FS projection is handled by subscribers registered via onApply() —
 * the Emitter itself has no knowledge of the filesystem.
 *
 * Usage:
 *   const emitter = createEmitter({ kmDir: "/path/to/.km" })
 *   emitter.onApply((event, options) => { ... })
 *   emitter.apply({ type: "node_created", actor: "user", data: {...} })
 *   emitter.setEventHub({ broadcast: (e) => socket.send(e) })
 *   emitter.close()
 */

import { createLogger } from "loggily"
import { appendFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import type { Event } from "@km/core"
import type { Database } from "bun:sqlite"
import type { CommitSource } from "./store/commit-types.ts"
import { applyEventWithDb } from "./db/events.ts"

const log = createLogger("km:storage:emitter")

// --- Types ---

/** Event hub for real-time broadcasting (e.g., to TUI or WebSocket clients) */
export interface EventHub {
  broadcast(event: Event): void
}

/** Options for apply() calls */
export interface EmitOptions {
  /** Skip writing to events.jsonl */
  skipPersist?: boolean
  /** Skip broadcasting via eventHub */
  skipBroadcast?: boolean
  /** Provenance of this event — used by onApply subscribers to filter (e.g., skip FS projection for "fs-import" events) */
  source?: CommitSource
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
   * Apply an event to the system (DB + journal + broadcast + onApply callbacks).
   *
   * 1. Applies to database (if db provided) — primary operation, DB consistency is non-negotiable
   * 2. Appends to events.jsonl (unless skipPersist) — if crash between 1 and 2, event is lost from journal but DB is correct
   * 3. Broadcasts via eventHub (unless skipBroadcast)
   * 4. Notifies onApply subscribers (FS projection, etc.)
   */
  apply(event: Omit<Event, "id" | "ts">, options?: EmitOptions): Event

  /**
   * Commit an event to the database and journal (no filesystem projection).
   * Unlike apply(), does NOT fire onApply callbacks — structurally prevents
   * echo loops for FS-origin events.
   */
  commit(event: Omit<Event, "id" | "ts">, options?: EmitOptions): Event

  /**
   * Subscribe to successful apply() calls.
   * Called after DB + persist + broadcast for every apply().
   * Returns an unsubscribe function.
   */
  onApply(cb: (event: Event, options: EmitOptions) => void): () => void

  /** Set event hub for real-time broadcasting */
  setEventHub(hub: EventHub | null): void

  /** Get current event hub (for testing/inspection) */
  getEventHub(): EventHub | null

  /** Close emitter (clears callbacks) */
  close(): void
}

// --- Factory ---

/**
 * Create an Emitter domain object.
 *
 * @example
 * const emitter = createEmitter({ kmDir: "/path/to/.km" })
 * emitter.apply({ type: "node_created", actor: "user", data: { id: "abc" } })
 */
export function createEmitter(options: EmitterOptions): Emitter {
  const { kmDir } = options
  const defaultDb = options.db ?? null
  const defaultSkipPersist = options.skipPersist ?? false
  let eventHub: EventHub | null = options.eventHub ?? null
  const applyCallbacks = new Set<(event: Event, options: EmitOptions) => void>()

  const eventsPath = join(kmDir, "events.jsonl")

  function ensureKmDir(): void {
    if (!existsSync(kmDir)) {
      mkdirSync(kmDir, { recursive: true })
    }
  }

  /**
   * Internal: apply to DB + persist + broadcast.
   * Both apply() and commit() delegate here.
   */
  function commitInternal(partialEvent: Omit<Event, "id" | "ts">, commitOptions: EmitOptions = {}): Event {
    const event: Event = {
      id: ulid(),
      ts: Date.now(),
      ...partialEvent,
    }

    // 1. Apply to database — primary operation, must succeed or throw
    const db = commitOptions.db ?? defaultDb
    if (db) {
      applyEventWithDb(db, event)
    }

    // 2. Persist to events.jsonl (unless skipPersist is set per-call or as default)
    // Isolated: failure here must not prevent broadcast (step 3)
    const shouldPersist = !(commitOptions.skipPersist ?? defaultSkipPersist)
    if (shouldPersist) {
      try {
        ensureKmDir()
        appendFileSync(eventsPath, JSON.stringify(event) + "\n")
      } catch (err) {
        log.error?.(`events.jsonl append failed for ${event.type}: ${err}`)
      }
    }

    // 3. Broadcast via event hub — isolated
    if (eventHub && !commitOptions.skipBroadcast) {
      try {
        eventHub.broadcast(event)
      } catch (err) {
        log.error?.(`broadcast failed for ${event.type}: ${err}`)
      }
    }

    return event
  }

  return {
    get kmDir() {
      return kmDir
    },
    get eventsPath() {
      return eventsPath
    },

    apply(partialEvent, emitOptions = {}) {
      const event = commitInternal(partialEvent, emitOptions)
      // Notify subscribers (FS projection, etc.)
      for (const cb of applyCallbacks) {
        try {
          cb(event, emitOptions)
        } catch (err) {
          log.error?.(`onApply callback failed for ${event.type}: ${err}`)
        }
      }
      return event
    },

    commit(partialEvent, commitOptions = {}) {
      // Identical to apply() at the Emitter level but does NOT fire onApply callbacks.
      // Used for FS-origin events where projecting back to FS would cause echo loops.
      return commitInternal(partialEvent, commitOptions)
    },

    onApply(cb) {
      applyCallbacks.add(cb)
      return () => {
        applyCallbacks.delete(cb)
      }
    },

    setEventHub(hub) {
      eventHub = hub
    },

    getEventHub() {
      return eventHub
    },

    close() {
      eventHub = null
      applyCallbacks.clear()
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
  return emitter.apply({ type: "node_created", actor, data }, options)
}

/** Emit node_updated event */
export function emitNodeUpdated(
  emitter: Emitter,
  actor: string,
  target: string,
  data: Record<string, unknown>,
  options?: EmitOptions,
): Event {
  return emitter.apply({ type: "node_updated", actor, target, data }, options)
}

/** Emit node_deleted event */
export function emitNodeDeleted(
  emitter: Emitter,
  actor: string,
  target: string,
  reason?: string,
  options?: EmitOptions,
): Event {
  return emitter.apply({ type: "node_deleted", actor, target, data: { reason } }, options)
}
