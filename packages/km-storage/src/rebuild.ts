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
import { getEventsPath, getKmDir, setDatabase } from "./emit.ts";
import { dbApplyEvent } from "./db.ts";
import { applyEvent, getDb, getDbPath, resetDb, closeDb, setDb } from "./db.ts";
import { initStore } from "./store.ts";

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

  debug("read %d events (%d dupes, %d malformed)", events.length, dupes, malformed);
  return events;
}

/**
 * Rebuild state.db from events.jsonl
 * This is the primary recovery mechanism
 */
export function rebuildState(): { eventCount: number; nodeCount: number } {
  debug("rebuilding state.db");
  const start = Date.now();

  // Reset the database
  resetDb();

  // Read and apply all events
  const events = readEvents();

  for (const event of events) {
    applyEvent(event);
  }

  // Get final stats
  const db = getDb();
  const nodeCount = (
    db.prepare("SELECT COUNT(*) as count FROM nodes").get() as { count: number }
  ).count;

  debug("rebuilt state.db: %d events → %d nodes in %dms", events.length, nodeCount, Date.now() - start);

  return {
    eventCount: events.length,
    nodeCount,
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
    debug("needsRebuild: %s (no last_event, %d events)", needs ? "yes" : "no", events.length);
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
  debug("needsRebuild: %s (last=%s, applied=%s)", needs ? "yes" : "no", lastEvent.id.slice(-8), lastApplied.value.slice(-8));
  return needs;
}

/**
 * Incremental sync - apply only new events
 */
export function syncState(): { applied: number } {
  debug("syncState: checking for new events");
  const db = getDb();
  const lastApplied = db
    .prepare("SELECT value FROM meta WHERE key = ?")
    .get("last_event") as { value: string } | undefined;

  const events = readEvents();
  let applied = 0;

  for (const event of events) {
    // Skip already applied events
    if (lastApplied?.value && event.id <= lastApplied.value) {
      continue;
    }

    applyEvent(event);
    applied++;
  }

  debug("syncState: applied %d new events", applied);
  return { applied };
}

/**
 * Full reset - delete state.db and rebuild
 */
export function fullReset(): { eventCount: number; nodeCount: number } {
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

  return rebuildState();
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
 */
export function ensureState(rootPath?: string, searchAncestors = true): void {
  debug("ensureState: rootPath=%s, searchAncestors=%s", rootPath ?? "cwd", searchAncestors);
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
      rebuildState();
    } else {
      syncState();
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
