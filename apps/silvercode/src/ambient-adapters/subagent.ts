/**
 * Sub-agent ambient adapter — emits `source: "subagent"` ambient events
 * when a Task-tool sub-agent reports started / progressed / completed.
 *
 * **Status: stub-with-test-hook.** The full surface needs:
 *
 *   1. A structured sub-agent event stream from the agent harness. Today
 *      the `Task` tool returns a final result only; we want the
 *      `SubagentStop` hook (and ideally per-progress notifications) to
 *      flow into a controller-level subscription point.
 *   2. A subscriber inside the controller that fans the stream to all
 *      registered sub-agent ambient adapters.
 *
 * Until that lands, this adapter exposes:
 *
 *   - `registerSubagentAmbientAdapter` returning a disposer (no-op
 *     production path — adapter has nothing to subscribe to yet).
 *   - `emitSubagentEventForTest(opts, event)` — drives one event through
 *     the adapter pipeline (sanitize → debounce → enqueue). The future
 *     real implementation just connects the harness stream to this same
 *     internal `emit` path.
 *
 * Tracking: `km-silvercode.ambient-phase-6-adapters` (Phase 6.b).
 *
 * Per `ambient-context-safety.md` § 3, every payload passes through
 * Layer 2 (`sanitizeAmbient`).
 */

import createDebug from "debug"
import type { AmbientAdapterCtx } from "./types.ts"
import { createDebouncedEmit, makeAmbientEventId } from "./types.ts"

const dSubagent = createDebug("silvercode:ambient:subagent")

const SOURCE = "subagent" as const

export type SubagentEventKind = "started" | "progress" | "completed" | "stopped"

export type SubagentEvent = {
  readonly kind: SubagentEventKind
  readonly agent: string
  readonly summary: string
  readonly sessionId?: string
}

export type SubagentAdapterOptions = AmbientAdapterCtx

type SubagentHandle = {
  readonly dispose: () => void
  /** Internal: route one event through the adapter pipeline. Test surface. */
  readonly handle: (event: SubagentEvent) => boolean
}

export function registerSubagentAmbientAdapter(opts: SubagentAdapterOptions): () => void {
  return registerSubagentAmbientAdapterHandle(opts).dispose
}

export function registerSubagentAmbientAdapterHandle(opts: SubagentAdapterOptions): SubagentHandle {
  const emit = createDebouncedEmit(opts)
  let disposed = false

  function handle(event: SubagentEvent): boolean {
    if (disposed) return false
    const content = formatSubagentEvent(event)
    if (content.length === 0) return false
    return emit({
      id: makeAmbientEventId(SOURCE),
      source: SOURCE,
      timestamp: Date.now(),
      content,
      meta: { kind: "subagent-status", agent: event.agent, status: event.kind, fromSessionId: event.sessionId },
    })
  }

  const dispose = (): void => {
    if (disposed) return
    disposed = true
    dSubagent("dispose")
  }
  opts.scope.defer(dispose)
  return { dispose, handle }
}

function formatSubagentEvent(event: SubagentEvent): string {
  const verb =
    event.kind === "started"
      ? "started"
      : event.kind === "progress"
        ? "in progress"
        : event.kind === "completed"
          ? "completed"
          : "stopped"
  return `[subagent ${event.agent}] ${verb}: ${event.summary}`
}

/**
 * Test-only: drive one sub-agent event through the adapter pipeline.
 * Returns whether it was enqueued (false if debounced or empty).
 */
export function emitSubagentEventForTest(opts: SubagentAdapterOptions, event: SubagentEvent): boolean {
  const handle = registerSubagentAmbientAdapterHandle(opts)
  try {
    return handle.handle(event)
  } finally {
    handle.dispose()
  }
}
