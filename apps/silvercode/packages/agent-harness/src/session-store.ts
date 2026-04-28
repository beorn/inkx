/**
 * Reactive session store — consumes AgentEvents, produces the reactive state
 * the silvery UI binds to.
 *
 * One store per session. The SessionUpdateList / TodoPanel / StatusLine / ToolCall
 * components subscribe via the returned signals. alien-signals underpins the
 * reactive layer so updates trigger minimal re-renders (see @silvery/signals).
 *
 * This module is deliberately dependency-light (alien-signals only) so tests
 * can exercise it without a full silvery runtime.
 */

import { signal } from "alien-signals"
import type { AgentEvent, AgentSession, ContentBlock, SessionId, ToolUseId, TurnId } from "./events.ts"

export type RoleIndicator = "user" | "assistant" | "system"

/**
 * Inline tool-call entry stored on a `MessageOp` (no `mcp_server` indirection;
 * the value `name` already includes the namespaced prefix when applicable).
 */
export type ToolCallEntry = { id: ToolUseId; name: string; input: unknown; mcp_server?: string }

/**
 * Inline tool-result entry. Optional — attached to its tool op when the
 * matching `tool-result` event arrives (often on a later turn).
 */
export type ToolResultEntry = { id: ToolUseId; output: unknown; is_error?: boolean }

/**
 * One operation produced by the agent within a turn. The order of `ops`
 * preserves the agent's emission order: `text` op for each contiguous run
 * of text deltas, `tool` op for each tool-use. Result attaches to the
 * matching tool op when it arrives. This preserves codex-style
 * text→tool→text→tool interleavings that are flattened away by the legacy
 * `text` + `toolCalls[]` representation.
 *
 * Bead: km-silvercode.codex-bundling-order. See SessionUpdateList.tsx
 * `ExchangeItem` for the renderer.
 */
export type MessageOp =
  | { kind: "text"; text: string }
  | { kind: "tool"; toolCall: ToolCallEntry; result?: ToolResultEntry }

/**
 * Public surface — both the new ordered `ops` field AND the legacy
 * `text` / `toolCalls` / `toolResults` projections coexist. Existing
 * consumers that read `.text`, `.toolCalls`, `.toolResults` keep working
 * through `Object.defineProperty` getters installed on every entry; new
 * consumers (renderer, harness) read `.ops` directly to preserve order.
 */
export type MessageEntry = {
  id: TurnId
  role: RoleIndicator
  /**
   * Order-preserving op stream — text runs and tool calls in arrival order.
   * This is the canonical storage; the legacy fields below are derived.
   */
  ops: MessageOp[]
  /** Derived: concatenation of every `text` op's text, in order. */
  readonly text: string
  /** Derived: every `tool` op's `toolCall`, in order. */
  readonly toolCalls: Array<ToolCallEntry>
  /** Derived: every `tool` op's `result`, when present, in order. */
  readonly toolResults: Array<ToolResultEntry>
  /** Final blocks once the turn closes (aggregated from assistant-message). */
  blocks?: ContentBlock[]
  /** TodoWrite extracted data, if any, for this turn. */
  todos?: Todo[]
  /** End-of-turn stop reason. */
  stopReason?: string
  /**
   * Hidden context attached to this message — system-reminder bodies,
   * hook output, isMeta entries, command-tag wrappers. Stripped from
   * `text` for chat readability but preserved here so the debug view
   * (`/raw`) can expose what the model actually received. Populated by
   * the parser on resume; live messages don't have it.
   * Bead: km-silvercode.resume-show-everything-collapsed.
   */
  additionalContext?: string
  ts: number
}

/**
 * Internal mutable shape used while the reducer is building / updating an
 * entry. The public `MessageEntry` adds derived getters via
 * {@link installEntryProjections} before the entry leaves the store.
 */
type WritableEntry = {
  id: TurnId
  role: RoleIndicator
  ops: MessageOp[]
  blocks?: ContentBlock[]
  todos?: Todo[]
  stopReason?: string
  additionalContext?: string
  ts: number
}

/**
 * Install the legacy `text` / `toolCalls` / `toolResults` getters on a
 * just-built entry. Each is a pure projection over `ops`. Computing on
 * read keeps the projection in lock-step with `ops` without separate
 * accumulators that could drift.
 */
function installEntryProjections<T extends WritableEntry>(entry: T): MessageEntry {
  Object.defineProperty(entry, "text", {
    get(this: WritableEntry) {
      let s = ""
      for (const op of this.ops) {
        if (op.kind === "text") s += op.text
      }
      return s
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(entry, "toolCalls", {
    get(this: WritableEntry) {
      const out: ToolCallEntry[] = []
      for (const op of this.ops) {
        if (op.kind === "tool") out.push(op.toolCall)
      }
      return out
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(entry, "toolResults", {
    get(this: WritableEntry) {
      const out: ToolResultEntry[] = []
      for (const op of this.ops) {
        if (op.kind === "tool" && op.result) out.push(op.result)
      }
      return out
    },
    enumerable: true,
    configurable: true,
  })
  return entry as unknown as MessageEntry
}

/**
 * Build a fresh `MessageEntry`. Used everywhere the reducer creates or
 * updates an entry — guarantees the legacy projections are present so
 * existing consumers (controller, SessionCard, SidePanel, harness tests,
 * storybook fixtures) keep working without migration.
 */
function makeEntry(init: WritableEntry): MessageEntry {
  return installEntryProjections({ ...init })
}

export type Todo = {
  content: string
  status: "pending" | "in_progress" | "completed"
  activeForm?: string
}

export type SessionState = {
  sessionId: SessionId | null
  model: string
  mode: string
  cwd: string
  tools: string[]
  mcpServers: string[]
  /** Slash commands the agent advertises (built-in + plugin). Populated from session-init. */
  slashCommands: string[]
  /** Skill names loaded in the agent. Populated from session-init. */
  skills: string[]
  /** Plugin names loaded in the agent. Populated from session-init. */
  plugins: string[]
  /** Claude Code CLI version the subprocess is running. */
  claudeCodeVersion: string
  /** Which auth path claude is using (ANTHROPIC_API_KEY, OAuth, etc.). */
  apiKeySource: string
  status: "spawning" | "idle" | "thinking" | "tool-running" | "awaiting-permission" | "ended"
  messages: MessageEntry[]
  permissions: Array<{ requestId: string; tool: string; args: unknown }>
  /** The most recent TodoWrite snapshot, regardless of which turn produced it. */
  todos: Todo[]
  /** Running cost + tokens. */
  cost: { usd: number; inputTokens: number; outputTokens: number }
  /** Last error surfaced by the harness or parser. */
  lastError: string | null
}

function initialState(): SessionState {
  return {
    sessionId: null,
    model: "",
    mode: "",
    cwd: "",
    tools: [],
    mcpServers: [],
    slashCommands: [],
    skills: [],
    plugins: [],
    claudeCodeVersion: "",
    apiKeySource: "",
    // "idle" not "spawning": claude --bare -p doesn't emit session-init
    // until the first user message arrives on stdin, so the subprocess can
    // sit in a "running but not yet chatty" state for a while. Labelling
    // that as "spawning" is a lie — the process IS spawned, it's just
    // waiting for input. Real transient spawning state (if we ever need
    // it) can be set briefly during the synchronous spawn() call and
    // cleared immediately after the subprocess is alive.
    status: "idle",
    messages: [],
    permissions: [],
    todos: [],
    cost: { usd: 0, inputTokens: 0, outputTokens: 0 },
    lastError: null,
  }
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

export type SessionStore = {
  state: { get(): SessionState; subscribe(fn: (s: SessionState) => void): () => void }
  apply(event: AgentEvent): void
  /** Convenience: subscribe an AgentSession's events directly. */
  bind(session: AgentSession): () => void
}

export function createSessionStore(): SessionStore {
  const s = signal(initialState())
  const subscribers = new Set<(state: SessionState) => void>()

  function set(next: SessionState): void {
    s(next)
    for (const fn of subscribers) fn(next)
  }
  function get(): SessionState {
    return s()
  }

  // ────────────────────────────────────────────────────────────────────
  // Echoed-prompt strip — adjacent to the duplicate-prompt dedup but for
  // a different surface. Some agent paths emit the assistant turn's
  // first text bytes with the user prompt prepended ("what repo is
  // this?km — Knowledge Machine ..."). The duplicate-prompt heuristic
  // re-keys an optimistic user-message echo onto the agent's turnId; it
  // does NOT touch the assistant content. This strip targets that case.
  //
  // Bead: km-silvercode.prompt-concat-into-reply.
  //
  // Per assistant turn we hold a small consumer state machine: try to
  // match incoming text-delta bytes against the most-recent user prompt
  // from the start. While a delta is a prefix-fragment of the remaining
  // prompt, swallow it. When a delta crosses the prompt boundary, emit
  // only the post-prompt suffix. On any mismatch, abandon and replay
  // the suppressed bytes — guarantees byte-exact pass-through whenever
  // the agent does NOT echo the prompt.
  type StripState = { fullPrompt: string; consumed: number; abandoned: boolean }
  const turnStrip = new Map<TurnId, StripState>()
  // Captured on the most recent user-message; consumed by the next
  // assistant turn-start (or assistant-message when streaming is
  // skipped). Cleared after consumption so a follow-up assistant turn
  // without an intervening user prompt doesn't accidentally re-arm.
  let pendingPromptForNextAssistantTurn = ""

  function armStripForTurn(turnId: TurnId): void {
    const prompt = pendingPromptForNextAssistantTurn
    pendingPromptForNextAssistantTurn = ""
    if (prompt.length === 0) return
    if (turnStrip.has(turnId)) return
    turnStrip.set(turnId, { fullPrompt: prompt, consumed: 0, abandoned: false })
  }

  /**
   * Run a chunk of incoming assistant text through the strip state for
   * `turnId`. Returns the bytes that should actually be appended to the
   * message's text op. On the first chunk that diverges from the prompt
   * prefix, the strip abandons and prepends any previously-suppressed
   * bytes so the rendered text is byte-equal to what the agent emitted.
   */
  function consumeStrip(turnId: TurnId, text: string): string {
    if (text.length === 0) return text
    const st = turnStrip.get(turnId)
    if (!st || st.abandoned || st.consumed >= st.fullPrompt.length) return text
    const remaining = st.fullPrompt.slice(st.consumed)
    if (remaining.startsWith(text)) {
      // Whole delta is a prefix-fragment of the remaining prompt. Swallow it.
      st.consumed += text.length
      return ""
    }
    if (text.startsWith(remaining)) {
      // Delta crosses the prompt boundary. Emit only the post-prompt suffix.
      st.consumed = st.fullPrompt.length
      return text.slice(remaining.length)
    }
    // Mismatch — agent isn't echoing. Abandon strip and replay any
    // bytes we silently swallowed earlier so the on-screen text matches
    // the agent's actual byte stream.
    const replay = st.fullPrompt.slice(0, st.consumed)
    st.abandoned = true
    return replay + text
  }
  /**
   * Build an updated entry. The mutator is given a fresh `WritableEntry`
   * (the input is destructured so callers can return `{ ...m, ... }` style
   * patches without worrying about getter-clobbering); the result is
   * re-wrapped via `makeEntry` to install projections on the new copy.
   */
  function upsertMessage(next: SessionState, id: TurnId, init: (m: WritableEntry) => WritableEntry): MessageEntry {
    const idx = next.messages.findIndex((m) => m.id === id)
    if (idx >= 0) {
      const prevEntry = next.messages[idx]!
      // Strip getters by copying primitive fields explicitly. Spreading
      // an entry with installed getters silently drops them on the new
      // object, so we need fresh ops/blocks/etc.
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
      next.messages = [...next.messages.slice(0, idx), updated, ...next.messages.slice(idx + 1)]
      return updated
    }
    const fresh = makeEntry(init({ id, role: "assistant", ops: [], ts: Date.now() }))
    next.messages = [...next.messages, fresh]
    return fresh
  }

  function apply(event: AgentEvent): void {
    const prev = get()
    const next: SessionState = { ...prev, messages: prev.messages }

    switch (event.kind) {
      case "session-init":
        next.sessionId = event.sessionId
        next.model = event.model
        next.mode = event.mode
        next.cwd = event.cwd
        next.tools = event.tools
        next.mcpServers = event.mcp_servers
        next.slashCommands = event.slashCommands
        next.skills = event.skills
        next.plugins = event.plugins
        next.claudeCodeVersion = event.claudeCodeVersion
        next.apiKeySource = event.apiKeySource
        next.status = "idle"
        break
      case "turn-start":
        upsertMessage(next, event.turnId, (m) => ({ ...m, role: event.role, ts: event.ts }))
        next.status = event.role === "assistant" ? "thinking" : "idle"
        if (event.role === "assistant") armStripForTurn(event.turnId)
        break
      case "user-message": {
        // Optimistic-echo dedup. Silvercode's controller applies a
        // user-message with a synthetic `u-<ts>` turnId for instant
        // feedback BEFORE shipping the prompt to the agent. The agent
        // then echoes the same prompt back via stream-json with its own
        // JSONL uuid as turnId — arriving 50-200ms later. Without this
        // guard the prompt renders TWICE (one optimistic + one echo)
        // because the two turnIds don't match and `upsertMessage` appends
        // a fresh entry for the second.
        //
        // Heuristic: if the new turnId isn't already in the store BUT a
        // prior optimistic entry (id starts with `u-`) carries the same
        // text within a 5-second window, re-key the optimistic entry to
        // the canonical turnId so subsequent `tool-result` lookups, turn-
        // end attaches, and scroll anchors all resolve correctly. The
        // window is wide enough to cover normal echo latency while narrow
        // enough that the same word repeated across turns ("ok", "yes")
        // doesn't collapse incorrectly.
        const existingIdx = next.messages.findIndex((m) => m.id === event.turnId)
        if (existingIdx === -1 && event.text.length > 0) {
          const ECHO_WINDOW_MS = 5_000
          const optimisticIdx = next.messages.findIndex(
            (m) =>
              m.role === "user" &&
              (m.id as string).startsWith("u-") &&
              m.ops.length === 1 &&
              m.ops[0]!.kind === "text" &&
              m.ops[0]!.text === event.text &&
              event.ts - m.ts < ECHO_WINDOW_MS,
          )
          if (optimisticIdx >= 0) {
            const optimistic = next.messages[optimisticIdx]!
            const updated = makeEntry({
              id: event.turnId,
              role: "user",
              ops: [...optimistic.ops],
              blocks: optimistic.blocks ? [...optimistic.blocks] : undefined,
              todos: optimistic.todos,
              stopReason: optimistic.stopReason,
              additionalContext: event.additionalContext ?? optimistic.additionalContext,
              ts: optimistic.ts,
            })
            next.messages = [
              ...next.messages.slice(0, optimisticIdx),
              updated,
              ...next.messages.slice(optimisticIdx + 1),
            ]
            break
          }
        }
        upsertMessage(next, event.turnId, (m) => ({
          ...m,
          role: "user",
          // User messages have a single text op (whole prompt). Replace
          // any prior ops outright — this isn't a streaming surface.
          ops: event.text.length > 0 ? [{ kind: "text", text: event.text }] : [],
          additionalContext: event.additionalContext ?? m.additionalContext,
          ts: event.ts,
        }))
        // Capture the prompt for the next assistant turn's echo strip.
        // See the `consumeStrip` block at the top of this factory.
        if (event.text.length > 0) pendingPromptForNextAssistantTurn = event.text
        break
      }
      case "text-delta": {
        // Strip echoed-prompt bytes before applying. When a delta is
        // entirely consumed by the strip, skip the apply entirely so we
        // don't push an empty text op or spuriously bump the entry copy.
        const stripped = consumeStrip(event.turnId, event.text)
        if (stripped.length === 0) break
        upsertMessage(next, event.turnId, (m) => {
          // Coalesce into the trailing text op when the most recent op
          // is text — this is how a multi-chunk assistant paragraph
          // collapses into one `text` op, matching Claude's typical
          // emission shape. A tool-use op intervening will start a new
          // text op afterwards, preserving codex-style interleaving.
          const ops = [...m.ops]
          const last = ops[ops.length - 1]
          if (last?.kind === "text") {
            ops[ops.length - 1] = { kind: "text", text: last.text + stripped }
          } else {
            ops.push({ kind: "text", text: stripped })
          }
          return { ...m, ops }
        })
        break
      }
      case "thinking-delta":
        // No-op for now: thinking deltas don't surface in the rendered
        // ops stream. Keeping this case to preserve the message slot for
        // completeness (so a thinking-only turn still has a MessageEntry).
        upsertMessage(next, event.turnId, (m) => m)
        break
      case "tool-use": {
        upsertMessage(next, event.turnId, (m) => {
          // Locate any existing tool op with the same id (rare — only
          // happens on duplicate tool-use events from buggy adapters).
          // When found, replace in place to preserve order; when not,
          // append a new tool op.
          const ops = [...m.ops]
          const existingIdx = ops.findIndex((op) => op.kind === "tool" && op.toolCall.id === event.id)
          const call: ToolCallEntry = {
            id: event.id,
            name: event.name,
            input: event.input,
            mcp_server: event.mcp_server,
          }
          if (existingIdx >= 0) {
            const prev = ops[existingIdx]!
            ops[existingIdx] = {
              kind: "tool",
              toolCall: call,
              result: prev.kind === "tool" ? prev.result : undefined,
            }
          } else {
            ops.push({ kind: "tool", toolCall: call })
          }
          return { ...m, ops }
        })
        if (event.name === "TodoWrite") {
          const t = extractTodos(event.input)
          if (t) next.todos = t
        }
        next.status = "tool-running"
        break
      }
      case "tool-result": {
        const result: ToolResultEntry = { id: event.id, output: event.output, is_error: event.is_error }
        // Attach to whichever message has a matching tool op. Tool
        // results often arrive on a *later* turn (the model uses the
        // tool, the harness emits the result, the next assistant turn
        // begins), so we search every message — not just the most
        // recent one.
        const idx = next.messages.findIndex((m) =>
          m.ops.some((op) => op.kind === "tool" && op.toolCall.id === event.id),
        )
        if (idx >= 0) {
          const msg = next.messages[idx]!
          const ops = msg.ops.map((op) => {
            if (op.kind === "tool" && op.toolCall.id === event.id) {
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
        // Status guard: only transition `tool-running → thinking`. A late
        // tool-result that arrives AFTER turn-end must NOT re-arm the
        // spinner — the ACP wire emits sessionUpdate notifications
        // fire-and-forget and races with the prompt response on the JSON-
        // RPC stream, so a tool_call_update can land on the consumer side
        // after the synthetic turn-end fired by withTurnLifecycle. Bead
        // km-silvercode.acp-status-as-derived tracks the architectural
        // fix (derive status from observable state instead of an FSM);
        // this guard is the symptomatic patch.
        if (next.status === "tool-running") next.status = "thinking"
        break
      }
      case "assistant-message":
        // Live streaming builds m.ops incrementally via text-delta +
        // tool-use events; this aggregate fires at turn-end with the
        // FINAL content blocks. Replay (--resume) skips the streaming
        // events entirely — only this aggregate fires. So when ops is
        // empty, derive ops from `event.content` *in order*, preserving
        // any text/tool interleaving the resumed transcript records.
        //
        // Replay path also needs echoed-prompt strip — message_start
        // never fires, so arm it on first encounter for this turn.
        if (!turnStrip.has(event.turnId)) armStripForTurn(event.turnId)
        upsertMessage(next, event.turnId, (m) => {
          if (m.ops.length > 0) {
            return { ...m, blocks: event.content }
          }
          const ops: MessageOp[] = []
          for (const b of event.content) {
            if (b.type === "text" && b.text.length > 0) {
              const stripped = consumeStrip(event.turnId, b.text)
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
            // tool_result / thinking / image blocks: not represented in
            // ops directly. tool_results inside assistant-message are
            // unusual (claude emits them as separate events); thinking
            // and image are intentionally skipped at the ops layer.
          }
          return { ...m, blocks: event.content, ops }
        })
        break
      case "turn-end":
        upsertMessage(next, event.turnId, (m) => ({ ...m, stopReason: event.stopReason }))
        next.status = "idle"
        if (event.usage) {
          next.cost = {
            usd: next.cost.usd,
            inputTokens: next.cost.inputTokens + (event.usage.input_tokens ?? 0),
            outputTokens: next.cost.outputTokens + (event.usage.output_tokens ?? 0),
          }
        }
        break
      case "permission-request":
        next.permissions = [...next.permissions, { requestId: event.requestId, tool: event.tool, args: event.args }]
        next.status = "awaiting-permission"
        break
      case "permission-decision":
        next.permissions = next.permissions.filter((p) => p.requestId !== event.requestId)
        next.status = next.permissions.length > 0 ? "awaiting-permission" : "idle"
        break
      case "status":
        // Harness "status" events are low-level; fold into status enum only for recognised values.
        if (event.status === "requesting") next.status = "thinking"
        break
      case "session-end":
        next.status = "ended"
        if (typeof event.costUsd === "number") next.cost = { ...next.cost, usd: event.costUsd }
        if (event.usage) {
          next.cost = {
            usd: next.cost.usd,
            inputTokens: next.cost.inputTokens + (event.usage.input_tokens ?? 0),
            outputTokens: next.cost.outputTokens + (event.usage.output_tokens ?? 0),
          }
        }
        break
      case "session-lifecycle":
        if (event.state === "ended") next.status = "ended"
        break
      case "error":
        next.lastError = event.message
        break
      case "handoff":
      case "km-reference":
        // No-op for M0/M1; wired through in M10.
        break
    }

    set(next)
  }

  return {
    state: {
      get,
      subscribe(fn: (state: SessionState) => void): () => void {
        subscribers.add(fn)
        return () => subscribers.delete(fn)
      },
    },
    apply,
    bind(session: AgentSession): () => void {
      return session.subscribe((e) => apply(e))
    },
  }
}
