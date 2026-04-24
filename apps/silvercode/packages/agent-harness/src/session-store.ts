/**
 * Reactive session store — consumes AgentEvents, produces the reactive state
 * the silvery UI binds to.
 *
 * One store per session. The MessageList / TodoPanel / StatusLine / ToolCallBlock
 * components subscribe via the returned signals. alien-signals underpins the
 * reactive layer so updates trigger minimal re-renders (see @silvery/signals).
 *
 * This module is deliberately dependency-light (alien-signals only) so tests
 * can exercise it without a full silvery runtime.
 */

import { signal } from "alien-signals"
import type { AgentEvent, AgentSession, ContentBlock, SessionId, ToolUseId, TurnId } from "./events.ts"

export type RoleIndicator = "user" | "assistant" | "system"

export type MessageEntry = {
  id: TurnId
  role: RoleIndicator
  /** Incrementally growing text for streaming assistant text blocks. */
  text: string
  /** Tool blocks produced within this turn. */
  toolCalls: Array<{ id: ToolUseId; name: string; input: unknown; mcp_server?: string }>
  /** Results keyed by tool_use id; may land in a later turn. */
  toolResults: Array<{ id: ToolUseId; output: unknown; is_error?: boolean }>
  /** Final blocks once the turn closes (aggregated from assistant-message). */
  blocks?: ContentBlock[]
  /** TodoWrite extracted data, if any, for this turn. */
  todos?: Todo[]
  /** End-of-turn stop reason. */
  stopReason?: string
  ts: number
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
    status: "spawning",
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
  function upsertMessage(next: SessionState, id: TurnId, init: (m: MessageEntry) => MessageEntry): MessageEntry {
    const idx = next.messages.findIndex((m) => m.id === id)
    if (idx >= 0) {
      const updated = init(next.messages[idx]!)
      next.messages = [...next.messages.slice(0, idx), updated, ...next.messages.slice(idx + 1)]
      return updated
    }
    const fresh = init({ id, role: "assistant", text: "", toolCalls: [], toolResults: [], ts: Date.now() })
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
        next.status = "idle"
        break
      case "turn-start":
        upsertMessage(next, event.turnId, (m) => ({ ...m, role: event.role, ts: event.ts }))
        next.status = event.role === "assistant" ? "thinking" : "idle"
        break
      case "user-message":
        upsertMessage(next, event.turnId, (m) => ({ ...m, role: "user", text: event.text, ts: event.ts }))
        break
      case "text-delta":
        upsertMessage(next, event.turnId, (m) => ({ ...m, text: m.text + event.text }))
        break
      case "thinking-delta":
        upsertMessage(next, event.turnId, (m) => ({ ...m, text: m.text }))
        break
      case "tool-use": {
        upsertMessage(next, event.turnId, (m) => {
          const existingIdx = m.toolCalls.findIndex((c) => c.id === event.id)
          const call = { id: event.id, name: event.name, input: event.input, mcp_server: event.mcp_server }
          if (existingIdx >= 0) {
            const calls = [...m.toolCalls]
            calls[existingIdx] = call
            return { ...m, toolCalls: calls }
          }
          return { ...m, toolCalls: [...m.toolCalls, call] }
        })
        if (event.name === "TodoWrite") {
          const t = extractTodos(event.input)
          if (t) next.todos = t
        }
        next.status = "tool-running"
        break
      }
      case "tool-result": {
        const result = { id: event.id, output: event.output, is_error: event.is_error }
        // Attach to whichever message contains the originating tool call.
        const idx = next.messages.findIndex((m) => m.toolCalls.some((c) => c.id === event.id))
        if (idx >= 0) {
          const msg = next.messages[idx]!
          const existing = msg.toolResults.findIndex((r) => r.id === event.id)
          const results =
            existing >= 0 ? msg.toolResults.map((r, i) => (i === existing ? result : r)) : [...msg.toolResults, result]
          const updated = { ...msg, toolResults: results }
          next.messages = [...next.messages.slice(0, idx), updated, ...next.messages.slice(idx + 1)]
        }
        next.status = "thinking"
        break
      }
      case "assistant-message":
        upsertMessage(next, event.turnId, (m) => ({ ...m, blocks: event.content }))
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
