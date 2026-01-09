/**
 * State Rebuild
 *
 * Rebuilds state.db from events.jsonl
 */

import { existsSync, readFileSync, unlinkSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { getEventsPath, getKmPath } from "./emit.ts";
import { applyEvent, getDb, getDbPath, resetDb, closeDb } from "./db.ts";
import type { Event } from "./types.ts";

/**
 * Read all events from events.jsonl
 * Handles deduplication and sorting by ULID
 */
export function readEvents(): Event[] {
  const eventsPath = getEventsPath();

  if (!existsSync(eventsPath)) {
    return [];
  }

  const content = readFileSync(eventsPath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim());

  const events: Event[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Event;

      // Dedupe by ID
      if (seen.has(event.id)) {
        continue;
      }
      seen.add(event.id);

      events.push(event);
    } catch {
      // Skip malformed lines
      console.warn("Skipping malformed event line:", line.slice(0, 50));
    }
  }

  // Sort by ULID (lexicographic = chronological)
  events.sort((a, b) => a.id.localeCompare(b.id));

  return events;
}

/**
 * Rebuild state.db from events.jsonl
 * This is the primary recovery mechanism
 */
export function rebuildState(): { eventCount: number; nodeCount: number } {
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
    return true;
  }

  const eventsPath = getEventsPath();
  if (!existsSync(eventsPath)) {
    // No events, no rebuild needed
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
    return events.length > 0;
  }

  // Check if events file has newer events
  const events = readEvents();
  const lastEvent = events.at(-1);

  if (!lastEvent) {
    return false;
  }

  // ULID comparison - if last event ID > last applied, need to catch up
  return lastEvent.id > lastApplied.value;
}

/**
 * Incremental sync - apply only new events
 */
export function syncState(): { applied: number } {
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
 */
export function ensureState(): void {
  if (needsRebuild()) {
    rebuildState();
  } else {
    syncState();
  }
}

/**
 * Fresh start - delete entire .km directory contents
 * This removes all events, state, and blobs
 */
export function freshStart(): void {
  closeDb();

  const kmPath = getKmPath();
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
