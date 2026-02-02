/**
 * State Rebuild
 *
 * @deprecated Legacy API for state rebuilding. Use createRepo() instead.
 * These functions are kept for backwards compatibility but all use loadRepo() internally.
 *
 * For the generator helpers (runGenerator, runWithProgress), import from @km/core instead.
 */

/* eslint-disable @typescript-eslint/no-deprecated -- This file contains deprecated rebuild implementation */

import { createConditionalLogger } from "@beorn/logger"
import { existsSync, readFileSync, unlinkSync, readdirSync, rmSync } from "fs"
import type { Database } from "bun:sqlite"

const log = createConditionalLogger("km:storage:rebuild")
import { join, dirname } from "path"
import type { Event } from "@km/core"
import { loadRepo, type StepYield } from "./repo-loader.ts"

/** Result from rebuildState */
export interface RebuildResult {
  eventCount: number
  nodeCount: number
  duration: number
}

/**
 * Read all events from events.jsonl
 * Handles deduplication and sorting by ULID
 *
 * @param kmDir - Path to .km directory
 */
export function readEvents(kmDir: string): Event[] {
  const eventsPath = join(kmDir, "events.jsonl")

  if (!existsSync(eventsPath)) {
    log.debug?.(`no events file at ${eventsPath}`)
    return []
  }

  const content = readFileSync(eventsPath, "utf-8")
  const lines = content.split("\n").filter((line) => line.trim())

  log.debug?.(`reading ${lines.length} lines from events.jsonl`)

  const events: Event[] = []
  const seen = new Set<string>()
  let dupes = 0
  let malformed = 0

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Event

      // Dedupe by ID
      if (seen.has(event.id)) {
        dupes++
        continue
      }
      seen.add(event.id)

      events.push(event)
    } catch {
      // Skip malformed lines
      malformed++
      log.warn?.("Skipping malformed event line", { preview: line.slice(0, 50) })
    }
  }

  // Sort by ULID (lexicographic = chronological)
  events.sort((a, b) => a.id.localeCompare(b.id))

  log.debug?.(
    `read ${events.length} events (${dupes} dupes, ${malformed} malformed)`,
  )
  return events
}

/**
 * Rebuild state.db from events.jsonl
 * This is the primary recovery mechanism.
 * Yields progress info for each step.
 *
 * Now delegates to loadRepo() with force: true.
 *
 * @param kmDir - Path to .km directory
 * @param db - Database instance to use
 */
export function* rebuildState(
  kmDir: string,
  db: Database,
): Generator<StepYield, RebuildResult, unknown> {
  log.debug?.("rebuildState: delegating to loadRepo with force=true")

  // Count events for the return value (loadRepo doesn't track this)
  const events = readEvents(kmDir)
  const eventCount = events.length

  const repoRoot = dirname(kmDir)

  // Delegate to loadRepo with force flag
  const result = yield* loadRepo(repoRoot, {
    searchAncestors: false,
    force: true,
    db,
  })

  return {
    eventCount,
    nodeCount: result.nodeCount,
    duration: result.duration,
  }
}

/** Result from syncState */
export interface SyncResult {
  applied: number
  duration: number
}

/** Options for syncState */
export interface SyncStateOptions {
  /** Path to .km directory (required) */
  kmDir: string
  /** Database to use (required) */
  db: Database
}

/**
 * Incremental sync - apply only new events
 * Yields progress info for each step.
 *
 * Now delegates to loadRepo() (which handles incremental sync internally).
 *
 * @param options.kmDir - Path to .km directory
 * @param options.db - Database to use
 */
export function* syncState(
  options: SyncStateOptions,
): Generator<StepYield, SyncResult, unknown> {
  log.debug?.("syncState: delegating to loadRepo")

  const { kmDir, db } = options

  // Get current state to calculate how many events were applied
  const lastApplied = db
    .prepare("SELECT value FROM meta WHERE key = ?")
    .get("last_event") as { value: string } | undefined
  const events = readEvents(kmDir)
  const newEvents = events.filter(
    (e) => !lastApplied?.value || e.id > lastApplied.value,
  )

  const repoRoot = dirname(kmDir)

  // Delegate to loadRepo (incremental mode)
  const result = yield* loadRepo(repoRoot, { searchAncestors: false, db })

  return {
    applied: newEvents.length,
    duration: result.duration,
  }
}

/**
 * Full reset - delete state.db and rebuild
 * Yields progress info for each step.
 *
 * @param kmDir - Path to .km directory
 * @param db - Database instance (will be reset)
 */
export function* fullReset(
  kmDir: string,
  db: Database,
): Generator<StepYield, RebuildResult, unknown> {
  // Delete db files if they exist (for disk mode)
  const dbPath = join(kmDir, "state.db")
  const walPath = dbPath + "-wal"
  const shmPath = dbPath + "-shm"

  if (existsSync(dbPath)) {
    unlinkSync(dbPath)
  }
  if (existsSync(walPath)) {
    unlinkSync(walPath)
  }
  if (existsSync(shmPath)) {
    unlinkSync(shmPath)
  }

  // Delegate to rebuildState
  return yield* rebuildState(kmDir, db)
}

/**
 * Fresh start - delete entire .km directory contents
 * This removes all events, state, and blobs
 *
 * @param kmDir - Path to .km directory
 */
export function freshStart(kmDir: string): void {
  if (!existsSync(kmDir)) {
    return
  }

  // Delete all contents of .km directory
  const entries = readdirSync(kmDir)
  for (const entry of entries) {
    const fullPath = join(kmDir, entry)
    rmSync(fullPath, { recursive: true, force: true })
  }
}

/**
 * Run a progress generator with a callback.
 * Bridges generator-based APIs to callback-based progress reporting.
 */
export function runWithProgress<T>(
  generator: Generator<StepYield, T, unknown>,
  onProgress?: (info: StepYield) => void,
): T {
  let result = generator.next()
  while (!result.done) {
    onProgress?.(result.value)
    result = generator.next()
  }
  return result.value
}

/**
 * Consume a generator without progress reporting.
 * Use this when you need to run loadRepo() but don't need progress updates.
 */
export function runGenerator<T>(generator: Generator<unknown, T, unknown>): T {
  let result = generator.next()
  while (!result.done) {
    result = generator.next()
  }
  return result.value
}
