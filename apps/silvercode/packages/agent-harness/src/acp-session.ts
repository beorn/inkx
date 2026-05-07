/**
 * `createAcpSession(scope, agentSession, opts?)` — silvery-house-style
 * reactive wrapper around an `AgentSession` event stream.
 *
 * The legacy `AgentSession` (from `events.ts`) emits a Claude-CLI-shaped
 * `AgentEvent` union turn-by-turn. This factory drains those events into
 * silvercode's canonical ACP-shaped surface — a small bundle of
 * `alien-signals` / `alien-projections` / `alien-trees` primitives the UI
 * can subscribe to directly, without ever pattern-matching on raw
 * `SessionUpdate` (or `AgentEvent`) variants outside the adapter layer.
 *
 * Layering:
 *
 *     spawnClaude / spawnSdk / spawnCodex / connectAcp
 *         → AgentSession (legacy AgentEvent union, in events.ts)
 *             → createAcpSession(scope, session)
 *                 → AcpSession (signals over silvercode ACP-shaped types)
 *                     → silvercode UI components
 *
 * The legacy `createSessionStore(...)` continues to exist; consumers migrate
 * one component at a time. Both paths can run in parallel against the same
 * underlying `AgentSession`.
 *
 * Bead: `km-silvercode.acp-session`. Tracking: `km-silvercode.acp`.
 */

import { effect, signal } from "alien-signals"
import { createProjection } from "alien-projections"
import { createTree, type TreeStore } from "alien-trees"
import { Scope, disposable } from "@silvery/scope"

import type { AgentEvent, AgentSession } from "./events.ts"
import type {
  AgentCapabilities,
  ContentBlock,
  PermissionOption,
  PermissionRequestId,
  Plan,
  PlanEntry,
  PlanEntryPriority,
  PlanEntryStatus,
  RequestPermissionRequest,
  Role,
  SessionId,
  SessionModeId,
  StopReason,
  ToolCall,
  ToolCallContent,
  ToolCallId,
  ToolCallStatus,
  UsageUpdate,
} from "./acp-types.ts"

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/** A single conversational turn, represented as ACP-shaped content blocks. */
export interface Message {
  /**
   * Stable identifier for the message. Maps from the legacy `turnId` (or a
   * synthetic id when an event doesn't carry one).
   */
  id: string
  role: Role
  /** ACP-shaped content blocks, one entry per produced block. */
  content: ContentBlock[]
  /** Wall-clock timestamp of the first event that opened this message. */
  ts: number
}

/** A pending permission request awaiting a client decision. */
export interface PendingPermission {
  id: PermissionRequestId
  /** Synthesized request shaped like ACP's `RequestPermissionRequest`. */
  request: RequestPermissionRequest
}

/** Coarse-grained session status for status-line consumers. */
export type AcpSessionStatus = "idle" | "thinking" | "tool-running" | "awaiting-permission" | "ended"

/** Read-only callable signal — `() => T`. */
export type ReadSignal<T> = () => T

/** Read-only callable projection — `() => T[]`. */
export type ReadProjection<T> = () => T[]

/**
 * Decision payload for `respondToPermission`. Mirrors ACP's
 * `RequestPermissionOutcome` but spelled to match the legacy
 * `AgentSession.respondToPermission(id, approved)` boolean signature so the
 * fake session works without modification.
 */
export type PermissionDecision = boolean | { approved: boolean }

export interface AcpSessionOpts {
  /** Override the initial session id. Defaults to the underlying session's. */
  sessionId?: SessionId
  /** Override the initial agent capabilities (for tests / fake sessions). */
  capabilities?: AgentCapabilities
}

/**
 * The reactive surface produced by `createAcpSession`. UI components import
 * from this single object instead of subscribing to raw `AgentEvent`s.
 *
 * All read accessors are callable signals/projections (`() => T`) so they
 * compose with `alien-signals` `computed(...)` / `effect(...)` directly.
 */
export interface AcpSession {
  /** The session id reported by the agent (mutable until session-init lands). */
  readonly id: ReadSignal<SessionId>
  /** Conversation transcript as ACP-shaped messages. */
  readonly messages: ReadSignal<Message[]>
  /** Live tool calls, incrementally maintained, keyed by `ToolCallId`. */
  readonly toolCalls: ReadProjection<ToolCall>
  /** The latest plan snapshot, or `null` if the agent has never sent one. */
  readonly plan: ReadSignal<Plan | null>
  /** Tree-store over the latest plan's entries (flat at v1, nesting-ready). */
  readonly planTree: TreeStore<PlanTreeSchema>
  /** The current session mode, if the agent advertises one. */
  readonly mode: ReadSignal<SessionModeId | null>
  /** Latest usage snapshot (tokens / cost). */
  readonly usage: ReadSignal<UsageUpdate | null>
  /** Capabilities advertised by the agent at initialize time. */
  readonly capabilities: ReadSignal<AgentCapabilities | null>
  /** Coarse-grained status — backs the status line. */
  readonly status: ReadSignal<AcpSessionStatus>
  /** Permission requests awaiting a client decision, keyed by request id. */
  readonly pendingPermissions: ReadProjection<PendingPermission>

  /**
   * Send a prompt and resolve when the resulting turn ends. Honors the
   * scope's `AbortSignal`: if the scope disposes (or `cancel()` is called)
   * before the turn ends, the returned promise resolves with
   * `stopReason: "cancelled"`.
   *
   * The exact text is forwarded via `agentSession.send(text)` — content
   * blocks other than `text` (image/audio/resource) currently surface as
   * an error and resolve with `stopReason: "cancelled"` because the legacy
   * `AgentSession.send()` API is text-only. Multi-modal prompting will land
   * when the canonical AcpAgentSession path replaces the legacy path.
   */
  prompt(content: ContentBlock[]): Promise<{ stopReason: StopReason }>

  /**
   * Cancel the in-flight prompt (if any). Resolves the pending `prompt(...)`
   * promise with `stopReason: "cancelled"` and forwards the cancel to the
   * underlying session via `close()` (the legacy `AgentSession` has no
   * `cancel()` method — `close()` is the closest signal-equivalent).
   */
  cancel(): void

  /**
   * Resolve a pending permission request. The decision is forwarded to the
   * underlying `AgentSession.respondToPermission(...)`.
   */
  respondToPermission(id: PermissionRequestId, decision: PermissionDecision): void
}

// ---------------------------------------------------------------------------
// Plan tree schema — the per-node alien-trees shape.
// ---------------------------------------------------------------------------

interface PlanNodeData {
  content: string
  status: PlanEntryStatus
  priority: PlanEntryPriority
  /** Index in the original `Plan.entries` array (for ordering). */
  index: number
}

/**
 * The plan-tree schema as `createTree` consumes it. We use writable signals
 * for the per-node `data` blob; the tree exposes ancestor/descendant
 * aggregates via `tree.descendants(...)` / `tree.ancestors(...)` if a future
 * nested-plan revision needs them. ACP currently emits flat plans, so the
 * traversal at v1 is "everything is a child of `__root__`".
 */
type PlanTreeSchema = ReturnType<typeof planTreeFactory>

function planTreeFactory(): { data: ReturnType<typeof signal<PlanNodeData | null>> } {
  return { data: signal<PlanNodeData | null>(null) }
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const ROOT_NODE = "__root__"

export function createAcpSession(scope: Scope, agentSession: AgentSession, opts: AcpSessionOpts = {}): AcpSession {
  // ── Underlying state signals ─────────────────────────────────────────────
  const idSig = signal<SessionId>(opts.sessionId ?? (agentSession.sessionId as SessionId))
  const messagesSig = signal<Message[]>([])
  // Backing array for the toolCalls projection. Replaced (not mutated) on
  // every change so alien-projections sees a fresh source.
  const toolCallsSig = signal<ToolCall[]>([])
  const planSig = signal<Plan | null>(null)
  const modeSig = signal<SessionModeId | null>(null)
  const usageSig = signal<UsageUpdate | null>(null)
  const capabilitiesSig = signal<AgentCapabilities | null>(opts.capabilities ?? null)
  const pendingSig = signal<PendingPermission[]>([])
  const statusSig = signal<AcpSessionStatus>("idle")

  // ── Plan tree ────────────────────────────────────────────────────────────
  // The traversal is mutable: every plan update rebinds it. We keep it
  // outside the closure so tree.rebind(...) sees the latest snapshot.
  let planChildren: string[] = []
  const traversal = {
    parent(id: string): string | null {
      if (id === ROOT_NODE) return null
      return planChildren.includes(id) ? ROOT_NODE : null
    },
    children(id: string): string[] {
      return id === ROOT_NODE ? planChildren : []
    },
  }
  const planTree = createTree(planTreeFactory, traversal)

  // ── Projections ──────────────────────────────────────────────────────────
  // alien-projections needs an `Accessor<T[]>` (a 0-arg getter). The
  // signal() return type is an overloaded `(): T & ((value: T) => void)`,
  // which doesn't unify cleanly to `() => T[]`. Wrap each in a thin
  // typed reader.
  const toolCallsRead = (): ToolCall[] => toolCallsSig()
  const pendingRead = (): PendingPermission[] => pendingSig()
  const toolCallsProjection = createProjection<ToolCall, ToolCallId>(toolCallsRead, {
    key: (call) => call.toolCallId,
  })
  const pendingProjection = createProjection<PendingPermission, PermissionRequestId>(pendingRead, {
    key: (p) => p.id,
  })

  // ── Prompt orchestration ─────────────────────────────────────────────────
  // Only one prompt() call is in-flight at a time; the legacy AgentSession
  // surface is single-turn anyway. We track the pending promise so cancel()
  // / scope-dispose can resolve it.
  let pendingPrompt: { resolve: (r: { stopReason: StopReason }) => void } | null = null

  function settlePrompt(stopReason: StopReason): void {
    if (!pendingPrompt) return
    const p = pendingPrompt
    pendingPrompt = null
    p.resolve({ stopReason })
  }

  // ── Status derivation ────────────────────────────────────────────────────
  // `status` is technically derivable from (active-tool-calls?, pending?,
  // ended?, current-turn-role?). We compute it imperatively in the event
  // handler because the alien-trees / alien-projections setup already
  // demands fine-grained writes; one extra computed wouldn't add safety,
  // just allocation.

  let endedFlag = false
  let activeAssistantTurn = false

  function recomputeStatus(): void {
    if (endedFlag) {
      statusSig("ended")
      return
    }
    if (pendingSig().length > 0) {
      statusSig("awaiting-permission")
      return
    }
    const activeTool = toolCallsSig().some(
      (c) => c.status === "pending" || c.status === "in_progress" || c.status === undefined,
    )
    // ToolCall created without status field defaults to "in_progress" intent.
    // We treat undefined as in-progress until a tool_call_update lands.
    if (activeTool) {
      statusSig("tool-running")
      return
    }
    statusSig(activeAssistantTurn ? "thinking" : "idle")
  }

  // ── Event translation ────────────────────────────────────────────────────
  function applyEvent(event: AgentEvent): void {
    switch (event.kind) {
      case "session-init": {
        idSig(event.sessionId as SessionId)
        // ACP capabilities aren't encoded in legacy session-init; populate
        // a minimal stub if the agent didn't override it. Real ACP-native
        // sessions get capabilities from initialize() and pre-seed via opts.
        if (capabilitiesSig() === null) capabilitiesSig({})
        recomputeStatus()
        return
      }

      case "turn-start": {
        const id = event.turnId as unknown as string
        const msg: Message = { id, role: event.role, content: [], ts: event.ts }
        const list = messagesSig()
        const idx = list.findIndex((m) => m.id === id)
        const existing = idx >= 0 ? list[idx] : undefined
        if (existing) {
          // Re-open / role-correction.
          const next = [...list]
          next[idx] = { ...existing, role: event.role, ts: event.ts }
          messagesSig(next)
        } else {
          messagesSig([...list, msg])
        }
        if (event.role === "assistant") {
          activeAssistantTurn = true
        }
        recomputeStatus()
        return
      }

      case "user-message": {
        const id = event.turnId as unknown as string
        const list = messagesSig()
        const idx = list.findIndex((m) => m.id === id)
        const block: ContentBlock = { type: "text", text: event.text }
        const existing = idx >= 0 ? list[idx] : undefined
        if (existing) {
          const next = [...list]
          next[idx] = { ...existing, role: "user", content: [block], ts: event.ts }
          messagesSig(next)
        } else {
          messagesSig([...list, { id, role: "user", content: [block], ts: event.ts }])
        }
        return
      }

      case "text-delta": {
        const id = event.turnId as unknown as string
        const list = messagesSig()
        const idx = list.findIndex((m) => m.id === id)
        const existing = idx >= 0 ? list[idx] : undefined
        if (!existing) {
          // Synthesize an assistant message for orphan deltas.
          messagesSig([...list, { id, role: "assistant", content: [{ type: "text", text: event.text }], ts: event.ts }])
          activeAssistantTurn = true
          recomputeStatus()
          return
        }
        const lastBlock = existing.content[existing.content.length - 1]
        let nextContent: ContentBlock[]
        if (lastBlock?.type === "text") {
          // Merge into the trailing text block.
          const merged: ContentBlock = { ...lastBlock, text: lastBlock.text + event.text }
          nextContent = [...existing.content.slice(0, -1), merged]
        } else {
          nextContent = [...existing.content, { type: "text", text: event.text }]
        }
        const next = [...list]
        next[idx] = { ...existing, content: nextContent }
        messagesSig(next)
        activeAssistantTurn = true
        recomputeStatus()
        return
      }

      case "thinking-delta": {
        // Thinking chunks aren't part of the visible message content in the
        // ACP shape (agent_thought_chunk is a separate sessionUpdate). We
        // don't attach them to `messages`; UI consumers that want thinking
        // visibility subscribe to the underlying AgentSession directly. The
        // status still flips to "thinking".
        activeAssistantTurn = true
        recomputeStatus()
        return
      }

      case "tool-use": {
        const id = event.id as unknown as ToolCallId
        const call: ToolCall = {
          toolCallId: id,
          title: event.name,
          status: "in_progress",
          rawInput: event.input,
        }
        const calls = toolCallsSig()
        const idx = calls.findIndex((c) => c.toolCallId === id)
        const existingCall = idx >= 0 ? calls[idx] : undefined
        if (existingCall) {
          const next = [...calls]
          next[idx] = { ...existingCall, ...call }
          toolCallsSig(next)
        } else {
          toolCallsSig([...calls, call])
        }
        // TodoWrite is Claude Code's plan-equivalent. Translate the input's
        // `todos` array into an ACP-shaped Plan; the planSig effect handles
        // tree rebind automatically.
        if (event.name === "TodoWrite") {
          const plan = extractPlanFromTodos(event.input)
          if (plan) planSig(plan)
        }
        recomputeStatus()
        return
      }

      case "tool-result": {
        const id = event.id as unknown as ToolCallId
        const calls = toolCallsSig()
        const idx = calls.findIndex((c) => c.toolCallId === id)
        const finalStatus: ToolCallStatus = event.is_error ? "failed" : "completed"
        const resultContent: ToolCallContent[] = [
          {
            type: "content",
            content: { type: "text", text: stringifyOutput(event.output) },
          },
        ]
        const existing = idx >= 0 ? calls[idx] : undefined
        if (existing) {
          const next = [...calls]
          next[idx] = {
            ...existing,
            status: finalStatus,
            rawOutput: event.output,
            content: [...(existing.content ?? []), ...resultContent],
          }
          toolCallsSig(next)
        } else {
          // Orphan result with no prior tool-use — synthesize one.
          toolCallsSig([
            ...calls,
            {
              toolCallId: id,
              title: "(unknown)",
              status: finalStatus,
              rawOutput: event.output,
              content: resultContent,
            },
          ])
        }
        recomputeStatus()
        return
      }

      case "permission-request": {
        const reqId = event.requestId
        const request: RequestPermissionRequest = {
          sessionId: idSig() as SessionId,
          toolCall: {
            toolCallId: event.requestId as unknown as string as ToolCallId,
            title: event.tool,
            rawInput: event.args,
          },
          options: defaultPermissionOptions(),
        }
        const list = pendingSig()
        const idx = list.findIndex((p) => p.id === reqId)
        if (idx >= 0) {
          const next = [...list]
          next[idx] = { id: reqId, request }
          pendingSig(next)
        } else {
          pendingSig([...list, { id: reqId, request }])
        }
        recomputeStatus()
        return
      }

      case "permission-decision": {
        const reqId = event.requestId
        const list = pendingSig()
        const next = list.filter((p) => p.id !== reqId)
        if (next.length !== list.length) pendingSig(next)
        recomputeStatus()
        return
      }

      case "assistant-message": {
        // Final block aggregation lands at end-of-turn. We replace the
        // message's content with the canonical block list, translating
        // legacy block shapes to ACP content blocks where possible.
        const id = event.turnId as unknown as string
        const list = messagesSig()
        const idx = list.findIndex((m) => m.id === id)
        const blocks = event.content
          .map((b): ContentBlock | null => {
            if (b.type === "text") return { type: "text", text: b.text }
            if (b.type === "image") return { type: "image", data: "", mimeType: b.mediaType }
            // tool_use / tool_result / thinking blocks have no direct ACP
            // content-block analogue — they live in toolCalls / are dropped.
            return null
          })
          .filter((b): b is ContentBlock => b !== null)
        const existing = idx >= 0 ? list[idx] : undefined
        if (existing) {
          const next = [...list]
          next[idx] = { ...existing, content: blocks }
          messagesSig(next)
        } else {
          messagesSig([...list, { id, role: "assistant", content: blocks, ts: event.ts }])
        }
        return
      }

      case "turn-end": {
        activeAssistantTurn = false
        if (event.usage) {
          const used = (event.usage.input_tokens ?? 0) + (event.usage.output_tokens ?? 0)
          usageSig({ size: 0, used })
        }
        if (event.stopReason === "tool_use") {
          recomputeStatus()
          return
        }
        const reason = mapStopReason(event.stopReason)
        if (pendingPrompt) settlePrompt(reason)
        recomputeStatus()
        return
      }

      case "session-end": {
        endedFlag = true
        if (event.usage) {
          const used = (event.usage.input_tokens ?? 0) + (event.usage.output_tokens ?? 0)
          const cost = typeof event.costUsd === "number" ? { amount: event.costUsd, currency: "USD" } : undefined
          usageSig({ size: 0, used, ...(cost ? { cost } : {}) })
        }
        if (pendingPrompt) settlePrompt(mapStopReason(event.stopReason))
        recomputeStatus()
        return
      }

      case "session-lifecycle": {
        if (event.state === "ended") {
          endedFlag = true
          if (pendingPrompt) settlePrompt("end_turn")
        }
        recomputeStatus()
        return
      }

      case "status":
      case "error":
      case "handoff":
      case "km-reference":
        // Status / error / handoff / km-reference don't directly drive the
        // ACP-shaped surface. UI consumers that need them keep subscribing
        // to the legacy AgentSession.
        return
    }
  }

  // ── Subscribe to the underlying session ──────────────────────────────────
  const unsubscribe = agentSession.subscribe((e) => {
    try {
      applyEvent(e)
    } catch {
      // Defensive: don't let an event handler bug tear down the session.
      // Real diagnostics would surface a debug log; we keep this silent at
      // v1 to mirror the boundary adapter's "lossy by design" stance.
    }
  })

  // ── Scope wiring — abort + cleanup ──────────────────────────────────────
  scope.use(
    disposable({}, () => {
      unsubscribe()
      if (pendingPrompt) settlePrompt("cancelled")
    }),
  )
  if (scope.signal.aborted) {
    // Already aborted at construction time — drop subscription immediately.
    unsubscribe()
  } else {
    scope.signal.addEventListener(
      "abort",
      () => {
        if (pendingPrompt) settlePrompt("cancelled")
      },
      { once: true },
    )
  }

  // ── Plan tree wiring — derive a flat traversal from the latest plan ─────
  // An `effect` watches `planSig()` and rewires the tree on every change.
  // Effect autoruns at registration and on each tracked-signal write.
  const stopPlanEffect = effect(() => {
    const p = planSig()
    if (!p) {
      planChildren = []
      planTree.clear()
      planTree.rebind(traversal)
      return
    }
    const ids: string[] = []
    p.entries.forEach((entry, i) => {
      const id = `plan-${i}`
      ids.push(id)
      const node = planTree.get(id)
      // The schema declares `data: signal<PlanNodeData | null>()`. Calling
      // it with an argument is the canonical write.
      ;(node.data as (v: PlanNodeData | null) => void)({
        content: entry.content,
        priority: entry.priority,
        status: entry.status,
        index: i,
      })
    })
    planChildren = ids
    planTree.rebind(traversal)
  })
  scope.use(disposable({}, () => stopPlanEffect()))

  // ── Public surface ───────────────────────────────────────────────────────
  return {
    id: idSig as ReadSignal<SessionId>,
    messages: messagesSig as ReadSignal<Message[]>,
    toolCalls: toolCallsProjection,
    plan: planSig as ReadSignal<Plan | null>,
    planTree,
    mode: modeSig as ReadSignal<SessionModeId | null>,
    usage: usageSig as ReadSignal<UsageUpdate | null>,
    capabilities: capabilitiesSig as ReadSignal<AgentCapabilities | null>,
    status: statusSig as ReadSignal<AcpSessionStatus>,
    pendingPermissions: pendingProjection,

    async prompt(content: ContentBlock[]): Promise<{ stopReason: StopReason }> {
      // Concatenate all text blocks; non-text content surfaces an error and
      // resolves with cancelled — see `prompt()` JSDoc on the interface.
      const textParts: string[] = []
      let hadNonText = false
      for (const block of content) {
        if (block.type === "text") textParts.push(block.text)
        else hadNonText = true
      }
      if (hadNonText && textParts.length === 0) {
        return { stopReason: "cancelled" }
      }
      const text = textParts.join("")

      // If there's already an in-flight prompt, resolve it cancelled before
      // starting a new one. Single-turn invariant.
      if (pendingPrompt) settlePrompt("cancelled")

      return new Promise<{ stopReason: StopReason }>((resolve) => {
        pendingPrompt = { resolve }
        if (scope.signal.aborted || agentSession.closed) {
          settlePrompt("cancelled")
          return
        }
        try {
          agentSession.send(text)
        } catch {
          settlePrompt("cancelled")
        }
      })
    },

    cancel(): void {
      if (pendingPrompt) settlePrompt("cancelled")
      try {
        void agentSession.close()
      } catch {
        // already closed — fine.
      }
    },

    respondToPermission(id: PermissionRequestId, decision: PermissionDecision): void {
      const approved = typeof decision === "boolean" ? decision : decision.approved
      try {
        agentSession.respondToPermission(id, approved)
      } catch {
        // Underlying session may not support out-of-band approval (e.g. ACP
        // sessions where the request/response is inline). Surface the
        // decision into our local pending list anyway so the UI clears.
      }
      const list = pendingSig()
      const next = list.filter((p) => p.id !== id)
      if (next.length !== list.length) pendingSig(next)
      recomputeStatus()
    },
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Translate Claude Code's TodoWrite input into an ACP-shaped Plan.
 *
 * Claude's `TodoWrite` tool takes `{ todos: [{ content, status, activeForm? }] }`.
 * ACP's Plan takes `entries: [{ content, status, priority }]`. We map status
 * verbatim (both surfaces use the same "pending" / "in_progress" /
 * "completed" trio) and synthesize "medium" priority — TodoWrite has no
 * priority concept.
 */
function extractPlanFromTodos(input: unknown): Plan | null {
  if (!input || typeof input !== "object") return null
  const maybe = (input as Record<string, unknown>).todos
  if (!Array.isArray(maybe)) return null
  const entries: PlanEntry[] = []
  for (const t of maybe) {
    if (!t || typeof t !== "object") continue
    const o = t as Record<string, unknown>
    const content = typeof o.content === "string" ? o.content : null
    if (!content) continue
    const rawStatus = typeof o.status === "string" ? o.status : "pending"
    const status: PlanEntryStatus = rawStatus === "in_progress" || rawStatus === "completed" ? rawStatus : "pending"
    entries.push({ content, status, priority: "medium" })
  }
  if (entries.length === 0) return null
  return { entries }
}

function stringifyOutput(output: unknown): string {
  if (typeof output === "string") return output
  if (output == null) return ""
  try {
    return JSON.stringify(output)
  } catch {
    return String(output)
  }
}

function mapStopReason(legacy: string | undefined): StopReason {
  switch (legacy) {
    case "end_turn":
    case "max_tokens":
    case "max_turn_requests":
    case "refusal":
    case "cancelled":
      return legacy
    default:
      return "end_turn"
  }
}

/**
 * Default permission option set used when the legacy AgentSession surfaces
 * a `permission-request` event without ACP-shaped option metadata.
 */
function defaultPermissionOptions(): PermissionOption[] {
  return [
    { optionId: "allow_once" as PermissionOption["optionId"], name: "Allow", kind: "allow_once" },
    { optionId: "reject_once" as PermissionOption["optionId"], name: "Reject", kind: "reject_once" },
  ]
}

// ---------------------------------------------------------------------------
// Internal helpers exposed for tests — use sparingly.
// ---------------------------------------------------------------------------

/** @internal — exposed for tests that want to seed a Plan signal directly. */
export function __testCreatePlanEntry(
  content: string,
  status: PlanEntryStatus = "pending",
  priority: PlanEntryPriority = "medium",
): PlanEntry {
  return { content, status, priority }
}
