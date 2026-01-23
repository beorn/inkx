/**
 * Event emission - append events to events.jsonl
 */

import createDebug from "debug";
import { appendFileSync, existsSync, mkdirSync } from "fs";

const debug = createDebug("km:storage:emit");
import { ulid } from "ulid";
import { join } from "path";
import type { Event } from "@km/core";

// Event hub for real-time broadcasting (set by km-code)
let eventHub: { broadcast: (event: Event) => void } | null = null;

// Database for immediate projection (set when db is loaded)
let db: { applyEvent: (event: Event) => void } | null = null;

// Filesystem sync callback (set by km-watch when sync is enabled)
let fsSync: { applyEventToFs: (event: Event) => void } | null = null;

// Path to km state directory (defaults to .km, can be overridden with KM_DIR env var)
let kmDir = process.env.KM_DIR ?? ".km";

/**
 * Set the km state directory path
 */
export function setKmDir(path: string): void {
  kmDir = path;
}

/**
 * Get the current km state directory path
 * @deprecated Use Vault.path or pass kmDir explicitly to functions that need it.
 * This singleton will be removed in a future version.
 */
export function getKmDir(): string {
  return kmDir;
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
export function setDatabase(
  database: {
    applyEvent: (event: Event) => void;
  } | null,
): void {
  db = database;
}

/**
 * Set the filesystem sync callback
 * Called for each event to sync changes back to markdown files
 */
export function setFsSync(
  sync: { applyEventToFs: (event: Event) => void } | null,
): void {
  fsSync = sync;
}

/**
 * Clear the database reference (for testing)
 */
export function clearDatabase(): void {
  db = null;
}

/**
 * Ensure the km directory exists
 */
function ensureKmDir(): void {
  if (!existsSync(kmDir)) {
    mkdirSync(kmDir, { recursive: true });
  }
}

/**
 * Get the events file path
 */
export function getEventsPath(): string {
  return join(kmDir, "events.jsonl");
}

/**
 * Emit an event - append to events.jsonl and optionally broadcast
 */
export function emit(
  event: Omit<Event, "id" | "ts">,
  options: { skipPersist?: boolean; skipBroadcast?: boolean } = {},
): Event {
  const full: Event = {
    id: ulid(),
    ts: Date.now(),
    ...event,
  };

  debug("emit: %s target=%s", full.type, full.target ?? "(none)");

  // Ensure directory exists
  ensureKmDir();

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

  // 4. Sync to filesystem if enabled
  if (fsSync) {
    fsSync.applyEventToFs(full);
  }

  return full;
}

/**
 * Helper to emit node_created event
 */
export function emitNodeCreated(
  actor: string,
  data: Record<string, unknown>,
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
  data: Record<string, unknown>,
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
  data: { parent_id: string | null; parent_idx?: number },
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
  reason?: string,
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
  reason?: string,
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
  summary?: string,
): Event {
  return emit({
    type: "task_completed",
    actor,
    target,
    data: { summary },
  });
}

/**
 * Helper to emit session_started event
 */
export function emitSessionStarted(
  actor: string,
  sessionId: string,
  model: string,
  target?: string,
  systemPromptHash?: string,
): Event {
  return emit({
    type: "session_started",
    actor,
    target,
    data: {
      session_id: sessionId,
      model,
      system_prompt_hash: systemPromptHash,
    },
  });
}

/**
 * Helper to emit session_message event
 */
export function emitSessionMessage(
  actor: string,
  sessionId: string,
  role: "user" | "assistant" | "system",
  content: string,
  tokens?: number,
): Event {
  return emit({
    type: "session_message",
    actor,
    data: {
      session_id: sessionId,
      role,
      content,
      tokens,
    },
  });
}

/**
 * Helper to emit session_tool_call event
 */
export function emitSessionToolCall(
  actor: string,
  sessionId: string,
  tool: string,
  args: Record<string, unknown>,
  result?: unknown,
  tokens?: number,
): Event {
  return emit({
    type: "session_tool_call",
    actor,
    data: {
      session_id: sessionId,
      tool,
      args,
      result,
      tokens,
    },
  });
}

/**
 * Helper to emit session_ended event
 */
export function emitSessionEnded(
  actor: string,
  sessionId: string,
  status: "success" | "error" | "cancelled",
  options?: {
    totalTokens?: number;
    costUsd?: number;
    filesModified?: string[];
    summary?: string;
    error?: string;
  },
): Event {
  return emit({
    type: "session_ended",
    actor,
    data: {
      session_id: sessionId,
      status,
      total_tokens: options?.totalTokens,
      cost_usd: options?.costUsd,
      files_modified: options?.filesModified,
      summary: options?.summary,
      error: options?.error,
    },
  });
}
