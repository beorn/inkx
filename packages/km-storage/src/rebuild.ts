/**
 * State Rebuild
 *
 * Rebuilds state.db from events.jsonl
 */

import createDebug from "debug";
import { existsSync, readFileSync, unlinkSync, readdirSync, rmSync } from "fs";

const debug = createDebug("km:storage:rebuild");
import { join } from "path";
import type { Event } from "@km/core";
import type { ProgressInfo } from "@beorn/inkx-ui";
import { getEventsPath, getKmDir, setDatabase } from "./emit.ts";
import { dbApplyEvent } from "./db.ts";
import { applyEvent, getDb, getDbPath, resetDb, closeDb, setDb } from "./db.ts";
import { initStore } from "./store.ts";
import { evaluateAllRules, setBulkMode } from "./db-rules.ts";

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
 */
export function* rebuildState(): Generator<
  ProgressInfo,
  RebuildResult,
  unknown
> {
  debug("rebuilding state.db");
  const start = Date.now();

  // Reset the database
  resetDb();

  // Read events (phase 1)
  yield { phase: "reading", current: 0, total: 1 };
  const events = readEvents();
  yield { phase: "reading", current: 1, total: 1 };

  // Apply all events in a single transaction for performance
  // Without this, each applyEvent triggers an fsync to disk
  const db = getDb();
  const total = events.length;

  // Enable bulk mode to suppress incremental rule evaluation during rebuild
  setBulkMode(true);

  db.run("BEGIN IMMEDIATE");
  try {
    for (const [i, event] of events.entries()) {
      applyEvent(event);

      // Yield progress every 100 events to avoid overhead
      if (i % 100 === 0 || i === total - 1) {
        yield { phase: "applying", current: i + 1, total };
      }
    }
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    setBulkMode(false);
    throw error;
  }

  // Disable bulk mode and evaluate all rules
  setBulkMode(false);

  // Evaluate all add= rules to materialize results (phase 3)
  for (const progress of evaluateAllRules()) {
    yield { phase: "rules", current: progress.current, total: progress.total };
  }

  // Get final stats
  const nodeCount = (
    db.prepare("SELECT COUNT(*) as count FROM nodes").get() as { count: number }
  ).count;

  const duration = Date.now() - start;
  debug(
    "rebuilt state.db: %d events → %d nodes in %dms",
    events.length,
    nodeCount,
    duration,
  );

  return {
    eventCount: events.length,
    nodeCount,
    duration,
  };
}

/**
 * Check if state.db needs rebuild
 * Returns true if:
 * - state.db doesn't exist
 * - events.jsonl has events newer than last applied
 */
export function needsRebuild(): boolean {
  const dbPath = getDbPath();

  if (!existsSync(dbPath)) {
    debug("needsRebuild: yes (no state.db)");
    return true;
  }

  const eventsPath = getEventsPath();
  if (!existsSync(eventsPath)) {
    // No events, no rebuild needed
    debug("needsRebuild: no (no events.jsonl)");
    return false;
  }

  // Check if there are unapplied events
  const db = getDb();
  const lastApplied = db
    .prepare("SELECT value FROM meta WHERE key = ?")
    .get("last_event") as { value: string } | undefined;

  if (!lastApplied?.value) {
    // DB exists but hasn't applied any events
    const events = readEvents();
    const needs = events.length > 0;
    debug("needsRebuild", {
      result: needs ? "yes" : "no",
      reason: "no last_event",
      eventCount: events.length,
    });
    return needs;
  }

  // Check if events file has newer events
  const events = readEvents();
  const lastEvent = events.at(-1);

  if (!lastEvent) {
    debug("needsRebuild: no (no events)");
    return false;
  }

  // ULID comparison - if last event ID > last applied, need to catch up
  const needs = lastEvent.id > lastApplied.value;
  debug("needsRebuild", {
    result: needs ? "yes" : "no",
    last: lastEvent.id.slice(-8),
    applied: lastApplied.value.slice(-8),
  });
  return needs;
}

/** Result from syncState */
export interface SyncResult {
  applied: number;
  duration: number;
}

/**
 * Incremental sync - apply only new events
 * Yields progress info for each step.
 */
export function* syncState(): Generator<ProgressInfo, SyncResult, unknown> {
  debug("syncState: checking for new events");
  const start = Date.now();
  const db = getDb();
  const lastApplied = db
    .prepare("SELECT value FROM meta WHERE key = ?")
    .get("last_event") as { value: string } | undefined;

  yield { phase: "reading", current: 0, total: 1 };
  const events = readEvents();
  yield { phase: "reading", current: 1, total: 1 };

  // Filter to only new events
  const newEvents = events.filter(
    (e) => !lastApplied?.value || e.id > lastApplied.value,
  );
  const total = newEvents.length;

  if (total === 0) {
    debug("syncState: no new events");
    return { applied: 0, duration: Date.now() - start };
  }

  // Enable bulk mode to suppress incremental rule evaluation
  setBulkMode(true);

  // Apply in transaction for performance
  db.run("BEGIN IMMEDIATE");
  try {
    for (const [i, event] of newEvents.entries()) {
      applyEvent(event);

      if (i % 100 === 0 || i === total - 1) {
        yield { phase: "applying", current: i + 1, total };
      }
    }
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    setBulkMode(false);
    throw error;
  }

  // Disable bulk mode and evaluate all rules
  setBulkMode(false);

  // Evaluate all add= rules to materialize results
  for (const progress of evaluateAllRules()) {
    yield { phase: "rules", current: progress.current, total: progress.total };
  }

  const duration = Date.now() - start;
  debug("syncState: applied %d new events in %dms", total, duration);
  return { applied: total, duration };
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

  // Delegate to rebuildState and return its result
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
 * @param rootPath - Directory to use as root
 * @param searchAncestors - If true, search for .km/ in ancestors (default: true)
 * @param onProgress - Optional callback for progress reporting
 */
export function* ensureState(
  rootPath?: string,
  searchAncestors = true,
): Generator<ProgressInfo, void, unknown> {
  debug("ensureState", { rootPath: rootPath ?? "cwd", searchAncestors });
  const store = initStore(rootPath, searchAncestors);

  if (store.mode === "memory") {
    debug("ensureState: memory mode");
    // Memory mode: store already scanned filesystem
    // Inject its database into db.ts for backwards compatibility
    setDb(store.getDatabase());
  } else {
    debug("ensureState: disk mode");
    // Disk mode: use existing event-sourced approach
    if (needsRebuild()) {
      yield* rebuildState();
    } else {
      yield* syncState();
    }
    // Enable immediate event application so emit() updates state.db in real-time
    setDatabase(dbApplyEvent);
  }
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
