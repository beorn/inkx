/**
 * Event emission - append events to events.jsonl
 */

import createDebug from "debug"
import { appendFileSync, existsSync, mkdirSync } from "fs"
import { AsyncLocalStorage } from "async_hooks"

const debug = createDebug("km:storage:emit")
import { ulid } from "ulid"
import { join } from "path"
import type { Event } from "@km/core"
import { tryGetContextDb } from "./db-instance.ts"
import { applyEventWithDb } from "./db-events.ts"

// Event hub for real-time broadcasting (set by km-code)
let eventHub: { broadcast: (event: Event) => void } | null = null

// Filesystem sync callback (set by km-watch when sync is enabled)
let fsSync: { applyEventToFs: (event: Event) => void } | null = null

// AsyncLocalStorage for context-local kmDir (enables parallel test isolation)
const kmDirContext = new AsyncLocalStorage<string>()

/**
 * Set the km state directory path.
 * @deprecated Use runWithKmDir() for context-local paths instead.
 * This function now sets the default for non-context code paths only.
 */
export function setKmDir(path: string): void {
  // Store as default for legacy code paths that don't use ALS context
  defaultKmDir = path
}

// Default kmDir for legacy code paths (prefer ALS context via runWithKmDir)
let defaultKmDir = process.env.KM_DIR ?? ".km"

/**
 * Get the current km state directory path.
 * Prefers ALS context (set via runWithKmDir), falls back to default.
 *
 * @deprecated Use Vault.path or pass kmDir explicitly to functions that need it.
 * Prefer using runWithKmDir() to establish context.
 */
export function getKmDir(): string {
  // Check async context first (enables parallel test isolation)
  const contextKmDir = kmDirContext.getStore()
  if (contextKmDir) {
    return contextKmDir
  }
  return defaultKmDir
}

/**
 * Run a function with a context-local kmDir.
 * This enables parallel test isolation - each test can have its own kmDir
 * without affecting other concurrent tests.
 */
export function runWithKmDir<T>(path: string, fn: () => T): T {
  return kmDirContext.run(path, fn)
}

/**
 * Set the event hub for real-time broadcasting
 */
export function setEventHub(hub: { broadcast: (event: Event) => void }): void {
  eventHub = hub
}

/**
 * Set the filesystem sync callback
 * Called for each event to sync changes back to markdown files
 */
export function setFsSync(
  sync: { applyEventToFs: (event: Event) => void } | null,
): void {
  fsSync = sync
}

/**
 * Ensure the km directory exists
 */
function ensureKmDir(): void {
  const dir = getKmDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * Get the events file path
 */
export function getEventsPath(): string {
  return join(getKmDir(), "events.jsonl")
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
  }

  debug("emit: %s target=%s", full.type, full.target ?? "(none)")

  // Ensure directory exists
  ensureKmDir()

  // 1. Append to events file (persistent)
  if (!options.skipPersist) {
    const eventsPath = getEventsPath()
    appendFileSync(eventsPath, JSON.stringify(full) + "\n")
  }

  // 2. Apply to state.db if loaded (context db from runWithDb)
  const contextDb = tryGetContextDb()
  if (contextDb) {
    applyEventWithDb(contextDb, full)
  }

  // 3. Broadcast via socket (real-time)
  if (eventHub && !options.skipBroadcast) {
    eventHub.broadcast(full)
  }

  // 4. Sync to filesystem if enabled
  if (fsSync) {
    fsSync.applyEventToFs(full)
  }

  return full
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
  })
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
  })
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
  })
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
  })
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
  })
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
  })
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
  })
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
  })
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
  })
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
  })
}

/**
 * Helper to emit session_ended event
 */
export function emitSessionEnded(
  actor: string,
  sessionId: string,
  status: "success" | "error" | "cancelled",
  options?: {
    totalTokens?: number
    costUsd?: number
    filesModified?: string[]
    summary?: string
    error?: string
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
  })
}
