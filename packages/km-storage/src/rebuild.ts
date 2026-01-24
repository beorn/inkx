/**
 * State Rebuild
 *
 * @deprecated Legacy API for state rebuilding. Use createVault() instead.
 * These functions are kept for backwards compatibility but all use loadVault() internally.
 *
 * For the generator helpers (runGenerator, runWithProgress), import from @km/core instead.
 */

import createDebug from "debug";
import { existsSync, readFileSync, unlinkSync, readdirSync, rmSync } from "fs";

const debug = createDebug("km:storage:rebuild");
import { join, dirname } from "path";
import type { Event } from "@km/core";
import type { ProgressInfo } from "@beorn/inkx-ui";
import { getEventsPath, getKmDir } from "./emit.ts";
import { getDb, getDbPath, closeDb } from "./db.ts";
import { loadVault } from "./vault-loader.ts";

/** Result from rebuildState */
export interface RebuildResult {
  eventCount: number;
  nodeCount: number;
  duration: number;
}

/**
 * Read all events from events.jsonl
 * Handles deduplication and sorting by ULID
 */
export function readEvents(): Event[] {
  const eventsPath = getEventsPath();

  if (!existsSync(eventsPath)) {
    debug("no events file at %s", eventsPath);
    return [];
  }

  const content = readFileSync(eventsPath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim());

  debug("reading %d lines from events.jsonl", lines.length);

  const events: Event[] = [];
  const seen = new Set<string>();
  let dupes = 0;
  let malformed = 0;

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Event;

      // Dedupe by ID
      if (seen.has(event.id)) {
        dupes++;
        continue;
      }
      seen.add(event.id);

      events.push(event);
    } catch {
      // Skip malformed lines
      malformed++;
      console.warn("Skipping malformed event line:", line.slice(0, 50));
    }
  }

  // Sort by ULID (lexicographic = chronological)
  events.sort((a, b) => a.id.localeCompare(b.id));

  debug(
    "read %d events (%d dupes, %d malformed)",
    events.length,
    dupes,
    malformed,
  );
  return events;
}

/**
 * Rebuild state.db from events.jsonl
 * This is the primary recovery mechanism.
 * Yields progress info for each step.
 *
 * Now delegates to loadVault() with force: true.
 */
export function* rebuildState(): Generator<
  ProgressInfo,
  RebuildResult,
  unknown
> {
  debug("rebuildState: delegating to loadVault with force=true");

  // Count events for the return value (loadVault doesn't track this)
  const events = readEvents();
  const eventCount = events.length;

  // Get vault root from already-configured kmDir (set by setKmDir())
  const kmDir = getKmDir();
  const vaultRoot = dirname(kmDir);

  // Delegate to loadVault with force flag
  const result = yield* loadVault(vaultRoot, {
    searchAncestors: false,
    force: true,
  });

  return {
    eventCount,
    nodeCount: result.nodeCount,
    duration: result.duration,
  };
}

/** Result from syncState */
export interface SyncResult {
  applied: number;
  duration: number;
}

/**
 * Incremental sync - apply only new events
 * Yields progress info for each step.
 *
 * Now delegates to loadVault() (which handles incremental sync internally).
 */
export function* syncState(): Generator<ProgressInfo, SyncResult, unknown> {
  debug("syncState: delegating to loadVault");

  // Get current state to calculate how many events were applied
  const db = getDb();
  const lastApplied = db
    .prepare("SELECT value FROM meta WHERE key = ?")
    .get("last_event") as { value: string } | undefined;
  const events = readEvents();
  const newEvents = events.filter(
    (e) => !lastApplied?.value || e.id > lastApplied.value,
  );

  // Get vault root from already-configured kmDir (set by setKmDir())
  const kmDir = getKmDir();
  const vaultRoot = dirname(kmDir);

  // Delegate to loadVault (incremental mode)
  const result = yield* loadVault(vaultRoot, { searchAncestors: false });

  return {
    applied: newEvents.length,
    duration: result.duration,
  };
}

/**
 * Full reset - delete state.db and rebuild
 * Yields progress info for each step.
 */
export function* fullReset(): Generator<ProgressInfo, RebuildResult, unknown> {
  closeDb();

  const dbPath = getDbPath();
  const walPath = dbPath + "-wal";
  const shmPath = dbPath + "-shm";

  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
  }
  if (existsSync(walPath)) {
    unlinkSync(walPath);
  }
  if (existsSync(shmPath)) {
    unlinkSync(shmPath);
  }

  // Delegate to rebuildState (which now uses loadVault)
  return yield* rebuildState();
}

/**
 * Ensure state is up to date
 * Called at startup
 *
 * Supports two modes:
 * - Disk mode (.km/ exists): rebuild from events.jsonl
 * - Memory mode (no .km/): scan filesystem into :memory: SQLite
 *
 * Now delegates entirely to loadVault().
 *
 * @param rootPath - Directory to use as root
 * @param searchAncestors - If true, search for .km/ in ancestors (default: true)
 */
export function* ensureState(
  rootPath?: string,
  searchAncestors = true,
): Generator<ProgressInfo, void, unknown> {
  debug("ensureState: delegating to loadVault", {
    rootPath: rootPath ?? "cwd",
    searchAncestors,
  });

  // Delegate entirely to loadVault - it handles both modes
  yield* loadVault(rootPath, { searchAncestors });
}

/**
 * Fresh start - delete entire .km directory contents
 * This removes all events, state, and blobs
 */
export function freshStart(): void {
  closeDb();

  const kmPath = getKmDir();
  if (!existsSync(kmPath)) {
    return;
  }

  // Delete all contents of .km directory
  const entries = readdirSync(kmPath);
  for (const entry of entries) {
    const fullPath = join(kmPath, entry);
    rmSync(fullPath, { recursive: true, force: true });
  }
}

/**
 * Run a progress generator with a callback.
 * Bridges generator-based APIs to callback-based progress reporting.
 */
export function runWithProgress<T>(
  generator: Generator<ProgressInfo, T, unknown>,
  onProgress?: (info: ProgressInfo) => void,
): T {
  let result = generator.next();
  while (!result.done) {
    onProgress?.(result.value);
    result = generator.next();
  }
  return result.value;
}

/**
 * Consume a generator without progress reporting.
 * Use this when you need to run ensureState() but don't need progress updates.
 */
export function runGenerator<T>(generator: Generator<unknown, T, unknown>): T {
  let result = generator.next();
  while (!result.done) {
    result = generator.next();
  }
  return result.value;
}
