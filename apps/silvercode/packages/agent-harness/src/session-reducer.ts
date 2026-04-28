/**
 * Session reducer — pure `(state, action) → [state, Effect[]]` for the
 * silvercode agent session.
 *
 * **Why this exists**: the legacy `session-store.ts` mixed state mutation
 * with closure-captured runtime state (`pendingPromptForNextAssistantTurn`,
 * `turnStrip`). Two independent features sharing the same `user-message`
 * case statement (optimistic-echo dedup + prompt-echo strip arming) repeatedly
 * collided — the dedup branch's early `break` skipped the strip-arm. Each
 * fix was locally correct; together they regressed
 * (`km-silvercode.prompt-concat-into-reply` regression).
 *
 * This is the **No-Parallel-Derivation** smell from `docs/principles.md`:
 * when multiple branches must update the same downstream state, they ALL
 * have to remember to do it. Refactor to TEA so that:
 *
 * 1. Branching is purely on the data update.
 * 2. Effects (such as strip-arming) are computed unconditionally from the
 *    incoming action, then merged into the state in one place.
 * 3. The class of bug where one branch forgets to update some downstream
 *    state cannot recur — the state machine principle from
 *    `docs/design/tea.md` makes the contract explicit.
 *
 * **Public surface preservation**: the public `SessionState` shape and the
 * public `createSessionStore()` API are not affected by this refactor. The
 * strip runtime is private (a `_strip` field on `InternalSessionState`,
 * stripped before the state crosses the public boundary).
 *
 * Bead: km-silvercode.session-store-tea-refactor.
 */

import type { AgentEvent, ContentBlock, TurnId } from "./events.ts"
import type {
  MessageEntry,
  MessageOp,
  SessionState,
  Todo,
  ToolCallEntry,
  ToolResultEntry,
  WritableEntry,
} from "./session-types.ts"
import { initialSessionState, makeEntry } from "./session-types.ts"

// ─────────────────────────────────────────────────────────────────────────
// State

/**
 * Per-turn echoed-prompt strip state. See {@link consumeStrip} for the
 * matching semantics.
 */
export type StripState = {
  fullPrompt: string
  consumed: number
  abandoned: boolean
}

/**
 * Transport-only bookkeeping for the prompt-echo strip. Lives inside the
 * reduced state (kept pure) but is projected away before the state is
 * exposed publicly via `store.state.get()`.
 */
export type StripRuntime = {
  /** Per-assistant-turn strip state. Empty after the prompt is fully matched (or abandoned). */
  byTurn: ReadonlyMap<TurnId, StripState>
  /**
   * Captured on the most-recent `user-message`; consumed on the next
   * assistant turn-start (or assistant-message when streaming is skipped).
   * Empty string means "no pending prompt" — equivalent to "no echo strip
   * needs arming for the next assistant turn".
   */
  pending: string
}

/**
 * Internal state carried by the reducer. {@link SessionState} is a
 * projection over this shape with the `_strip` runtime field stripped.
 */
export type InternalSessionState = SessionState & {
  /** Private — never exposed across the `createSessionStore()` boundary. */
  _strip: StripRuntime
}

export function initialInternalState(): InternalSessionState {
  return {
    ...initialSessionState(),
    _strip: { byTurn: new Map(), pending: "" },
  }
}

/**
 * Project the public-facing slice of the internal state. The store's
 * `state.get()` and `subscribe()` notifications return this shape — the
 * `_strip` runtime is never observable to UI consumers.
 */
export function publicView(state: InternalSessionState): SessionState {
  // Cheap object copy with the private field omitted. Avoids leaking the
  // `_strip` map to subscribers (and avoids accidentally being mutated by
  // a downstream consumer).
  const { _strip, ...rest } = state
  void _strip
  return rest
}

// ─────────────────────────────────────────────────────────────────────────
// Effects

/**
 * Reducer effects — kept as an open discriminated union so future cases
 * (notify-bell, persist-to-event-log, dispatch-to-acp-session) can be
 * added without changing the reducer's signature. Currently the reducer
 * computes everything as pure data, so `Effect` is empty in practice.
 *
 * Adding a variant: define the data shape here, emit it from the relevant
 * pure-fn pair, and handle it in {@link runEffect}.
 */
export type Effect = never

// ─────────────────────────────────────────────────────────────────────────
// Strip helpers — pure functions over StripRuntime + string

/**
 * Arm the strip for `turnId` from the currently-pending prompt. Returns a
 * new {@link StripRuntime} with `pending` cleared and `byTurn` extended if
 * the prompt was non-empty. A no-op if there's no pending prompt or the
 * turn is already armed (re-arming would lose the consumed counter).
 */
function armStrip(strip: StripRuntime, turnId: TurnId): StripRuntime {
  const prompt = strip.pending
  if (prompt.length === 0) return { ...strip, pending: "" }
  if (strip.byTurn.has(turnId)) return { ...strip, pending: "" }
  const byTurn = new Map(strip.byTurn)
  byTurn.set(turnId, { fullPrompt: prompt, consumed: 0, abandoned: false })
  return { byTurn, pending: "" }
}

/**
 * Consume a chunk of incoming assistant text against the strip state for
 * `turnId`. Returns the visible bytes and the updated runtime.
 *
 * Matching rules (byte-equal pass-through guarantee when the agent does
 * NOT echo the prompt):
 *   1. Whole delta is a prefix-fragment of the remaining prompt → swallow
 *      it (return ""), advance `consumed`.
 *   2. Delta crosses the prompt boundary → emit the post-prompt suffix,
 *      mark fully-consumed.
 *   3. Mismatch → abandon strip, replay any previously-suppressed bytes
 *      so on-screen text matches the agent's actual byte stream.
 *
 * No-op when there's no strip state, the strip is already abandoned, or
 * the prompt has been fully consumed — the input bytes pass through.
 */
function consumeStrip(strip: StripRuntime, turnId: TurnId, text: string): [StripRuntime, string] {
  if (text.length === 0) return [strip, text]
  const st = strip.byTurn.get(turnId)
  if (!st || st.abandoned || st.consumed >= st.fullPrompt.length) return [strip, text]
  const remaining = st.fullPrompt.slice(st.consumed)
  if (remaining.startsWith(text)) {
    const updated: StripState = { ...st, consumed: st.consumed + text.length }
    const byTurn = new Map(strip.byTurn)
    byTurn.set(turnId, updated)
    return [{ ...strip, byTurn }, ""]
  }
  if (text.startsWith(remaining)) {
    const updated: StripState = { ...st, consumed: st.fullPrompt.length }
    const byTurn = new Map(strip.byTurn)
    byTurn.set(turnId, updated)
    return [{ ...strip, byTurn }, text.slice(remaining.length)]
  }
  // Mismatch — abandon and replay any swallowed bytes.
  const replay = st.fullPrompt.slice(0, st.consumed)
  const updated: StripState = { ...st, abandoned: true }
  const byTurn = new Map(strip.byTurn)
  byTurn.set(turnId, updated)
  return [{ ...strip, byTurn }, replay + text]
}

// ─────────────────────────────────────────────────────────────────────────
// Message helpers — pure functions over messages array

/**
 * Build an updated messages array. The mutator is given a fresh
 * `WritableEntry` (the input is destructured so callers can return
 * `{ ...m, ... }` style patches without worrying about getter-clobbering);
 * the result is re-wrapped via `makeEntry` to install projections.
 *
 * Returns the new messages array. Pure: never mutates `messages` in place.
 */
function upsertMessage(
  messages: readonly MessageEntry[],
  id: TurnId,
  init: (m: WritableEntry) => WritableEntry,
): MessageEntry[] {
  const idx = messages.findIndex((m) => m.id === id)
  const prevEntry = idx >= 0 ? messages[idx] : undefined
  if (prevEntry) {
    const writable: WritableEntry = {
      id: prevEntry.id,
      role: prevEntry.role,
      ops: prevEntry.ops,
      blocks: prevEntry.blocks,
      todos: prevEntry.todos,
      stopReason: prevEntry.stopReason,
      additionalContext: prevEntry.additionalContext,
      ts: prevEntry.ts,
    }
    const updated = makeEntry(init(writable))
    return [...messages.slice(0, idx), updated, ...messages.slice(idx + 1)]
  }
  const fresh = makeEntry(init({ id, role: "assistant", ops: [], ts: Date.now() }))
  return [...messages, fresh]
}

function extractTodos(input: unknown): Todo[] | undefined {
  if (!input || typeof input !== "object") return undefined
  const maybe = (input as Record<string, unknown>).todos
  if (!Array.isArray(maybe)) return undefined
  return maybe
    .map((t): Todo | null => {
      if (!t || typeof t !== "object") return null
      const o = t as Record<string, unknown>
      const content = typeof o.content === "string" ? (o.content as string) : null
      if (!content) return null
      const rawStatus = typeof o.status === "string" ? (o.status as string) : "pending"
      const status: Todo["status"] =
        rawStatus === "in_progress" || rawStatus === "completed" ? (rawStatus as Todo["status"]) : "pending"
      return {
        content,
        status,
        activeForm: typeof o.activeForm === "string" ? (o.activeForm as string) : undefined,
      }
    })
    .filter((t): t is Todo => t != null)
}

// ─────────────────────────────────────────────────────────────────────────
// Per-case handlers — each is a pure function of (next, action) that
// applies its mutations to `next` in place. Splitting the switch into
// these helpers keeps `reduce()` itself a flat dispatcher (well under
// the cyclomatic-complexity budget) and lines up with the TEA pattern
// where every action-kind has its own handler.

function applySessionInit(next: InternalSessionState, action: Extract<AgentEvent, { kind: "session-init" }>): void {
  next.sessionId = action.sessionId
  next.model = action.model
  next.mode = action.mode
  next.cwd = action.cwd
  next.tools = action.tools
  next.mcpServers = action.mcp_servers
  next.slashCommands = action.slashCommands
  next.skills = action.skills
  next.plugins = action.plugins
  next.claudeCodeVersion = action.claudeCodeVersion
  next.apiKeySource = action.apiKeySource
  next.status = "idle"
}

function applyTurnStart(next: InternalSessionState, action: Extract<AgentEvent, { kind: "turn-start" }>): void {
  next.messages = upsertMessage(next.messages, action.turnId, (m) => ({
    ...m,
    role: action.role,
    ts: action.ts,
  }))
  next.status = action.role === "assistant" ? "thinking" : "idle"
  if (action.role === "assistant") next._strip = armStrip(next._strip, action.turnId)
}

/**
 * Look for an optimistic entry that matches the canonical echo. The match
 * window is wide enough to cover normal echo latency (50-200ms typical)
 * while narrow enough that a repeated short prompt across turns ("ok")
 * doesn't collapse incorrectly.
 */
function findOptimisticEcho(messages: readonly MessageEntry[], text: string, ts: number): number {
  const ECHO_WINDOW_MS = 5_000
  return messages.findIndex((m) => {
    if (m.role !== "user") return false
    if (!(m.id as string).startsWith("u-")) return false
    if (m.ops.length !== 1) return false
    const op = m.ops[0]
    if (op?.kind !== "text") return false
    if (op.text !== text) return false
    return ts - m.ts < ECHO_WINDOW_MS
  })
}

function applyUserMessage(next: InternalSessionState, action: Extract<AgentEvent, { kind: "user-message" }>): void {
  // ──────────────────────────────────────────────────────────────────
  // STRIP-ARM (computed unconditionally from the action).
  //
  // This is the No-Parallel-Derivation fix: in the legacy imperative
  // shape, this assignment lived inside the `user-message` case, after
  // an early `break` from the dedup branch. The dedup re-key path
  // skipped the assignment entirely — the strip never armed for the
  // optimistic→canonical re-key surface, so the prompt leaked into
  // assistant replies (km-silvercode.prompt-concat-into-reply
  // regression). In TEA shape, the strip-arm is a function of the
  // action alone — the data-update branch below cannot accidentally
  // skip it because it's computed before the branching.
  const stripPending = action.text.length > 0 ? action.text : next._strip.pending
  next._strip = { ...next._strip, pending: stripPending }

  // ──────────────────────────────────────────────────────────────────
  // DATA UPDATE — optimistic-echo dedup OR canonical upsert.
  //
  // Silvercode's controller applies a user-message with a synthetic
  // `u-<ts>` turnId for instant feedback BEFORE shipping the prompt
  // to the agent. The agent then echoes the same prompt back via
  // stream-json with its own JSONL uuid as turnId — arriving 50-200ms
  // later. Without this guard the prompt renders TWICE (one optimistic
  // + one echo) because the two turnIds don't match and `upsertMessage`
  // appends a fresh entry for the second.
  const existing = next.messages.findIndex((m) => m.id === action.turnId)
  if (existing === -1 && action.text.length > 0) {
    const optimisticIdx = findOptimisticEcho(next.messages, action.text, action.ts)
    if (optimisticIdx >= 0) {
      const optimistic = next.messages[optimisticIdx]
      if (optimistic) {
        const updated = makeEntry({
          id: action.turnId,
          role: "user",
          ops: [...optimistic.ops],
          blocks: optimistic.blocks ? [...optimistic.blocks] : undefined,
          todos: optimistic.todos,
          stopReason: optimistic.stopReason,
          additionalContext: action.additionalContext ?? optimistic.additionalContext,
          ts: optimistic.ts,
        })
        next.messages = [...next.messages.slice(0, optimisticIdx), updated, ...next.messages.slice(optimisticIdx + 1)]
        return
      }
    }
  }
  next.messages = upsertMessage(next.messages, action.turnId, (m) => ({
    ...m,
    role: "user",
    // User messages have a single text op (whole prompt). Replace
    // any prior ops outright — this isn't a streaming surface.
    ops: action.text.length > 0 ? [{ kind: "text", text: action.text }] : [],
    additionalContext: action.additionalContext ?? m.additionalContext,
    ts: action.ts,
  }))
}

function applyTextDelta(next: InternalSessionState, action: Extract<AgentEvent, { kind: "text-delta" }>): void {
  // Strip echoed-prompt bytes before applying. When a delta is entirely
  // consumed by the strip, skip the apply entirely so we don't push an
  // empty text op or spuriously bump the entry copy.
  const [strip2, stripped] = consumeStrip(next._strip, action.turnId, action.text)
  next._strip = strip2
  if (stripped.length === 0) return
  next.messages = upsertMessage(next.messages, action.turnId, (m) => {
    // Coalesce into the trailing text op when the most recent op is text
    // — this is how a multi-chunk assistant paragraph collapses into one
    // `text` op, matching Claude's typical emission shape.
    const ops = [...m.ops]
    const last = ops[ops.length - 1]
    if (last?.kind === "text") {
      ops[ops.length - 1] = { kind: "text", text: last.text + stripped }
    } else {
      ops.push({ kind: "text", text: stripped })
    }
    return { ...m, ops }
  })
}

function applyToolUse(next: InternalSessionState, action: Extract<AgentEvent, { kind: "tool-use" }>): void {
  next.messages = upsertMessage(next.messages, action.turnId, (m) => {
    const ops = [...m.ops]
    const existingIdx = ops.findIndex((op) => op.kind === "tool" && op.toolCall.id === action.id)
    const call: ToolCallEntry = {
      id: action.id,
      name: action.name,
      input: action.input,
      mcp_server: action.mcp_server,
    }
    if (existingIdx >= 0) {
      const prev = ops[existingIdx]
      ops[existingIdx] = {
        kind: "tool",
        toolCall: call,
        result: prev?.kind === "tool" ? prev.result : undefined,
      }
    } else {
      ops.push({ kind: "tool", toolCall: call })
    }
    return { ...m, ops }
  })
  if (action.name === "TodoWrite") {
    const t = extractTodos(action.input)
    if (t) next.todos = t
  }
  next.status = "tool-running"
}

function applyToolResult(next: InternalSessionState, action: Extract<AgentEvent, { kind: "tool-result" }>): void {
  const result: ToolResultEntry = { id: action.id, output: action.output, is_error: action.is_error }
  // Attach to whichever message has a matching tool op. Tool results
  // often arrive on a *later* turn (the model uses the tool, the harness
  // emits the result, the next assistant turn begins), so we search
  // every message — not just the most recent one.
  const idx = next.messages.findIndex((m) => m.ops.some((op) => op.kind === "tool" && op.toolCall.id === action.id))
  if (idx >= 0) {
    const msg = next.messages[idx]
    if (msg) {
      const ops: MessageOp[] = msg.ops.map((op) => {
        if (op.kind === "tool" && op.toolCall.id === action.id) {
          return { kind: "tool" as const, toolCall: op.toolCall, result }
        }
        return op
      })
      const updated = makeEntry({
        id: msg.id,
        role: msg.role,
        ops,
        blocks: msg.blocks,
        todos: msg.todos,
        stopReason: msg.stopReason,
        additionalContext: msg.additionalContext,
        ts: msg.ts,
      })
      next.messages = [...next.messages.slice(0, idx), updated, ...next.messages.slice(idx + 1)]
    }
  }
  // Status guard: only transition `tool-running → thinking`. A late
  // tool-result that arrives AFTER turn-end must NOT re-arm the spinner
  // — the ACP wire emits sessionUpdate notifications fire-and-forget
  // and races with the prompt response on the JSON-RPC stream, so a
  // tool_call_update can land on the consumer side after the synthetic
  // turn-end fired by withTurnLifecycle. Bead
  // km-silvercode.acp-status-as-derived tracks the architectural fix;
  // this guard is the symptomatic patch.
  if (next.status === "tool-running") next.status = "thinking"
}

/**
 * Derive ops from a finalized assistant-message's content blocks. Pure
 * — folds {@link consumeStrip} across the text blocks and threads the
 * updated strip out for the caller to merge.
 *
 * Returns `[derivedOps, finalStrip]`. The caller decides whether to use
 * `derivedOps` (when there were no prior streaming ops) or to discard
 * them (when the live stream already populated the entry's ops).
 */
function deriveOpsFromBlocks(
  strip: StripRuntime,
  turnId: TurnId,
  content: ReadonlyArray<ContentBlock>,
): [MessageOp[], StripRuntime] {
  const ops: MessageOp[] = []
  let s = strip
  for (const b of content) {
    if (b.type === "text" && b.text.length > 0) {
      const [s2, stripped] = consumeStrip(s, turnId, b.text)
      s = s2
      if (stripped.length === 0) continue
      const last = ops[ops.length - 1]
      if (last?.kind === "text") {
        ops[ops.length - 1] = { kind: "text", text: last.text + stripped }
      } else {
        ops.push({ kind: "text", text: stripped })
      }
    } else if (b.type === "tool_use") {
      ops.push({
        kind: "tool",
        toolCall: { id: b.id, name: b.name, input: b.input, mcp_server: b.mcp_server },
      })
    }
    // tool_result / thinking / image blocks: not represented in ops
    // directly. tool_results inside assistant-message are unusual
    // (claude emits them as separate events); thinking and image are
    // intentionally skipped at the ops layer.
  }
  return [ops, s]
}

function applyAssistantMessage(
  next: InternalSessionState,
  action: Extract<AgentEvent, { kind: "assistant-message" }>,
): void {
  // Live streaming builds m.ops incrementally via text-delta + tool-use
  // events; this aggregate fires at turn-end with the FINAL content
  // blocks. Replay (--resume) skips streaming events entirely — only
  // this aggregate fires. So when ops is empty, derive ops from
  // `event.content` *in order*, preserving any text/tool interleaving
  // the resumed transcript records.
  //
  // Replay path also needs echoed-prompt strip — message_start never
  // fires, so arm it on first encounter for this turn.
  let strip = next._strip
  if (!strip.byTurn.has(action.turnId)) strip = armStrip(strip, action.turnId)

  // Pre-compute the per-block consume passes so the upsert callback is
  // pure data; strip mutation is collected in the local `strip`.
  const existingIdx = next.messages.findIndex((m) => m.id === action.turnId)
  const existing = existingIdx >= 0 ? next.messages[existingIdx] : undefined
  const existingHasOps = existing ? existing.ops.length > 0 : false
  let derivedOps: MessageOp[] | null = null
  if (!existingHasOps) {
    const [ops, finalStrip] = deriveOpsFromBlocks(strip, action.turnId, action.content)
    strip = finalStrip
    derivedOps = ops
  }
  next._strip = strip
  next.messages = upsertMessage(next.messages, action.turnId, (m) => {
    if (derivedOps !== null) {
      // m.ops was empty at the time we computed; pin our derived ops.
      return { ...m, blocks: action.content as ContentBlock[], ops: derivedOps }
    }
    return { ...m, blocks: action.content as ContentBlock[] }
  })
}

function applyTurnEnd(next: InternalSessionState, action: Extract<AgentEvent, { kind: "turn-end" }>): void {
  next.messages = upsertMessage(next.messages, action.turnId, (m) => ({
    ...m,
    stopReason: action.stopReason,
  }))
  next.status = "idle"
  if (action.usage) {
    next.cost = {
      usd: next.cost.usd,
      inputTokens: next.cost.inputTokens + (action.usage.input_tokens ?? 0),
      outputTokens: next.cost.outputTokens + (action.usage.output_tokens ?? 0),
    }
  }
}

function applySessionEnd(next: InternalSessionState, action: Extract<AgentEvent, { kind: "session-end" }>): void {
  next.status = "ended"
  if (typeof action.costUsd === "number") next.cost = { ...next.cost, usd: action.costUsd }
  if (action.usage) {
    next.cost = {
      usd: next.cost.usd,
      inputTokens: next.cost.inputTokens + (action.usage.input_tokens ?? 0),
      outputTokens: next.cost.outputTokens + (action.usage.output_tokens ?? 0),
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Reducer

/**
 * Pure reducer. Given the current state and an agent event, returns the
 * next state plus any effects the runtime must perform.
 *
 * **TEA discipline**: each `case` delegates to a single per-action
 * handler. Branching is purely on the *data update* (e.g. "did we re-key
 * an optimistic entry or upsert a fresh one?"); side-effect-like
 * concerns (strip-arm on user-message, todo extraction on TodoWrite,
 * status transitions) are computed unconditionally relative to the
 * action, never gated behind a data branch.
 *
 * This makes the No-Parallel-Derivation regression structurally
 * impossible: in the previous imperative shape, the `user-message`
 * dedup branch could `break` early and skip the strip-arm. Here, the
 * strip-arm is the first statement of {@link applyUserMessage}, so the
 * data-branch below cannot accidentally skip it.
 */
export function reduce(state: InternalSessionState, action: AgentEvent): [InternalSessionState, Effect[]] {
  const next: InternalSessionState = { ...state }
  const effects: Effect[] = []

  switch (action.kind) {
    case "session-init":
      applySessionInit(next, action)
      break
    case "slash-commands-update":
      // Mid-session refresh — the agent advertised a fresh full list of
      // available commands. ACP semantics: each update REPLACES the
      // previous list (a plugin unload must drop names from the snapshot
      // SessionState exposes). Bead: km-silvercode.slash-command-vault-
      // discovery.
      next.slashCommands = action.slashCommands
      break
    case "turn-start":
      applyTurnStart(next, action)
      break
    case "user-message":
      applyUserMessage(next, action)
      break
    case "text-delta":
      applyTextDelta(next, action)
      break
    case "thinking-delta":
      // No-op for ops stream: thinking deltas don't surface in rendered
      // ops. Keep the message slot for completeness (so a thinking-only
      // turn still has a MessageEntry).
      next.messages = upsertMessage(next.messages, action.turnId, (m) => m)
      break
    case "tool-use":
      applyToolUse(next, action)
      break
    case "tool-result":
      applyToolResult(next, action)
      break
    case "assistant-message":
      applyAssistantMessage(next, action)
      break
    case "turn-end":
      applyTurnEnd(next, action)
      break
    case "permission-request":
      next.permissions = [...next.permissions, { requestId: action.requestId, tool: action.tool, args: action.args }]
      next.status = "awaiting-permission"
      break
    case "permission-decision":
      next.permissions = next.permissions.filter((p) => p.requestId !== action.requestId)
      next.status = next.permissions.length > 0 ? "awaiting-permission" : "idle"
      break
    case "status":
      // Harness "status" events are low-level annotations on whatever the
      // turn lifecycle already established. Only honour `requesting` when
      // a turn is genuinely in flight (status already running). If we're
      // idle / ended / awaiting-permission / spawning, a stray `requesting`
      // would flip status to "thinking" with no active turn — and because
      // controller.send gates the queue on idle/ended, the queue wedges
      // forever. km-silvercode.queue-stuck-thinking.
      if (
        action.status === "requesting" &&
        (next.status === "thinking" || next.status === "tool-running")
      ) {
        next.status = "thinking"
      }
      break
    case "session-end":
      applySessionEnd(next, action)
      break
    case "session-lifecycle":
      if (action.state === "ended") next.status = "ended"
      break

    case "error":
      next.lastError = action.message
      break

    case "handoff":
    case "km-reference":
      // No-op for M0/M1; wired through in M10.
      break
  }

  return [next, effects]
}

/**
 * Effect runner. Currently a no-op — the reducer doesn't emit any side-
 * effecting variants yet. Kept as the documented seam where future
 * effect handlers (notify-bell, persist-event-log, etc.) plug in without
 * changing the reducer's signature.
 */
export function runEffect(_effect: Effect): void {
  // Exhaustiveness check on the (currently empty) Effect union.
  // When a variant is added, the compiler will require a case here.
  const _exhaustive: never = _effect
  void _exhaustive
}
