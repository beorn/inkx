/**
 * Sub-agent notification adapter — emits `source: "subagent"` notification events
 * when a Task-tool sub-agent reports started / completed / failed.
 *
 * Wiring: the controller's per-session `AgentSession.subscribe` loop calls
 * `notifySubagentToolUse` whenever it sees a `tool-use` event for the Task
 * (or "Agent") tool, and `notifySubagentToolResult` when the matching
 * `tool-result` lands. This adapter correlates the two by
 * `tool_use_id` so the COMPLETION / FAILURE event can carry the same
 * description that the START event carried.
 *
 * Per `apps/silvercode/docs/channels.md` § 3, every payload passes through Layer
 * 2 (`sanitizeNotification`). Unlike chatty ambient sources, Task lifecycle
 * events are state transitions; dropping sibling starts/completions leaves the
 * UI with stale active subagents.
 *
 * Coordination value: peer sessions watching notification events see "session
 * X spawned subagent: <description>" and "session X completed subagent:
 * <digest>". This is the trail Phase 6.b promised.
 *
 * Lifecycle stages (see `SubagentEventKind`):
 *   - `started`    — Task tool invoked, sub-agent spawning
 *   - `progress`   — reserved for future (no progress events surfaced today)
 *   - `completed`  — Task tool returned a non-error result
 *   - `failed`     — Task tool returned `is_error: true` OR errored out
 *   - `stopped`    — graceful stop without success/failure (e.g., cancel)
 *
 * Tracking: `km-silvercode.notification-subagent-real`.
 */

import createDebug from "debug"
import type { NotificationAdapterCtx } from "./types.ts"
import { sanitizeNotification } from "../notification-sanitize.ts"
import { makeNotificationEventId } from "./types.ts"

const dSubagent = createDebug("silvercode:notification:subagent")

const SOURCE = "subagent" as const

/** Tool names that map to a sub-agent dispatch. Both spellings exist in the wild. */
const SUBAGENT_TOOL_NAMES: ReadonlySet<string> = new Set(["Task", "Agent"])

/**
 * Default cap on the size of result digests carried in `completed` events.
 * Override with `SILVERCODE_SUBAGENT_DIGEST_MAX` (parsed as a positive
 * integer; non-positive / NaN values fall back to the default).
 */
const DEFAULT_DIGEST_MAX = 200

/**
 * Cap on the description length carried in `started` / `completed` /
 * `failed` events. Descriptions are typically short (< 80 chars) but
 * agents occasionally pass a multi-paragraph prompt as the description;
 * truncate so a runaway description can't blow the per-event budget.
 */
const DESCRIPTION_MAX = 200

export type SubagentEventKind = "started" | "progress" | "completed" | "stopped" | "failed"

export type SubagentEvent = {
  readonly kind: SubagentEventKind
  /** Identifier used for the visible "[subagent X]" tag — agent name, slug, or session id. */
  readonly agent: string
  /** Short human description (started: task description; completed: digest; failed: error). */
  readonly summary: string
  readonly toolUseId?: string
  readonly description?: string
  /**
   * Source session id — i.e., the session that spawned the subagent. Used
   * for per-session attribution by the prompt-cross-agent slice and by
   * the side panel.
   */
  readonly sessionId?: string
}

export type SubagentAdapterOptions = NotificationAdapterCtx & {
  /**
   * Override the digest cap. Defaults to `SILVERCODE_SUBAGENT_DIGEST_MAX`
   * env var or `DEFAULT_DIGEST_MAX` (200).
   */
  readonly digestMax?: number
}

export type SubagentHandle = {
  readonly dispose: () => void
  /** Internal: route one already-shaped `SubagentEvent` through the pipeline. */
  readonly handle: (event: SubagentEvent) => boolean
  /**
   * Notify the adapter that a Task tool was invoked. Filters non-Task
   * tool calls automatically — the controller can hand us every
   * `tool-use` event without pre-filtering. Returns `true` if a started
   * event was enqueued.
   */
  readonly notifyTaskToolUse: (input: TaskToolUseInput) => boolean
  /**
   * Notify the adapter that a Task tool returned a result. Correlates by
   * `tool_use_id` against the in-flight map populated by
   * `notifyTaskToolUse`; ignores tool_use_ids the adapter never saw a
   * `started` for. Returns `true` if a completed/failed event was enqueued.
   */
  readonly notifyTaskToolResult: (input: TaskToolResultInput) => boolean
  /** Test surface — number of in-flight Task invocations awaiting a result. */
  readonly inflightCount: () => number
}

/** Inputs the controller passes for each Task `tool-use` event. */
export type TaskToolUseInput = {
  readonly toolUseId: string
  readonly toolName: string
  readonly input: unknown
  readonly sessionId?: string
}

/** Inputs the controller passes for each `tool-result` matched to a Task tool_use_id. */
export type TaskToolResultInput = {
  readonly toolUseId: string
  readonly output: unknown
  readonly isError?: boolean
  readonly sessionId?: string
}

/**
 * Per-tool-use record kept until the matching `tool-result` arrives. We
 * carry the description separately from `agent` so the completed/failed
 * event can repeat it: the result event itself carries no description.
 */
type Inflight = {
  readonly description: string
  readonly agent: string
  readonly sessionId?: string
  readonly startedAt: number
}

export function registerSubagentNotificationAdapter(opts: SubagentAdapterOptions): () => void {
  return registerSubagentNotificationAdapterHandle(opts).dispose
}

export function registerSubagentNotificationAdapterHandle(opts: SubagentAdapterOptions): SubagentHandle {
  const inflight = new Map<string, Inflight>()
  const digestMax = resolveDigestMax(opts.digestMax)
  let disposed = false

  function handle(event: SubagentEvent): boolean {
    if (disposed) return false
    const content = sanitizeNotification(formatSubagentEvent(event, digestMax))
    if (content.length === 0) return false
    opts.queue.enqueue({
      id: makeNotificationEventId(SOURCE),
      source: SOURCE,
      timestamp: Date.now(),
      content,
      meta: {
        kind: "subagent-status",
        agent: event.agent,
        status: event.kind,
        fromSessionId: event.sessionId,
        toolUseId: event.toolUseId,
        description: event.description,
      },
    })
    return true
  }

  function notifyTaskToolUse(input: TaskToolUseInput): boolean {
    if (disposed) return false
    if (!isTaskTool(input.toolName)) return false
    const description = extractTaskDescription(input.input)
    const agent = extractTaskAgent(input.input) ?? input.toolName
    inflight.set(input.toolUseId, {
      description,
      agent,
      sessionId: input.sessionId,
      startedAt: Date.now(),
    })
    dSubagent("task-use id=%s agent=%s desc=%s", input.toolUseId, agent, description)
    return handle({
      kind: "started",
      agent,
      summary: truncate(description, DESCRIPTION_MAX),
      toolUseId: input.toolUseId,
      description,
      sessionId: input.sessionId,
    })
  }

  function notifyTaskToolResult(input: TaskToolResultInput): boolean {
    if (disposed) return false
    const record = inflight.get(input.toolUseId)
    if (!record) return false
    inflight.delete(input.toolUseId)
    const digest = extractResultDigest(input.output, digestMax)
    if (input.isError === true) {
      dSubagent("task-fail id=%s desc=%s", input.toolUseId, record.description)
      return handle({
        kind: "failed",
        agent: record.agent,
        summary: composeFailedSummary(record.description, digest),
        toolUseId: input.toolUseId,
        description: record.description,
        sessionId: input.sessionId ?? record.sessionId,
      })
    }
    dSubagent("task-complete id=%s desc=%s", input.toolUseId, record.description)
    return handle({
      kind: "completed",
      agent: record.agent,
      summary: composeCompletedSummary(record.description, digest),
      toolUseId: input.toolUseId,
      description: record.description,
      sessionId: input.sessionId ?? record.sessionId,
    })
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    inflight.clear()
    dSubagent("dispose")
  }
  opts.scope.defer(dispose)
  return {
    dispose,
    handle,
    notifyTaskToolUse,
    notifyTaskToolResult,
    inflightCount: () => inflight.size,
  }
}

function isTaskTool(name: string): boolean {
  return SUBAGENT_TOOL_NAMES.has(name)
}

/**
 * Pull a human-readable description from the Task tool input. Claude's
 * Task tool uses `{ description, prompt, subagent_type? }`; we prefer the
 * short description but fall back to a truncated prompt when no
 * description is provided.
 */
function extractTaskDescription(input: unknown): string {
  if (!input || typeof input !== "object") return "(no description)"
  const o = input as Record<string, unknown>
  if (typeof o.description === "string" && o.description.trim().length > 0) {
    return o.description.trim()
  }
  if (typeof o.prompt === "string" && o.prompt.trim().length > 0) {
    return o.prompt.trim()
  }
  return "(no description)"
}

/**
 * Pull a sub-agent identifier from the Task tool input. Claude's Task
 * tool exposes a `subagent_type` field (e.g., `silvery`, `tdd`,
 * `general-purpose`); when present we use it as the visible "[subagent
 * X]" tag. Falls back to the bare tool name (`Task` or `Agent`).
 */
function extractTaskAgent(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined
  const o = input as Record<string, unknown>
  if (typeof o.subagent_type === "string" && o.subagent_type.trim().length > 0) {
    return o.subagent_type.trim()
  }
  if (typeof o.agent === "string" && o.agent.trim().length > 0) {
    return o.agent.trim()
  }
  return undefined
}

/**
 * Build a result digest from a tool-result `output` field. The Claude
 * Task tool packages the sub-agent's final assistant message as either a
 * plain string or an array of content blocks; we collapse to a single
 * string and trim to `digestMax`. Sanitization happens later in
 * `createDebouncedEmit` (Layer 2).
 */
function extractResultDigest(output: unknown, digestMax: number): string {
  const raw = collapseOutput(output)
  return truncate(raw, digestMax)
}

function collapseOutput(output: unknown): string {
  if (output == null) return ""
  if (typeof output === "string") return output
  if (Array.isArray(output)) {
    const parts: string[] = []
    for (const item of output as Array<Record<string, unknown>>) {
      if (item && typeof item === "object") {
        if (typeof item.text === "string") parts.push(item.text)
        else if (typeof item.content === "string") parts.push(item.content)
      } else if (typeof item === "string") {
        parts.push(item)
      }
    }
    return parts.join("\n").trim()
  }
  if (typeof output === "object") {
    const o = output as Record<string, unknown>
    if (typeof o.text === "string") return o.text
    if (typeof o.content === "string") return o.content
  }
  try {
    return JSON.stringify(output)
  } catch {
    return String(output)
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  // Account for the ellipsis suffix so we never exceed `max` even after
  // truncation.
  const ellipsis = "…"
  return s.slice(0, Math.max(0, max - ellipsis.length)) + ellipsis
}

function composeCompletedSummary(description: string, digest: string): string {
  const desc = truncate(description, DESCRIPTION_MAX)
  if (digest.length === 0) return desc
  return `${desc} — ${digest}`
}

function composeFailedSummary(description: string, digest: string): string {
  const desc = truncate(description, DESCRIPTION_MAX)
  if (digest.length === 0) return desc
  return `${desc} — ${digest}`
}

function formatSubagentEvent(event: SubagentEvent, _digestMax: number): string {
  const verb =
    event.kind === "started"
      ? "started"
      : event.kind === "progress"
        ? "in progress"
        : event.kind === "completed"
          ? "completed"
          : event.kind === "failed"
            ? "failed"
            : "stopped"
  return `[subagent ${event.agent}] ${verb}: ${event.summary}`
}

function resolveDigestMax(override: number | undefined): number {
  if (typeof override === "number" && override > 0 && Number.isFinite(override)) {
    return Math.floor(override)
  }
  const fromEnv = process.env.SILVERCODE_SUBAGENT_DIGEST_MAX
  if (fromEnv) {
    const parsed = Number.parseInt(fromEnv, 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return DEFAULT_DIGEST_MAX
}

/**
 * Test-only: drive one sub-agent event through the adapter pipeline.
 * Returns whether it was enqueued (false if sanitized content is empty).
 */
export function emitSubagentEventForTest(opts: SubagentAdapterOptions, event: SubagentEvent): boolean {
  const handle = registerSubagentNotificationAdapterHandle(opts)
  try {
    return handle.handle(event)
  } finally {
    handle.dispose()
  }
}
