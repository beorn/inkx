/**
 * Emitter Domain Object
 *
 * Owns change emission lifecycle: kmDir, changeHub.
 * Replaces global singletons in emit.ts with explicit ownership.
 *
 * FS projection is handled by subscribers registered via onApply() —
 * the Emitter itself has no knowledge of the filesystem.
 *
 * Usage:
 *   const emitter = createEmitter({ kmDir: "/path/to/.km" })
 *   emitter.onApply((change, options) => { ... })
 *   emitter.apply({ type: "node_created", actor: "user", data: {...} })
 *   emitter.setChangeHub({ broadcast: (c) => socket.send(c) })
 *   emitter.close()
 */

import { createLogger } from "loggily"
import { appendFileSync, existsSync, mkdirSync } from "fs"
import { join } from "path"
import { ulid } from "ulid"
import type { Change } from "@km/core"
import type { Database } from "bun:sqlite"
import type { CommitSource } from "./store/commit-types.ts"
import { applyChangeWithDb } from "./db/changes.ts"

const log = createLogger("km:storage:emitter")

// --- Types ---

/** Change hub for real-time broadcasting (e.g., to TUI or WebSocket clients) */
export interface ChangeHub {
  broadcast(change: Change): void
}

/** Options for apply() calls */
export interface EmitOptions {
  /** Skip writing to changes.jsonl */
  skipPersist?: boolean
  /** Skip broadcasting via changeHub */
  skipBroadcast?: boolean
  /** Provenance of this change — used by onApply subscribers to filter (e.g., skip FS projection for "fs-import" changes) */
  source?: CommitSource
  /** Database to apply change to (if not provided, change is not applied to db) */
  db?: Database
}

/** Options for createEmitter() */
export interface EmitterOptions {
  /** Path to .km directory (required) */
  kmDir: string
  /** Database to apply changes to (optional - changes only written to file if not provided) */
  db?: Database
  /** Optional change hub for real-time broadcasting */
  changeHub?: ChangeHub
  /** Skip persisting changes to filesystem by default (useful for mock fs tests) */
  skipPersist?: boolean
}

/** Emitter domain object - owns change emission lifecycle */
export interface Emitter {
  /** Path to .km directory */
  readonly kmDir: string

  /** Path to changes.jsonl file */
  readonly changesPath: string

  /**
   * Apply a change to the system (DB + journal + broadcast + onApply callbacks).
   *
   * 1. Applies to database (if db provided) — primary operation, DB consistency is non-negotiable
   * 2. Appends to changes.jsonl (unless skipPersist) — if crash between 1 and 2, change is lost from journal but DB is correct
   * 3. Broadcasts via changeHub (unless skipBroadcast)
   * 4. Notifies onApply subscribers (FS projection, etc.)
   */
  apply(change: Omit<Change, "id" | "ts">, options?: EmitOptions): Change

  /**
   * Commit a change to the database and journal (no filesystem projection).
   * Unlike apply(), does NOT fire onApply callbacks — structurally prevents
   * echo loops for FS-origin changes.
   */
  commit(change: Omit<Change, "id" | "ts">, options?: EmitOptions): Change

  /**
   * Subscribe to successful apply() calls.
   * Called after DB + persist + broadcast for every apply().
   * Returns an unsubscribe function.
   */
  onApply(cb: (change: Change, options: EmitOptions) => void): () => void

  /** Set change hub for real-time broadcasting */
  setChangeHub(hub: ChangeHub | null): void

  /** Get current change hub (for testing/inspection) */
  getChangeHub(): ChangeHub | null

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
  let changeHub: ChangeHub | null = options.changeHub ?? null
  const applyCallbacks = new Set<(change: Change, options: EmitOptions) => void>()

  const changesPath = join(kmDir, "changes.jsonl")

  function ensureKmDir(): void {
    if (!existsSync(kmDir)) {
      mkdirSync(kmDir, { recursive: true })
    }
  }

  /**
   * Internal: apply to DB + persist + broadcast.
   * Both apply() and commit() delegate here.
   */
  function commitInternal(partialChange: Omit<Change, "id" | "ts">, commitOptions: EmitOptions = {}): Change {
    const change: Change = {
      id: ulid(),
      ts: Date.now(),
      ...partialChange,
    }

    // 1. Apply to database — primary operation, must succeed or throw.
    //    Also persist to the events table inside the same transaction so
    //    nodes-row + events-row commit atomically. This is the SCHEMA_VERSION
    //    12 model: the events table replaces changes.jsonl as the canonical
    //    journal. The jsonl write below stays during migration so the legacy
    //    read path keeps working — drop after `km doctor migrate-journal`
    //    verifies parity. See @km/storage/events-table-replaces-jsonl.
    //
    //    Atomicity: SAVEPOINT works whether the caller is already in a
    //    transaction (bulk-sync's BEGIN IMMEDIATE) or not (single-event
    //    interactive emit). On error, ROLLBACK TO discards both writes.
    const db = commitOptions.db ?? defaultDb
    const shouldPersist = !(commitOptions.skipPersist ?? defaultSkipPersist)
    if (db) {
      db.run("SAVEPOINT __emit_change__")
      try {
        applyChangeWithDb(db, change)
        if (shouldPersist) {
          insertEventRow(db, change, commitOptions.source)
        }
        db.run("RELEASE __emit_change__")
      } catch (err) {
        try {
          db.run("ROLLBACK TO __emit_change__")
          db.run("RELEASE __emit_change__")
        } catch {
          // RELEASE failure is fine — outer txn handles it.
        }
        // UNIQUE(id) collisions during replay are benign — INSERT OR IGNORE
        // handles them inside insertEventRow, so we should not see one here.
        // Anything reaching this catch is a real failure.
        throw err
      }
    }

    // 2. Persist to changes.jsonl (unless skipPersist is set per-call or as default)
    // Isolated: failure here must not prevent broadcast (step 3)
    if (shouldPersist) {
      try {
        ensureKmDir()
        appendFileSync(changesPath, JSON.stringify(change) + "\n")
      } catch (err) {
        log.error?.(`changes.jsonl append failed for ${change.type}: ${String(err)}`)
      }
    }

    // 3. Broadcast via change hub — isolated
    if (changeHub && !commitOptions.skipBroadcast) {
      try {
        changeHub.broadcast(change)
      } catch (err) {
        log.error?.(`broadcast failed for ${change.type}: ${String(err)}`)
      }
    }

    return change
  }

  return {
    get kmDir() {
      return kmDir
    },
    get changesPath() {
      return changesPath
    },

    apply(partialChange, emitOptions = {}) {
      const change = commitInternal(partialChange, emitOptions)
      // Notify subscribers (FS projection, etc.)
      for (const cb of applyCallbacks) {
        try {
          cb(change, emitOptions)
        } catch (err) {
          log.error?.(`onApply callback failed for ${change.type}: ${String(err)}`)
        }
      }
      return change
    },

    commit(partialChange, commitOptions = {}) {
      // Identical to apply() at the Emitter level but does NOT fire onApply callbacks.
      // Used for FS-origin changes where projecting back to FS would cause echo loops.
      return commitInternal(partialChange, commitOptions)
    },

    onApply(cb) {
      applyCallbacks.add(cb)
      return () => {
        applyCallbacks.delete(cb)
      }
    },

    setChangeHub(hub) {
      changeHub = hub
    },

    getChangeHub() {
      return changeHub
    },

    close() {
      changeHub = null
      applyCallbacks.clear()
    },
  }
}

/**
 * Insert one row into the `events` table. The events table is the
 * SCHEMA_VERSION 12 replacement for changes.jsonl — see
 * @km/storage/events-table-replaces-jsonl. We split actor/source/target out
 * of the Change shape so the SQL columns can be indexed directly.
 *
 * `data` is the FULL Change object serialized as JSON, so a replay step can
 * round-trip through `applyChangeWithDb` without information loss. The
 * top-level columns (type, actor, ...) are denormalized projections that
 * live in their own indexed columns for query speed.
 *
 * Failure is non-fatal for the caller — the legacy changes.jsonl write path
 * still runs alongside (until migration verifies parity). UNIQUE(id)
 * conflicts are expected during replay (same event id arrives twice) and
 * are surfaced via SQLite's constraint-violation error; callers may
 * choose to treat them as benign.
 */
function insertEventRow(db: import("bun:sqlite").Database, change: Change, source: string | undefined): void {
  const target = (change as { target?: string | null }).target ?? null
  const peerId = null // future: populated when events arrive via CRDT sync
  const hlc = null // future: populated when CRDT adopted
  db.run(
    `INSERT OR IGNORE INTO events (id, hlc, ts, v, type, actor, peer_id, source, target, data)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
    [change.id, hlc, change.ts, change.type, change.actor, peerId, source ?? null, target, JSON.stringify(change)],
  )
}

// --- Helper Functions ---
// These are convenience wrappers that take an emitter parameter

/** Emit node_created change */
export function emitNodeCreated(
  emitter: Emitter,
  actor: string,
  data: Record<string, unknown>,
  options?: EmitOptions,
): Change {
  return emitter.apply({ type: "node_created", actor, data }, options)
}

/** Emit node_updated change */
export function emitNodeUpdated(
  emitter: Emitter,
  actor: string,
  target: string,
  data: Record<string, unknown>,
  options?: EmitOptions,
): Change {
  return emitter.apply({ type: "node_updated", actor, target, data }, options)
}

/** Emit node_deleted change */
export function emitNodeDeleted(
  emitter: Emitter,
  actor: string,
  target: string,
  reason?: string,
  options?: EmitOptions,
): Change {
  return emitter.apply({ type: "node_deleted", actor, target, data: { reason } }, options)
}
