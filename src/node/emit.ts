/**
 * Event emission - append events to events.jsonl
 */

import { appendFileSync, existsSync, mkdirSync } from "fs";
import { ulid } from "ulid";
import { dirname, join } from "path";
import type { Event, EventType } from "./types.ts";

// Event hub for real-time broadcasting (set by km-code)
let eventHub: { broadcast: (event: Event) => void } | null = null;

// Database for immediate projection (set when db is loaded)
let db: { applyEvent: (event: Event) => void } | null = null;

// Path to kimmi directory
let kimmiPath = ".kimmi";

/**
 * Set the kimmi directory path
 */
export function setKimmiPath(path: string): void {
  kimmiPath = path;
}

/**
 * Get the current kimmi path
 */
export function getKimmiPath(): string {
  return kimmiPath;
}

/**
 * Set the event hub for real-time broadcasting
 */
export function setEventHub(hub: { broadcast: (event: Event) => void }): void {
  eventHub = hub;
}

/**
 * Set the database for immediate projection
 */
export function setDatabase(database: {
  applyEvent: (event: Event) => void;
}): void {
  db = database;
}

/**
 * Ensure the kimmi directory exists
 */
function ensureKimmiDir(): void {
  if (!existsSync(kimmiPath)) {
    mkdirSync(kimmiPath, { recursive: true });
  }
}

/**
 * Get the events file path
 */
export function getEventsPath(): string {
  return join(kimmiPath, "events.jsonl");
}

/**
 * Emit an event - append to events.jsonl and optionally broadcast
 */
export function emit(
  event: Omit<Event, "id" | "ts">,
  options: { skipPersist?: boolean; skipBroadcast?: boolean } = {}
): Event {
  const full: Event = {
    id: ulid(),
    ts: Date.now(),
    ...event,
  };

  // Ensure directory exists
  ensureKimmiDir();

  // 1. Append to events file (persistent)
  if (!options.skipPersist) {
    const eventsPath = getEventsPath();
    appendFileSync(eventsPath, JSON.stringify(full) + "\n");
  }

  // 2. Apply to state.db if loaded
  if (db) {
    db.applyEvent(full);
  }

  // 3. Broadcast via socket (real-time)
  if (eventHub && !options.skipBroadcast) {
    eventHub.broadcast(full);
  }

  return full;
}

/**
 * Create a typed emit function for specific event types
 */
export function createEmitter<T extends Record<string, unknown>>(
  type: EventType,
  actor: string
) {
  return (data: T, target?: string): Event => {
    return emit({
      type,
      actor,
      target,
      data,
    });
  };
}

/**
 * Helper to emit node_created event
 */
export function emitNodeCreated(
  actor: string,
  data: Record<string, unknown>
): Event {
  return emit({
    type: "node_created",
    actor,
    data,
  });
}

/**
 * Helper to emit node_updated event
 */
export function emitNodeUpdated(
  actor: string,
  target: string,
  data: Record<string, unknown>
): Event {
  return emit({
    type: "node_updated",
    actor,
    target,
    data,
  });
}

/**
 * Helper to emit node_moved event
 */
export function emitNodeMoved(
  actor: string,
  target: string,
  data: { parent_id: string | null; sort_order?: number }
): Event {
  return emit({
    type: "node_moved",
    actor,
    target,
    data,
  });
}

/**
 * Helper to emit node_deleted event
 */
export function emitNodeDeleted(
  actor: string,
  target: string,
  reason?: string
): Event {
  return emit({
    type: "node_deleted",
    actor,
    target,
    data: { reason },
  });
}

/**
 * Helper to emit task_claimed event
 */
export function emitTaskClaimed(target: string, actor: string): Event {
  return emit({
    type: "task_claimed",
    actor,
    target,
    data: {},
  });
}

/**
 * Helper to emit task_released event
 */
export function emitTaskReleased(
  target: string,
  actor: string,
  reason?: string
): Event {
  return emit({
    type: "task_released",
    actor,
    target,
    data: { reason },
  });
}

/**
 * Helper to emit task_completed event
 */
export function emitTaskCompleted(
  target: string,
  actor: string,
  summary?: string
): Event {
  return emit({
    type: "task_completed",
    actor,
    target,
    data: { summary },
  });
}
