/**
 * Event emission - append events to events.jsonl
 *
 * @deprecated This module contains global singletons. Use Emitter domain object instead:
 *   import { createEmitter } from "./emitter.ts"
 *   const emitter = createEmitter({ kmDir, db })
 *   emitter.emit({ type: "node_created", actor: "user", data: {...} })
 *
 * The functions in this file are kept for backward compatibility with CLI commands
 * that haven't been migrated yet. New code should use Emitter.
 */

/* eslint-disable @typescript-eslint/no-deprecated -- This file contains deprecated singleton implementation */

import createDebug from "debug"
import { appendFileSync, existsSync, mkdirSync } from "fs"
import { AsyncLocalStorage } from "async_hooks"

const debug = createDebug("km:storage:emit")
import { ulid } from "ulid"
import { join } from "path"
import type { Event } from "@km/core"

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
 * @deprecated Use Repo.path or pass kmDir explicitly to functions that need it.
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
 *
 * @deprecated Use Emitter domain object: `emitter.emit({ type, actor, data })`.
 * This function uses global singletons (kmDir, db) which break test isolation.
 */
export function emit(
  event: Omit<Event, "id" | "ts">,
  options: { skipPersist?: boolean } = {},
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

  // NOTE: Database application, broadcasting, and filesystem sync have been removed.
  // Use Emitter domain object (createEmitter) for full event emission capabilities.
  // This deprecated function only persists to events.jsonl for backward compatibility.

  return full
}

/**
 * Helper to emit node_created event
 * @deprecated Use emitter.emit() or createDbOps(db, emitter).addNode()
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
 * @deprecated Use emitter.emit() or createDbOps(db, emitter).updateNode()
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
 * @deprecated Use emitter.emit() or createDbOps(db, emitter).moveNode()
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
 * @deprecated Use emitter.emit() or createDbOps(db, emitter).deleteNode()
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
 * @deprecated Use emitter.emit({ type: "task_claimed", ... })
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
 * @deprecated Use emitter.emit({ type: "task_released", ... })
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
 * @deprecated Use emitter.emit({ type: "task_completed", ... })
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
 * @deprecated Use emitter.emit({ type: "session_started", ... })
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
 * @deprecated Use emitter.emit({ type: "session_message", ... })
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
 * @deprecated Use emitter.emit({ type: "session_tool_call", ... })
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
 * @deprecated Use emitter.emit({ type: "session_ended", ... })
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
